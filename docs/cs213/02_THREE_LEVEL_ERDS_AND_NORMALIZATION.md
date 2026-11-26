# CS 213 – Three Levels of Database Design (Three Separate Crow's Foot ERDs & 3NF)

This document presents the **three separate database design levels** for **DSC OMS (`dsc-oms-cs213`)** strictly in **Crow's Foot ERD notation** (Conceptual, Logical + 3NF, and Physical — no UML), using consistent entity and table names matching `migrations/0001_initial.sql` through `migrations/0010_cs213_auth_and_datamart.sql`.

---

## 1. Conceptual ERD (Crow's Foot Notation)

**Question Answered:** *What core business information does the organization need, and how do the main business entities relate?* (Database types, foreign-key columns, and indexes are intentionally omitted.)

```mermaid
erDiagram
  DEPARTMENT ||--o{ USER : "employs"
  DEPARTMENT }o--o{ PROJECT : "participates in"
  DEPARTMENT ||--o{ TASK : "owns"
  DEPARTMENT ||--o{ REQUEST : "sends or receives"
  DEPARTMENT ||--o{ ANNOUNCEMENT : "targeted by"

  USER ||--o{ PROJECT : "manages or creates"
  USER }o--o{ TASK : "assigned to"
  USER ||--o{ EVENT : "creates"
  USER }o--o{ EVENT : "appointed to"
  USER ||--o{ NOTIFICATION : "receives"
  USER ||--o{ ACTIVITY_LOG : "performs"
  USER ||--o{ AUTH_SESSION : "authenticates via"

  PROJECT ||--o{ TASK : "groups"
  PROJECT ||--o{ EVENT : "sponsors"

  REQUEST ||--o| TASK : "converts to"

  EVENT ||--o{ EVENT_TEAM : "organizes"
  EVENT ||--o{ EVENT_ISSUE : "tracks"
  EVENT ||--o{ EVENT_REQUIREMENT : "verifies"
  EVENT ||--o{ EVENT_RECORD : "archives references for"
  EVENT ||--o{ EVENT_SCHEDULE_ITEM : "schedules"
  EVENT ||--o| EVENT_DEBRIEF : "closes with"
  EVENT ||--o{ EVENT_TASK_LINK : "links"
  TASK ||--o| EVENT_TASK_LINK : "linked via"

  ANNOUNCEMENT ||--o{ ANNOUNCEMENT_READ : "acknowledged by"
  USER ||--o{ ANNOUNCEMENT_READ : "reads"

  DM_MONTH ||--o{ DM_FACT_MONTHLY_TASKS : "slices by period"
  DM_DEPARTMENT ||--o{ DM_FACT_MONTHLY_TASKS : "slices by dept"
```

---

## 2. Logical ERD & Normalization through 3NF

**Question Answered:** *How is the data structured into normalized relations with primary keys, foreign keys, and associative entities to eliminate redundancy?*

### 2.1 Logical ERD (Crow's Foot with Keys & Associative Entities)

```mermaid
erDiagram
  departments {
    string id PK
    string name UK "NOT NULL"
    string status "Active | Inactive"
  }

  users {
    string id PK
    string name "NOT NULL"
    string email UK "NOT NULL"
    string department_id FK "NOT NULL"
    string role "Lead | Co-Lead | Executive | Member"
    string status "Active | Inactive"
  }

  user_credentials {
    string user_id PK,FK
    string password_hash "PBKDF2-SHA256"
    string password_salt "16-byte hex"
    int iterations "NOT NULL"
  }

  auth_sessions {
    string token_hash PK
    string user_id FK "NOT NULL"
    string expires_at "NOT NULL"
    string revoked_at "nullable"
  }

  projects {
    string id PK
    string name "NOT NULL"
    string type "Organization | Department"
    string created_by FK "NOT NULL"
    string status "Draft | Active | Completed | Archived"
  }

  project_departments {
    string id PK
    string project_id FK "UK(project_id, department_id)"
    string department_id FK
    string assigned_by FK
  }

  project_members {
    string id PK
    string project_id FK "UK(project_id, user_id)"
    string user_id FK
    string project_role "Manager | Member"
    string status "Active | Removed"
  }

  requests {
    string id PK
    string title "NOT NULL"
    string requester_department_id FK "NOT NULL"
    string receiver_department_id FK "NOT NULL"
    string requested_by FK "NOT NULL"
    string status "Pending | Approved | Converted | Rejected"
  }

  tasks {
    string id PK
    string title "NOT NULL"
    string department_id FK "NOT NULL"
    string project_id FK "nullable"
    string created_by FK "NOT NULL"
    string priority "Critical | High | Medium | Low"
    string status "Created | Assigned | Ongoing | For Review | Approved | Completed | Archived"
    int progress "0..100"
    string source_request_id FK,UK "nullable"
  }

  task_assignments {
    string id PK
    string task_id FK "UK(task_id, user_id)"
    string user_id FK
    string assigned_by FK
    string status "Active | Completed | Removed"
  }

  events {
    string id PK
    string name "NOT NULL"
    string project_id FK "nullable"
    string proposed_director_id FK "nullable"
    string created_by FK "NOT NULL"
    string status "11-stage workflow"
  }

  event_teams {
    string id PK
    string event_id FK "UK(event_id, name)"
    string name "NOT NULL"
    string created_by FK
  }

  event_appointments {
    string id PK
    string event_id FK
    string team_id FK "nullable for Director"
    string user_id FK
    string role "5 event roles"
    string status "Proposed | Accepted | Declined | Ended"
  }

  event_task_links {
    string task_id PK,FK
    string event_id FK
    string team_id FK "nullable"
    string linked_by FK
  }

  event_task_creation_requests {
    string event_id PK,FK
    string actor_id PK,FK
    string request_id PK
    string task_id FK,UK
    string team_id FK "nullable"
    string department_id FK
  }

  dm_dim_month {
    string month_key PK
    int year
    int month
    int quarter
    string label
  }

  dm_dim_department {
    string department_key PK,FK
    string department_name
    string status
  }

  dm_fact_department_monthly_tasks {
    string month_key PK,FK
    string department_key PK,FK
    int active_task_count
    int completed_task_count
    int overdue_task_count
    float avg_progress
  }

  departments ||--o{ users : "has"
  users ||--o| user_credentials : "secures"
  users ||--o{ auth_sessions : "owns"
  departments ||--o{ project_departments : "linked"
  projects ||--o{ project_departments : "spans"
  projects ||--o{ project_members : "staffed by"
  users ||--o{ project_members : "joins"
  departments ||--o{ requests : "receives"
  requests ||--o| tasks : "converts"
  departments ||--o{ tasks : "accountable for"
  projects ||--o{ tasks : "contains"
  tasks ||--o{ task_assignments : "assigned via"
  users ||--o{ task_assignments : "works on"
  events ||--o{ event_teams : "has"
  events ||--o{ event_appointments : "appoints"
  event_teams ||--o{ event_appointments : "staffed by"
  tasks ||--o| event_task_links : "linked to event"
  events ||--o{ event_task_links : "tracks"
  events ||--o{ event_task_creation_requests : "idempotency key"
  dm_dim_month ||--o{ dm_fact_department_monthly_tasks : "period"
  dm_dim_department ||--o{ dm_fact_department_monthly_tasks : "dept"
```

### 2.2 Normalization Through Third Normal Form (3NF)
- **First Normal Form (1NF):** Every column stores atomic scalar values (no comma-separated lists or repeating groups). Multi-valued relationships are factored into associative tables: `project_departments`, `project_members`, `task_assignments`, `event_appointments`, `event_task_links`, and `announcement_reads`.
- **Second Normal Form (2NF):** Every table has either a single-column surrogate `id` primary key (so no partial dependencies on a composite key can exist) or a composite key (`event_task_creation_requests(event_id, actor_id, request_id)`, `task_import_receipts(actor_id, request_id, row_id)`, `announcement_reads(announcement_id, user_id)`, `dm_fact_department_monthly_tasks(month_key, department_key)`) where all non-key attributes depend on the **entire** composite key.
- **Third Normal Form (3NF):** Non-key attributes depend solely on their table's primary key (`users` stores `department_id` rather than duplicating `department_name`; `tasks` stores `department_id` and `project_id` rather than department/project names; `event_task_links` references `task_id` and `event_id` cleanly).
- **Documented Deliberate Exceptions to 3NF:**
  1. **`activity_log.actor_name` and `activity_log.actor_role`:** Intentionally snapshot the actor's display name and role at the moment an audit event occurs so historical audit records remain accurate even if the user is later renamed, changes role, or has `actor_user_id` set to `NULL`.
  2. **`dm_dim_department.department_name` & `dm_fact_department_monthly_tasks`:** Intentional OLAP star-schema denormalization for fast read-only analytical aggregation and historical period slicing, reconciled back to OLTP `tasks` via `dm_etl_runs`.

---

## 3. Physical ERD (Crow's Foot Notation — SQLite / Cloudflare D1 Schema)

**Question Answered:** *How is the database physically implemented in SQLite / Cloudflare D1, including exact column types, nullability, defaults, constraints, and indexes matching `migrations/0001`–`0010`?*

**Physical Crow's Foot Legend:**
- `PK` = Primary Key, `FK` = Foreign Key, `UK` = Unique Key/Constraint, `NN` = `NOT NULL`.
- All timestamps are ISO-8601 UTC strings stored as `TEXT`; SQLite `PRAGMA foreign_keys = ON` and database triggers (`oms_*`, `m3_*`) enforce state-transition and authorization invariants inside atomic D1 transactions.

### 3.1 Core Identity, Auth, Projects, Requests & Tasks Physical Tables (Crow's Foot)

```mermaid
erDiagram
  departments {
    TEXT id PK
    TEXT name UK "NN COLLATE NOCASE"
    TEXT status "NN DEFAULT Active CHECK Active|Inactive"
    TEXT created_at "NN"
  }

  users {
    TEXT id PK
    TEXT name "NN"
    TEXT email UK "NN COLLATE NOCASE"
    TEXT department_id FK "NN ON DELETE RESTRICT"
    TEXT position "nullable"
    TEXT role "NN CHECK Lead|Co-Lead|Executive|Member"
    TEXT status "NN DEFAULT Active CHECK Active|Inactive"
    TEXT messenger_url "nullable"
    TEXT facebook_url "nullable"
    TEXT contact_number "nullable"
    TEXT created_at "NN"
    TEXT updated_at "NN"
  }

  user_credentials {
    TEXT user_id PK,FK "ON DELETE CASCADE"
    TEXT password_hash "NN PBKDF2-SHA256"
    TEXT password_salt "NN 16-byte hex"
    INTEGER iterations "NN DEFAULT 100000 CHECK >= 100000"
    TEXT updated_at "NN"
  }

  auth_sessions {
    TEXT token_hash PK
    TEXT user_id FK "NN ON DELETE CASCADE"
    TEXT created_at "NN"
    TEXT expires_at "NN"
    TEXT revoked_at "nullable"
  }

  projects {
    TEXT id PK
    TEXT name "NN"
    TEXT type "NN CHECK Organization|Department"
    TEXT created_by FK "NN ON DELETE RESTRICT"
    TEXT status "NN CHECK Draft|Active|Completed|Archived"
    TEXT start_date "nullable"
    TEXT end_date "nullable CHECK >= start_date"
    TEXT description "nullable"
    TEXT created_at "NN"
    TEXT updated_at "NN"
  }

  project_departments {
    TEXT id PK
    TEXT project_id FK,UK "NN ON DELETE CASCADE"
    TEXT department_id FK,UK "NN ON DELETE RESTRICT"
    TEXT assigned_by FK "NN ON DELETE RESTRICT"
    TEXT assigned_at "NN"
  }

  project_members {
    TEXT id PK
    TEXT project_id FK,UK "NN ON DELETE CASCADE"
    TEXT user_id FK,UK "NN ON DELETE RESTRICT"
    TEXT project_role "NN CHECK Manager|Member"
    TEXT assigned_by FK "NN ON DELETE RESTRICT"
    TEXT assigned_at "NN"
    TEXT status "NN CHECK Active|Removed"
  }

  tasks {
    TEXT id PK
    TEXT title "NN"
    TEXT description "nullable"
    TEXT department_id FK "NN ON DELETE RESTRICT"
    TEXT project_id FK "nullable ON DELETE RESTRICT"
    TEXT created_by FK "NN ON DELETE RESTRICT"
    TEXT priority "NN DEFAULT Medium"
    TEXT start_date "nullable"
    TEXT deadline "nullable CHECK >= start_date"
    TEXT status "NN 7 lifecycle states"
    INTEGER progress "NN DEFAULT 0 CHECK 0..100"
    TEXT instructions "nullable"
    TEXT notes "nullable"
    TEXT evidence_url "nullable"
    TEXT submitted_at "nullable"
    TEXT reviewed_by FK "nullable"
    TEXT review_notes "nullable"
    TEXT completed_at "nullable"
    TEXT created_at "NN"
    TEXT updated_at "NN"
    TEXT archived_at "nullable"
    TEXT source_request_id FK,UK "nullable"
  }

  task_assignments {
    TEXT id PK
    TEXT task_id FK,UK "NN ON DELETE CASCADE"
    TEXT user_id FK,UK "NN ON DELETE RESTRICT"
    TEXT assigned_by FK "NN ON DELETE RESTRICT"
    TEXT assignment_role "NN DEFAULT Assignee"
    TEXT status "NN CHECK Active|Completed|Removed"
    TEXT assigned_at "NN"
    TEXT completed_at "nullable"
  }

  task_import_receipts {
    TEXT actor_id PK,FK "NN"
    TEXT request_id PK "NN"
    TEXT row_id PK "NN"
    TEXT payload_hash "NN"
    TEXT task_id FK "NN ON DELETE CASCADE"
    TEXT created_at "NN"
  }

  departments ||--o{ users : "department_id"
  users ||--o| user_credentials : "user_id"
  users ||--o{ auth_sessions : "user_id"
  projects ||--o{ project_departments : "project_id"
  departments ||--o{ project_departments : "department_id"
  projects ||--o{ project_members : "project_id"
  users ||--o{ project_members : "user_id"
  departments ||--o{ tasks : "department_id"
  projects |o--o{ tasks : "project_id"
  tasks ||--o{ task_assignments : "task_id"
  users ||--o{ task_assignments : "user_id"
  tasks ||--o{ task_import_receipts : "task_id"
```

**Physical Indexes (Core Identity, Auth, Projects & Tasks):**

| Table | Index / Unique Name | Indexed Columns & Condition | Purpose |
| --- | --- | --- | --- |
| `users` | `idx_users_department_status` | `(department_id, status)` | Fast active-member roster queries by department |
| `users` | `idx_users_role_status` | `(role, status)` | Last active `Lead` guard & executive lookup |
| `auth_sessions` | `idx_auth_sessions_user` | `(user_id, revoked_at)` | Fast session revocation on logout/deactivation |
| `projects` | `idx_projects_status_type` | `(status, type)` | Active project filtering & Draft exclusion |
| `projects` | `idx_projects_created_by` | `(created_by)` | Creator ownership queries |
| `project_departments` | `idx_project_departments_department` | `(department_id)` | Department-scoped project lookup |
| `project_members` | `ux_project_one_active_manager` | `UNIQUE(project_id) WHERE project_role='Manager' AND status='Active'` | Enforces at most 1 active manager per project |
| `tasks` | `idx_tasks_department_status_created` | `(department_id, status, created_at DESC)` | Grouped summary & detailed report filtering |
| `tasks` | `idx_tasks_status_deadline` | `(status, deadline)` | Exception report overdue deadline scans |
| `task_assignments` | `ux_task_one_active_assignment` | `UNIQUE(task_id) WHERE status='Active'` | Enforces at most 1 active assignee per task |

### 3.2 Events Governance, Operations, Audit & Data Mart Physical Tables (Crow's Foot)

```mermaid
erDiagram
  events {
    TEXT id PK
    TEXT name "NN"
    TEXT description "nullable"
    TEXT objectives "nullable"
    TEXT event_type "NN DEFAULT Other"
    TEXT venue "nullable"
    TEXT starts_at "nullable"
    TEXT ends_at "nullable CHECK >= starts_at"
    INTEGER expected_attendance "nullable CHECK >= 0"
    REAL proposed_budget "nullable CHECK >= 0"
    TEXT project_id FK "nullable"
    TEXT proposed_director_id FK "nullable"
    TEXT created_by FK "NN"
    TEXT status "NN 13 lifecycle states"
    TEXT created_at "NN"
    TEXT updated_at "NN"
  }

  event_teams {
    TEXT id PK
    TEXT event_id FK,UK "NN ON DELETE CASCADE"
    TEXT name UK "NN"
    TEXT purpose "nullable"
    TEXT created_by FK "NN"
    TEXT created_at "NN"
  }

  event_appointments {
    TEXT id PK
    TEXT event_id FK "NN ON DELETE CASCADE"
    TEXT team_id FK "nullable"
    TEXT user_id FK "NN"
    TEXT role "NN 5 event roles"
    TEXT status "NN CHECK Proposed|Accepted|Declined|Ended"
    TEXT reports_to_id FK "nullable"
    TEXT responsibilities "NN"
    TEXT proposed_by FK "NN"
    TEXT proposed_at "NN"
    TEXT responded_at "nullable"
    TEXT ended_at "nullable"
  }

  event_task_links {
    TEXT task_id PK,FK "ON DELETE CASCADE"
    TEXT event_id FK "NN ON DELETE CASCADE"
    TEXT team_id FK "nullable ON DELETE RESTRICT"
    TEXT linked_by FK "NN"
    TEXT linked_at "NN"
  }

  event_task_creation_requests {
    TEXT event_id PK,FK "NN ON DELETE CASCADE"
    TEXT actor_id PK,FK "NN"
    TEXT request_id PK "NN"
    TEXT payload_hash "NN"
    TEXT task_id FK,UK "NN ON DELETE RESTRICT"
    TEXT team_id FK "nullable"
    TEXT department_id FK "NN"
    TEXT created_at "NN"
  }

  event_issues {
    TEXT id PK
    TEXT event_id FK "NN ON DELETE CASCADE"
    TEXT title "NN"
    TEXT severity "NN CHECK Low|Medium|High|Urgent"
    TEXT status "NN CHECK Open|Escalated|Resolved"
    TEXT owner_id FK "nullable"
    TEXT due_at "nullable"
    TEXT created_by FK "NN"
    TEXT created_at "NN"
    TEXT updated_at "NN"
  }

  activity_log {
    TEXT id PK
    TEXT occurred_at "NN"
    TEXT actor_user_id FK "nullable ON DELETE SET NULL"
    TEXT actor_name "NN"
    TEXT actor_role "NN"
    TEXT action "NN"
    TEXT reference_type "NN"
    TEXT reference_id "NN"
    TEXT old_value "nullable"
    TEXT new_value "nullable"
  }

  dm_dim_month {
    TEXT month_key PK
    INTEGER year "NN"
    INTEGER month "NN CHECK 1..12"
    INTEGER quarter "NN CHECK 1..4"
    TEXT label "NN"
  }

  dm_dim_department {
    TEXT department_key PK,FK "ON DELETE RESTRICT"
    TEXT department_name "NN"
    TEXT status "NN CHECK Active|Inactive"
  }

  dm_fact_department_monthly_tasks {
    TEXT month_key PK,FK "NN"
    TEXT department_key PK,FK "NN"
    INTEGER active_task_count "NN"
    INTEGER completed_task_count "NN"
    INTEGER overdue_task_count "NN"
    REAL avg_progress "NN"
    TEXT loaded_at "NN"
  }

  dm_etl_runs {
    TEXT id PK
    TEXT started_at "NN"
    TEXT completed_at "NN"
    TEXT triggered_by FK "NN"
    INTEGER source_task_count "NN"
    INTEGER mart_task_count "NN"
    INTEGER reconciled "NN CHECK 0|1"
  }

  events ||--o{ event_teams : "event_id"
  events ||--o{ event_appointments : "event_id"
  event_teams |o--o{ event_appointments : "team_id"
  events ||--o{ event_task_links : "event_id"
  events ||--o{ event_task_creation_requests : "event_id"
  events ||--o{ event_issues : "event_id"
  dm_dim_month ||--o{ dm_fact_department_monthly_tasks : "month_key"
  dm_dim_department ||--o{ dm_fact_department_monthly_tasks : "department_key"
```

**Physical Indexes (Events Governance, Audit & Data Mart):**

| Table | Index / Unique Name | Indexed Columns & Condition | Purpose |
| --- | --- | --- | --- |
| `events` | `idx_events_status_dates` | `(status, starts_at, ends_at)` | Stage & schedule timeline queries |
| `event_appointments` | `ux_event_one_open_director` | `UNIQUE(event_id) WHERE role='Event Director' AND status IN ('Proposed','Accepted')` | Concurrency lock: at most 1 open Director per Event |
| `event_appointments` | `ux_event_one_open_team_head` | `UNIQUE(event_id, team_id) WHERE role='Team Head' AND status IN ('Proposed','Accepted')` | Concurrency lock: at most 1 open Team Head per Team |
| `event_task_links` | `idx_event_tasks_event` | `(event_id, team_id)` | Event Workspace task filtering |
| `event_issues` | `idx_event_issues_active_report` | `(status, severity, event_id)` | Readiness gate & Exception Report scanning |
| `activity_log` | `idx_activity_created` | `(occurred_at DESC)` | Recent system audit feed |
| `activity_log` | `idx_activity_reference_created` | `(reference_type, reference_id, occurred_at DESC)` | Per-entity audit history lookup |
| `dm_fact_department_monthly_tasks` | `idx_dm_fact_dept` | `(department_key, month_key)` | Department trend & OLAP slicing |

*(Note: Supporting operational, governance, and communication tables `requests`, `notifications`, `event_approvals`, `event_stage_history`, `event_closure_records`, `event_requirements`, `event_requirement_history`, `event_records`, `event_schedule_items`, `event_debriefs`, `event_coordination_notes`, `announcements`, `announcement_reads`, and `announcement_history` are fully documented in [03_DATA_DICTIONARY.md](03_DATA_DICTIONARY.md).)*
