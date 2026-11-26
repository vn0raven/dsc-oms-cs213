# DSC OMS — Reviewed Source Candidate

Latest frontend update: [November 22 focused UI polish and validation](docs/UI_POLISH_2026_11_22.md). This supersedes earlier UI layout/zoom limitations for the specifically tested paths; backend and production-readiness decisions are unchanged.

## November 19, 2026 finalization candidate

Start with [Finalization report](docs/FINALIZATION_REPORT.md), [current issues and governance decisions](docs/FINALIZATION_ISSUES.md), [Event task API](docs/EVENT_TASK_API.md), [spreadsheet migration](docs/SPREADSHEET_MIGRATION.md), and [local setup / deployment gates / rollback](docs/LOCAL_SETUP_AND_ROLLBACK.md). Older milestone results below are historical, not current release evidence.

This candidate adds creation-only delegation for accepted Event Directors/Team Heads, atomic task/link/audit writes and retry keys, improved Event Tasks/Organization/Operations, shared Event-aware Board/Sheet filtering, and controlled CSV imports using existing permanent-role rights. New migrations are 0008 and 0009; previous migrations are unchanged. **Production remains NO-GO pending the documented staging, Access, governance and operational acceptance gates.**

This is a **non-deployed, staged-review source archive** of the Developer Student Community Operations Management System, based on the supplied Cloudflare Worker/Hono/D1 project. It retains the original product and visual identity, and adds targeted security/workflow fixes, a safe source packager and synthetic test suites.

**Start here:** `docs/ARCHITECTURE_AND_AUDIT.md`, `docs/ISSUE_REGISTER.md` and `.csv`, `docs/VALIDATION.md`, and `docs/DEPLOYMENT_READINESS.md`. The new migration is `migrations/0004_state_invariants.sql`; obtain human approval and rehearse against a staging copy first.

With a clean npm dependency install, check the project via `npm run test:offline`, `npm run test:db`, and `npx tsc --noEmit`. Build a safe shareable source bundle with `npm run package:safe`. Do **not** deploy or apply migrations automatically; the Wrangler config still needs independently configured staging/production databases and Cloudflare Access policies.

## Security and verification (2026-10-22 remediation)

This archive is a **candidate**, not a deployed release. See `docs/HARDENING_ROUND2.md`, `docs/ISSUE_REGISTER.md`, `docs/SECURITY_VERIFICATION_ROUND2.md`, `docs/PERFORMANCE_ROUND2.md`, `docs/VALIDATION_ROUND2.md`, and `docs/DEPLOYMENT_READINESS.md`.

Run `npm run test:offline`, `npm run test:db`, `tsc --noEmit` and, if Chromium and Python Playwright are installed, `python test/browser_component_smoke.py`. Native Worker tests require a clean compatible runtime. `npm run check:deploy-config` **is expected to fail** until separate staging/production environments are configured by the Cloudflare owner.

`npm run deploy` now refuses implicit deploys. Only after approved environment setup, staging migration rehearsal, Access verification and release signoff may an operator invoke `DSC_RELEASE_APPROVED=YES npm run deploy -- staging` (or production after additional review). Never enable development identity overrides on Cloudflare public hosts. Do not migrate production directly from this offline review.


## UI remediation round 3 — local verification

The source code in this package includes the revised layout, typography, theme and accessible filter labels. Findings, screenshots and scope limitations are documented in:

- `docs/UI_REPAIR_ROOT_CAUSES.md`
- `docs/UI_REPAIR_ISSUE_REGISTER.md`
- `docs/UI_REPAIR_ACCESSIBILITY.md`
- `docs/UI_REPAIR_VALIDATION.md`
- `docs/UI_REPAIR_CSS_OWNERSHIP.md`

For offline verification, run `npm ci`, `npx tsc --noEmit`, `npm run test:offline`, and `python test/db_invariants.py`. With Python Playwright and Chromium installed, `python test/ui_browser_regression.py` renders the **actual module render functions and actual CSS** with synthetic fixtures at five CSS widths. This component harness deliberately does not connect to D1 or authenticate against Cloudflare Access; use your local Wrangler installation with synthetic `.dev.vars` and the demo seed for a true end-to-end acceptance pass. **Never deploy or run D1 remote migrations simply to verify a UI change.**

## Milestone M1 — Unified Tasks (2026-10-23)

The Tasks page now supports a responsive **Board** list and a full-width **Sheet** with spreadsheet-like table headers, sorting, sticky headers, resize handles, columns preferences, row navigation, safe inline edits for selected fields, shared filters and independent/project task contexts. Lists show up to 100 tasks per page. The task detail shows authorized activity history. No D1 migrations or role permissions were modified for M1; Events/Announcements are future milestones.

See `docs/M1_UNIFIED_TASKS.md`, `docs/M1_ISSUE_REGISTER.md`, and `docs/M1_VALIDATION.md`. Run `npm run test:offline`, `npm run test:db`, `npx tsc --noEmit`, and (if Chromium + Playwright available) `python test/m1_browser.py`. This is a synthetic component harness, not full Cloudflare Worker browser E2E. The release is not production-approved.

## Milestone M2 — Governance-Aware Events (2026-10-23)

M2 introduces a dedicated Events workspace, an additive `0005_event_governance.sql` migration, temporary accepted event appointments, functional teams, authorized Lead/Co-Lead event approvals, eleven-stage event lifecycle, audit history, optional Project links, and event links to existing M1 Tasks. Regular Members may draft event proposals but **cannot approve** them. Event-specific roles never modify permanent OMS roles.

See `docs/M2_EVENTS_GOVERNANCE.md`, `docs/M2_ISSUE_REGISTER.md`, `docs/M2_VALIDATION.md`, and `docs/M2_HIGH_LEVEL_PROMPT.md` for technical details, pending SOP choices, tests and release gates. **Do not migrate production or deploy** this offline candidate. Locally, run `npm run test:offline`, `npm run test:db`, `npx tsc --noEmit`, and `npx wrangler d1 migrations apply DB --local` before `npm run dev`. Existing `.dev.vars` and `.wrangler` local data are deliberately not packaged.

## M3 — Event Operations and Announcements (development candidate)
The M3 extension uses `migrations/0006_event_operations_announcements.sql` and `0007_notification_m3_types.sql`. It adds event readiness checklists, evidence submission/verification, operational issues/escalation, schedules, coordination notes, document *references* (not uploads), closure requirements and debriefs, and official announcements scoped to organization or department.

**Development setup on Windows:** preserve your existing `.dev.vars` and `.wrangler/` local database, replace only source files, then run:

```powershell
npm ci
npx tsc --noEmit
npm run test:offline
npm run test:db
python test/m3_db_smoke.py
python test/m3_migration_upgrade.py
npx wrangler d1 migrations apply DB --local
npm run dev
```

The announcement and event operational routes live under `/api/m3`, while the existing M2 lifecycle stays under `/api/events`. **Never apply remote migrations until 0006/0007 are rehearsed on an approved staging copy.** The revised notification schema in 0007 rebuilds the notifications table and must be backed up in staging before deployment.

M3 schema keeps independent/project-linked tasks and previous M2 events unchanged. See `docs/M3_IMPLEMENTATION.md`, `docs/M3_ISSUE_REGISTER.md`, `docs/M3_SECURITY_AND_DEPLOYMENT.md`, and `docs/M3_VALIDATION.md`.

### Local UI repair and demo records (M3 follow-up)

See [`docs/M3_UI_LOCAL_FIX.md`](docs/M3_UI_LOCAL_FIX.md). To populate a **local** D1 database with synthetic Members, Projects, Events and Announcements, first configure `.dev.vars` for local use and apply `--local` migrations, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Seed-DSCOMS-M3-Local.ps1 -SkipMigrations
```

This seed never calls remote D1 and does not delete or replace existing records. The Events workspace has a scoped `Refresh Events` action; it does not reload the application shell.

## M3.5 — UI architecture stabilization (2026-10-24)

The UI now separates Browse, Read, and Action: full-page Events workspace, full-page Announcement reading, and modal Task/Project/Department inspection. Modern confirmation/editor modals share the coordinator in `public/js/modal-manager.js`; old task/project forms remain supported through a compatibility bridge. Requests are removed from primary UI only—backend records and migrations are retained.

Documentation: `docs/M35_UI_ARCHITECTURE.md`, `docs/M35_UI_ISSUE_REGISTER.md`, `docs/M35_VALIDATION_AND_READINESS.md`, `docs/M35_ROADMAP.md`.

Local developer checks: `npm run test:offline`, `npm run test:db`, `npx tsc --noEmit`; optional Chromium tests require Python Playwright and Chromium: `python test/m35_browser.py`, `python test/m35_special_cases.py`. These tests use synthetic mocked API responses and do not replace authentic Worker tests. **No production deployment is approved.**
