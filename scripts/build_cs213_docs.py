"""Build combined CS 213 PDF and DOCX documentation with rendered Crow's Foot ERDs.

Usage (requires Playwright + Chromium):
  python scripts/build_cs213_docs.py
"""
from __future__ import annotations

from dataclasses import dataclass
import html
from pathlib import Path
import re
import shutil
import struct
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape as xml_escape
from zipfile import ZipFile, ZIP_DEFLATED

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DOCS_CS213 = ROOT / 'docs' / 'cs213'
EXPORTS_DIR = DOCS_CS213 / 'exports'
DIST_DIR = ROOT / 'dist'
DIAG_SCRATCH = Path(
    r'C:\Users\dinga\.gemini\antigravity\brain\619aed18-845a-4889-8e0d-4074037ee589\scratch\cs213_diagrams'
)

INPUT_DOCS = [
    ('Part I — Project Documentation, Business Rules & Architecture', DOCS_CS213 / '01_PROJECT_DOCUMENTATION.md'),
    ('Part II — Three Separate Crow\'s Foot ERDs & Normalization (3NF)', DOCS_CS213 / '02_THREE_LEVEL_ERDS_AND_NORMALIZATION.md'),
    ('Part III — Complete Data Dictionary & Design Rationale', DOCS_CS213 / '03_DATA_DICTIONARY.md'),
    ('Part IV — Test Plan, Executed Test Report & Defect Log', DOCS_CS213 / '04_TEST_PLAN_AND_EXECUTED_REPORT.md'),
]

DIAGRAM_CAPTIONS = [
    'Figure 1.1 — Three-Tier Client-Server Architecture (Browser, Hono Worker, Cloudflare D1)',
    'Figure 2.1 — Level 1: Conceptual Crow\'s Foot ERD',
    'Figure 2.2 — Level 2: Logical Crow\'s Foot ERD (Normalized through 3NF)',
    'Figure 2.3 — Level 3a: Physical Crow\'s Foot ERD — Core Identity, Auth, Projects, Requests & Tasks',
    'Figure 2.4 — Level 3b: Physical Crow\'s Foot ERD — Events Governance, Audit Log & Data Mart',
]


@dataclass
class Block:
    kind: str  # heading, hr, paragraph, list, table, code, mermaid
    data: object
    level: int = 0
    ordered: bool = False
    lang: str = ''
    diagram_index: int = -1


def clean_xml_text(text: str) -> str:
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)


def split_table_row(line: str) -> list[str]:
    stripped = line.strip()
    if stripped.startswith('|'):
        stripped = stripped[1:]
    if stripped.endswith('|'):
        stripped = stripped[:-1]
    cells: list[str] = []
    cur: list[str] = []
    i = 0
    while i < len(stripped):
        ch = stripped[i]
        if ch == '\\' and i + 1 < len(stripped) and stripped[i + 1] == '|':
            cur.append('|')
            i += 2
            continue
        if ch == '|':
            cells.append(''.join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    cells.append(''.join(cur).strip())
    return cells


def is_table_sep(line: str) -> bool:
    parts = split_table_row(line)
    return bool(parts) and all(re.fullmatch(r':?-{2,}:?', p.replace(' ', '')) for p in parts)


def parse_markdown_blocks(md_text: str, diag_counter: list[int]) -> list[Block]:
    lines = md_text.replace('\r\n', '\n').split('\n')
    blocks: list[Block] = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if re.fullmatch(r'-{3,}', stripped):
            blocks.append(Block('hr', None))
            i += 1
            continue
        if stripped.startswith('```'):
            lang = stripped[3:].strip().lower()
            i += 1
            code_lines: list[str] = []
            while i < n and not lines[i].strip().startswith('```'):
                code_lines.append(lines[i])
                i += 1
            i += 1  # consume closing ```
            content = '\n'.join(code_lines)
            if lang == 'mermaid':
                idx = diag_counter[0]
                diag_counter[0] += 1
                blocks.append(Block('mermaid', content, diagram_index=idx))
            else:
                blocks.append(Block('code', content, lang=lang))
            continue
        m_head = re.match(r'^(#{1,4})\s+(.+)$', line)
        if m_head:
            blocks.append(Block('heading', m_head.group(2).strip(), level=len(m_head.group(1))))
            i += 1
            continue
        if '|' in line and i + 1 < n and '|' in lines[i + 1] and is_table_sep(lines[i + 1]):
            headers = split_table_row(line)
            i += 2
            rows: list[list[str]] = []
            while i < n and lines[i].strip().startswith('|'):
                row = split_table_row(lines[i])
                while len(row) < len(headers):
                    row.append('')
                rows.append(row[:len(headers)])
                i += 1
            blocks.append(Block('table', {'headers': headers, 'rows': rows}))
            continue
        m_list = re.match(r'^(\s*)(?:([-*])|(\d+)\.)\s+(.+)$', line)
        if m_list:
            items: list[tuple[int, bool, str]] = []
            while i < n:
                ml = re.match(r'^(\s*)(?:([-*])|(\d+)\.)\s+(.+)$', lines[i])
                if not ml:
                    break
                indent = len(ml.group(1)) // 2
                is_ord = ml.group(3) is not None
                items.append((indent, is_ord, ml.group(4).strip()))
                i += 1
            blocks.append(Block('list', items))
            continue
        para_lines = [stripped]
        i += 1
        while i < n:
            nxt = lines[i]
            ns = nxt.strip()
            if (
                not ns
                or ns.startswith('#')
                or ns.startswith('```')
                or re.fullmatch(r'-{3,}', ns)
                or re.match(r'^(\s*)(?:[-*]|\d+\.)\s+', nxt)
                or ('|' in nxt and i + 1 < n and is_table_sep(lines[i + 1]))
            ):
                break
            para_lines.append(ns)
            i += 1
        blocks.append(Block('paragraph', ' '.join(para_lines)))
    return blocks


TOKEN_RE = re.compile(
    r'(<br\s*/?>)|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))'
)


def tokenize_inline(text: str) -> list[tuple[str, str]]:
    """Return list of (kind, text) where kind is text|br|code|bold|italic."""
    # Replace markdown links [label](url) with just label if file:/// else label
    tokens: list[tuple[str, str]] = []
    pos = 0
    for m in TOKEN_RE.finditer(text):
        if m.start() > pos:
            tokens.append(('text', text[pos:m.start()]))
        if m.group(1):
            tokens.append(('br', '\n'))
        elif m.group(2):
            tokens.append(('code', m.group(2)[1:-1]))
        elif m.group(3):
            tokens.append(('bold', m.group(3)[2:-2]))
        elif m.group(4):
            tokens.append(('italic', m.group(4)[1:-1]))
        elif m.group(5):
            lm = re.match(r'^\[([^\]]+)\]\(([^)]+)\)$', m.group(5))
            tokens.append(('text', lm.group(1) if lm else m.group(5)))
        pos = m.end()
    if pos < len(text):
        tokens.append(('text', text[pos:]))
    return tokens


def inline_to_html(text: str) -> str:
    parts: list[str] = []
    for kind, val in tokenize_inline(text):
        esc = html.escape(val)
        if kind == 'br':
            parts.append('<br/>')
        elif kind == 'code':
            parts.append(f'<code>{esc}</code>')
        elif kind == 'bold':
            parts.append(f'<strong>{esc}</strong>')
        elif kind == 'italic':
            parts.append(f'<em>{esc}</em>')
        else:
            parts.append(esc)
    return ''.join(parts)


def build_html(parsed_docs: list[tuple[str, list[Block]]]) -> str:
    body_parts: list[str] = [
        """
        <section class="cover-page">
          <div class="cover-kicker">CS 213 – DATABASE MANAGEMENT SYSTEM · SUMMATIVE ASSESSMENT 3</div>
          <h1>DSC Operations Management System<br/><span>(DSC OMS — <code>dsc-oms-cs213</code>)</span></h1>
          <p class="cover-subtitle">Complete Technical Project Documentation, Three Separate Crow's Foot ERDs &amp; 3NF Normalization, Complete Data Dictionary, and Executed Test Report</p>
          <div class="cover-meta">
            <div><strong>Course &amp; Section:</strong> CS 213 – Database Management System (SA 3)</div>
            <div><strong>Prepared For:</strong> Prof. Ivy Kim D. Machica</div>
            <div><strong>Database Platform:</strong> SQLite 3 / Cloudflare D1 (<code>migrations/0001</code>–<code>0010</code>, <code>PRAGMA foreign_keys = ON</code>)</div>
            <div><strong>Application Runtime:</strong> Cloudflare Workers (Hono TypeScript API) + Vanilla ES Modules UI</div>
            <div><strong>Document Date:</strong> November 26, 2026</div>
          </div>
          <div class="cover-toc">
            <h2>Included Documents</h2>
            <ol>
              <li><strong>Part I:</strong> Project Documentation, Requirements, Business Rules, Role–Permission Matrix &amp; Architecture</li>
              <li><strong>Part II:</strong> Three Separate Crow's Foot ERDs (Conceptual, Logical + 3NF, Physical SQLite/D1)</li>
              <li><strong>Part III:</strong> Complete Data Dictionary (`0001`–`0010`) &amp; Index / Trigger Design Rationale</li>
              <li><strong>Part IV:</strong> Test Plan, Executed Verification (`TC01`–`TC12`, `TC-SEC-01`, `TC-DEPT-01`), Regression Summary &amp; Defect Log</li>
            </ol>
          </div>
        </section>
        """
    ]

    for doc_idx, (part_label, blocks) in enumerate(parsed_docs):
        body_parts.append(f'<section class="doc-section" data-part="{doc_idx + 1}">')
        body_parts.append(f'<div class="part-banner">{html.escape(part_label)}</div>')
        for blk in blocks:
            if blk.kind == 'hr':
                body_parts.append('<hr/>')
            elif blk.kind == 'heading':
                tag = f'h{min(max(blk.level, 1), 4)}'
                body_parts.append(f'<{tag}>{inline_to_html(str(blk.data))}</{tag}>')
            elif blk.kind == 'paragraph':
                body_parts.append(f'<p>{inline_to_html(str(blk.data))}</p>')
            elif blk.kind == 'code':
                body_parts.append(f'<pre class="code-block"><code>{html.escape(str(blk.data))}</code></pre>')
            elif blk.kind == 'mermaid':
                cap = DIAGRAM_CAPTIONS[blk.diagram_index] if blk.diagram_index < len(DIAGRAM_CAPTIONS) else f'Diagram {blk.diagram_index + 1}'
                body_parts.append(
                    f'<figure class="diagram-figure">'
                    f'<div class="mermaid" data-diag-index="{blk.diagram_index}">{html.escape(str(blk.data))}</div>'
                    f'<figcaption>{html.escape(cap)}</figcaption>'
                    f'</figure>'
                )
            elif blk.kind == 'table':
                tdata = blk.data  # type: ignore
                ths = ''.join(f'<th>{inline_to_html(h)}</th>' for h in tdata['headers'])
                trs = []
                for row in tdata['rows']:
                    tds = ''.join(f'<td>{inline_to_html(c)}</td>' for c in row)
                    trs.append(f'<tr>{tds}</tr>')
                body_parts.append(
                    f'<table><thead><tr>{ths}</tr></thead><tbody>{"".join(trs)}</tbody></table>'
                )
            elif blk.kind == 'list':
                items = blk.data  # type: ignore
                is_ord = bool(items and items[0][1])
                tag = 'ol' if is_ord else 'ul'
                lis = []
                for indent, item_ord, txt in items:
                    cls = ' class="nested-item"' if indent > 0 else ''
                    lis.append(f'<li{cls}>{inline_to_html(txt)}</li>')
                body_parts.append(f'<{tag}>{"".join(lis)}</{tag}>')
        body_parts.append('</section>')

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>DSC OMS (CS 213 SA 3) — Complete Documentation</title>
<style>
  @page {{
    size: Letter;
    margin: 0.6in 0.55in 0.65in 0.55in;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    font-size: 9.5pt;
    line-height: 1.45;
    color: #1a2433;
    margin: 0;
  }}
  .cover-page {{
    min-height: 9.3in;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0.4in;
    border: 2px solid #1e3a5f;
    background: linear-gradient(180deg, #f7faff 0%, #ffffff 45%);
  }}
  .cover-kicker {{
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #2c5282;
    margin-bottom: 12px;
  }}
  .cover-page h1 {{
    font-size: 24pt;
    color: #102a43;
    margin: 0 0 12px 0;
    line-height: 1.2;
  }}
  .cover-page h1 span {{ font-size: 16pt; color: #2b6cb0; }}
  .cover-subtitle {{
    font-size: 11.5pt;
    color: #334e68;
    margin: 0 0 24px 0;
  }}
  .cover-meta {{
    background: #eef4fa;
    border-left: 4px solid #1e3a5f;
    padding: 14px 18px;
    margin-bottom: 24px;
    line-height: 1.7;
  }}
  .cover-toc {{
    border-top: 1px solid #cbd5e1;
    padding-top: 14px;
  }}
  .cover-toc h2 {{ margin: 0 0 8px 0; font-size: 12pt; color: #1e3a5f; }}
  .doc-section {{ page-break-before: always; }}
  .part-banner {{
    background: #1e3a5f;
    color: #ffffff;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 5px 10px;
    border-radius: 3px;
    margin-bottom: 10px;
  }}
  h1 {{ font-size: 15.5pt; color: #102a43; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px; margin: 10px 0 8px 0; }}
  h2 {{ font-size: 12.5pt; color: #1e3a5f; margin: 14px 0 6px 0; page-break-after: avoid; }}
  h3 {{ font-size: 10.5pt; color: #2b4c7e; margin: 10px 0 4px 0; page-break-after: avoid; }}
  h4 {{ font-size: 9.8pt; color: #334e68; margin: 8px 0 4px 0; page-break-after: avoid; }}
  p {{ margin: 0 0 7px 0; }}
  ul, ol {{ margin: 0 0 8px 0; padding-left: 20px; }}
  li {{ margin-bottom: 3px; }}
  li.nested-item {{ margin-left: 16px; list-style-type: circle; }}
  hr {{ border: none; border-top: 1px solid #d9e2ec; margin: 12px 0; }}
  code {{
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 8.3pt;
    background: #f0f4f8;
    padding: 1px 4px;
    border-radius: 3px;
    color: #102a43;
    word-break: break-word;
  }}
  pre.code-block {{
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 3px solid #2b6cb0;
    padding: 8px 10px;
    border-radius: 4px;
    overflow-x: hidden;
    white-space: pre-wrap;
    font-size: 8pt;
    page-break-inside: avoid;
  }}
  pre.code-block code {{ background: none; padding: 0; }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 12px 0;
    font-size: 8.1pt;
    table-layout: auto;
  }}
  thead {{ display: table-header-group; }}
  tr {{ page-break-inside: avoid; }}
  th {{
    background: #1e3a5f;
    color: #ffffff;
    text-align: left;
    padding: 5px 6px;
    border: 1px solid #1e3a5f;
    font-weight: 600;
  }}
  td {{
    padding: 4px 6px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
    word-wrap: break-word;
  }}
  tbody tr:nth-child(even) {{ background: #f8fafc; }}
  figure.diagram-figure {{
    margin: 10px 0 14px 0;
    padding: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: #ffffff;
    text-align: center;
    page-break-inside: avoid;
  }}
  figure.diagram-figure .mermaid {{
    display: flex;
    justify-content: center;
    width: 100%;
  }}
  figure.diagram-figure .mermaid svg {{
    max-width: 100% !important;
    height: auto !important;
    max-height: 8.2in;
  }}
  figcaption {{
    margin-top: 6px;
    font-size: 8.5pt;
    font-weight: 600;
    color: #334e68;
  }}
</style>
</head>
<body>
{''.join(body_parts)}
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  window.__mermaidReady = (async () => {{
    mermaid.initialize({{
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      er: {{ useMaxWidth: true, fontSize: 11, layoutDirection: 'TB' }},
      flowchart: {{ useMaxWidth: true, htmlLabels: true }}
    }});
    await mermaid.run({{ querySelector: '.mermaid' }});
    return document.querySelectorAll('.mermaid').length;
  }})();
</script>
</body>
</html>"""


def png_dimensions(png_bytes: bytes) -> tuple[int, int]:
    assert png_bytes[:8] == b'\x89PNG\r\n\x1a\n', 'Invalid PNG header'
    w, h = struct.unpack('>II', png_bytes[16:24])
    return int(w), int(h)


def docx_runs_xml(text: str, *, base_size_half_pt: int = 20, base_color: str = '1A2433', force_bold: bool = False) -> str:
    out: list[str] = []
    for kind, val in tokenize_inline(clean_xml_text(text)):
        if kind == 'br':
            out.append('<w:r><w:br/></w:r>')
            continue
        is_bold = force_bold or kind == 'bold'
        is_italic = kind == 'italic'
        is_code = kind == 'code'
        rpr = []
        if is_code:
            rpr.append('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>')
            rpr.append('<w:shd w:val="clear" w:color="auto" w:fill="F0F4F8"/>')
            rpr.append(f'<w:sz w:val="{max(base_size_half_pt - 2, 16)}"/><w:szCs w:val="{max(base_size_half_pt - 2, 16)}"/>')
        else:
            rpr.append(f'<w:sz w:val="{base_size_half_pt}"/><w:szCs w:val="{base_size_half_pt}"/>')
        if base_color:
            rpr.append(f'<w:color w:val="{base_color}"/>')
        if is_bold:
            rpr.append('<w:b/>')
        if is_italic:
            rpr.append('<w:i/>')
        rpr_xml = f'<w:rPr>{"".join(rpr)}</w:rPr>'
        out.append(f'<w:r>{rpr_xml}<w:t xml:space="preserve">{xml_escape(val)}</w:t></w:r>')
    return ''.join(out) or f'<w:r><w:t xml:space="preserve"></w:t></w:r>'


def docx_image_paragraph(rel_id: str, doc_pr_id: int, png_bytes: bytes, caption: str) -> str:
    px_w, px_h = png_dimensions(png_bytes)
    max_w_emu = int(6.5 * 914400)
    max_h_emu = int(8.2 * 914400)
    # Capture was at 2x scale; nominal DPI ~192 -> start at ~4762 EMU/px and clamp cleanly
    emu_w = px_w * 4762
    emu_h = px_h * 4762
    if emu_w > max_w_emu:
        scale = max_w_emu / emu_w
        emu_w = max_w_emu
        emu_h = int(emu_h * scale)
    if emu_h > max_h_emu:
        scale = max_h_emu / emu_h
        emu_h = max_h_emu
        emu_w = int(emu_w * scale)
    emu_w = max(emu_w, 914400)
    emu_h = max(emu_h, 457200)
    img_p = (
        '<w:p><w:pPr><w:jc w:val="center"/><w:keepNext/><w:spacing w:before="120" w:after="60"/></w:pPr>'
        '<w:r><w:drawing>'
        '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{emu_w}" cy="{emu_h}"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        f'<wp:docPr id="{doc_pr_id}" name="Diagram{doc_pr_id}"/>'
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic>'
        f'<pic:nvPicPr><pic:cNvPr id="{doc_pr_id}" name="diagram_{doc_pr_id}.png"/><pic:cNvPicPr/></pic:nvPicPr>'
        f'<pic:blipFill><a:blip r:embed="{rel_id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{emu_w}" cy="{emu_h}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        '</pic:pic>'
        '</a:graphicData></a:graphic>'
        '</wp:inline>'
        '</w:drawing></w:r></w:p>'
    )
    cap_p = (
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="160"/></w:pPr>'
        f'{docx_runs_xml(caption, base_size_half_pt=18, base_color="334E68", force_bold=True)}</w:p>'
    )
    return img_p + cap_p


def docx_table_xml(headers: list[str], rows: list[list[str]]) -> str:
    ncols = max(len(headers), 1)
    total_w = 9360  # 6.5 inches in twips
    col_w = total_w // ncols
    grid = ''.join(f'<w:gridCol w:w="{col_w}"/>' for _ in headers)
    tbl_pr = (
        '<w:tblPr>'
        f'<w:tblW w:w="{total_w}" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="6" w:space="0" w:color="1E3A5F"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
        '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="1E3A5F"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
        '</w:tblBorders>'
        '<w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>'
        '</w:tblPr>'
    )
    header_cells = ''.join(
        f'<w:tc><w:tcPr><w:tcW w:w="{col_w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="1E3A5F"/></w:tcPr>'
        f'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>'
        f'{docx_runs_xml(h, base_size_half_pt=17, base_color="FFFFFF", force_bold=True)}</w:p></w:tc>'
        for h in headers
    )
    rows_xml = [f'<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>{header_cells}</w:tr>']
    for r_idx, row in enumerate(rows):
        fill = 'F8FAFC' if r_idx % 2 == 1 else 'FFFFFF'
        tcs = ''.join(
            f'<w:tc><w:tcPr><w:tcW w:w="{col_w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="{fill}"/></w:tcPr>'
            f'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>'
            f'{docx_runs_xml(cell, base_size_half_pt=17, base_color="1A2433")}</w:p></w:tc>'
            for cell in row
        )
        rows_xml.append(f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{tcs}</w:tr>')
    return f'<w:tbl>{tbl_pr}<w:tblGrid>{grid}</w:tblGrid>{"".join(rows_xml)}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>'


def build_docx(parsed_docs: list[tuple[str, list[Block]]], diagram_pngs: list[bytes], out_path: Path) -> None:
    body_xml: list[str] = []

    # Cover Page
    body_xml.append(
        '<w:p><w:pPr><w:spacing w:before="1400" w:after="120"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="2C5282"/></w:rPr>'
        '<w:t>CS 213 – DATABASE MANAGEMENT SYSTEM · SUMMATIVE ASSESSMENT 3</w:t></w:r></w:p>'
    )
    body_xml.append(
        '<w:p><w:pPr><w:spacing w:before="120" w:after="160"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="102A43"/></w:rPr>'
        '<w:t>DSC Operations Management System (DSC OMS)</w:t></w:r></w:p>'
    )
    body_xml.append(
        '<w:p><w:pPr><w:spacing w:before="0" w:after="360"/></w:pPr>'
        '<w:r><w:rPr><w:sz w:val="24"/><w:color w:val="334E68"/></w:rPr>'
        '<w:t>Complete Project Documentation, Three Separate Crow\'s Foot ERDs &amp; 3NF Normalization, Complete Data Dictionary, and Executed Test Report</w:t></w:r></w:p>'
    )
    body_xml.append(
        docx_table_xml(
            ['Submission Field', 'Details'],
            [
                ['Course & Assessment', 'CS 213 – Database Management System (SA 3 – Database Application Project)'],
                ['Prepared For', 'Prof. Ivy Kim D. Machica'],
                ['Application Root', '`dsc-oms-cs213/` (isolated clean CS 213 copy)'],
                ['Database Engine', 'SQLite 3 / Cloudflare D1 (`migrations/0001`–`0010`, `PRAGMA foreign_keys = ON`)'],
                ['Application Stack', 'Cloudflare Worker (Hono TypeScript API) + Vanilla ES Modules UI'],
                ['Included Sections', 'Part I Project Docs · Part II 3 Crow\'s Foot ERDs · Part III Data Dictionary · Part IV Executed Test Report'],
                ['Document Date', 'November 26, 2026'],
            ],
        )
    )

    doc_pr_id = 1
    for part_label, blocks in parsed_docs:
        body_xml.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        body_xml.append(
            f'<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="1E3A5F"/><w:spacing w:before="60" w:after="140"/></w:pPr>'
            f'{docx_runs_xml(" " + part_label + " ", base_size_half_pt=18, base_color="FFFFFF", force_bold=True)}</w:p>'
        )
        for blk in blocks:
            if blk.kind == 'hr':
                body_xml.append(
                    '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D9E2EC"/></w:pBdr>'
                    '<w:spacing w:before="80" w:after="80"/></w:pPr></w:p>'
                )
            elif blk.kind == 'heading':
                lvl = min(max(blk.level, 1), 4)
                sizes = {1: 30, 2: 25, 3: 22, 4: 20}
                colors = {1: '102A43', 2: '1E3A5F', 3: '2B4C7E', 4: '334E68'}
                bdr = '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="1E3A5F"/></w:pBdr>' if lvl == 1 else ''
                body_xml.append(
                    f'<w:p><w:pPr><w:pStyle w:val="Heading{lvl}"/>{bdr}<w:keepNext/>'
                    f'<w:spacing w:before="160" w:after="80"/></w:pPr>'
                    f'{docx_runs_xml(str(blk.data), base_size_half_pt=sizes[lvl], base_color=colors[lvl], force_bold=True)}</w:p>'
                )
            elif blk.kind == 'paragraph':
                body_xml.append(
                    f'<w:p><w:pPr><w:spacing w:before="0" w:after="100" w:line="276" w:lineRule="auto"/></w:pPr>'
                    f'{docx_runs_xml(str(blk.data), base_size_half_pt=20, base_color="1A2433")}</w:p>'
                )
            elif blk.kind == 'code':
                for line in str(blk.data).split('\n'):
                    body_xml.append(
                        f'<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>'
                        f'<w:ind w:left="240" w:right="120"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
                        f'<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="17"/><w:color w:val="102A43"/></w:rPr>'
                        f'<w:t xml:space="preserve">{xml_escape(clean_xml_text(line) or " ")}</w:t></w:r></w:p>'
                    )
                body_xml.append('<w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>')
            elif blk.kind == 'mermaid':
                idx = blk.diagram_index
                if 0 <= idx < len(diagram_pngs):
                    cap = DIAGRAM_CAPTIONS[idx] if idx < len(DIAGRAM_CAPTIONS) else f'Diagram {idx + 1}'
                    body_xml.append(docx_image_paragraph(f'rIdImg{idx + 1}', doc_pr_id, diagram_pngs[idx], cap))
                    doc_pr_id += 1
            elif blk.kind == 'table':
                tdata = blk.data  # type: ignore
                body_xml.append(docx_table_xml(tdata['headers'], tdata['rows']))
            elif blk.kind == 'list':
                items = blk.data  # type: ignore
                ord_counter = 1
                for indent, is_ord, txt in items:
                    if indent == 0:
                        prefix = f'{ord_counter}. ' if is_ord else '• '
                        if is_ord:
                            ord_counter += 1
                    else:
                        prefix = '◦ '
                    left_ind = 360 + indent * 360
                    body_xml.append(
                        f'<w:p><w:pPr><w:ind w:left="{left_ind}" w:hanging="220"/><w:spacing w:before="0" w:after="60"/></w:pPr>'
                        f'{docx_runs_xml(prefix + txt, base_size_half_pt=20, base_color="1A2433")}</w:p>'
                    )

    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<w:body>'
        + ''.join(body_xml)
        + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>'
        '</w:sectPr></w:body></w:document>'
    )

    styles_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:docDefaults><w:rPrDefault><w:rPr>'
        '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>'
        '<w:sz w:val="20"/><w:szCs w:val="20"/>'
        '</w:rPr></w:rPrDefault></w:docDefaults>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="3"/></w:pPr></w:style>'
        '</w:styles>'
    )

    img_rels = ''.join(
        f'<Relationship Id="rIdImg{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram_{i + 1}.png"/>'
        for i in range(len(diagram_pngs))
    )
    doc_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        f'{img_rels}'
        '</Relationships>'
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rIdDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>'
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Default Extension="png" ContentType="image/png"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '</Types>'
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(out_path, 'w', compression=ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr('[Content_Types].xml', content_types_xml.encode('utf-8'))
        z.writestr('_rels/.rels', root_rels_xml.encode('utf-8'))
        z.writestr('word/document.xml', document_xml.encode('utf-8'))
        z.writestr('word/styles.xml', styles_xml.encode('utf-8'))
        z.writestr('word/_rels/document.xml.rels', doc_rels_xml.encode('utf-8'))
        for idx, png in enumerate(diagram_pngs):
            z.writestr(f'word/media/diagram_{idx + 1}.png', png)

    # Strict validation of archive and every XML file inside
    with ZipFile(out_path) as z:
        assert z.testzip() is None, 'Corrupt DOCX ZIP detected'
        for name in z.namelist():
            if name.endswith(('.xml', '.rels')):
                ET.fromstring(z.read(name))


def main() -> None:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    DIAG_SCRATCH.mkdir(parents=True, exist_ok=True)

    diag_counter = [0]
    parsed_docs: list[tuple[str, list[Block]]] = []
    for title, path in INPUT_DOCS:
        text = path.read_text(encoding='utf-8')
        assert 'classDiagram' not in text and '«table»' not in text, f'UML found in {path}'
        parsed_docs.append((title, parse_markdown_blocks(text, diag_counter)))

    html_doc = build_html(parsed_docs)
    html_file = DIAG_SCRATCH / 'cs213_combined.html'
    html_file.write_text(html_doc, encoding='utf-8')

    pdf_out = EXPORTS_DIR / 'DSC-OMS-CS213-Complete-Documentation.pdf'
    docx_out = EXPORTS_DIR / 'DSC-OMS-CS213-Complete-Documentation.docx'

    diagram_pngs: list[bytes] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1200, 'height': 900}, device_scale_factor=2)
        page.goto(html_file.as_uri(), wait_until='networkidle')
        count = page.evaluate('window.__mermaidReady')
        assert count == diag_counter[0], f'Expected {diag_counter[0]} diagrams, rendered {count}'

        err_count = page.locator('.mermaid .error-icon, .mermaid text:has-text("Syntax error")').count()
        assert err_count == 0, f'Mermaid syntax error count = {err_count}'

        for idx in range(count):
            loc = page.locator(f'.mermaid[data-diag-index="{idx}"] svg').first
            box = loc.bounding_box()
            assert box and box['width'] > 50 and box['height'] > 50, f'Diagram {idx} failed box check: {box}'
            png = loc.screenshot(type='png')
            diagram_pngs.append(png)
            (DIAG_SCRATCH / f'diagram_{idx + 1}.png').write_bytes(png)

        page.emulate_media(media='print')
        page.pdf(
            path=str(pdf_out),
            format='Letter',
            print_background=True,
            display_header_footer=True,
            header_template='<div style="font-size:8px;color:#64748b;width:100%;text-align:right;padding-right:24px;">DSC OMS (dsc-oms-cs213) — CS 213 SA 3 Complete Documentation</div>',
            footer_template='<div style="font-size:8px;color:#64748b;width:100%;display:flex;justify-content:space-between;padding:0 24px;"><span>CS 213 – Database Management System</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
            margin={'top': '0.6in', 'bottom': '0.65in', 'left': '0.5in', 'right': '0.5in'},
        )
        browser.close()

    build_docx(parsed_docs, diagram_pngs, docx_out)

    shutil.copy2(pdf_out, DIST_DIR / pdf_out.name)
    shutil.copy2(docx_out, DIST_DIR / docx_out.name)

    print(f'Rendered {len(diagram_pngs)} Mermaid diagrams with 0 syntax errors.')
    print(f'PDF  -> {pdf_out} ({pdf_out.stat().st_size} bytes)')
    print(f'DOCX -> {docx_out} ({docx_out.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
