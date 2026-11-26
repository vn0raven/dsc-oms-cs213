## M3.5 — 2026-10-24 — UI navigation, modal and accessibility refactor

- Full-page Events workspace, isolated list/search, tab routes, local refresh, browser Back/Forward.
- Announcements notice board, full reading view, publisher-only editor modal and lazy linking selections.
- Shared accessible modal lifecycle; modal Task/Project/Department details, focus restoration, scroll locking and dirty-form confirmation.
- M1 Sheet select/double-click interaction repair, existing inline authorization rules preserved.
- Requests removed from primary navigation, dashboard and visible report panels; all history/API/database data remains.
- Synthetic Chromium real-source shell tests and before/after screenshots; zero backend/migration changes.

### Known limits
- Legacy form wrappers remain pending full migration to common dialog markup. Full authenticated Worker, native Cloudflare, staging/production and WCAG audits remain unverified.

## M2 — 2026-10-23

### Added
- Event governance additive migration, eleven-stage workflow and Lead/Co-Lead approval decisions.
- Teams and consent-based temporary event appointments, scoped delegation, recipient inbox, audit/stage history.
- Optional restricted Project links and task associations retaining M1 authorization.
- Event responsive frontend and evidence-backed readiness/closure attestations.
- M2 route/database/browser-component regression tests and SOP/release-gate documentation.

### Unchanged / outstanding
- Existing Projects, Tasks, permanent roles and production data.
- Standard Event SOP, financial authorization, registrations, Official Announcements and full notification-bell integration deferred.
- No production staging copy, real Cloudflare Access testing, or native Worker E2E in this environment.

# Change log

## M1 — 2026-10-23

### Added
- Unified task context/filter helper for Independent and Project tasks; Events deliberately deferred.
- Excel-inspired Sheet: sortable accessible headers, configurable columns and widths, keyboard navigation, sticky headers and task selection.
- Permission-aware priority/progress/deadline cell editor using the existing task PATCH endpoint; status and assignment retain existing actions.
- Client-side 100-row pagination and full filtered CSV export.
- Authorized activity history in task details and selection-preserving task refresh.
- 9 Node UI regression tests, 43 Chromium component scenarios, measured HTML-generation benchmark, architecture and issue reports.

### Fixed
- `<tr>` Sheet cells collapsed by global flex task-row styling.
- Table width bug that enlarged sticky row index and blocked first sortable header.
- Inconsistent task filter implementations, unnecessary detail-triggered list rebuild, stale detail feedback and misleading empty states.
- Unreadable Sheet layout in split desktop master/detail view.

### Unchanged / outstanding
- No D1 schema, task-state, role or authorization changes. Existing Approved-versus-Completed distinction awaits product approval.
- Native Cloudflare Worker and authenticated browser E2E blocked here; staging and production remain untouched.

## M3 — Event Operations and Official Communications (candidate, October 2026)
- Added additive D1 migrations 0006/0007: event readiness and closure requirements, evidence and verification history, issue management, schedules, coordination notes, protected record references, post-event debriefs, official announcements, separate read receipts, and notification types.
- Linked readiness and closure verification to existing M2 event transitions using database triggers; high-severity unresolved issues block readiness.
- Added event Operations, Readiness, and Records panels, and an official Announcements page with department audience restrictions.
- Announcements support drafts, editing, organization/department publication, category, pinning, project/event linking, read receipts, archived history, and notification fan-out.
- Added recipient-scoped operational notifications, dashboard summary, and reports summary.
- Extended synthetic database, API, and browser-component tests. No production deployment or migration has occurred.
- **Known limitations**: protected file uploads, formal SOP templates, full financial processing, authenticated Worker browser E2E, native Worker tests, and staging migration rehearsal remain outside verified M3 delivery.

## M3 UI follow-up — Local appearance and fixture repair

- Replaced hard-coded dashboard onboarding light colors with theme tokens.
- Scoped legacy bottom-sheet modal rules to mobile; repaired the Events form with a two-column desktop grid, scrollable field region and always-visible actions.
- Added Events-only Refresh control with persistent selection, filter text and tabs.
- Reordered navigation to Dashboard, Announcements, Events, Projects, Tasks, Requests, Notifications, Members, Departments, Reports and Audit Log.
- Added an idempotent synthetic local fixture seed and PowerShell helper (6 users, 3 projects, 4 events, 5 tasks, 2 announcements).
- Added Chromium component regression tests for theme, modal and Events refresh behavior, and SQLite fixture integrity checks.
- Production records, role matrix, event lifecycle and migrations remain unchanged.
# November 22, 2026 — Focused UI polish

- Aligned shared page gutters and section widths; removed inner Announcements/Event-list insets and empty Dashboard/Report tracks.
- Improved Department card width/wrapping and Member list/detail alignment, avatars, labels and controls.
- Removed the leftover Dashboard New Request quick action; legacy Request APIs/data/history remain intact.
- Reflowed seven report status cells without a trailing empty block, preserving calculations and zeros.
- Consolidated existing Task toolbar nodes and retained user-selected columns, filters, sort, paging, selection, widths and CSV actions.
- Corrected semantic badge/theme conflicts, action/control contrast and focus; normalized Audit Log naming and supplied the existing-system Department icon.
- Verified the actual local app across 80 width/theme/page states, keyboard/CSV/preference/paging/edge cases, and native 200% zoom with matched before/after evidence. Existing Node/native/SQLite/browser regressions pass. No backend or schema changes.

# November 19, 2026 — Event task finalization candidate

- Added `POST /api/events/:id/tasks/create`; preserved the existing task-link endpoint.
- Added explicit creation capabilities for accepted Event Directors and exact Team Heads. User-approved stage range is Team Formation through Post-Event; tasks are unassigned, owned by creator's permanent department, and have no Project by default.
- Shared M1 validation/repository writes; transaction-time permission guard and durable idempotency receipts in additive migration 0008. Existing assignment/edit/review rules are unchanged.
- Added Event Tasks creation/error recovery and M1 inspector, grouped task lists, accepted/pending organization hierarchy and team roster dialog, compact Operations panels.
- Added Event context to existing M1 DTOs, Board/Sheet filtering, advanced filter disclosure/chips, concise default Sheet columns, and context-aware CSV export.
- Added CSV file mapping, server preview and permanent-role-controlled unassigned independent task import with duplicate checks, row-level transactions and retry receipts in 0009. No historical records are overwritten.
- Repaired Windows-specific test paths/UTF-8 readers and configurable Chromium discovery; replaced empty Cloudflare test dependency with version 1.8.5 and scoped native test discovery.
- Patched Hono to 4.13.16 after production dependency advisories. Added API, native D1, SQLite upgrade/backup, browser, JS/CSS checks and reproducible evidence tooling.
- Patched Vitest to 4.1.12 for development-tool advisories; full dependency audit reports zero advisories. Corrected Event action opener focus restoration and tested Head/denied-role keyboard paths.
- Added current issue/governance log, workflow inventory, setup, release gates and rollback guidance. This is a non-deployed candidate, not production acceptance.

