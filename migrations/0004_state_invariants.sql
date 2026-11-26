-- Add non-destructive concurrency guards. Triggers protect D1 batches (including
-- their audit/notification inserts) from stale write attempts by aborting the
-- entire batch. They do not rewrite existing rows.

-- A status-changing request write may only perform an authorized transition
-- from its *current* database state, not from a previously loaded snapshot.
CREATE TRIGGER IF NOT EXISTS oms_request_state_guard
BEFORE UPDATE OF status ON requests
WHEN NOT (
  OLD.is_archived = 0 AND OLD.is_withdrawn = 0 AND
  ((OLD.status = 'Pending' AND NEW.status IN ('Approved', 'Rejected')) OR
   (OLD.status = 'Approved' AND NEW.status = 'Converted'))
)
BEGIN
  SELECT RAISE(ABORT, 'OMS_STATE_CONFLICT: request status');
END;

CREATE TRIGGER IF NOT EXISTS oms_request_withdraw_guard
BEFORE UPDATE OF is_withdrawn ON requests
WHEN NOT (
  OLD.status = 'Pending' AND OLD.is_archived = 0 AND
  OLD.is_withdrawn = 0 AND NEW.is_withdrawn = 1
)
BEGIN
  SELECT RAISE(ABORT, 'OMS_STATE_CONFLICT: request withdrawal');
END;

CREATE TRIGGER IF NOT EXISTS oms_request_archive_guard
BEFORE UPDATE OF is_archived ON requests
WHEN NOT (
  OLD.status IN ('Converted', 'Rejected') AND
  ((OLD.is_archived = 0 AND NEW.is_archived = 1) OR
   (OLD.is_archived = 1 AND NEW.is_archived = 0))
)
BEGIN
  SELECT RAISE(ABORT, 'OMS_STATE_CONFLICT: request archive');
END;

-- The Lead-admin business invariant must not depend solely on application
-- read-then-write checks, which can race between simultaneous admins.
CREATE TRIGGER IF NOT EXISTS oms_last_lead_guard
BEFORE UPDATE OF role, status ON users
WHEN OLD.role = 'Lead' AND OLD.status = 'Active'
  AND (NEW.role <> 'Lead' OR NEW.status <> 'Active')
  AND NOT EXISTS (
    SELECT 1 FROM users
    WHERE id <> OLD.id AND role = 'Lead' AND status = 'Active'
  )
BEGIN
  SELECT RAISE(ABORT, 'OMS_STATE_CONFLICT: last active Lead');
END;

-- Validate real task lifecycle edges on all state-changing writers. A same-
-- status assignment update is intentionally allowed; assignment concurrency
-- still needs separate optimistic-version protection.
CREATE TRIGGER IF NOT EXISTS oms_task_state_guard
BEFORE UPDATE OF status ON tasks
WHEN OLD.status <> NEW.status AND NOT (
  (OLD.status = 'Created' AND NEW.status = 'Assigned') OR
  (OLD.status = 'Assigned' AND NEW.status IN ('Created', 'Ongoing')) OR
  (OLD.status = 'Ongoing' AND NEW.status = 'For Review') OR
  (OLD.status = 'For Review' AND NEW.status IN ('Ongoing', 'Completed')) OR
  (OLD.status = 'Approved' AND NEW.status = 'Completed') OR
  (OLD.status = 'Completed' AND NEW.status = 'Archived') OR
  (OLD.status = 'Archived' AND NEW.status = 'Completed')
)
BEGIN
  SELECT RAISE(ABORT, 'OMS_STATE_CONFLICT: task lifecycle');
END;
