# DSC OMS — CS 213 SA 3 Database Application Package

This directory (`dsc-oms-cs213/`) is an isolated, runnable copy of the **Developer Student Community Operations Management System (DSC OMS)** prepared for **CS 213 – Database Management System (SA 3)**. The original handover repository remains completely untouched.

---

## 1. Prerequisites
- **Node.js 22+** (verified on Node v26.13.1) and `npm`
- **Python 3.12+** (with Playwright + Chromium if running browser E2E checks)
- **Local Dependencies:** Already installed in `node_modules/` (or run `npm ci --ignore-scripts --no-audit --no-fund` using the pinned `package-lock.json`).

---

## 2. Quick Start (One-Command Classroom Launch)

From `C:\Users\dinga\.gemini\antigravity\scratch\dsc-oms-cs213`:

```powershell
powershell.exe -NoProfile -File scripts/Start-CS213.ps1
```

This script automatically:
1. Generates `wrangler.cs213.jsonc` (isolated local database `dsc-oms-cs213-local`, `APP_ENV="local"`, no auto-login override so real session login/logout is enforced).
2. Applies SQL migrations `0001` through `0010` to `.cs213-state/`.
3. Seeds synthetic demo data (`scripts/m3_local_demo_seed.sql` and `scripts/cs213_demo_seed.sql`).
4. Starts the local Cloudflare Worker at **`http://127.0.0.1:8787`**.

---

## 3. Sample Classroom Test Accounts (Synthetic Only)

| Role | Email | Password | Capabilities Demonstrated |
| --- | --- | --- | --- |
| **Lead** | `demo.lead@example.test` | `LeadPass#2026` | Full admin, User creation/role change, Event approvals, Reports & Data Mart ETL |
| **Co-Lead** | `demo.colead@example.test` | `CoLeadPass#2026` | Operations oversight, Event approvals, Reports & Data Mart ETL |
| **Executive** | `demo.executive@example.test` | `ExecPass#2026` | Department task/project management + accepted Team Head (Creatives) |
| **Member** | `demo.member@example.test` | `MemberPass#2026` | Standard member + accepted Event Director on *Demo Git Workshop* (denied `Reports` & `POST /api/users`) |

---

## 4. Reproducing Automated Verification & Evidence

```powershell
# 1. TypeScript, Node tests (incl. TC01-TC12), SQLite invariants/upgrades, CSS & native D1 tests
python scripts/validate_release.py --native

# 2. CS 213 Live Browser E2E (Login -> Wrong Password -> Lead Reports + Data Mart ETL -> Logout -> Member 403)
python test/cs213_browser_e2e.py
```

*(If running Python tests from the existing `.qa-venv`, pass the path to `.qa-venv\Scripts\python.exe`.)*

---

## 5. CS 213 Academic Documentation Index

- **[01_PROJECT_DOCUMENTATION.md](docs/cs213/01_PROJECT_DOCUMENTATION.md)** — Problem, Scope, Requirements (`FR`/`SEC`/`TRX`/`RPT`/`ADV`), Business Rules, Role–Permission Matrix, `TC-SEC-01`, Client–Server Architecture & Request Walkthrough
- **[02_THREE_LEVEL_ERDS_AND_NORMALIZATION.md](docs/cs213/02_THREE_LEVEL_ERDS_AND_NORMALIZATION.md)** — Three Separate Crow's Foot ERDs (Conceptual ERD, Logical ERD + 3NF Normalization, Physical SQLite/D1 Crow's Foot ERD)
- **[03_DATA_DICTIONARY.md](docs/cs213/03_DATA_DICTIONARY.md)** — Complete Data Dictionary (`0001`–`0010`) & Index Rationale
- **[04_TEST_PLAN_AND_EXECUTED_REPORT.md](docs/cs213/04_TEST_PLAN_AND_EXECUTED_REPORT.md)** — Formal Test Plan, Executed `TC01`–`TC12` + `TC-SEC-01` Results, DB State Proof & Defect Log
- **[05_LIVE_DEMO_SCRIPT.md](docs/cs213/05_LIVE_DEMO_SCRIPT.md)** — 10-Minute Live Classroom Demonstration Guide
- **Machine Evidence:** [cs213_tc01_tc12_results.json](docs/cs213/evidence/cs213_tc01_tc12_results.json) & [cs213_browser_e2e_results.json](docs/cs213/evidence/cs213_browser_e2e_results.json)
