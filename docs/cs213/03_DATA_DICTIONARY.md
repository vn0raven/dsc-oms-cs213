# CS 213 – Complete Data Dictionary & Design Rationale

**DBMS:** SQLite / Cloudflare D1 (`PRAGMA foreign_keys = ON`)  
**Schema Source:** `migrations/0001_initial.sql` through `migrations/0010_cs213_auth_and_datamart.sql`

---

## 1. Core Identity & Authentication Tables

### `departments`
| Column | Meaning | SQLite Type | Key / Constraint | Valid Values |
| --- | --- | --- | --- | --- |
| `id` | Unique department identifier | `TEXT` | `PRIMARY KEY` | Non-empty string (e.g., `demo_dept_eng`) |
| `name` | Department display name | `TEXT` | `NOT NULL`, `COLLATE NOCASE UNIQUE` | Case-insensitive unique name |
| `status` | Operational availability | `TEXT` | `NOT NULL DEFAULT 'Active' CHECK` | `'Active'`, `'Inactive'` |
| `created_at` | Creation timestamp | `TEXT` | `NOT NULL DEFAULT strftime(...)` | ISO-8601 UTC timestamp |

### `users`
| Column | Meaning | SQLite Type | Key / Constraint | Valid Values |
| --- | --- | --- | --- | --- |
| `id` | Unique user identifier | `TEXT` | `PRIMARY KEY` | UUID or seeded ID |
| `name` | Full display name | `TEXT` | `NOT NULL` | 1–120 chars |
| `email` | Organizational login email | `TEXT` | `NOT NULL`, `COLLATE NOCASE UNIQUE` | Valid lowercase/case-insensitive unique email |
| `department_id` | Permanent accountable department | `TEXT` | `NOT NULL FK -> departments(id) ON UPDATE CASCADE ON DELETE RESTRICT` | Active department ID |
| `position` | Organizational title | `TEXT` | Nullable | Free text |
| `role` | Permanent OMS system role | `TEXT` | `NOT NULL CHECK` | `'Lead'`, `'Co-Lead'`, `'Executive'`, `'Member'` |
| `status` | Account active status | `TEXT` | `NOT NULL DEFAULT 'Active' CHECK` | `'Active'`, `'Inactive'` |
| `messenger_url` | Optional Messenger link | `TEXT` | Nullable | Valid `http(s)` URL |
| `facebook_url` | Optional Facebook link | `TEXT` | Nullable | Valid `http(s)` URL |
| `contact_number` | Optional phone number | `TEXT` | Nullable | Text up to 40 chars |
| `created_at` | Record creation UTC timestamp | `TEXT` | `NOT NULL DEFAULT strftime(...)` | ISO-8601 UTC |
| `updated_at` | Last update UTC timestamp | `TEXT` | `NOT NULL DEFAULT strftime(...)` | ISO-8601 UTC |

### `user_credentials`
| Column | Meaning | SQLite Type | Key / Constraint | Valid Values |
| --- | --- | --- | --- | --- |
| `user_id` | Associated user account | `TEXT` | `PRIMARY KEY FK -> users(id) ON UPDATE CASCADE ON DELETE CASCADE` | Existing `users.id` |
| `password_hash` | Derived PBKDF2-SHA256 digest | `TEXT` | `NOT NULL` | 64-char hex string (256-bit) |
| `password_salt` | Per-user cryptographic salt | `TEXT` | `NOT NULL` | 32-char hex string (128-bit) |
| `iterations` | PBKDF2 work factor | `INTEGER` | `NOT NULL DEFAULT 100000 CHECK (iterations >= 100000)` | `>= 100000` |
| `updated_at` | Credential update timestamp | `TEXT` | `NOT NULL` | ISO-8601 UTC |

### `auth_sessions`
| Column | Meaning | SQLite Type | Key / Constraint | Valid Values |
| --- | --- | --- | --- | --- |
| `token_hash` | SHA-256 hash of `dsc_oms_session` cookie | `TEXT` | `PRIMARY KEY` | 64-char hex digest |
| `user_id` | Authenticated session owner | `TEXT` | `NOT NULL FK -> users(id) ON UPDATE CASCADE ON DELETE CASCADE` | Active `users.id` |
| `created_at` | Login timestamp | `TEXT` | `NOT NULL` | ISO-8601 UTC |
| `expires_at` | Session expiration timestamp (+24h) | `TEXT` | `NOT NULL` | ISO-8601 UTC |
| `revoked_at` | Logout revocation timestamp | `TEXT` | Nullable | `NULL` (active) or ISO-8601 UTC |

---

## 2. Projects, Requests & Tasks Tables

### `projects`, `project_departments`, `project_members`
| Table | Key Columns & Constraints | Valid Values / Notes |
| --- | --- | --- |
| `projects` | `id (PK)`, `name (NN)`, `type (CHECK)`, `created_by (FK -> users)`, `status (CHECK)`, `start_date`, `end_date (CHECK >= start_date)`, `description`, `created_at`, `updated_at` | `type`: `'Organization' \| 'Department'`; `status`: `'Draft' \| 'Active' \| 'Completed' \| 'Archived'` |
| `project_departments` | `id (PK)`, `project_id (FK CASCADE)`, `department_id (FK RESTRICT)`, `assigned_by (FK)`, `assigned_at`, `UNIQUE(project_id, department_id)` | Resolves M:N between `projects` and `departments` |
| `project_members` | `id (PK)`, `project_id (FK CASCADE)`, `user_id (FK RESTRICT)`, `project_role (CHECK)`, `assigned_by (FK)`, `assigned_at`, `status (CHECK)`, `UNIQUE(project_id, user_id)` | `project_role`: `'Manager' \| 'Member'`; partial unique index `ux_project_one_active_manager` enforces at most 1 active manager per project |

### `requests`
| Column | Meaning | SQLite Type | Key / Constraint | Valid Values |
| --- | --- | --- | --- | --- |
| `id` | Unique request ID | `TEXT` | `PRIMARY KEY` | UUID |
| `title`, `description` | Request summary and details | `TEXT` | `title NOT NULL` | Text |
| `type` | Request category | `TEXT` | `NOT NULL CHECK` | `'Task Request'`, `'Assistance Request'`, `'Resource Request'` |
| `requester_department_id` | Sending department | `TEXT` | `NOT NULL FK -> departments(id)` | Department ID |
| `receiver_department_id` | Target department | `TEXT` | `NOT NULL FK -> departments(id)` | Department ID |
| `requested_by` | Submitting user | `TEXT` | `NOT NULL FK -> users(id)` | User ID |
| `status` | Lifecycle state | `TEXT` | `NOT NULL CHECK` | `'Pending'`, `'Approved'`, `'Converted'`, `'Rejected'` |
| `is_archived`, `is_withdrawn` | Archive / withdrawal flags | `INTEGER` | `NOT NULL DEFAULT 0 CHECK (0\|1)` | `0` or `1` |
| `approved_by`, `rejected_by`, `archived_by`, `withdrawn_by` | Actor FKs and timestamps | `TEXT` | `FK -> users(id)` | Nullable until action |

### `tasks`, `task_assignments`, `task_import_receipts`
| Table | Column | Meaning | Type | Key / Constraint / Valid Values |
| --- | --- | --- | --- | --- |
| `tasks` | `id` | Unique task ID | `TEXT` | `PRIMARY KEY` |
| `tasks` | `title`, `description`, `instructions`, `notes`, `evidence_url` | Task work content | `TEXT` | `title NOT NULL` |
| `tasks` | `department_id` | Accountable permanent department | `TEXT` | `NOT NULL FK -> departments(id) ON DELETE RESTRICT` |
| `tasks` | `project_id` | Optional parent project | `TEXT` | `FK -> projects(id) ON DELETE RESTRICT` (nullable) |
| `tasks` | `created_by`, `reviewed_by` | Creator and reviewer | `TEXT` | `FK -> users(id) ON DELETE RESTRICT` |
| `tasks` | `priority` | Work urgency | `TEXT` | `NOT NULL DEFAULT 'Medium' CHECK('Critical'\|'High'\|'Medium'\|'Low')` |
| `tasks` | `start_date`, `deadline` | Schedule bounds | `TEXT` | `CHECK(deadline IS NULL OR start_date IS NULL OR deadline >= start_date)` |
| `tasks` | `status` | Workflow stage | `TEXT` | `CHECK('Created'\|'Assigned'\|'Ongoing'\|'For Review'\|'Approved'\|'Completed'\|'Archived')` |
| `tasks` | `progress` | Completion percentage | `INTEGER` | `NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100)` |
| `tasks` | `source_request_id` | Converted request back-reference | `TEXT` | `UNIQUE FK -> requests(id)` (nullable; prevents duplicate conversion) |
| `task_assignments` | `id`, `task_id`, `user_id`, `assigned_by`, `assignment_role`, `status`, `assigned_at`, `completed_at` | Links tasks to assigned user | `TEXT` | `UNIQUE(task_id, user_id)`; `ux_task_one_active_assignment` allows only 1 `Active` assignee per task |
| `task_import_receipts` | `actor_id`, `request_id`, `row_id`, `payload_hash`, `task_id`, `created_at` | Per-row CSV import idempotency & guard | `TEXT` | `PRIMARY KEY(actor_id, request_id, row_id)`, `FK task_id -> tasks(id)` |

---

## 3. Events Governance, Operations & Announcements Tables

| Table | Purpose | Primary Key & Key Constraints |
| --- | --- | --- |
| `events` | Event header & 11-stage workflow | `id (PK)`, `status CHECK` (13 values incl. `Rejected`, `Cancelled`), `expected_attendance >= 0`, `proposed_budget >= 0`, `ends_at >= starts_at`, `project_id (FK)` |
| `event_teams` | Activated functional teams inside an Event | `id (PK)`, `event_id (FK CASCADE)`, `UNIQUE(event_id, name)` |
| `event_appointments` | Consent-based temporary Event staffing | `id (PK)`, `role CHECK` (5 roles), `status CHECK` (`Proposed\|Accepted\|Declined\|Ended`), partial unique indexes `ux_event_one_open_director` and `ux_event_one_open_team_head` |
| `event_approvals` | Formal Lead/Co-Lead approval decisions | `id (PK)`, `event_id (FK CASCADE)`, `decision CHECK('Approved'\|'Returned'\|'Rejected'\|'Closure Approved')` |
| `event_stage_history` | Chronological stage transitions | `id (PK)`, `event_id (FK CASCADE)`, `actor_id (FK)` |
| `event_closure_records` | Mandatory closure attestation & metrics | `event_id (PK, FK RESTRICT)`, `final_attendance >= 0`, `final_expense >= 0`, `financial_validated = 1`, `records_validated = 1` |
| `event_task_links` | Associates a task with an Event and optional Event Team | `task_id (PK, FK CASCADE)`, `event_id (FK CASCADE)`, `team_id (FK RESTRICT)` |
| `event_task_creation_requests` | Durable retry & transaction guard for Event task creation | `PRIMARY KEY(event_id, actor_id, request_id)`, `task_id (UNIQUE FK RESTRICT)`, trigger `oms_event_task_creation_guard` |
| `event_requirements` & `event_requirement_history` | Readiness & Closure checklists + verification history | `id (PK)`, `phase CHECK('Readiness'\|'Closure')`, `status CHECK('Pending'\|'Submitted'\|'Verified'\|'Not Applicable')` |
| `event_issues` | Operational issues & escalation | `id (PK)`, `severity CHECK('Low'\|'Medium'\|'High'\|'Urgent')`, `status CHECK('Open'\|'Escalated'\|'Resolved')` |
| `event_records` | Protected document/record references | `id (PK)`, `classification CHECK('Restricted'\|'Event Team')`, `status CHECK('Submitted'\|'Verified')` |
| `event_schedule_items`, `event_debriefs`, `event_coordination_notes` | Event run-of-show, post-event debrief, meeting/decision notes | `id (PK)` / `event_id (PK)` (`debriefs`), `ends_at >= starts_at` |
| `announcements`, `announcement_reads`, `announcement_history` | Audience-scoped notices, read receipts, edit history | `announcements.id (PK)`, `announcement_reads PK(announcement_id, user_id)`, `audience CHECK('Organization'\|'Department')` |

---

## 4. Notifications, Audit Log & Data Mart Tables

| Table | Columns & Constraints | Purpose |
| --- | --- | --- |
| `notifications` | `id (PK)`, `user_id (FK CASCADE)`, `type (CHECK 18 types)`, `title`, `message`, `reference_type`, `reference_id`, `status ('Unread'\|'Read')`, `created_at`, `read_at` | Recipient-scoped workflow alerts |
| `activity_log` | `id (PK)`, `occurred_at`, `actor_user_id (FK SET NULL)`, `actor_name`, `actor_role`, `action`, `reference_type`, `reference_id`, `old_value`, `new_value` | Immutable audit trail for security & business mutations |
| `dm_dim_month` | `month_key (PK)`, `year`, `month (1..12)`, `quarter (1..4)`, `label` | Time dimension (`YYYY-MM`) for OLAP slicing |
| `dm_dim_department` | `department_key (PK, FK -> departments.id)`, `department_name`, `status` | Department dimension for analytical joins |
| `dm_fact_department_monthly_tasks` | `PRIMARY KEY (month_key, department_key)`, `active_task_count`, `completed_task_count`, `overdue_task_count`, `avg_progress`, `loaded_at` | Monthly department KPI grain excluding `Archived` tasks. `active_task_count` counts all open/in-progress non-archived tasks (`status NOT IN ('Completed', 'Archived')`, i.e., `Created` through `Approved`) so `active_task_count + completed_task_count == total non-archived tasks`. |
| `dm_etl_runs` | `id (PK)`, `started_at`, `completed_at`, `triggered_by (FK -> users.id)`, `source_task_count`, `mart_task_count`, `reconciled (0\|1)` | Tracks ETL executions & OLTP reconciliation status |

---

## 5. Design Choices & Index Rationale

1. **`UNIQUE` Constraints for Concurrency & Integrity:** `users.email (COLLATE NOCASE UNIQUE)`, `departments.name (COLLATE NOCASE UNIQUE)`, `tasks.source_request_id UNIQUE`, `ux_event_one_open_director`, and `ux_event_one_open_team_head` push race-condition enforcement directly into SQLite's storage engine so simultaneous API requests cannot create duplicate directors or double-convert requests.
2. **Filtered Composite Indexes for Reports & Exception Queries:**
   - `idx_tasks_department_status_created ON tasks(department_id, status, created_at DESC)` accelerates Grouped Summary and department-filtered Detailed reports.
   - `idx_tasks_status_deadline ON tasks(status, deadline)` accelerates Exception Report overdue scans (`deadline <= asOfDate AND status NOT IN ('Completed','Archived')`).
   - `idx_event_issues_active_report ON event_issues(status, severity, event_id)` accelerates unresolved High/Urgent issue exception checks.
   - `idx_auth_sessions_user ON auth_sessions(user_id, revoked_at)` and `token_hash PRIMARY KEY` keep session validation `O(log N)` per API call.
3. **Database Triggers for Transaction-Time Guardrails:** Triggers (`oms_task_state_guard`, `oms_last_lead_guard`, `oms_event_state_guard`, `oms_event_task_creation_guard`, `m3_blocking_issues`) guarantee that even if another session changes an Event's stage or deactivates an actor between API pre-checks and D1 batch commit, the entire batch aborts cleanly with `OMS_STATE_CONFLICT`.
