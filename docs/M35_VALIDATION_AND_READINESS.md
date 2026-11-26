# DSC OMS M3.5 — Validation & Production Readiness

## Results (synthetic/offline execution)

| Check | Evidence | Outcome |
|---|---|---|
| TypeScript `npx tsc --noEmit` | Actual backend, unchanged TS source | PASS |
| Offline API and workflow tests `npm run test:offline` | 73 existing Node tests incl. M1/M2/M3 role/scoping/concurrency | PASS 73/73 |
| SQLite invariant suite | 12 existing cases against in-memory migrated SQLite | PASS 12/12 |
| M3 SQLite constraints | `python test/m3_db_smoke.py` | PASS on synthetic data; rerun locally |
| M3 migration upgrade | `python test/m3_migration_upgrade.py` | PASS on synthetic data; rerun locally |
| M3 demo seed | `python test/m3_local_seed.py` | PASS on synthetic data; rerun locally |
| JavaScript parse | `node --check` over frontend JS | PASS |
| CSS parse | `tinycss2` stylesheet parse | PASS |
| Full frontend shell browser harness | Real ES modules, real layered CSS, mocked synthetic `/api` results, both themes at 375/768/1024/1440/1920 | PASS 10/10 in completed earlier run; repeated final run was interrupted after 8/10 due tool timeout |
| Additional interactive browser test | M1 Sheet select/dblclick, four synthetic role-specific notice controls | PASS 5 cases |
| History / navigation | Event list -> workspace -> browser back -> forward; notice reading back | PASS |
| Modal focus & background locking | Inspector Escape; announcement editor; selected scroll policy | PASS for tested examples |
| XSS | Synthetic HTML payload in event description and announcement body rendered as text | PASS on checked views |
| Requests backend preservation | No server code or migration changes | Source verified; no production database accessed |
| Full authenticated Cloudflare Worker browser E2E | Browser navigation to local server blocked by environment policy | BLOCKED |
| Native Cloudflare Worker Vitest | Supplied dependency tree contains incompatible Windows-native packages | BLOCKED |
| 200% zoom / WCAG 2.2 AA manual screen-reader | Not executed | UNTESTED |
| Staging Access, D1 migrations, backups/rollback | No live access requested or attempted | NOT RUN; release blocker |

## Query-count performance comparison

Requests made when entering an authorized list view with the **same synthetic fixture**, counted in Chromium's `window.fetch` mock, including available list data and not background notification polling:

| View | M3 baseline | M3.5 | Note |
|---|---:|---:|---|
| Events browsing | 3 | 2 | Deferred fetching `/api/events/:id/workspace` until an event is selected |
| Announcements browsing | 3 | 1 | Deferred events/projects linking selectors until editor opens |

No claims of D1 production latency improvements; these are frontend request-count changes only. The generated screenshots represent actual CSS and running frontend JavaScript with synthetic fixture API responses, **not** a deployed authorized session.

## Production readiness

**NO-GO** pending full authenticated Worker/browser E2E, approved staging D1 migration rehearsal, Cloudflare Access role/department scoping verification, native Worker tests, and WCAG keyboard/screen-reader review. There are no new migrations in M3.5; previously pending M3 notification migration (0007) still needs staging rehearsal before production. Governance/CBL rules and role matrix are unchanged.

## Local Windows acceptance

1. Back up your existing local project directory and `.wrangler` state; stop Wrangler.
2. Extract candidate separately; copy changed `public` and tests into your working M3 root; keep `.dev.vars` and `.wrangler` untouched.
3. Run `npm ci`, `npx tsc --noEmit`, `npm run test:offline`, `npm run test:db`.
4. Run `npx wrangler d1 migrations apply DB --local` (local only, if needed), then `npm run dev`.
5. Test Lead/Co-Lead/Executive/Member with synthetic accounts; select Events, open workspace and navigation/back; create/edit using modal, verify backend rejects unauthorized operations; inspect Tasks Sheet/Board, Departments and Projects; switch themes and mobile browser zoom.
6. No `wrangler deploy` or `--remote` command is part of this validation.
