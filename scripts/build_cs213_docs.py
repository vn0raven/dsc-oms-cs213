"""Build combined CS 213 PDF and DOCX documentation with rendered Crow's Foot ERDs.

Clean, formal academic black-and-white styling (no colored banners, no running top headers,
and no decorative divider lines).

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
    DOCS_CS213 / '01_PROJECT_DOCUMENTATION.md',
    DOCS_CS213 / '02_THREE_LEVEL_ERDS_AND_NORMALIZATION.md',
    DOCS_CS213 / '03_DATA_DICTIONARY.md',
    DOCS_CS213 / '04_TEST_PLAN_AND_EXECUTED_REPORT.md',
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


def build_html(parsed_docs: list[list[Block]]) -> str:
    body_parts: list[str] = [
        """
        <section class="cover-page">
          <div class="cover-kicker">CS 213 – DATABASE MANAGEMENT SYSTEM · SUMMATIVE ASSESSMENT 3</div>
          <h1>DSC Operations Management System (DSC OMS)</h1>
          <p class="cover-subtitle">Project Documentation, Three Separate Crow's Foot ERDs &amp; 3NF Normalization, Complete Data Dictionary, and Executed Test Report</p>
          <table class="cover-meta-table">
            <tbody>
              <tr><th>Course &amp; Assessment</th><td>CS 213 – Database Management System (SA 3 – Database Application Project)</td></tr>
              <tr><th>Prepared For</th><td>Prof. Ivy Kim D. Machica</td></tr>
              <tr><th>Application Root</th><td><code>dsc-oms-cs213/</code> (isolated clean CS 213 copy)</td></tr>
              <tr><th>Database Platform</th><td>SQLite 3 / Cloudflare D1 (<code>migrations/0001</code>–<code>0010</code>, <code>PRAGMA foreign_keys = ON</code>)</td></tr>
              <tr><th>Application Stack</th><td>Cloudflare Workers (Hono TypeScript API) + Vanilla ES Modules UI</td></tr>
              <tr><th>Date</th><td>November 26, 2026</td></tr>
            </tbody>
          </table>
          <div class="cover-toc">
            <h2>Table of Contents</h2>
            <ol>
              <li><strong>Part I:</strong> Project Documentation, Requirements, Business Rules, Role–Permission Matrix &amp; Architecture</li>
              <li><strong>Part II:</strong> Three Separate Crow's Foot ERDs (Conceptual, Logical + 3NF, Physical SQLite/D1)</li>
              <li><strong>Part III:</strong> Complete Data Dictionary (<code>0001</code>–<code>0010</code>) &amp; Index / Trigger Design Rationale</li>
              <li><strong>Part IV:</strong> Test Plan, Executed Verification (<code>TC01</code>–<code>TC12</code>, <code>TC-SEC-01</code>, <code>TC-DEPT-01</code>), Regression Summary &amp; Defect Log</li>
            </ol>
          </div>
        </section>
        """
    ]

    for doc_idx, blocks in enumerate(parsed_docs):
        body_parts.append(f'<section class="doc-section" data-part="{doc_idx + 1}">')
        for blk in blocks:
            if blk.kind == 'hr':
                continue
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
    margin: 0.75in 0.7in 0.75in 0.7in;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #000000;
    background: #ffffff;
    margin: 0;
  }}
  .cover-page {{
    min-height: 9.0in;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0.25in 0.1in;
    background: #ffffff;
  }}
  .cover-kicker {{
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #000000;
    text-align: center;
    margin-bottom: 14px;
  }}
  .cover-page h1 {{
    font-size: 22pt;
    color: #000000;
    text-align: center;
    margin: 0 0 10px 0;
    line-height: 1.25;
  }}
  .cover-subtitle {{
    font-size: 11.5pt;
    color: #000000;
    text-align: center;
    margin: 0 0 28px 0;
  }}
  .cover-meta-table {{
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 26px 0;
    font-size: 9.8pt;
  }}
  .cover-meta-table th {{
    width: 28%;
    background: #f2f2f2;
    color: #000000;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid #000000;
  }}
  .cover-meta-table td {{
    background: #ffffff;
    color: #000000;
    padding: 6px 8px;
    border: 1px solid #000000;
  }}
  .cover-toc h2 {{
    margin: 0 0 8px 0;
    font-size: 12pt;
    color: #000000;
  }}
  .cover-toc ol {{
    margin: 0;
    padding-left: 22px;
    line-height: 1.7;
  }}
  .doc-section {{ page-break-before: always; }}
  h1 {{ font-size: 15pt; color: #000000; margin: 4px 0 10px 0; }}
  h2 {{ font-size: 12.5pt; color: #000000; margin: 14px 0 6px 0; page-break-after: avoid; }}
  h3 {{ font-size: 11pt; color: #000000; margin: 10px 0 4px 0; page-break-after: avoid; }}
  h4 {{ font-size: 10.5pt; color: #000000; margin: 8px 0 4px 0; page-break-after: avoid; }}
  p {{ margin: 0 0 8px 0; color: #000000; }}
  ul, ol {{ margin: 0 0 9px 0; padding-left: 22px; color: #000000; }}
  li {{ margin-bottom: 3px; }}
  li.nested-item {{ margin-left: 16px; list-style-type: circle; }}
  code {{
    font-family: Consolas, 'Courier New', monospace;
    font-size: 8.8pt;
    color: #000000;
    background: #ffffff;
    word-break: break-word;
  }}
  pre.code-block {{
    background: #fafafa;
    border: 1px solid #000000;
    padding: 8px 10px;
    overflow-x: hidden;
    white-space: pre-wrap;
    font-size: 8.5pt;
    color: #000000;
    page-break-inside: avoid;
  }}
  pre.code-block code {{ background: none; padding: 0; }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 12px 0;
    font-size: 8.8pt;
    table-layout: auto;
    color: #000000;
  }}
  thead {{ display: table-header-group; }}
  tr {{ page-break-inside: avoid; }}
  th {{
    background: #f2f2f2;
    color: #000000;
    text-align: left;
    padding: 5px 6px;
    border: 1px solid #000000;
    font-weight: 700;
  }}
  td {{
    padding: 4px 6px;
    border: 1px solid #000000;
    background: #ffffff;
    color: #000000;
    vertical-align: top;
    word-wrap: break-word;
  }}
  figure.diagram-figure {{
    margin: 10px 0 14px 0;
    padding: 6px 0;
    border: none;
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
    max-height: 8.0in;
  }}
  figcaption {{
    margin-top: 6px;
    font-size: 9pt;
    font-weight: 700;
    color: #000000;
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
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: {{
        background: '#ffffff',
        primaryColor: '#ffffff',
        primaryTextColor: '#000000',
        primaryBorderColor: '#000000',
        secondaryColor: '#f5f5f5',
        tertiaryColor: '#ffffff',
        lineColor: '#000000',
        textColor: '#000000',
        mainBkg: '#ffffff',
        nodeBorder: '#000000',
        clusterBkg: '#ffffff',
        clusterBorder: '#000000',
        attributeBackgroundColorOdd: '#ffffff',
        attributeBackgroundColorEven: '#f7f7f7',
        fontFamily: 'Times New Roman, Georgia, serif'
      }},
      er: {{ useMaxWidth: true, fontSize: 11, layoutDirection: 'TB', stroke: '#000000', fill: '#ffffff' }},
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


def docx_runs_xml(text: str, *, base_size_half_pt: int = 21, force_bold: bool = False) -> str:
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
            rpr.append(f'<w:sz w:val="{max(base_size_half_pt - 2, 17)}"/><w:szCs w:val="{max(base_size_half_pt - 2, 17)}"/>')
        else:
            rpr.append(f'<w:sz w:val="{base_size_half_pt}"/><w:szCs w:val="{base_size_half_pt}"/>')
        rpr.append('<w:color w:val="000000"/>')
        if is_bold:
            rpr.append('<w:b/>')
        if is_italic:
            rpr.append('<w:i/>')
        rpr_xml = f'<w:rPr>{"".join(rpr)}</w:rPr>'
        out.append(f'<w:r>{rpr_xml}<w:t xml:space="preserve">{xml_escape(val)}</w:t></w:r>')
    return ''.join(out) or '<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t xml:space="preserve"></w:t></w:r>'


def docx_image_paragraph(rel_id: str, doc_pr_id: int, png_bytes: bytes, caption: str) -> str:
    px_w, px_h = png_dimensions(png_bytes)
    max_w_emu = int(6.5 * 914400)
    max_h_emu = int(8.2 * 914400)
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
        f'{docx_runs_xml(caption, base_size_half_pt=18, force_bold=True)}</w:p>'
    )
    return img_p + cap_p


def docx_table_xml(headers: list[str], rows: list[list[str]]) -> str:
    ncols = max(len(headers), 1)
    total_w = 9360
    col_w = total_w // ncols
    grid = ''.join(f'<w:gridCol w:w="{col_w}"/>' for _ in headers)
    tbl_pr = (
        '<w:tblPr>'
        f'<w:tblW w:w="{total_w}" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        '</w:tblBorders>'
        '<w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>'
        '</w:tblPr>'
    )
    header_cells = ''.join(
        f'<w:tc><w:tcPr><w:tcW w:w="{col_w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr>'
        f'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>'
        f'{docx_runs_xml(h, base_size_half_pt=18, force_bold=True)}</w:p></w:tc>'
        for h in headers
    )
    rows_xml = [f'<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>{header_cells}</w:tr>']
    for row in rows:
        tcs = ''.join(
            f'<w:tc><w:tcPr><w:tcW w:w="{col_w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/></w:tcPr>'
            f'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>'
            f'{docx_runs_xml(cell, base_size_half_pt=18)}</w:p></w:tc>'
            for cell in row
        )
        rows_xml.append(f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{tcs}</w:tr>')
    return f'<w:tbl>{tbl_pr}<w:tblGrid>{grid}</w:tblGrid>{"".join(rows_xml)}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>'


def build_docx(parsed_docs: list[list[Block]], diagram_pngs: list[bytes], out_path: Path) -> None:
    body_xml: list[str] = []

    # Clean formal centered Cover Page (no colored boxes, no horizontal lines)
    body_xml.append(
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="1400" w:after="160"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="000000"/></w:rPr>'
        '<w:t>CS 213 – DATABASE MANAGEMENT SYSTEM · SUMMATIVE ASSESSMENT 3</w:t></w:r></w:p>'
    )
    body_xml.append(
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="140"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="000000"/></w:rPr>'
        '<w:t>DSC Operations Management System (DSC OMS)</w:t></w:r></w:p>'
    )
    body_xml.append(
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="360"/></w:pPr>'
        '<w:r><w:rPr><w:sz w:val="23"/><w:color w:val="000000"/></w:rPr>'
        '<w:t>Project Documentation, Three Separate Crow\'s Foot ERDs &amp; 3NF Normalization, Complete Data Dictionary, and Executed Test Report</w:t></w:r></w:p>'
    )
    body_xml.append(
        docx_table_xml(
            ['Submission Field', 'Details'],
            [
                ['Course & Assessment', 'CS 213 – Database Management System (SA 3 – Database Application Project)'],
                ['Prepared For', 'Prof. Ivy Kim D. Machica'],
                ['Application Root', '`dsc-oms-cs213/` (isolated clean CS 213 copy)'],
                ['Database Engine', 'SQLite 3 / Cloudflare D1 (`migrations/0001`–`0010`, `PRAGMA foreign_keys = ON`)'],
                ['Application Stack', 'Cloudflare Workers (Hono TypeScript API) + Vanilla ES Modules UI'],
                ['Date', 'November 26, 2026'],
            ],
        )
    )
    body_xml.append(
        '<w:p><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>'
        f'{docx_runs_xml("Table of Contents", base_size_half_pt=24, force_bold=True)}</w:p>'
    )
    for item in (
        '1. **Part I:** Project Documentation, Requirements, Business Rules, Role–Permission Matrix & Architecture',
        '2. **Part II:** Three Separate Crow\'s Foot ERDs (Conceptual, Logical + 3NF, Physical SQLite/D1)',
        '3. **Part III:** Complete Data Dictionary (`0001`–`0010`) & Index / Trigger Design Rationale',
        '4. **Part IV:** Test Plan, Executed Verification (`TC01`–`TC12`, `TC-SEC-01`, `TC-DEPT-01`), Regression Summary & Defect Log',
    ):
        body_xml.append(
            f'<w:p><w:pPr><w:ind w:left="360" w:hanging="220"/><w:spacing w:before="0" w:after="60"/></w:pPr>'
            f'{docx_runs_xml(item, base_size_half_pt=21)}</w:p>'
        )

    doc_pr_id = 1
    for blocks in parsed_docs:
        body_xml.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        for blk in blocks:
            if blk.kind == 'hr':
                continue
            elif blk.kind == 'heading':
                lvl = min(max(blk.level, 1), 4)
                sizes = {1: 30, 2: 25, 3: 22, 4: 21}
                body_xml.append(
                    f'<w:p><w:pPr><w:pStyle w:val="Heading{lvl}"/><w:keepNext/>'
                    f'<w:spacing w:before="180" w:after="80"/></w:pPr>'
                    f'{docx_runs_xml(str(blk.data), base_size_half_pt=sizes[lvl], force_bold=True)}</w:p>'
                )
            elif blk.kind == 'paragraph':
                body_xml.append(
                    f'<w:p><w:pPr><w:spacing w:before="0" w:after="100" w:line="276" w:lineRule="auto"/></w:pPr>'
                    f'{docx_runs_xml(str(blk.data), base_size_half_pt=21)}</w:p>'
                )
            elif blk.kind == 'code':
                for line in str(blk.data).split('\n'):
                    body_xml.append(
                        '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FAFAFA"/>'
                        '<w:ind w:left="240" w:right="120"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
                        '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/><w:color w:val="000000"/></w:rPr>'
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
                        f'{docx_runs_xml(prefix + txt, base_size_half_pt=21)}</w:p>'
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
        '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
        '<w:color w:val="000000"/>'
        '<w:sz w:val="21"/><w:szCs w:val="21"/>'
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
    parsed_docs: list[list[Block]] = []
    for path in INPUT_DOCS:
        text = path.read_text(encoding='utf-8')
        assert 'classDiagram' not in text and '«table»' not in text, f'UML found in {path}'
        parsed_docs.append(parse_markdown_blocks(text, diag_counter))

    html_doc = build_html(parsed_docs)
    html_file = DIAG_SCRATCH / 'cs213_combined.html'
    html_file.write_text(html_doc, encoding='utf-8')

    pdf_out = EXPORTS_DIR / 'DSC-OMS-CS213-Complete-Documentation.pdf'
    docx_out = EXPORTS_DIR / 'DSC-OMS-CS213-Complete-Documentation.docx'

    diagram_pngs: list[bytes] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1100, 'height': 900}, device_scale_factor=2)
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

        # Save visual preview screenshots of cover and Part I top
        page.locator('.cover-page').screenshot(path=str(DIAG_SCRATCH / 'preview_cover.png'))
        page.locator('.doc-section[data-part="1"]').scroll_into_view_if_needed()
        page.screenshot(path=str(DIAG_SCRATCH / 'preview_part1.png'))

        page.emulate_media(media='print')
        page.pdf(
            path=str(pdf_out),
            format='Letter',
            print_background=True,
            display_header_footer=True,
            header_template='<span></span>',
            footer_template='<div style="font-size:8.5pt;font-family:\'Times New Roman\',serif;color:#000000;width:100%;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
            margin={'top': '0.75in', 'bottom': '0.75in', 'left': '0.7in', 'right': '0.7in'},
        )
        browser.close()

    build_docx(parsed_docs, diagram_pngs, docx_out)

    shutil.copy2(pdf_out, DIST_DIR / pdf_out.name)
    shutil.copy2(docx_out, DIST_DIR / docx_out.name)

    print(f'Rendered {len(diagram_pngs)} monochrome Mermaid diagrams with 0 syntax errors.')
    print(f'PDF  -> {pdf_out} ({pdf_out.stat().st_size} bytes)')
    print(f'DOCX -> {docx_out} ({docx_out.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
