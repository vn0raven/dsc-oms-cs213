# DSC OMS — Prioritized Issue Register

Evidence is from the supplied source and isolated synthetic tests. **Confirmed** is not the same as a deployed exploit. Paths are relative to repository root.

| ID | Priority | Classification | Module | Finding | Status |
|---|---|---|---|---|---|
| OMS-001 | P0 | Confirmed defect | Frontend security | Unescaped account profile content in shell | Fixed / offline tested |
| OMS-002 | P0 | Confirmed exposure surface | Release packaging | Private backups and development material packaged | Fixed / package tested |
| OMS-003 | P1 | Confirmed configuration risk | Authentication | Development identity override trusted deployment flag alone | Fixed / offline tested |
| OMS-004 | P1 | Confirmed concurrency defect | Task workflow | Task state changes depended on stale read | Fixed / offline tested |
| OMS-005 | P1 | Confirmed concurrency defect | Request workflow | Request approval, rejection and conversion race | Fixed / offline tested |
| OMS-006 | P1 | Confirmed concurrency defect | User management | Sole active Lead could be removed between check and update | Fixed / offline tested |
| OMS-007 | P1 | Confirmed deployment gap | Cloudflare deployment | Staging and production environments not isolated in config | Open / deployment dependent |
| OMS-008 | P2 | Confirmed disclosure | API diagnostics | Public health endpoint returned user count | Fixed / offline tested |
| OMS-009 | P1 | Confirmed test mismatch | QA infrastructure | Template tests did not exercise application | Fixed / offline tested |
| OMS-010 | P1 | Confirmed unsafe URL handling | Frontend security | Social profile links accepted legacy unsafe protocols | Fixed / offline tested |
| OMS-011 | P2 | Confirmed input risk | Exports | CSV formula protection missed obfuscated leading whitespace | Fixed / offline tested |
| OMS-012 | P1 | Confirmed hardening gap | API defense in depth | No explicit mutation origin enforcement in API | Mitigated / offline tested |
| OMS-013 | P2 | Confirmed workflow inconsistency | Task workflow | Defined Approved task state never reached by approval | Open / requires product decision |
| OMS-014 | P1 | Policy ambiguity (not confirmed vulnerability) | Task visibility | All active tasks visible across departments | Open / policy decision |
| OMS-015 | P2 | Confirmed inefficiency | Projects / performance | Sequential per-project aggregate lookups | Fixed / bulk-query parity + measured |
| OMS-016 | P2 | Confirmed inefficiency | Tasks / performance | Task DTO computes permissions with additional queries | Fixed / preload permissions + role-tested |
| OMS-017 | P2 | Confirmed redundant UI | Navigation / UX | Multiple notification controls and theme UI injected | Fixed / component-browser verified (full E2E pending) |
| OMS-018 | P3 | Confirmed cosmetic defect | Frontend display | Mojibake in navigation glyphs and request placeholders | Fixed / offline tested |
| OMS-019 | P2 | Untested area | Frontend QA | No browser-based cross-device and accessibility verification | Partially verified / component-browser only |
| OMS-020 | P1 | Untested operational dependency | Production readiness | Backup/restore and Access configuration not verified live | Open / environment access required |
| OMS-021 | P2 | Confirmed maintainability issue | Frontend maintainability | Repeated HTML escape helpers and layered CSS overrides | Open / low-risk cleanup deferred |
| OMS-022 | P2 | Partially verified risk | Frontend XSS | Template HTML rendering across 28 JS modules remains broader review scope | Partially mitigated / broader template audit remains |
| OMS-023 | P2 | Suspected scalability issue | Search, lists, reports | List endpoints do not show consistent pagination | Open / pagination not changed (API compatibility) |
| OMS-024 | P2 | Untested security control | Authentication | JWT live JWKS/certificate lifecycle and Cloudflare policy | Open / external verification needed |

## Reproduction, remediation and verification details

### OMS-001 — Unescaped account profile content in shell (P0)

- **Classification:** Confirmed defect; **module:** Frontend security; **status:** Fixed / offline tested
- **Location:** `public/js/app.js:255-266,397-447,745`
- **Technical evidence / reproduction:** Profile name, role, position, department and error values reached innerHTML without HTML encoding. Original source contained raw ${user.name} templates.
- **Impact:** Stored markup injection in an authenticated account; executing payload depends on attacker control of a field.
- **Recommended or implemented correction:** Use context-aware escapeHtml for every affected interpolation and retry handlers through addEventListener.
- **Effort:** S; **validation:** Offline HTML escaping and template inspection

### OMS-002 — Private backups and development material packaged (P0)

- **Classification:** Confirmed exposure surface; **module:** Release packaging; **status:** Fixed / package tested
- **Location:** `dsc-oms-cloudflare.zip ZIP inventory; scripts/package_release.py`
- **Technical evidence / reproduction:** Original ZIP contains .dev.vars, .git contents, SQL backup files and user-seeding scripts; no credentials or personal records reproduced in the audit.
- **Impact:** Unnecessary risk when source ZIP is shared; actual secret exposure NOT established.
- **Recommended or implemented correction:** Strict source allowlist, exclude backups, historical content, .dev.vars, and node_modules.
- **Effort:** S; **validation:** Inspect release ZIP and verify exclusion of paths

### OMS-003 — Development identity override trusted deployment flag alone (P1)

- **Classification:** Confirmed configuration risk; **module:** Authentication; **status:** Fixed / offline tested
- **Location:** `src/auth.ts:26-44`
- **Technical evidence / reproduction:** Original bypass activated with APP_ENV=local plus DEV_USER_EMAIL, regardless of request host.
- **Impact:** A mistakenly deployed APP_ENV value could bypass Cloudflare Access.
- **Recommended or implemented correction:** Require APP_ENV local AND URL loopback hostname, keep Access JWT verified for public hosts.
- **Effort:** S; **validation:** localhost vs public-host tokenless auth tests

### OMS-004 — Task state changes depended on stale read (P1)

- **Classification:** Confirmed concurrency defect; **module:** Task workflow; **status:** Fixed / offline tested
- **Location:** `src/repositories/tasks.repository.ts:610-760; migrations/0004_state_invariants.sql:54-69`
- **Technical evidence / reproduction:** Original task transition updates matched only id; two actors could act on the same read status.
- **Impact:** Duplicate notifications/activity or wrong state after overlapping operations.
- **Recommended or implemented correction:** Optimistic status/version guard in D1 batch; DB trigger enforcing legal transition graph.
- **Effort:** M; **validation:** Synthetic SQLite and real HTTP request stale-operation tests

### OMS-005 — Request approval, rejection and conversion race (P1)

- **Classification:** Confirmed concurrency defect; **module:** Request workflow; **status:** Fixed / offline tested
- **Location:** `src/repositories/requests.repository.ts:608-925; migrations/0004_state_invariants.sql:6-36`
- **Technical evidence / reproduction:** Status-changing UPDATE previously matched id only; withdrawal/archive/approval checks were earlier reads.
- **Impact:** Duplicate/conflicting status, audit and notification events; conversion errors.
- **Recommended or implemented correction:** D1 BEFORE UPDATE state triggers abort conflicting batches; preserve UNIQUE source_request_id.
- **Effort:** M; **validation:** 10 actual-API SQL integration tests and 12 direct SQLite checks

### OMS-006 — Sole active Lead could be removed between check and update (P1)

- **Classification:** Confirmed concurrency defect; **module:** User management; **status:** Fixed / offline tested
- **Location:** `src/services/user.service.ts:616-648,695-727; migrations/0004_state_invariants.sql:40-51`
- **Technical evidence / reproduction:** Separate last-Lead count query and mutation opened a race for simultaneous administrators.
- **Impact:** Organization can become administratively locked out.
- **Recommended or implemented correction:** Add database guard that blocks demotion/inactivation of final active Lead.
- **Effort:** S; **validation:** Synthetic SQLite last-Lead tests and real API forbidden role mutation

### OMS-007 — Staging and production environments not isolated in config (P1)

- **Classification:** Confirmed deployment gap; **module:** Cloudflare deployment; **status:** Open / deployment dependent
- **Location:** `wrangler.jsonc:1-26`
- **Technical evidence / reproduction:** Only one D1 binding points to a database named dsc-oms-staging; no named production environment is defined.
- **Impact:** A production deployment command could target staging resources or incorrectly share data.
- **Recommended or implemented correction:** Define explicit environments with separate DB IDs and verified Access policies; manual approval.
- **Effort:** M; **validation:** Dry-run deployments and independent D1 binding verification

### OMS-008 — Public health endpoint returned user count (P2)

- **Classification:** Confirmed disclosure; **module:** API diagnostics; **status:** Fixed / offline tested
- **Location:** `src/index.ts:53-66`
- **Technical evidence / reproduction:** Original unauthenticated /api/health queried user count.
- **Impact:** Discloses organizational membership volume and uses an unnecessary count query.
- **Recommended or implemented correction:** Use SELECT 1 readiness check without user totals; return 503 if D1 unavailable.
- **Effort:** S; **validation:** Unauthenticated HTTP tests of public endpoint

### OMS-009 — Template tests did not exercise application (P1)

- **Classification:** Confirmed test mismatch; **module:** QA infrastructure; **status:** Fixed / offline tested
- **Location:** `test/index.spec.ts; test/node/oms.integration.test.mjs; test/node/oms.db-integration.test.mjs`
- **Technical evidence / reproduction:** Original Vitest checked /message and /random starter endpoints absent from current app.
- **Impact:** False confidence and no regression safety.
- **Recommended or implemented correction:** Replace placeholders; add Node built-in runner and in-memory real-SQL route tests.
- **Effort:** M; **validation:** 36 Node tests plus 12 Python SQLite tests (see latest validation)

### OMS-010 — Social profile links accepted legacy unsafe protocols (P1)

- **Classification:** Confirmed unsafe URL handling; **module:** Frontend security; **status:** Fixed / offline tested
- **Location:** `public/js/users.js:238-280; public/js/ux.js:1206-1235; public/js/safe-html.mjs`
- **Technical evidence / reproduction:** Dynamic profile URLs were inserted into anchor contexts; URL scheme not consistently normalized on display.
- **Impact:** Potential javascript: link execution or hostile external link if legacy database values exist.
- **Recommended or implemented correction:** Validate protocols as HTTP(S) before constructing anchors.
- **Effort:** S; **validation:** safeExternalUrl rejects javascript:, data: and relative URLs

### OMS-011 — CSV formula protection missed obfuscated leading whitespace (P2)

- **Classification:** Confirmed input risk; **module:** Exports; **status:** Fixed / offline tested
- **Location:** `public/js/task-export.js:131-151`
- **Technical evidence / reproduction:** Original guard checked only the first character and missed strings such as space followed by =.
- **Impact:** Spreadsheet formula execution when opened by staff in a supporting spreadsheet application.
- **Recommended or implemented correction:** Reject/neutralize formula leading characters even after whitespace/BOM/zero width.
- **Effort:** S; **validation:** CSV tests with synthetic formula payloads

### OMS-012 — No explicit mutation origin enforcement in API (P1)

- **Classification:** Confirmed hardening gap; **module:** API defense in depth; **status:** Mitigated / offline tested
- **Location:** `src/index.ts:22-37; public/_headers`
- **Technical evidence / reproduction:** Authenticated mutations relied on Cloudflare Access protection and browser cookie behavior, with no API-level Origin check.
- **Impact:** CSRF depends on Cloudflare Access deployment and cookie policy. Exploit not demonstrated.
- **Recommended or implemented correction:** Reject explicit cross-origin mutations; no-store API responses; static CSP/headers.
- **Effort:** S; **validation:** Cross-origin POST with origin + sec-fetch-site returns 403

### OMS-013 — Defined Approved task state never reached by approval (P2)

- **Classification:** Confirmed workflow inconsistency; **module:** Task workflow; **status:** Open / requires product decision
- **Location:** `src/services/task.service.ts:1193-1295`
- **Technical evidence / reproduction:** approveTask deliberately writes Completed from For Review; Approved is still in schema and requested lifecycle.
- **Impact:** Misleading terminology for members and reporting; introducing an Approved stage would change behavior.
- **Recommended or implemented correction:** Product decision: keep legacy direct completion or formally add Approved then Completed transition.
- **Effort:** M; **validation:** Explicit workflow acceptance tests after approval policy decision

### OMS-014 — All active tasks visible across departments (P1)

- **Classification:** Policy ambiguity (not confirmed vulnerability); **module:** Task visibility; **status:** Open / policy decision
- **Location:** `src/services/task.service.ts:236-273`
- **Technical evidence / reproduction:** Function canViewTask explicitly returns true for any non-Archived task, marked OMS_ORGANIZATION_TASK_VISIBILITY.
- **Impact:** If tasks include confidential data, active-task read scope may be excessive; the intent may instead be transparency.
- **Recommended or implemented correction:** Confirm organization privacy policy; restrict fields/rows only if policy requires, with role tests.
- **Effort:** M; **validation:** Run consented access matrix including confidential task fixtures

### OMS-015 — Sequential per-project aggregate lookups (P2)

- **Classification:** Confirmed inefficiency; **module:** Projects / performance; **status:** Fixed / bulk-query parity + measured
- **Location:** `src/services/project.service.ts:635-665`
- **Technical evidence / reproduction:** listProjects loops over projects and awaits getProjectAggregate one by one.
- **Impact:** Latency and extra D1 reads grow with project count.
- **Recommended or implemented correction:** Aggregate with batched queries or keyed bulk loading; benchmark first.
- **Effort:** M; **validation:** Seed 10/100/1000 synthetic projects and compare D1 read count

### OMS-016 — Task DTO computes permissions with additional queries (P2)

- **Classification:** Confirmed inefficiency; **module:** Tasks / performance; **status:** Fixed / preload permissions + role-tested
- **Location:** `src/services/task.service.ts:390-550,831-933`
- **Technical evidence / reproduction:** DTO permission evaluation awaits project manager/member checks per task; listTasks builds DTOs per record.
- **Impact:** Excess reads and UI latency for large task lists.
- **Recommended or implemented correction:** Preload role/project membership once per page and paginate; preserve permission logic.
- **Effort:** M; **validation:** Count D1 statements before and after on generated fixtures

### OMS-017 — Multiple notification controls and theme UI injected (P2)

- **Classification:** Confirmed redundant UI; **module:** Navigation / UX; **status:** Fixed / component-browser verified (full E2E pending)
- **Location:** `public/js/app.js:326; public/js/header-runtime.js:108-148`
- **Technical evidence / reproduction:** Header runtime independently adds a notification bell and theme buttons in addition to app shell.
- **Impact:** Duplicated controls and inconsistent focus/accessibility on smaller screens.
- **Recommended or implemented correction:** Consolidate after browser snapshots verify intended layout; one duplicate notification menu removed.
- **Effort:** M; **validation:** Browser desktop and mobile behavior, keyboard focus checks

### OMS-018 — Mojibake in navigation glyphs and request placeholders (P3)

- **Classification:** Confirmed cosmetic defect; **module:** Frontend display; **status:** Fixed / offline tested
- **Location:** `public/js/app.js:640-648; public/js/requests.js:39,202`
- **Technical evidence / reproduction:** Corrupted UTF-8 text showed gibberish instead of symbols.
- **Impact:** Visual credibility and legibility.
- **Recommended or implemented correction:** Replace corrupted strings with proper Unicode glyphs.
- **Effort:** S; **validation:** Node regression inspection + JS syntax check

### OMS-019 — No browser-based cross-device and accessibility verification (P2)

- **Classification:** Untested area; **module:** Frontend QA; **status:** Partially verified / component-browser only
- **Location:** `test/node/oms.integration.test.mjs; public/styles/*.css`
- **Technical evidence / reproduction:** Static source review is possible; Playwright/browser run was not executed in this Linux working environment.
- **Impact:** Unknown keyboard, focus, mobile layout and dark/light regressions.
- **Recommended or implemented correction:** Install browser runner in a clean environment and exercise user journeys.
- **Effort:** M; **validation:** Playwright smoke flow at 375/768/1440 widths and axe scans

### OMS-020 — Backup/restore and Access configuration not verified live (P1)

- **Classification:** Untested operational dependency; **module:** Production readiness; **status:** Open / environment access required
- **Location:** `wrangler.jsonc; docs/DEPLOYMENT_READINESS.md`
- **Technical evidence / reproduction:** Offline ZIP does not prove live Cloudflare Access policies, D1 PITR status, restore readiness, or separate secrets.
- **Impact:** Data recovery and public exposure risk if configuration differs from assumptions.
- **Recommended or implemented correction:** Human-run staging restore drill and Cloudflare Access policy review before deploy.
- **Effort:** M; **validation:** Staging restore drill, token tests and deployed smoke checks

### OMS-021 — Repeated HTML escape helpers and layered CSS overrides (P2)

- **Classification:** Confirmed maintainability issue; **module:** Frontend maintainability; **status:** Open / low-risk cleanup deferred
- **Location:** `public/js/ux.js:2-9; public/js/requests.js:11-19; public/styles/*.css`
- **Technical evidence / reproduction:** Multiple local helpers duplicate same transform; six linked stylesheets have override layering.
- **Impact:** Divergent escaping behavior and hard-to-debug styles.
- **Recommended or implemented correction:** Incrementally centralize safe rendering and remove only proven-dead CSS.
- **Effort:** M; **validation:** Visual regression screenshots and template unit tests

### OMS-022 — Template HTML rendering across 28 JS modules remains broader review scope (P2)

- **Classification:** Partially verified risk; **module:** Frontend XSS; **status:** Partially mitigated / broader template audit remains
- **Location:** `public/js/projects.js; public/js/tasks.js; public/js/reports.js; public/js/users.js`
- **Technical evidence / reproduction:** Many components use innerHTML. Targeted shell fields and social links were fixed; no exhaustive taint analysis of every template slot or browser exploit test completed.
- **Impact:** Residual XSS cannot be ruled out from static/source sampling.
- **Recommended or implemented correction:** Taint-review every interpolated user field by HTML, attribute, or URL context; add browser attack fixtures.
- **Effort:** L; **validation:** Automated template-slot checks and browser input injection E2E

### OMS-023 — List endpoints do not show consistent pagination (P2)

- **Classification:** Suspected scalability issue; **module:** Search, lists, reports; **status:** Open / pagination not changed (API compatibility)
- **Location:** `src/routes/tasks.routes.ts:48-61; src/routes/requests.routes.ts:48-60`
- **Technical evidence / reproduction:** Routes return complete task/request lists; no limit/offset in these two paths.
- **Impact:** Large datasets can increase Worker time, D1 reads and DOM size.
- **Recommended or implemented correction:** Add scoped cursor paging and server-side filters after measuring datasets.
- **Effort:** M; **validation:** Synthetic load benchmark for 100/1000/10000 tasks

### OMS-024 — JWT live JWKS/certificate lifecycle and Cloudflare policy (P2)

- **Classification:** Untested security control; **module:** Authentication; **status:** Open / external verification needed
- **Location:** `src/auth.ts:13-72`
- **Technical evidence / reproduction:** jose jwtVerify with issuer/audience and a cached remote JWK set is implemented; no real signed Access JWT or network JWKS rotation fixture tested.
- **Impact:** Live Access outage/policy drift behavior remains unverified.
- **Recommended or implemented correction:** Staging signed token tests for expiry, audience and rotation; keep fail closed.
- **Effort:** M; **validation:** Integration with representative JWKS and controlled token expiry

## Round 2 — Source-verified amendments (2026-10-22)

This register retains all prior issue IDs. Offline-test success does not imply staging or production verification. The two new issues below were identified during a subsequent source review.

| ID | Priority | Classification | Module | Finding | Status |
|---|---|---|---|---|---|
| OMS-025 | P1 | Confirmed unsafe HTML sink | Create Project dialog | Raw department/user fields and option attribute values in `public/js/project-create.js` | Fixed / source regression + Chromium component DOM |
| OMS-026 | P2 | Confirmed accessibility gap | Create Project dialog | No modal role, keyboard focus trap or Escape close | Fixed / Chromium component DOM at 375/768/1440 |

### OMS-025 — Create Project field injection (P1)

- **Evidence:** Original `public/js/project-create.js` concatenated `${department.name}`, `${user.name}`, `${user.id}` and dynamic department IDs directly into an `overlay.innerHTML` template. This is exploitable if an attacker can insert malicious values into those records; real attacker access was not demonstrated.
- **Fix:** Imported shared `safe-html.mjs` `escapeHtml` and escaped every data-derived text and quoted attribute context; no user permissions altered.
- **Regression:** Source-sink assertions and Chromium component DOM injection with synthetic `<img onerror>` and a malicious quoted attribute, confirming 0 generated images and no JS execution at 375/768/1440; no live Access path was tested.
- **Files:** `public/js/project-create.js`, `test/node/oms.integration.test.mjs`, `test/browser_component_smoke.py`.
- **Effort:** S; **residual:** other modal/view templates still need full taint-to-sink review.

### OMS-026 — Create Project dialog keyboard support (P2)

- **Evidence:** Modal markup lacked an ARIA dialog role and could not be dismissed with Escape; focus did not move into the dialog at open.
- **Fix:** Added shared `trapModalFocus`, accessible dialog attributes and labelled heading, Escape close, Tab containment and return focus on dismissal. Applied narrowly to Create Project to avoid changing untested dialogs.
- **Regression:** Chromium component checks at 3 viewport widths confirmed initial focus and Escape; screen reader output and other dialogs unverified.
- **Files:** `public/js/project-create.js`, `public/js/modal-focus.js`, `test/browser_component_smoke.py`.
- **Effort:** S; **residual:** other modals and full keyboard navigation still need coverage.

### Changed existing findings

- **OMS-015 (P2): fixed/offline verified.** `getProjectAggregatesForRows` replaces four additional SQL calls per project with three indexed bulk queries per batch of 100. Comparison fixture: 40 projects/120 tasks, 162 before → 5 after, data parity checked.
- **OMS-016 (P2): fixed/offline verified.** `listActiveManagedProjectIds` is loaded once on task list views, reducing repeated DTO-level manager lookups. Fixture: 120 tasks/40 projects, 242 before → 3 after, every task's DTO permission signature unchanged.
- **OMS-017 (P2): fixed/component verified.** Removed injected runtime header script and inert duplicate theme toggle; original static theme switcher and notifications remain. Browser component checked 3 theme choices and one notification menu at 375/768/1440. Full SPA E2E is outstanding.
- **OMS-019 (P2): partially verified.** Actual CSS + HTML component smoke ran in Chromium at 3 requested widths without document horizontal overflow; full authenticated page navigation, screen reader and complete accessibility testing remain blocked/untested.
- **OMS-021 (P2): open.** Repeated escape helpers and CSS override consolidation deferred to avoid broad refactor with inadequate visual regression baseline.
- **OMS-022 (P2): partially mitigated.** Confirmed `project-create` unsafe sink repaired. It is **not** evidence that every `innerHTML` sink in the application has been audited.
- **OMS-023 (P2): open.** Server pagination requires a backward-compatible API design and realistic-load tests; avoided a superficial JS-only page slice.
- **OMS-007 / 020 / 024 (P1/P2): blocked.** Local config gate now fails closed with missing named staging/production; no production database ID, Access policies, or staging database copy was provided.
- **OMS-013 / 014: policy decision pending.** Approved→Completed state and organization-wide task visibility are unchanged.
