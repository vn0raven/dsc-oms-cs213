# DSC OMS — Final Offline Validation Ledger

**Run environment:** 2026-10-21; Linux sandbox, Node 22.x, TypeScript compiler, Python 3 sqlite3; data only from synthetic test fixtures. Zero remote Cloudflare calls to modify D1, zero real user imports, zero deployments.

## Commands from repository root

```bash
node node_modules/typescript/bin/tsc --noEmit
npm run test:offline
npm run test:db
npm run package:safe
```

`test:offline` transpiles the real TypeScript Worker source to a temporary, excluded `.audit-build/` ESM tree using TypeScript and then runs `node --test test/node/*.test.mjs`. The API integration suite runs the actual Hono app with the current SQL migrations applied to a fresh in-memory SQLite database via a small D1 adapter. Other tests validate authentication, permissions, HTML escaping, CSV escaping and headers. `test:db` runs Python's sqlite3 directly against all migrations. Runtime-incompatible Windows optional packages in the uploaded `node_modules` prevent executing native Cloudflare/Vitest locally; a clean-platform CI environment is required for that runner.

## Results

| Validation | Outcome | Evidence |
|---|---|---|
| TypeScript compile / types | PASS | `tsc --noEmit` exit 0 |
| Real API routes, SQL transactions and auth in Node | PASS | 36 Node built-in tests (13 real in-memory SQLite/HTTP route tests, 23 other Node tests) |
| SQLite migration/invariant tests | PASS | 12 tests, applied migrations `0001`–`0004` to synthetic in-memory DB |
| Frontend JS parser check | PASS | All shipped `.js` and `.mjs` checked using Node `--check` |
| Safe source package contents | PASS | Allowlist ZIP manifest validated against exclusion rules |
| Native Cloudflare Vitest/workerd | BLOCKED | Bundled native optional binaries are for Windows, not Linux |
| Signed live Access JWT/JWKS with policy | NOT RUN | Requires isolated Access application |
| Real remote D1 migration + consistency | NOT RUN | Requires approved staging DB copy |
| Browser desktop/mobile E2E, a11y | NOT RUN | Needs browser runner and stage fixtures |
| Cloudflare Worker duration/production availability | NOT RUN | No live service measured |

## Confirmed regression scenarios

- Authentication: missing/malformed assertions fail closed, `APP_ENV` local only for loopback, inactive/unknown accounts denied, Member/Executive restricted on user role mutation and reports, tester lookup hidden from non-Lead.
- Roles: all four role permission predicates, request direct-ID cross-department denial, non-manager unauthorized project edit, Member unable to deactivate user or create project.
- Requests: pending creation, receipt/ownership, withdrawal forbidding approval, sequential and concurrent duplicate approvals rejected with one activity entry, conversion into one task, second conversion refused.
- Tasks: department assignee required, other user cannot start, second start refused, evidence submission, reviewer-only approval, returned-for-revision flow, resubmission, completed then archived then restored, event and user-notification checks.
- Projects: create, update, archive/restore preserving team records.
- Notifications: assignments generate user-specific notification; direct-ID read by a different member fails and does not mark the notification read.
- Database: FK violations, case-insensitive email uniqueness, source-request unique tasks, final-active-Lead protection, legal/illegal task/request status edges, batch rollback of activity insert on failure.
- Frontend: profile templates output HTML-escaped values, link scheme rejects script/data URLs, task CSV neutralizes formula prefixes after whitespace, corrupted icon placeholder strings removed, single shell notification popover, explicit cross-origin POST rejected.

## Caveats: do not overinterpret PASS

Node's in-memory SQLite correctly exercises **real schema triggers and actual SQL statements** but is not a substitute for Cloudflare D1's runtime, transaction scheduling or Access/JWKS network. The concurrency test executes overlapping Worker handlers in one Node process; it is not a distributed load test. UI parser success does not prove CSS appearance, keyboard focus, browser accessibility or absence of other stored-XSS paths. Lack of observed exploits is not evidence that the whole product is secure. `Approved` task state was not introduced because it is a product decision with workflow consequences. No production-data integrity claim is made.

## Evidence handling

The issue register uses anonymized descriptions, and tests use `@example.invalid` fake identities. Actual `.dev.vars`, backups and seed contents were excluded from all outputs; no historical user records were copied into the test databases or reports. Original archive remains untouched.
