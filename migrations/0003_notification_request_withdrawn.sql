-- Expand the notifications type constraint to support withdrawn requests.
-- Existing rows, foreign keys, status checks, and indexes are preserved.

CREATE TABLE notifications_v2 (
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
    'Deadline Reminder'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('TASK','PROJECT','REQUEST','DEPARTMENT')),
  reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'Unread' CHECK (status IN ('Unread','Read')),
  created_at TEXT NOT NULL,
  read_at TEXT
);

INSERT INTO notifications_v2 (
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

ALTER TABLE notifications_v2
RENAME TO notifications;

CREATE INDEX idx_notifications_user_status_created
ON notifications(user_id, status, created_at DESC);
