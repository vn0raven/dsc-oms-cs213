"""Package the dated handover and explicit reviewed artifacts without local state."""
from pathlib import Path
import hashlib
import html
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'handover-2026-11-25'
OUT.mkdir(parents=True, exist_ok=True)
md = ROOT / 'docs' / 'COMPLETE_HANDOVER_2026_11_25.md'
content = md.read_text(encoding='utf-8')
parts, code, buffer = [], False, []
for line in content.splitlines():
    if line.startswith('```'):
        if code:
            parts.append('<pre><code>' + html.escape('\n'.join(buffer)) + '</code></pre>')
            buffer = []
        code = not code
        continue
    if code:
        buffer.append(line)
        continue
    safe = html.escape(line)
    safe = re.sub(r'`([^`]+)`', r'<code>\1</code>', safe)
    match = re.match(r'^(#{1,3}) (.*)', line)
    if match:
        level = len(match[1])
        anchor = re.sub(r'[^a-z0-9]+', '-', match[2].lower()).strip('-')
        parts.append(f'<h{level} id="{anchor}">{html.escape(match[2])}</h{level}>')
    elif line.startswith('- '):
        parts.append('<p class="item">&#8226; ' + safe[2:] + '</p>')
    elif line.strip():
        parts.append('<p>' + safe + '</p>')
toc = ''.join('<li><a href="#' + re.sub(r'[^a-z0-9]+', '-', h.lower()).strip('-') + '">' + html.escape(h) + '</a></li>' for h in re.findall(r'^## (.+)$', content, re.M))
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DSC OMS Complete Technical Handover</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#17202b;font:16px/1.65 system-ui,Arial,sans-serif}main{max-width:960px;margin:32px auto;padding:40px 48px;background:white;border:1px solid #d8dde3;border-radius:10px}h1,h2,h3{color:#000;line-height:1.25}h1{font-size:32px}h2{margin-top:36px;font-size:23px;scroll-margin-top:20px}p{margin:12px 0}p.item{padding-left:18px;text-indent:-14px;margin:7px 0}a{color:#ad151b}a:focus-visible{outline:3px solid #d71920;outline-offset:3px}nav{border:1px solid #ddd;padding:12px 22px;margin:24px 0}nav ul{columns:2;padding-left:20px}code{font:13px/1.5 Consolas,monospace;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#f3f4f6;padding:16px;border:1px solid #ddd;border-radius:6px;overflow-wrap:anywhere} @media(max-width:650px){main{margin:0;padding:24px 18px;border:0}nav ul{columns:1}}@media print{body{background:white}main{border:0;margin:0;padding:0;max-width:none}nav{break-after:page}h2{break-after:avoid}pre{break-inside:avoid}a{color:#000}}
</style><main>'''
parts.insert(2, '<nav aria-label="Contents"><strong>Contents</strong><ul>' + toc + '</ul></nav>')
html_path = OUT / 'DSC-OMS-Complete-Handover.html'
html_path.write_text(document + '\n'.join(parts) + '</main></html>', encoding='utf-8')
files = [('handover/COMPLETE_HANDOVER_2026_11_25.md', md), ('handover/DSC-OMS-Complete-Handover.html', html_path)]
for name, folder in [
    ('dsc-oms-ui-polish-2026-11-22-source.zip', 'source'),
    ('dsc-oms-ui-polish-2026-11-22-evidence.zip', 'evidence'),
    ('dsc-oms-validation-evidence.zip', 'evidence'),
    ('DSC-OMS-Offline-Preview.zip', 'optional-older-demo'),
    ('DSC-OMS-Offline-Preview.html', 'optional-older-demo'),
]:
    path = ROOT / 'dist' / name
    if not path.is_file():
        raise FileNotFoundError(path)
    files.append((folder + '/' + name, path))
refs = Path.home() / 'Downloads'
missing = []
for name in ['DSC_OMS_M3_5_UI_Refactor_Candidate.zip', 'DSC_OMS_Event_Task_UX_Authorization_Spec.md', 'plaintext (10).txt', 'DSC_CBL_EVENTS.docx']:
    path = refs / name
    if path.is_file():
        files.append(('references/' + name, path))
    else:
        missing.append(name)
readme = OUT / 'START-HERE.txt'
readme.write_text('DSC OMS COMPLETE HANDOVER - November 25 2026 PHT\n\n1. Open handover/DSC-OMS-Complete-Handover.html in a browser.\n2. Latest application: source/dsc-oms-ui-polish-2026-11-22-source.zip.\n3. Extract it and enter its dsc-oms-cloudflare folder containing package.json.\n4. Follow the Windows local setup in the handover.\n\nEvidence records actual November 19/22 checks; no new full regression is claimed.\nThe optional offline demo predates UI polish and is not the real backend.\nReferences are supporting inputs, not permission to deploy or expand roles.\nNo secrets, dependencies, local databases, or production backups are included.\nNo remote deployment or D1 operation is authorized. Production gates remain open.\n', encoding='utf-8')
files.append(('START-HERE.txt', readme))
records = [{'path': name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for name, p in files]
source = ROOT / 'dist/dsc-oms-ui-polish-2026-11-22-source.zip'
with zipfile.ZipFile(source) as z:
    forbidden = [n for n in z.namelist() if any(part in {'.dev.vars', '.env', 'node_modules', '.qa-state', '.wrangler'} for part in Path(n).parts) or n.endswith(('.sqlite', '.sqlite3', '.db'))]
    if forbidden:
        raise ValueError(forbidden)
    differences = []
    compared = 0
    for name in z.namelist():
        if name.endswith('/'):
            continue
        rel = Path(*Path(name).parts[1:])
        current = ROOT / rel
        if not current.is_file() or current.read_bytes() != z.read(name):
            differences.append(str(rel))
        compared += 1
    if differences:
        raise ValueError({'sourceArchiveDiffersFromWorkspace': differences})
manifest = {'preparedDatePHT': '2026-11-25', 'lastFullRegressionDate': '2026-11-22', 'productionDeployed': False, 'remoteD1Operations': False, 'sourceArchiveEntriesComparedToWorkspace': compared, 'sourceArchiveDifferences': differences, 'missingOptionalReferences': missing, 'files': records}
manifest_path = OUT / 'HANDOVER_MANIFEST.json'
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
bundle = ROOT / 'dist/DSC-OMS-Complete-Handover-2026-11-25.zip'
with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, path in files:
        z.write(path, name)
    z.write(manifest_path, 'HANDOVER_MANIFEST.json')
with zipfile.ZipFile(bundle) as z:
    assert z.testzip() is None
    for record in records:
        assert hashlib.sha256(z.read(record['path'])).hexdigest() == record['sha256']
digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
bundle.with_suffix('.sha256').write_text(digest + '  ' + bundle.name + '\n', encoding='ascii')
print(json.dumps({'bundle': str(bundle), 'bytes': bundle.stat().st_size, 'sha256': digest, 'sourceFilesMatched': compared, 'includedFiles': len(records) + 1, 'missingOptionalReferences': missing}, indent=2))
