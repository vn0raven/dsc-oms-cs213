# Local setup, release gates and rollback

## Existing installation

Preserve `.dev.vars`, `.wrangler/`, database backups and existing Wrangler bindings. Copy source changes from the candidate only after taking a backup of the existing checkout. Do not copy synthetic QA config over `wrangler.jsonc`. Migrations 0001–0007 were not edited; 0008 and 0009 are additive. Never reset a database to update this source.

Requirements: Node 22, npm, Python 3.12 or compatible; Windows browser checks use Python Playwright and Chromium. Install the lockfile with `npm ci`. The validation environment initially used `--ignore-scripts`; bundled native dependencies successfully ran on this host. A normal supported installation may require native package setup.

## Isolated synthetic acceptance environment

These commands create a separate local QA database. They do not use an existing `.wrangler` store, secrets, or the configured remote staging ID.

```powershell
npm ci
python scripts/prepare_local_qa.py --identity member
npx wrangler d1 migrations apply DB --local --config wrangler.qa.jsonc --persist-to .qa-state
npx wrangler d1 execute DB --local --config wrangler.qa.jsonc --persist-to .qa-state --file scripts/m3_local_demo_seed.sql
npx wrangler dev --local --config wrangler.qa.jsonc --persist-to .qa-state --ip 127.0.0.1 --port 8787
```

Open the local URL printed by Wrangler. The synthetic Member has an accepted Event Director appointment for Demo Git Workshop. Existing Lead/Co-Lead/Executive/Member demo records are synthetic. To test CSV import, stop the server, run `python scripts/prepare_local_qa.py --identity lead`, then restart the same local server. Do not deploy the generated QA config. The localhost identity override is not a Cloudflare Access acceptance test.

## Reproducible tests

```powershell
python -m venv .qa-venv
.qa-venv\Scripts\python.exe -m pip install -r test/requirements-qa.txt
.qa-venv\Scripts\python.exe -m playwright install chromium
.qa-venv\Scripts\python.exe scripts/validate_release.py --native --browser
```

Set `CHROMIUM_PATH` only if selecting a custom browser executable. Otherwise Playwright uses its bundled browser. Test logs and exit codes go to `dist/validation/`; browser screenshots and JSON results go to `dist/*-evidence/`. Native specs execute inside local workerd/D1; Node suites use real routes with an SQLite D1 adapter.

With the corresponding synthetic server running:

```powershell
.qa-venv\Scripts\python.exe test/local_worker_browser.py
# Restart as synthetic Lead before this next test:
.qa-venv\Scripts\python.exe test/local_worker_browser.py --import-mode
```

These browser tests create uniquely named synthetic tasks and do not delete them. They reject non-loopback test URLs. To package source: `python scripts/package_release.py`.

## Production readiness checklist

- [x] Existing source and authorization/handoff inspected; no rewrite or permanent role expansion.
- [x] Baseline failures recorded and corrected; TypeScript, route, SQLite, native D1 and browser checks run.
- [x] Existing migrations preserved; additive migration and synthetic backup/restore rehearsal pass.
- [x] Source-only packaging excludes secrets, databases and local test state.
- [ ] Configure independent staging and production Workers/D1 IDs and Access policies. Current supplied root config is not sufficient proof of isolation.
- [ ] Verify valid/invalid/expired JWTs, issuer/audience, certificate/JWKS rotation and revocation against actual Access in staging.
- [ ] Back up approved staging data and rehearse restoration; record counts, history and foreign-key/integrity checks before/after 0008/0009.
- [ ] Confirm CBL/SOP adoption, spreadsheet workflow coverage, user acceptance and any confidentiality requirements.
- [ ] Complete manual accessibility/legacy form checks and realistic organization-scale testing.
- [ ] Obtain explicit authorization for deployment and any remote operation. None is granted by this document.

## Deployment procedure for the authorized operator

No deployment was performed. First resolve all unchecked gates, preserve the current deployed version and export/record a recoverable database backup using the owner's approved procedure. Rehearse on isolated staging, including task creation, role restrictions, old linking, imports, audit and rollback. Use the existing checked deployment gate with an explicitly selected configured environment. Do not set its release-approval flag until actual signoff. Production requires its own separate authorization.

## Rollback

If a source regression appears, stop new creation/import writes, retain the failed request IDs and row receipts, and restore the previous known-good Worker version. Keep additive 0008/0009 tables/triggers and all task/link/audit records: prior code can ignore them. Do not delete tasks, receipts or audit to make a rollback appear clean. Code rollback does not undo successfully created tasks.

For a data incident, use the verified staging/production restore procedure and approved recovery point, reconcile writes since that point, then validate row counts, Event links, task assignments, audit and receipt uniqueness. The SQLite synthetic backup rehearsal demonstrates local mechanics only; it does not validate the owner's Cloudflare recovery process. Prefer a forward fix to destructive schema rollback. Never reverse the older 0007 notification migration casually.
