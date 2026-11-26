# CS 213 SA 3 — 10-Minute Live Classroom Demonstration Script

**Pre-Demo Launch (Before Presenting):**
```powershell
cd C:\Users\dinga\.gemini\antigravity\scratch\dsc-oms-cs213
powershell.exe -NoProfile -File scripts/Start-CS213.ps1
```
Wait for Wrangler to print `http://127.0.0.1:8787` and open it in a browser.

---

### Part 1 — Authentication & Wrong-Password Denial (`SEC-01` / `TC03`, ~1.5 min)
1. Show the DSC OMS **Sign In** screen (`#login-form`). Explain that browser clients never touch SQLite directly and local auth uses **PBKDF2-SHA256 (`100,000` iterations)** + `HttpOnly`, `SameSite=Strict` cookies (`auth_sessions`).
2. Enter `demo.lead@example.test` with an incorrect password (e.g., `WrongPass123`) → show **`Invalid email or password.`** (`401`).
3. Sign in with **`demo.lead@example.test` / `LeadPass#2026`** → Dashboard loads.

### Part 2 — Complete End-to-End Workflow (`FR-01` / `FR-04` / `TRX-01`, ~2.5 min)
1. Click **Sign Out** in the sidebar, verify the app returns to Login, and sign in as **`demo.member@example.test` / `MemberPass#2026`** (permanent role `Member`, accepted `Event Director` for *Demo Git Workshop*).
2. Open **Events → Demo Git Workshop → Tasks** tab → click **+ New Task**.
   - Point out that `Event` is read-only, `Assignee` is absent (unassigned default), and `requestId` provides idempotency.
   - Create a task (e.g., `"Live Demo Workshop Checklist"`). Show it appears under Event Tasks AND in central **Tasks** (Board & Sheet) with Event context.
   - Click the task to open the inspector and show that temporary creation does **not** grant `Edit` or `Assign` rights (`403` if attempted).

### Part 3 — Restricted Action & Server-Side Matrix Enforcement (`SEC-02` / `TC04` / `TC-SEC-01`, ~1.5 min)
1. While still signed in as `Member`, point out that **Reports**, **Audit Log**, and **Add Member** are hidden in the UI.
2. Open Browser DevTools Console (or run `fetch('/api/reports/overview').then(r => console.log(r.status))` and `fetch('/api/users', {method:'POST', ...})`) to prove the **server** rejects direct calls with **`403 FORBIDDEN`** (`permissions["reports.view"]` = `['Lead', 'Co-Lead']`).

### Part 4 — Transaction Commit, Rollback & Concurrency Evidence (`TRX-01` / `TRX-02` / `TC05`–`TC07`, ~1.5 min)
1. Show `src/services/event.service.ts` (`createTaskTransaction` D1 batch) and `migrations/0008_event_task_creation.sql` (`oms_event_task_creation_guard` trigger).
2. Run or display the executed output from `node --test test/node/cs213-sa3.test.mjs` (`docs/cs213/evidence/cs213_tc01_tc12_results.json`):
   - **TC05 (Commit):** `tasks 10→11, links 1→2, receipts 0→1, audit 8→10`.
   - **TC06 (Rollback):** Mid-batch conflict aborts via trigger (`409`); `tasks` & `audit` remain unchanged (`11→11`, `10→10`).
   - **TC07 (Concurrency):** Two parallel `Event Director` proposals return `[201, 409]`; DB holds `1` open director.

### Part 5 — Detailed, Summary & Exception Reports (`RPT-01`–`RPT-03` / `TC08`–`TC10`, ~1.5 min)
1. Click **Sign Out** and sign back in as **`demo.lead@example.test` / `LeadPass#2026`**.
2. Open **Reports**:
   - **Detailed Task Records Report:** Filter `Start Date: 2026-10-01`, `End Date: 2026-10-31` → **Apply Filters** → show October tasks only. Reset or set `2026-11-01..2026-11-30` → show November tasks (Archived excluded).
   - **Grouped Summary Report:** Point out department totals and explicit exclusion counter (`Excluded: 1 archived tasks · 1 draft projects · 1 draft events`).
   - **Exception Report (`As-Of Date: 2026-11-25`):** Show `CS213 November Overdue Task` (`deadline 2026-11-12 <= 2026-11-25`) and `CS213 Unresolved High Readiness Issue`, while future-deadline `CS213 November Upcoming Task` (`2026-12-15`) is excluded.

### Part 6 — Operations Data Mart & Reconciliation + Audit Log (`ADV-01` / `TC11` / `TC12`, ~1.5 min)
1. Scroll to **Operations Analytics Data Mart (Star Schema & ETL)** on the **Reports** page.
2. Click **Run ETL Load & Reconcile** → show monthly star-schema rows (`dm_dim_month` × `dm_dim_department`) and the green **`RECONCILED (Mart == OLTP)`** badge.
3. Open **Audit Log** to show `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_LOGOUT`, `EVENT_TASK_CREATED`, and `DATAMART_ETL_LOADED` recorded with user, role, timestamp, and reference ID.
