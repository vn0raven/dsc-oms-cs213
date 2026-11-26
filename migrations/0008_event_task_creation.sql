-- Creation-only delegation. Existing task/link/assignment permissions stay intact.
-- Durable idempotency keys also provide a transaction-time authorization guard.
CREATE TABLE event_task_creation_requests (
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 request_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE RESTRICT,
 team_id TEXT REFERENCES event_teams(id) ON DELETE RESTRICT,
 department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 PRIMARY KEY(event_id,actor_id,request_id)
);

CREATE TRIGGER oms_event_task_creation_guard
BEFORE INSERT ON event_task_creation_requests
WHEN NOT EXISTS (
 SELECT 1 FROM users u JOIN departments d ON d.id=u.department_id
 JOIN events e ON e.id=NEW.event_id JOIN tasks t ON t.id=NEW.task_id
 WHERE u.id=NEW.actor_id AND u.status='Active' AND d.status='Active'
 AND u.department_id=NEW.department_id AND t.department_id=NEW.department_id
 AND t.created_by=u.id AND t.project_id IS NULL AND t.status='Created'
 AND NOT EXISTS (SELECT 1 FROM task_assignments WHERE task_id=t.id)
 AND e.status IN ('Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event')
 AND (NEW.team_id IS NULL OR EXISTS (
  SELECT 1 FROM event_teams et WHERE et.id=NEW.team_id AND et.event_id=e.id
 ))
 AND (u.role IN ('Lead','Co-Lead') OR EXISTS (
  SELECT 1 FROM event_appointments a WHERE a.event_id=e.id AND a.user_id=u.id
  AND a.status='Accepted' AND a.ended_at IS NULL
  AND (a.role='Event Director' OR (a.role='Team Head' AND a.team_id=NEW.team_id))
 ))
)
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: event task creation authority changed'); END;
