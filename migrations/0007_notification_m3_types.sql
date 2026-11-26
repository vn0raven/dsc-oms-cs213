-- M3: extend notification types and refs while retaining existing rows.
-- Staging migration rehearsal and D1 backup mandatory before production.
-- Existing rows, foreign keys, status checks, and indexes are preserved.

CREATE TABLE notifications_m3 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'Task Assigned',
    'Task Updated',
    'Task For Review',
    'Task Approved',
    'Task Completed',
    'Request Received',
    'Request Approved',
    'Request Rejected',
    'Request Converted',
    'Request Withdrawn',
    'Project Updated',
    'Project Assigned',
    'Project Archived',
    'Deadline Reminder', 'Official Announcement', 'Event Decision', 'Event Appointment', 'Event Operational Alert'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('TASK','PROJECT','REQUEST','DEPARTMENT','ANNOUNCEMENT','EVENT')),
  reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'Unread' CHECK (status IN ('Unread','Read')),
  created_at TEXT NOT NULL,
  read_at TEXT
);

INSERT INTO notifications_m3 (
  id,
  user_id,
  type,
  title,
  message,
  reference_type,
  reference_id,
  status,
  created_at,
  read_at
)
SELECT
  id,
  user_id,
  type,
  title,
  message,
  reference_type,
  reference_id,
  status,
  created_at,
  read_at
FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_m3
RENAME TO notifications;

CREATE INDEX idx_notifications_user_status_created
ON notifications(user_id, status, created_at DESC);
