"""Create a strictly allowlisted CS 213 submission package without local state or secrets.
Run: python scripts/package_release.py
This package is a reviewed CS 213 academic submission artifact, NOT a production deployment.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist' / 'dsc-oms-cs213-submission.zip'
ROOT_FILES = {
    'README.md', 'README_CS213.md', 'CHANGELOG.md', 'package.json', 'package-lock.json',
    'tsconfig.json', 'wrangler.jsonc', 'vitest.config.mts', 'worker-configuration.d.ts',
    '.editorconfig', '.prettierrc', '.gitignore',
}
ALLOWED = {
    'src': {'.ts'},
    'migrations': {'.sql'},
    'public': {'.js', '.mjs', '.html', '.css', '.svg'},
    'test': {'.ts', '.json', '.mjs', '.py'},
    'scripts': {'.py', '.mjs', '.ps1'},
    'docs': {'.md', '.csv', '.json', '.pdf', '.docx'},
}
DENIED_NAMES = {
    '.dev.vars', '.env', '.git', 'node_modules', 'backups',
    '.cs213-state', '.qa-state', '.qa-venv', 'wrangler.cs213.jsonc', 'wrangler.qa.jsonc',
    'real-users.sql', 'remote-roster-seed.sql', 'add-external-testers.sql',
}
EXTRA_ALLOWED_PATHS = {
    'public/_headers',
    'scripts/m3_local_demo_seed.sql',
    'scripts/cs213_demo_seed.sql',
    'test/requirements-qa.txt',
}


def selected():
    for f in sorted(ROOT.rglob('*')):
        if not f.is_file():
            continue
        rel = f.relative_to(ROOT)
        if any(part.startswith('temp-') or part in DENIED_NAMES
               or part in {'.audit-build', '.wrangler', 'dist', '__pycache__'}
               for part in rel.parts):
            continue
        if any(part.startswith('.') for part in rel.parts[1:]):
            continue
        if f.name.endswith(('.bak', '.sqlite', '.sqlite-wal', '.sqlite-shm', '.zip')):
            continue
        if len(rel.parts) == 1:
            if f.name in ROOT_FILES:
                yield f, rel
        elif rel.parts[0] in ALLOWED:
            if f.suffix in ALLOWED[rel.parts[0]] or rel.as_posix() in EXTRA_ALLOWED_PATHS:
                yield f, rel


def package():
    DEST.parent.mkdir(parents=True, exist_ok=True)
    entries = list(selected())
    with ZipFile(DEST, 'w', compression=ZIP_DEFLATED, compresslevel=7) as z:
        for source, rel in entries:
            z.write(source, arcname='dsc-oms-cs213/' + rel.as_posix())
    with ZipFile(DEST) as z:
        assert z.testzip() is None, 'Corrupt ZIP CRC detected'
        names = z.namelist()
        assert len(names) == len(entries)
        for required in (
            'src/index.ts',
            'migrations/0004_state_invariants.sql',
            'migrations/0010_cs213_auth_and_datamart.sql',
            'README_CS213.md',
            'scripts/Start-CS213.ps1',
            'scripts/cs213_demo_seed.sql',
            'docs/cs213/01_PROJECT_DOCUMENTATION.md',
            'docs/cs213/02_THREE_LEVEL_ERDS_AND_NORMALIZATION.md',
            'docs/cs213/03_DATA_DICTIONARY.md',
            'docs/cs213/04_TEST_PLAN_AND_EXECUTED_REPORT.md',
            'docs/cs213/05_LIVE_DEMO_SCRIPT.md',
            'docs/cs213/evidence/cs213_tc01_tc12_results.json',
            'docs/cs213/evidence/cs213_browser_e2e_results.json',
        ):
            assert any(n.endswith(required) for n in names), f'Missing required file: {required}'
        assert all(not any(token in n for token in (
            '.dev.vars', '.env', '.git/', 'node_modules/', 'backups/', '.sqlite',
            '.cs213-state', '.qa-state', '.qa-venv', 'wrangler.cs213.jsonc', 'wrangler.qa.jsonc',
            'real-users.sql', 'remote-roster-seed.sql', 'temp-', '.bak',
        )) for n in names), 'Denied token leaked into archive'
    digest = hashlib.sha256(DEST.read_bytes()).hexdigest()
    sha_path = DEST.with_suffix('.sha256')
    sha_path.write_text(f'{digest}  {DEST.name}\n', encoding='ascii')
    print(f'Packaged {len(entries)} allowlisted files; excluded personal data, secrets, node_modules, and local DB state.')
    print(f'Output: {DEST} ({DEST.stat().st_size} bytes)')
    print(f'SHA-256: {digest} (saved to {sha_path})')


if __name__ == '__main__':
    package()
