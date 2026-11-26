# DSC OMS — Source-Backed System Audit and Improvement Review

**Audit date:** 2026-10-21. **Source:** uploaded `dsc-oms-cloudflare.zip` (4,547 archive entries, including 3,865 `node_modules` paths and 465 Git paths). **Environment:** offline Linux analysis, synthetic data only. **Disposition:** fixes proposed as a reviewed source archive; **not deployed**. **Do not apply migration 0004 directly to production** without staging-copy verification and approval.

## 1. Executive assessment and scope

DSC OMS has a recognizable, integrated application design: Cloudflare Worker + Hono APIs, TypeScript services and repositories, Cloudflare Access JWT identity, Cloudflare D1/SQLite persistence, and a static JavaScript app. The architecture is sufficient for a departmental organization management system; a rewrite is not warranted. A functional service layer enforces most role and state transitions, and SQLite foreign keys/unique constraints already protect many relationships. The highest-value interventions are tightening untrusted HTML rendering, failing closed on dev identity, database-atomic workflow guards, and replacing placeholder tests.

**Implemented:** fixes for the first six prioritized findings, safer social links and task CSV export, HTTP hardening, non-sensitive health, synthetic regression tests, corrected navigation encoding, and an allowlisted release packager. **Still open:** live Access configuration verification, production/staging separation, browser/assistive technology tests, performance baselines, residual template-security review, and the product decision on the `Approved` task state. The included safe archive is **not certified production-ready**.

The analysis inspected the source tree, route declarations, auth middleware, permissions, services/repositories for key workflows, migrations `0001`–`0003`, frontend rendering/controls, stylesheets, tests, Wrangler config, and release artifacts. Source line ranges cited here are relative to the reviewed copy; offsets can differ from the original ZIP.

## 2. Architecture, data flow and module map

```text
[Browser: index.html, js/*.js, CSS]
    | fetch /api/* + Access-provided assertion
    v
[Cloudflare Access at the edge] -- policy not observable in ZIP
    v
[Hono Worker src/index.ts]
    |-- src/auth.ts: jose JWT/JWKS verification
    |-- src/middleware/authentication.ts: active registered OMS user
    |-- route modules --> service modules --> repository SQL
                                         |--> D1 (SQLite)
                                         |--> activity_log
                                         +--> notifications
    v
[JSON DTOs and declarative action permissions]
    v
[Frontend views, modals, notification polling, exports]
```

| Functional area | Server entry points | Main data relationship | Implementation assessment |
|---|---|---|---|
| Auth and account | `routes/auth.routes.ts`, `middleware/authentication.ts`, `auth.ts` | JWT email -> `users` -> `departments` | Functional offline; external Access/JWKS not live-tested |
| Directory and roles | `routes/users.routes.ts`, `services/user.service.ts` | Each user belongs to one department; role is organization-wide | Functional with server checks; new last-Lead DB guard |
| Departments | `routes/departments.routes.ts` | Parent of users, project departments, requests, tasks | Read workflows present; no comprehensive department CRUD |
| Projects | `routes/projects.routes.ts`, project service/repository | Project has departments and active `project_members`, one active manager | Create/update/archive/restore verified with actual API + synthetic DB; sequential list reads |
| Tasks | `routes/tasks.routes.ts`, task service/repository | Task belongs to department, optional project, optional source request, active assignment | Core lifecycle, review/rejection, archive/restore verified offline; `Approved` semantics inconsistent |
| Requests | `routes/requests.routes.ts`, request service/repository | Requester and receiving departments; optional converted task | Submit/approve/withdraw/convert verified offline; trigger guards added |
| Notifications | `routes/notifications.routes.ts` | User-owned notification, reference to source entity | Owner-only read tested; browser polling and real-world delivery not verified |
| Activity | task/request/project `/:id/activity`, `activity_log` | Historical actor, action, reference, timestamp | Real operation creates events; durability after migration not tested live |
| Dashboard | `routes/dashboard.routes.ts` | Aggregated task/request/project counts | Query path inspected; load accuracy at scale not measured |
| Reports | `routes/reports.routes.ts`, report service/repository | Privileged cross-module aggregates | Lead/Co-Lead restriction verified; export/report totals not reconciled with a known snapshot |

The browser currently delivers an entire page app rather than a bundler-produced bundle. `public/index.html` loads `theme.js`, `header-runtime.js`, and ES-module `app.js`, with six stylesheets. Most view scripts render HTML strings into `innerHTML`. The app uses `sessionStorage` for navigation/report context and `localStorage` for theme and task-view preferences; no JWT needs to be stored in either.

## 3. Permissions: practical route-level assessment

Roles: `Lead`, `Co-Lead`, `Executive`, `Member`. `src/services/permission.service.ts` grants report access only to Lead/Co-Lead; creation and management of users to Lead/Co-Lead; role change/deactivation only to Lead; organization projects to Lead/Co-Lead and department projects to those roles plus Executive. Cross-department project and task access is resolved in the **service** layer as well as the view's affordances.

| Action or view | Lead | Co-Lead | Executive | Member |
|---|---|---|---|---|
| Own account and directory | Yes | Yes | Yes | Yes |
| Registered user creation/profile management | Yes | Yes | No | No |
| Change role or deactivate account | Yes | No | No | No |
| Sensitive report endpoints | Yes | Yes | No | No |
| Create organization project | Yes | Yes | No | No |
| Create department project | Yes | Yes | Yes, scoped | No |
| Assign/approve department tasks | Yes | Yes | Yes, scoped / subject to project rules | No, unless separately authorized as project manager for applicable actions |
| Submit own assigned task | If assignee | If assignee | If assignee | If assignee |
| Review receiving-department request | Yes | Yes | Receiving Executive | No |
| Read request | Global | Global | Requester's own or receiver department as scoped | Own requests only |
| Read **non-archived task** | Yes | Yes | Yes | Yes — **explicit current organization policy in code** |
| Own notifications and mark read | Yes | Yes | Yes | Yes |

This is a model of **examined policy**, not independent approval of the current visibility policy. `canViewTask()` (`task.service.ts:236-273`) makes active tasks organization-visible by design; no unauthorized-read vulnerability is asserted without a data classification decision. Synthetic direct-ID tests show that requests and notifications are scoped and non-Lead tester account lookup is blocked. The permission matrix should be signed off before changing any existing role capability.

Authentication: `src/auth.ts` uses `jose.jwtVerify` with a remote Cloudflare Access JWKS, configured `issuer`, `audience`, and expiration/standard JWT checks; middleware looks up the normalized email and rejects missing/inactive records. The tested local bypass now requires both the explicit environment flag and a loopback request URL. **Unverified:** actual Access app edge policy, signed JWT expiry, token audience rotation, JWKS connectivity and live Access cookie settings. Missing malformed assertions failed closed offline.

## 4. Security review and confirmed remediations

**Stored/DOM HTML injection:** The supplied `public/js/app.js` placed raw user-profile fields directly inside `innerHTML` for sidebar/topbar/profile text, and rendered raw boot failure messages. These are untrusted text contexts. Changed to `escapeHtml()` in `safe-html.mjs` and updated every identified profile slot. Use of context-aware output encoding was chosen over a full DOM rewrite. The safe link utility rejects javascript/data/relative profile destinations in `users.js` and `ux.js`. A static CSP and restrictive object/form/frame policy were added in `public/_headers`. This mitigates identified paths, **not all** project templates: many other modules still use `innerHTML` and warrant a systematic future taint review.

**CSV injection:** `public/js/task-export.js` already protected obvious formula prefixes, but strings preceded by blanks or zero-width characters could slip through. The changed exporter neutralizes formula-like leading strings before CSV quoting. Test samples do not prove the result for every spreadsheet importer.

**Request forgery and confidentiality:** `src/index.ts` now checks explicit cross-origin `Origin` and Fetch Metadata values for API mutations, marks API responses `Cache-Control: no-store`, and adds anti-sniffing/frame/referrer headers. `public/_headers` applies to static assets, **not automatically to dynamic Worker API responses**; both paths are covered separately. Authentication still depends on real Cloudflare Access policy. The API health check now checks D1 readiness with `SELECT 1`, no user totals.

**Local secrets and archive hygiene:** The original supplied ZIP included `.dev.vars`, SQL backups, a full `.git` directory, scratch folders, and local Wrangler state. These are inappropriate in shared release packages. We did not print their contents. The packager `scripts/package_release.py` includes only approved source, migrations, public assets, tests, configs, and docs. **Actual exposure of a private key or credential has not been established.** If the original archive was distributed beyond its intended audience, the owner should privately assess the receiving parties and whether secrets require rotation.

**Security tests completed:** missing/malformed tokens, local vs deployed dev bypass, registered/inactive checks, four-role permission predicates, unauthorized reports/users mutations, tester record ID denial, cross-department request lookup, notification ID ownership, explicit cross-origin mutation refusal, HTML/URL/CSV test vectors. Other HTTP security and live JWT tests remain outstanding.

## 5. Workflow and business-rule review

### Users and departments

User creation/role/status endpoints exist, with validated payloads and role permission checks. The existing service attempts to prevent a final Lead from being demoted/deactivated, but a separate preliminary count could race with concurrent changes. Migration `0004` adds a database-level trigger on `users` protecting the final *active* Lead. The synthetic database suite proves both demotion and deactivation are refused. Test fixture members use `@example.invalid`; no existing records were imported.

### Projects

Projects associate participating departments and a manager/team through join tables. Unique active manager constraint already exists (`0001_initial.sql:64-68`). Real source service handles create/update/archive/restore and checks active tasks before archiving. A synthetic HTTP test created a department-scoped project, denied cross-department Member update, updated its name with Executive, archived/restored it, and observed retained team rows. The list view still performs serial `getProjectAggregate` calls; performance scales with record count.

### Tasks

**Implemented lifecycle in source:** Created -> Assigned -> Ongoing -> For Review; a reviewer **rejects** to Ongoing or **approves** straight to Completed; Completed -> Archived -> Completed on restore. Approved exists in the enum and DB but is not generated by the current `approveTask` handler (explicit legacy comment). The specified conceptual lifecycle `... For Review -> Approved -> Completed` is therefore not the current behavior; no silent breaking workflow change was made. Reviewed transition permissions check assignee/reviewer identity, and evidence URLs must be HTTP(S).

Task race protection: `writeTaskTransition` now compares previous status and `updated_at` inside the update, with an invalid sentinel that aborts via `CHECK`/trigger if stale. Assignment/unassignment batches begin with the same guard. The transaction rolls back state, activity and notifications on failure. `0004` additionally forbids impossible task state transitions. Tested real API: wrong assignee cannot start; double start fails 409; submit/reject/resubmit/approve/archive/restore works; duplicate approval generates only one approval audit event. Concurrent D1 behavior itself requires staging verification.

### Requests

Pending requests may be approved/rejected; their owner may withdraw a Pending request. Approved requests can be converted into a task; Converted or Rejected requests can be archived/restored. Source request ID has a unique constraint, already preventing two tasks from linking to one request. `0004` adds triggers requiring a currently pending, unwithdrawn, unarchived request for approval/rejection, a currently approved request for conversion, and valid archive/withdraw transitions. Guard failure aborts the batched update plus notification/activity insert. Tested duplicate approval, concurrent approval, withdrawal followed by approval, duplicate conversion, cross-department denial, and history persistence with real SQL.

### Notifications and audit events

User-scoped lookups and write paths are present. An assigned synthetic member received notifications; another member could not read them by ID. Duplicate task/request approvals generated one corresponding audit entry in isolated tests. The product still needs operational checks for polling timing, duplicate delivery under real retry/network failures, and audit export/access retention. Activity rows are not deleted in the corrections.

## 6. D1 schema, constraints and migration safety

| Data area | Existing controls | Remaining safeguards / risks |
|---|---|---|
| Users | FK to departments, role/status CHECK, case-insensitive email UNIQUE, indexes | Last active Lead trigger added; consider valid department executive presence only if policy requires |
| Projects | Status/type CHECK, start/end date check, active manager partial UNIQUE, join-table FK | Atomic manager swap and archive/restore must be tested on a D1 staging copy |
| Tasks | Department/project/source request FK, source request UNIQUE, progress/status/priority checks; indexes on department/status and deadline | Task transition trigger and optimistic guard added; benchmark large lists and ensure no last-millisecond false conflicts |
| Requests | Department/user FKs, request status/type checks, archive flags, department/status indexes | Status/withdraw/archive triggers added; concurrency + audit atomicity verified on SQLite, not remote D1 |
| Notifications | User FK, status CHECK, user/status/date index | Consider deduplication key if repeated non-state-triggering messages prove to be a problem |
| Activity | Reference fields and action/timestamp information | Retention and trusted reporting requirements to be defined |

Migration `0004_state_invariants.sql` adds five `BEFORE UPDATE` triggers; it does not drop, delete, or backfill data. **Compatibility warning:** direct SQL scripts, back-office procedures, and ad-hoc maintenance commands that bypass the application's state machine may now be refused. A real D1 staging **copy** must be used for dry run. Take/verify a point-in-time backup and agree to a rollback plan before changing production. For SQLite, drop the five `oms_*_guard` triggers to roll back that migration logic (the Worker code should be rolled back in coordination); review manually in staging before executing anywhere.

**D1 batch behavior:** Cloudflare D1 batches are transactional; on SQL failure the batch rolls back. The added SQL guards intentionally raise failure for invalid race outcomes, mapped to API `409 STATE_CONFLICT`. This preserves atomicity of the associated activity and notification inserts. A fabricated `UNIQUE` failure maps duplicate conversion to `409 REQUEST_ALREADY_CONVERTED` where the backend produces the expected SQLite error text.

## 7. UI/UX source review, screen by screen

This is a **static view and interaction review**, not a visual screenshot audit. No browser or assistive-technology session was run; responsive and focus assertions are not certified.

| View | Existing strength | Evidence-backed gap | Recommended incremental improvement |
|---|---|---|---|
| Shell/navigation | Grouped routes, profile context, themes, notification badge | Original mojibake glyphs; runtime header adds another bell and appearance controls | Encoding corrected; consolidate duplicate header only after browser comparison; preserve DSC mark/colors |
| Dashboard | Dedicated aggregate API and page | No measured loading/correctness baseline at 1k+ records | Add actionable overdue / awaiting review quick links with permission filter |
| Departments | Dedicated directory cards/detail UI | No verified department edit/onboarding flow | Introduce scoped department administration only if required |
| Users | Directory search, profile detail and role management | Malicious profile URL could appear as active link; tester visibility must be consistently scoped | URL validated; improve role-change confirmation and last-Lead error message |
| Projects | Create/edit modals, team/department selectors, archive flow | Serial aggregate fetch; large team forms can become slow | Lazy loading or batched project summaries, clear manager indication |
| Tasks | List/sheet preferences, assignment/review, export | Stage `Approved` ambiguously skipped; no server pagination; view-setting persistence | Keep historic behavior until sign-off; show transition labels and return-to-review guidance |
| Requests | Create/review/withdraw/convert flows | Source had mojibake placeholders; race could double actions | Placeholder fixed; disable conflicting controls pending response; show who can approve |
| Notifications | Polling, unread count, reference navigation | Multiple controls and mobile focus management not verified | One bell, consistent live region and read feedback after browser testing |
| Reports | Privileged routes and export UI | Validation against reference totals not performed | Reconcile a synthetic snapshot, expose calculation definitions |
| Audit/activity | Historical event screens and filters | Keyboard/filter and retention behavior untested | Add compact activity descriptions and scoped export after policy review |

Cross-cutting: standardize empty/loading/error states, ensure modal focus trapping and `Escape`, validate labels/ARIA live regions, use 375/768/1440 width checks, and ensure actions after mutation refresh the relevant list and its badge without reloading the whole page. Most rendering uses interpolated HTML templates; centralizing text escaping one file at a time is lower risk than replacing all views at once. Theme colors and current DSC brand asset are retained.

## 8. Functional gap analysis and roadmap

| Rank | Improvement | Who benefits / current pain | Complexity | Essential? |
|---|---|---|---|---|
| 1 | Formal task approval semantics (`Approved` intermediate vs direct `Completed`) | Assignees and reviewers need a truthful stage label | Medium | Essential product decision |
| 2 | Staging/live identity and D1 environment separation | Administrators avoid accidental cross-environment writes | Medium | Essential for production |
| 3 | E2E role journeys and browser accessibility tests | Every role and mobile user; removes untested behavior | Medium | Essential before certification |
| 4 | Browser-side optimistic pending indicators and conflict refresh | Reviewers acting simultaneously see clear retries | Small-Medium | Essential UX reliability |
| 5 | Targeted XSS review of all remaining HTML templates | All roles; reduces stored-content attack surface | Large | Essential security follow-up |
| 6 | Pagination and batch aggregate queries | Members in large organizations; slow lists / excessive DB reads | Medium | Essential once load warrants |
| 7 | Dashboard queues: overdue, my assignments, review requests | Members and Executives; repeated navigation | Medium | High-value optional |
| 8 | Notification delivery observability, stale polling recovery | All roles; missed or delayed task alerts | Medium | Optional until issue observed |
| 9 | Better filters, saved query scopes, report definitions | Executives and Leads; time spent manually finding work | Medium | Optional |
| 10 | CSS consolidation, shared front-end form helpers | Developers; specificity and duplicated utilities | Medium | Optional, after screenshots |

Priority is driven by security + correctness first, not feature volume. Any new administrative privilege requires approval and tests; this review did not silently grant one.

## 9. Performance and maintainability

`project.service.ts:635-665` exhibits a sequential N+1 aggregate pattern. Task DTOs re-evaluate authorizations per record (`task.service.ts:390-550,831-933`). Full-list routes are unpaginated; DOM templates can render many rows. A performance improvement should measure *D1 query count*, *p95 end-to-end response*, and *frontend render latency* on e.g. 10, 100, and 1,000 synthetic records before and after changes. The audit did **not** produce reliable real Cloudflare Worker duration or D1 latency measurements, and it does not claim quantitative speedups. CSS includes multiple override layers, but they should not be deleted until screenshot regressions show equivalence. Historical `temp-*` directories, `*.bak`, Git internals, and local backups are excluded from the shareable ZIP, not deleted from the user's original archive.

## 10. Validation methodology and remaining limits

Read `VALIDATION.md` for commands and counted results, `ISSUE_REGISTER.md`/`.csv` for per-issue evidence and status, and `DEPLOYMENT_READINESS.md` for staging checklist/rollback. Validations were run against actual Hono route handlers and actual SQL schemas via a synthetic in-memory adapter; browser assets were syntax checked. This tests business logic more strongly than mocks alone but cannot reproduce Cloudflare's external Access policy, D1 distributed runtime, Cloudflare `workerd` behavior, real credentials, or production data migrations. Original dependencies contained Windows-only native binaries, preventing execution of Cloudflare's Vitest worker runner here.

### Final acceptance disposition

**Eligible for staged review only**, not production deployment. Required before production promotion: signed-off role matrix (especially active-task visibility), product agreement on `Approved`, staged migration backup/rollback rehearsal, independently configured Access and D1 environments, deployed token/health smoke test, browser/mobile/a11y tests, and complete residual HTML context audit.
