# CS 213 – Test Plan & Executed Test Report

## 1. Test Plan Overview

- **System Under Test:** DSC Operations Management System (`dsc-oms-cs213`)
- **Database Platform:** SQLite 3 (`PRAGMA foreign_keys = ON`, schema files `0001`–`0010`)
- **How Verification Was Executed:**
  1. **Application Integration Tests:** Automated tests running real server routes, permissions, and transactions against an initialized SQLite test database populated with synthetic classroom records.
  2. **Database Integrity & Transaction Rollback Tests:** Automated checks verifying foreign keys, trigger guards, concurrency locks, and multi-statement rollback behavior.
  3. **Live Browser Workflow Verification:** End-to-end browser verification logged into the running local application using synthetic accounts across different roles (`Lead` and `Member`).
- **Sample Test Accounts (Synthetic Data Only):**
  - `demo.lead@example.test` / `LeadPass#2026` — Role: `Lead` (`demo_dept_eng`)
  - `demo.colead@example.test` / `CoLeadPass#2026` — Role: `Co-Lead` (`demo_dept_creative`)
  - `demo.executive@example.test` / `ExecPass#2026` — Role: `Executive` (`demo_dept_creative`, accepted `Team Head`)
  - `demo.member@example.test` / `MemberPass#2026` — Role: `Member` (`demo_dept_eng`, accepted `Event Director` on *Demo Git Workshop*)
- **Database Reset Procedure:** Run `powershell.exe -NoProfile -File scripts/Start-CS213.ps1` (or clear local state and re-apply schemas `0001`–`0010` plus synthetic classroom seed data).
- **Executed By:** CS 213 Project Team (November 26, 2026)

---

## 2. Executed Test Cases (`TC01`–`TC12`, `TC-SEC-01` & `TC-DEPT-01`)

| Test ID | Req ID | What Was Verified | Test Steps & Inputs | Expected Result | Actual Result & Database State | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **TC01** | `FR-01` | Core task workflow (create, retrieve, update, persist) | Sign in as `Lead`, create task `"CS213 Core Verification Task"` (`High`), update description, and reload record. | Task saves (`201`), updates (`200`), and persists updated text. | Task created and retrieved with `"Updated core workflow description"`. | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC02** | `FR-02` | Unique constraint enforcement on duplicate emails | Attempt to register a new user using existing email `DEMO.LEAD@example.test` (case-insensitive collision). | Duplicate rejected (`409`); row count in `users` stays unchanged. | Rejected with `409 Conflict`; `users` count stayed `6` before and `6` after. | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC03** | `SEC-01` | Authentication, password denial & logout revocation | 1. Attempt sign-in with wrong password.<br>2. Access tasks unauthenticated.<br>3. Sign in with `LeadPass#2026`.<br>4. Sign out and revisit tasks. | Wrong password denied (`401`); unauth denied (`401`); valid login issues `HttpOnly` cookie; sign-out revokes session (`401` afterward). | Wrong password `401`; unauth `401`; valid login `200`; logout stamped `revoked_at` (`1` revoked session); subsequent access denied `401`; browser returned to sign-in form. | **PASS** | `cs213_tc01_tc12_results.json`, `cs213_browser_e2e_results.json` |
| **TC04** | `SEC-02` | Role restriction enforced on server even if UI is hidden | Signed in as `Member`, attempt user creation and direct report access. Repeat as `Lead`. | `Member` denied (`403 Forbidden`); `Lead` permitted (`201` / `200`). | `Member` received `403` on both direct requests and Reports nav was hidden in UI; `Lead` received `201` and `200`. | **PASS** | `cs213_tc01_tc12_results.json`, `cs213_browser_e2e_results.json` |
| **TC-SEC-01** | `SEC-02`, `SEC-04` | Role–Permission Matrix test (`test_clerk`) | `Member` attempts to create `test_clerk@example.test`; verify DB count is `0`; `Lead` creates `test_clerk@example.test`. | `Member` blocked (`403`, `0` rows); `Lead` succeeds (`201`, `1` row + audit). | `Member`: `403` (`0` rows). `Lead`: `201` (`test_clerk@example.test` count = `1`, `USER_CREATED` logged). | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC05** | `TRX-01` | Successful multi-table atomic transaction | Accepted `Event Director` (`demo.member@example.test`) creates `"CS213 Atomic Event Task"` on *Demo Git Workshop*. | `201 Created`; task, link, retry receipt, and 2 audit rows commit together. | **Before:** `tasks=10, links=1, receipts=0, audit=8`.<br>**After:** `tasks=11, links=2, receipts=1, audit=10`. | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC06** | `TRX-01`, `TRX-02` | Full transaction rollback on mid-batch trigger failure | Deactivate actor immediately before commit so database trigger `oms_event_task_creation_guard` aborts mid-batch. | Transaction aborts (`409`); **0** partial rows persist in `tasks`, links, receipts, or `activity_log`. | Returned `409 EVENT_CONFLICT`.<br>**Before:** `tasks=11, links=2, receipts=1, audit=10`.<br>**After:** `tasks=11, links=2, receipts=1, audit=10` (`0` orphan rows). | **PASS** | `DEF-01` retested; `cs213_tc01_tc12_results.json` |
| **TC07** | `TRX-02` | Concurrent transactions competing for single director slot | Two parallel sessions simultaneously propose two different `Event Director`s on the same Event. | Exactly `1` succeeds (`201`) and `1` conflicts (`409`); DB holds `1` open director. | Parallel outcomes `[201, 409]`; DB holds exactly `1` open `Event Director` row (`ux_event_one_open_director`). | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC08** | `RPT-01` | Detailed Report date-range filtering | Filter Detailed Report for October (`2026-10-01..2026-10-31`) vs. November (`2026-11-01..2026-11-30`). | Oct returns Oct tasks only; Nov returns Nov tasks only; `Archived` excluded. | Oct returned `6` rows (excl. Nov); Nov returned `4` rows (excl. Oct & Archived). | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC09** | `RPT-02` | Grouped Summary accuracy & Draft/Archived exclusions | Run Grouped Summary against seeded data containing `1` `Archived` task, `1` `Draft` project, and `1` `Draft` event. | Summary total equals live non-archived tasks and explicitly lists excluded counts. | `totalNonArchivedTasks = 10` (matches `tasks WHERE status <> 'Archived'`); exclusions: `{ Archived Tasks: 1, Draft Projects: 1, Draft Events: 1 }`. | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC10** | `RPT-03` | Exception Report cutoff thresholds | Generate Exception Report with cutoff `asOfDate = 2026-11-25`. | Flags overdue tasks (`<= 2026-11-25`), unassigned priority tasks, and urgent issues; ignores future deadlines & completed tasks. | Flagged `6` overdue incomplete tasks, `2` unassigned High/Critical tasks, and `1` unresolved Urgent event issue; future & completed tasks excluded. | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC11** | `ADV-01`, `ADV-02` | Operations Data Mart ETL & OLTP reconciliation | Trigger ETL load (`asOfDate = 2026-11-25`) and compare Data Mart monthly & total counts against operational `tasks`. | Star schema loads atomically; monthly and grand totals equal non-archived OLTP tasks (`reconciled: true`). | `OLTP = 10`, `Mart = 10`, `Archived Excluded = 1`, `reconciled = true` (`2026-11`: `4==4`, `2026-10`: `6==6`). Live browser badge displayed `RECONCILED (Mart == OLTP: 8)`. | **PASS** | `cs213_tc01_tc12_results.json`, `cs213_browser_e2e_results.json` |
| **TC12** | `SEC-04` | Audit trail verification | Inspect `activity_log` after login, failed login, logout, user creation, Event task creation, and ETL refresh. | Every action logged with `actor_user_id`, `actor_role`, `action`, `reference_id`, `occurred_at`. | Confirmed `13` audit rows covering `AUTH_LOGIN_FAILED`, `AUTH_LOGIN_SUCCESS`, `AUTH_LOGOUT`, `EVENT_TASK_CREATED`, `USER_CREATED`, `DATAMART_ETL_LOADED`. | **PASS** | `cs213_tc01_tc12_results.json` |
| **TC-DEPT-01** | `FR-01`, `FR-02`, `SEC-02`, `SEC-04` | Lead-only Department CRUD & soft status protections | 1. Non-Lead roles attempt Department Create/Rename/Status changes.<br>2. `Lead` creates `"CS213 Operations"`, retries lowercase duplicate, renames, attempts deactivating own dept, then soft-deactivates & reactivates the new dept. | Non-Leads denied (`403`); Lead creates (`201`), duplicate fails (`409`), rename succeeds (`200`), own-dept deactivation fails (`409`), soft toggle succeeds (`200`), and actions are audited. | Non-Leads denied `403`; Lead succeeded (`201`, `409` duplicate, `200` rename, `409` own-dept lock, `200` soft toggle) with `DEPARTMENT_CREATED`, `DEPARTMENT_UPDATED`, and `DEPARTMENT_STATUS_CHANGED` audited. Verified in live browser UI too. | **PASS** | `cs213_tc01_tc12_results.json`, `cs213_browser_e2e_results.json` |

---

## 3. Automated Verification Summary (Executed Nov 26, 2026)

All automated checks passed (`exitCode: 0`) alongside the rubric test cases above:
- **CS 213 Rubric Test Cases (`TC01`–`TC12`, `TC-SEC-01`, `TC-DEPT-01`):** `14 / 14` **PASS**
- **Full Server Integration & Business-Rule Suite:** `116 / 116` **PASS** (`112` core workflow & RBAC tests + `4` CS 213 suites)
- **Native Transaction & Batch Rollback Suite:** `9 / 9` **PASS**
- **SQLite Schema, Trigger & Migration Integrity Checks:** `20 / 20` **PASS**
- **UI Asset Syntax & Stylesheet Checks:** `0` errors across `9` stylesheets and `37` client scripts
- **Live Browser End-to-End Walkthrough:** `6 / 6` steps **PASS**

---

## 4. Defect & Retest Log

| Defect ID | Area | Issue Found During Testing | Fix Applied & Retest Outcome |
| --- | --- | --- | --- |
| `DEF-01` | `TC06` Rollback Test | Initial test tried updating an Event directly from `Planning` to `For Closure`, which was stopped early by lifecycle validation instead of testing a mid-batch trigger abort. | Adjusted test setup to deactivate the user mid-request so SQLite trigger `oms_event_task_creation_guard` aborted the transaction, confirming `0` orphan rows (`tasks=11->11`, `audit=10->10`). **Retest: PASS**. |
| `DEF-02` | User Onboarding | New accounts created by a Lead did not accept an optional initial password, preventing immediate local login. | Added optional validated `password` (`8`–`128` chars) stored atomically as a PBKDF2-SHA256 credential while keeping password data out of `activity_log`. **Retest: PASS**. |
| `DEF-03` | Summary Report | Soft-deactivating a department excluded its non-archived historical tasks from the Grouped Summary, causing totals to differ from Detailed and Data Mart counts. | Included inactive departments that still hold non-archived tasks and labeled them `(Inactive)` so all three views reconcile (`Summary == Detailed == Data Mart`). **Retest: PASS**. |
| `DEF-04` | Account Deactivation | Deactivating a user blocked active requests via account status check, but left prior session records un-revoked if the account was later reactivated. | Stamped `revoked_at` on all active rows in `auth_sessions` atomically whenever a user is deactivated. **Retest: PASS**. |
| `DEF-05` | Testing Account Toggle | Toggling testing-account status updated the `users` table without recording an audit entry or revoking prior sessions. | Wrapped user status update, session revocation, and `TESTING_STATUS_CHANGED` audit insert in one atomic transaction. **Retest: PASS**. |
| `DEF-06` | Data Mart Terminology | Data Mart column header *"Active Tasks"* risked confusion with a narrower status subset used in the Summary panel. | Clarified header to *"Open / Active (Created–Approved)"* and documented the exact inclusion formula (`status NOT IN ('Completed', 'Archived')`) in the Data Dictionary. **Retest: PASS**. |
| `DEF-07` | Project Deletion Integrity | Attempting to delete a Draft project already linked to an Event or Announcement surfaced an unhandled database foreign-key error (`500`). | Added pre-delete reference checks and mapped `ON DELETE RESTRICT` conflicts cleanly to `409 PROJECT_DELETE_NOT_SAFE`. **Retest: PASS**. |
| `DEF-08` | Department Workload View | Department Workload counts still filtered out inactive departments with non-archived historical tasks. | Aligned query with the Summary Report so inactive departments with active/historical tasks remain counted (`Workload Sum == Summary Total`). **Retest: PASS**. |
| `DEF-09` | Event Debrief Concurrency | Simultaneous Event debrief submissions could raise an unhandled `UNIQUE` constraint error (`500`) instead of `409 Conflict`. | Mapped `event_debriefs` unique conflict to `409 EVENT_CONFLICT`; verified `[201, 409]` under concurrent requests. **Retest: PASS**. |
| `DEF-10` | Exception Date Default | Default cutoff date in the Exception Report used UTC date instead of local calendar date between midnight and 08:00 PHT. | Switched the UI default cutoff date to the browser's local calendar date and documented UTC timestamp storage rules. **Retest: PASS**. |
| `DEF-11` | Data Mart Freshness Alert | Renaming or soft-deactivating a department left `dm_dim_department` outdated until the next ETL run without a visible warning. | Added automatic `dimensionsSynced` check comparing OLTP departments vs. `dm_dim_department` and surfaced a clear UI refresh alert. **Retest: PASS**. |

---

## 5. Honest Scope & Limitations
- Classroom verification runs on a single local computer (`127.0.0.1:8787`) with synthetic classroom accounts while keeping client, server, and database tiers strictly separated.
- `dm_fact_department_monthly_tasks` uses full atomic recomputation per ETL run—ideal for student organization data volume; multi-million-row enterprise warehouses would adopt incremental batch watermarks.
