# DSC OMS — Cloudflare Release, Validation and Recovery Playbook

**State:** staging review required; do not deploy without human approval. This report does not attest to any configured Cloudflare account, Access policy, live domain or production database.

## Safe package

Run `npm run package:safe` (or `python scripts/package_release.py`). The resulting `dist/dsc-oms-reviewed-source.zip` contains allowlisted code, migrations, static assets, tests, and documentation only. It excludes `.dev.vars`, any `.env`, backups, `.git`, local Wrangler state, installed dependencies, `*.bak`, old `temp-*` folders and user-seeding scripts. Review every diff before applying. Do not send the original project ZIP to external reviewers without owner authorization.

## Required separate environments

1. Register a separate Cloudflare Access application for staging, with restricted testing identities; verify app audience (`POLICY_AUD`) and team domain (`TEAM_DOMAIN`) independently from production. `APP_ENV=local` and `DEV_USER_EMAIL` must **never** be present in staging/production configuration.
2. Create staging and production D1 database bindings with distinct IDs and environment declarations in Wrangler. The supplied `wrangler.jsonc` specifies a single DB named `dsc-oms-staging`; it is not safe to infer a production DB ID. Keep all secrets in Cloudflare-managed secrets, not tracked files.
3. Enable structured Workers observability and a private alert for 5xx rate, D1 errors, elevated 409 state conflicts, Access denials and health endpoint 503. Do not log JWTs, sensitive request bodies, or private member attributes.
4. Confirm Cloudflare Access protects **static app assets and APIs** as intended. The Worker verifies the JWT server-side but cannot replace a correctly deployed Access application. Review cookie SameSite behavior and permitted origins with a controlled browser test.

## Migration procedure (staging first)

1. Freeze schema-writing changes; take an approved copy/export or restore point of the current staging D1 database and verify readability. Verify `SELECT COUNT(*)` of each table on the backup without exporting personal fields into audit artifacts.
2. Confirm migrations `0001`–`0003` were applied already by inspecting migration history; use Cloudflare Wrangler's migration list rather than blindly replaying old scripts. Apply only the new `0004_state_invariants.sql` through the staging migrations workflow.
3. Expect five new triggers (`oms_request_state_guard`, `oms_request_withdraw_guard`, `oms_request_archive_guard`, `oms_last_lead_guard`, `oms_task_state_guard`). They impose stricter writes and may block legacy manual data maintenance or older Worker code.
4. Run `npm run test:offline`, `npm run test:db`, and TypeScript `tsc --noEmit` locally. Deploy a reviewed build to a **staging Worker only**; run the smoke and acceptance suite below with fabricated tester accounts. Never run fixture inserts against the production DB.
5. Approve production only after examining the resolved issue list and an out-of-hours rollback drill. Production schema changes and deploy are manual actions in the approved change window.

## Staging smoke test

- Healthy DB: unauthenticated GET `/api/health` returns 200 with service/DB state but no user count; invalid DB responds 503.
- Access: missing, expired, wrong-audience, forged and improperly signed assertions return 401; inactive/unknown valid users return 403. Confirm the public domain **never** honors the development identity override.
- Four roles: direct API authorization and department scopes; query different request, task, project, notification and tester IDs. Include role changes that would remove the final active Lead.
- Requests: create, withdraw, approve, reject, convert once, convert twice, archive and restore. Check exactly one activity event and notification on successful actions.
- Tasks: create, assign, start, submit evidence, reject, resubmit, approve, archive, restore and invalid transitions. Validate the current direct-completion behavior explicitly.
- Projects: create/edit manager and members, archive/restore while respecting active tasks. Compare join table and activity counts pre/post.
- Browser: desktop and narrow viewport nav, dialogs, keyboard-only controls, screen-reader announcements, light/dark theme, search filters, stale-action retry feedback. Inject inert text such as `<img src=x onerror=alert(1)>` in a test profile to verify safe text display without execution.
- Operations: query count/response latency under representative synthetic dataset; confirm assets receive CSP and API receives no-store, nosniff, and non-cross-origin protections.

## Rollback, recovery and contingency

The `0004` migration is **not** a one-click production rollback. Coordinate Worker + DB rollback, because new SQL triggers may reject writes from an old Worker version. The five triggers can be dropped in a controlled staging copy after reviewing their names and state, for example `DROP TRIGGER IF EXISTS oms_task_state_guard;` (repeat for the others). **Do not execute this in production without a prepared change plan.** A verified point-in-time restore or backup may be necessary for an interrupted major deployment. Before deployment, record the last-known-good Worker version, asset version, D1 migration level, rollback command, and responsible operator. During incident response, halt writes if invariant integrity is uncertain, capture safe diagnostic identifiers, and restore only after verifying data counts and approval/assignment invariants.

## Go/no-go conditions

No-go for production if Access scope is unverified, a current staging restore point is absent, old manual SQL paths are not vetted against triggers, any role has inappropriate access to confidential records, a stored-XSS fixture executes, core task/request workflows fail, or browser keyboard/mobility checks are not completed. The current reviewed package should be treated as **candidate source for peer/staging validation**, not a successful production deployment.


## 2026-10-22 release-blocking addendum

The second pass adds `npm run check:deploy-config`, which reads `wrangler.jsonc` and fails unless both named staging and production environment entries exist, their D1 UUIDs differ, and `APP_ENV` is non-local. **It currently fails as expected.** Do not mistake the newly added script for evidence that a production database exists. The previous Wrangler configuration was intentionally left unchanged pending an authorized production database identifier. See `WRANGLER_ENVIRONMENT_TEMPLATE.md`. Bare `npm run deploy` now fails closed; it requires an explicit staging/production target, validated named environment separation and an operator `DSC_RELEASE_APPROVED=YES` acknowledgment. This gate does not replace human release approval, Access policy verification or database backups. No remote secrets, production records or schema were touched in this audit.
