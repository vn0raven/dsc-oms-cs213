# DSC Operations Management System (DSC OMS)

**Course:** CS 213 – Database Management System (SA 3 – Database Application Project)  
**Instructor:** Prof. Ivy Kim D. Machica  
**Stack:** Cloudflare Workers (Hono TypeScript API) · SQLite 3 / Cloudflare D1 (`PRAGMA foreign_keys = ON`) · Vanilla ES Modules & CSS

---

## 1. System Overview
**DSC OMS (`dsc-oms-cs213`)** replaces manual spreadsheet trackers with a role-governed, database-backed web application for managing **Departments**, **Users & Sessions**, **Projects**, **Tasks**, **Cross-Department Requests**, **Governance-Aware Events**, **Announcements**, **Reports**, **Operations Analytics Data Mart ETL**, and an immutable **Activity Audit Log**.

Browser scripts never access SQLite directly; all requests pass through authenticated, origin-checked Worker routes using parameterized `.prepare(...).bind(...)` queries and atomic `env.DB.batch(...)` transactions guarded by SQLite triggers and `UNIQUE` / `CHECK` / `ON DELETE RESTRICT` constraints.

---

## 2. Quick Start (Local Classroom Run)

**Prerequisites:** Node.js 22+, `npm` (dependencies installed via `npm ci --ignore-scripts --no-audit --no-fund`), and Python 3.12+.

```powershell
powershell.exe -NoProfile -File scripts/Start-CS213.ps1
```

This script generates a local Wrangler configuration (`wrangler.cs213.jsonc` bound to `.cs213-state/`, `APP_ENV="local"`), applies schema migrations `0001`–`0010`, seeds synthetic classroom records (`scripts/m3_local_demo_seed.sql` and `scripts/cs213_demo_seed.sql`), and starts the server at **`http://127.0.0.1:8787`**.

---

## 3. Sample Classroom Test Accounts (Synthetic Data)

| Role | Email | Password | Permissions Demonstrated |
| --- | --- | --- | --- |
| **Lead** | `demo.lead@example.test` | `LeadPass#2026` | Full admin: Department CRUD, User creation/roles, Event approvals, Reports & Data Mart ETL |
| **Co-Lead** | `demo.colead@example.test` | `CoLeadPass#2026` | Operations oversight, User creation, Event approvals, Reports & Data Mart ETL |
| **Executive** | `demo.executive@example.test` | `ExecPass#2026` | Own-department Task/Project management + appointed Event Team Head |
| **Member** | `demo.member@example.test` | `MemberPass#2026` | Standard member + appointed Event Director (denied `Reports` & `POST /api/users` with `403`) |

---

## 4. Reproducing Automated Verification

```powershell
# TypeScript, Node integration & CS 213 suites (116 tests), SQLite invariants (20 tests), CSS syntax, JS syntax, and native D1 tests (9 tests)
python scripts/validate_release.py --native

# Live loopback browser E2E test (Playwright + Chromium)
python test/cs213_browser_e2e.py

# Build clean submission archive (dist/dsc-oms-cs213-submission.zip)
python scripts/package_release.py
```

---

## 5. Project Documentation Deliverables

- **[01_PROJECT_DOCUMENTATION.md](docs/cs213/01_PROJECT_DOCUMENTATION.md)** — Problem, Scope, Requirements (`FR`/`SEC`/`TRX`/`RPT`/`ADV`), Business Rules, Role–Permission Matrix, Architecture & Walkthrough
- **[02_THREE_LEVEL_ERDS_AND_NORMALIZATION.md](docs/cs213/02_THREE_LEVEL_ERDS_AND_NORMALIZATION.md)** — Three Separate Crow's Foot ERDs (Conceptual, Logical + 3NF, Physical SQLite/D1)
- **[03_DATA_DICTIONARY.md](docs/cs213/03_DATA_DICTIONARY.md)** — Complete Data Dictionary (`migrations/0001`–`0010`) & Index/Trigger Rationale
- **[04_TEST_PLAN_AND_EXECUTED_REPORT.md](docs/cs213/04_TEST_PLAN_AND_EXECUTED_REPORT.md)** — Formal Test Plan, Executed `TC01`–`TC12` + `TC-SEC-01` + `TC-DEPT-01` Results & Defect Log
- **[05_LIVE_DEMO_SCRIPT.md](docs/cs213/05_LIVE_DEMO_SCRIPT.md)** — 10-Minute Live Classroom Demonstration Guide
- **Complete Compiled Exports (PDF & DOCX):**
  - [DSC-OMS-CS213-Complete-Documentation.pdf](docs/cs213/exports/DSC-OMS-CS213-Complete-Documentation.pdf)
  - [DSC-OMS-CS213-Complete-Documentation.docx](docs/cs213/exports/DSC-OMS-CS213-Complete-Documentation.docx)
- **Machine Evidence:** [cs213_tc01_tc12_results.json](docs/cs213/evidence/cs213_tc01_tc12_results.json) & [cs213_browser_e2e_results.json](docs/cs213/evidence/cs213_browser_e2e_results.json)
