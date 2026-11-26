PRAGMA foreign_keys = ON;

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active','Inactive')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  department_id TEXT NOT NULL REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  position TEXT,
  role TEXT NOT NULL CHECK (role IN ('Lead','Co-Lead','Executive','Member')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  messenger_url TEXT,
  facebook_url TEXT,
  contact_number TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_users_department_status ON users(department_id, status);
CREATE INDEX idx_users_role_status ON users(role, status);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Organization','Department')),
  created_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('Draft','Active','Completed','Archived')),
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_projects_status_type ON projects(status, type);
CREATE INDEX idx_projects_created_by ON projects(created_by);

CREATE TABLE project_departments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  department_id TEXT NOT NULL REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL,
  UNIQUE(project_id, department_id)
);
CREATE INDEX idx_project_departments_department ON project_departments(department_id, project_id);

CREATE TABLE project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  project_role TEXT NOT NULL CHECK (project_role IN ('Manager','Member')),
  assigned_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Active','Removed')),
  UNIQUE(project_id, user_id)
);
CREATE UNIQUE INDEX ux_project_one_active_manager
  ON project_members(project_id)
  WHERE status = 'Active' AND project_role = 'Manager';
CREATE INDEX idx_project_members_user_status ON project_members(user_id, status);
CREATE INDEX idx_project_members_project_status ON project_members(project_id, status);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('Task Request','Assistance Request','Resource Request')),
  requester_department_id TEXT NOT NULL REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  receiver_department_id TEXT NOT NULL REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  requested_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('Pending','Approved','Converted','Rejected')),
  created_at TEXT NOT NULL,
  approved_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  approved_at TEXT,
  rejected_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  rejected_at TEXT,
  rejection_remarks TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  archived_at TEXT,
  archived_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_requests_receiver_status_archive
  ON requests(receiver_department_id, status, is_archived);
CREATE INDEX idx_requests_requester_status_archive
  ON requests(requester_department_id, status, is_archived);
CREATE INDEX idx_requests_requested_by_created
  ON requests(requested_by, created_at DESC);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  department_id TEXT NOT NULL REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  priority TEXT NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('Critical','High','Medium','Low')),
  start_date TEXT,
  deadline TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('Created','Assigned','Ongoing','For Review','Approved','Completed','Archived')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  instructions TEXT,
  notes TEXT,
  evidence_url TEXT,
  submitted_at TEXT,
  reviewed_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  review_notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  source_request_id TEXT UNIQUE REFERENCES requests(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CHECK (deadline IS NULL OR start_date IS NULL OR deadline >= start_date)
);
CREATE INDEX idx_tasks_department_status_created
  ON tasks(department_id, status, created_at DESC);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_status_deadline ON tasks(status, deadline);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);

CREATE TABLE task_assignments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  assignment_role TEXT NOT NULL DEFAULT 'Assignee'
    CHECK (assignment_role = 'Assignee'),
  status TEXT NOT NULL CHECK (status IN ('Active','Completed','Removed')),
  assigned_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(task_id, user_id)
);
CREATE UNIQUE INDEX ux_task_one_active_assignment
  ON task_assignments(task_id)
  WHERE status = 'Active';
CREATE INDEX idx_task_assignments_user_status
  ON task_assignments(user_id, status, assigned_at DESC);
CREATE INDEX idx_task_assignments_task_status
  ON task_assignments(task_id, status);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'Task Assigned','Task Updated','Task For Review','Task Approved','Task Completed',
    'Request Received','Request Approved','Request Rejected','Request Converted',
    'Project Updated','Project Assigned','Project Archived','Deadline Reminder'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('TASK','PROJECT','REQUEST','DEPARTMENT')),
  reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'Unread' CHECK (status IN ('Unread','Read')),
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX idx_notifications_user_status_created
  ON notifications(user_id, status, created_at DESC);

CREATE TABLE activity_log (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);
CREATE INDEX idx_activity_reference_created
  ON activity_log(reference_type, reference_id, occurred_at DESC);
CREATE INDEX idx_activity_actor_created
  ON activity_log(actor_user_id, occurred_at DESC);
CREATE INDEX idx_activity_created
  ON activity_log(occurred_at DESC);
