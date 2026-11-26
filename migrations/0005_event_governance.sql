-- M2: additive, event-scoped governance. Does not rewrite existing records.
-- This migration MUST be rehearsed on a staging copy before production approval.
CREATE TABLE events (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 180),
 description TEXT,
 objectives TEXT,
 event_type TEXT NOT NULL DEFAULT 'Other',
 venue TEXT,
 starts_at TEXT,
 ends_at TEXT,
 expected_attendance INTEGER CHECK(expected_attendance IS NULL OR expected_attendance >= 0),
 proposed_budget REAL CHECK(proposed_budget IS NULL OR proposed_budget >= 0),
 project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
 proposed_director_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN (
  'Draft','For Approval','Approved','Team Formation','Planning','Preparation',
  'Ready for Event','Ongoing','Post-Event','For Closure','Completed','Rejected','Cancelled')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX idx_events_status_dates ON events(status,starts_at);
CREATE INDEX idx_events_created_by ON events(created_by);
CREATE INDEX idx_events_project ON events(project_id);

CREATE TABLE event_teams (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 purpose TEXT,
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 UNIQUE(event_id,name)
);
CREATE INDEX idx_event_teams_event ON event_teams(event_id);

CREATE TABLE event_appointments (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 team_id TEXT REFERENCES event_teams(id) ON DELETE RESTRICT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 role TEXT NOT NULL CHECK(role IN ('Event Director','Event Co-Director','Team Head','Team Co-Head','Team Member')),
 status TEXT NOT NULL DEFAULT 'Proposed' CHECK(status IN ('Proposed','Accepted','Declined','Ended')),
 reports_to_id TEXT REFERENCES event_appointments(id) ON DELETE SET NULL,
 responsibilities TEXT NOT NULL,
 proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 proposed_at TEXT NOT NULL,
 responded_at TEXT,
 ended_at TEXT,
 CHECK((role IN ('Event Director','Event Co-Director') AND team_id IS NULL) OR
       (role IN ('Team Head','Team Co-Head','Team Member') AND team_id IS NOT NULL)),
 CHECK((status IN ('Proposed','Accepted','Declined') AND ended_at IS NULL) OR (status='Ended' AND ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX ux_event_one_open_director ON event_appointments(event_id)
 WHERE role='Event Director' AND status IN ('Proposed','Accepted');
CREATE UNIQUE INDEX ux_event_one_open_team_head ON event_appointments(team_id)
 WHERE role='Team Head' AND status IN ('Proposed','Accepted');
CREATE UNIQUE INDEX ux_event_active_role ON event_appointments(event_id,user_id,role,ifnull(team_id,''))
 WHERE status IN ('Proposed','Accepted');
CREATE INDEX idx_event_appointments_user ON event_appointments(user_id,status);
CREATE INDEX idx_event_appointments_event ON event_appointments(event_id,status);

CREATE TABLE event_approvals (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 decision TEXT NOT NULL CHECK(decision IN ('Approved','Returned','Rejected','Closure Approved')),
 actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 remarks TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX idx_event_approvals_event ON event_approvals(event_id,created_at);

CREATE TABLE event_stage_history (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 from_status TEXT,
 to_status TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 remarks TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX idx_event_stage_history_event ON event_stage_history(event_id,created_at);

-- Final approval creates a durable closure record, not only an audit string.
-- Verification fields record a responsible officer's attestation, not external proof.
CREATE TABLE event_closure_records (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE RESTRICT,
 final_attendance INTEGER NOT NULL CHECK(final_attendance >= 0),
 final_expense REAL NOT NULL CHECK(final_expense >= 0),
 financial_validated INTEGER NOT NULL CHECK(financial_validated=1),
 records_validated INTEGER NOT NULL CHECK(records_validated=1),
 evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference))>0),
 remarks TEXT NOT NULL CHECK(length(trim(remarks))>0),
 approved_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 approved_at TEXT NOT NULL
);

-- Link instead of rewriting the M1 tasks schema. An existing task can be linked
-- to at most one event; its project relationship and ownership stay unchanged.
CREATE TABLE event_task_links (
 task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 team_id TEXT REFERENCES event_teams(id) ON DELETE RESTRICT,
 linked_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 linked_at TEXT NOT NULL
);
CREATE INDEX idx_event_tasks_event ON event_task_links(event_id);

-- Enforce lifecycle even against stale simultaneous API writers. D1 batch abort
-- also rolls back event_approvals, stage history and audit writes.
CREATE TRIGGER oms_event_state_guard BEFORE UPDATE OF status ON events
WHEN OLD.status<>NEW.status AND NOT (
 (OLD.status='Draft' AND NEW.status='For Approval') OR
 (OLD.status='For Approval' AND NEW.status IN ('Approved','Draft','Rejected')) OR
 (OLD.status='Rejected' AND NEW.status='Draft') OR
 (OLD.status='Approved' AND NEW.status='Team Formation') OR
 (OLD.status='Team Formation' AND NEW.status='Planning') OR
 (OLD.status='Planning' AND NEW.status='Preparation') OR
 (OLD.status='Preparation' AND NEW.status='Ready for Event') OR
 (OLD.status='Ready for Event' AND NEW.status='Ongoing') OR
 (OLD.status='Ongoing' AND NEW.status='Post-Event') OR
 (OLD.status='Post-Event' AND NEW.status='For Closure') OR
 (OLD.status='For Closure' AND NEW.status='Completed') OR
 (OLD.status NOT IN ('Completed','Cancelled') AND NEW.status='Cancelled')
) BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: event lifecycle'); END;
CREATE TRIGGER oms_event_appointment_guard BEFORE UPDATE OF status ON event_appointments
WHEN NOT ((OLD.status='Proposed' AND NEW.status IN ('Accepted','Declined','Ended')) OR
 (OLD.status='Accepted' AND NEW.status='Ended'))
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: event appointment'); END;

-- No cross-event teams, even if a forged team identifier is submitted.
CREATE TRIGGER oms_appointment_team_guard BEFORE INSERT ON event_appointments
WHEN NEW.team_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM event_teams WHERE id=NEW.team_id AND event_id=NEW.event_id)
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: cross-event team'); END;
CREATE TRIGGER oms_event_task_team_guard BEFORE INSERT ON event_task_links
WHEN NEW.team_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM event_teams WHERE id=NEW.team_id AND event_id=NEW.event_id)
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: cross-event task team'); END;
-- Stale writes must fail the full batch, not commit only an audit entry.
DROP TRIGGER oms_event_state_guard;
CREATE TRIGGER oms_event_state_guard BEFORE UPDATE OF status ON events
WHEN OLD.status=NEW.status OR NOT (
 (OLD.status='Draft' AND NEW.status='For Approval') OR
 (OLD.status='For Approval' AND NEW.status IN ('Approved','Draft','Rejected')) OR
 (OLD.status='Rejected' AND NEW.status='Draft') OR
 (OLD.status='Approved' AND NEW.status='Team Formation') OR
 (OLD.status='Team Formation' AND NEW.status='Planning') OR
 (OLD.status='Planning' AND NEW.status='Preparation') OR
 (OLD.status='Preparation' AND NEW.status='Ready for Event') OR
 (OLD.status='Ready for Event' AND NEW.status='Ongoing') OR
 (OLD.status='Ongoing' AND NEW.status='Post-Event') OR
 (OLD.status='Post-Event' AND NEW.status='For Closure') OR
 (OLD.status='For Closure' AND NEW.status='Completed') OR
 (OLD.status NOT IN ('Completed','Cancelled') AND NEW.status='Cancelled')
) BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: event lifecycle'); END;
CREATE TRIGGER oms_event_draft_edit_guard BEFORE UPDATE OF name,description,objectives,event_type,venue,starts_at,ends_at,expected_attendance,proposed_budget,project_id,proposed_director_id ON events
WHEN OLD.status <> 'Draft' BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: event no longer draft'); END;
-- A queued request must not activate or appoint event staff after event closure.
CREATE TRIGGER oms_event_appointment_active_insert BEFORE INSERT ON event_appointments
WHEN NOT EXISTS (SELECT 1 FROM events WHERE id=NEW.event_id AND status IN
 ('Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure'))
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: appointments require approved active event'); END;
CREATE TRIGGER oms_event_appointment_active_accept BEFORE UPDATE OF status ON event_appointments
WHEN NEW.status='Accepted' AND NOT EXISTS (SELECT 1 FROM events WHERE id=NEW.event_id AND status IN
 ('Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure'))
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: event no longer accepts appointments'); END;
CREATE TRIGGER oms_event_team_active_insert BEFORE INSERT ON event_teams
WHEN NOT EXISTS (SELECT 1 FROM events WHERE id=NEW.event_id AND status IN
 ('Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure'))
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: teams require approved active event'); END;
CREATE TRIGGER oms_event_task_active_insert BEFORE INSERT ON event_task_links
WHEN NOT EXISTS (SELECT 1 FROM events WHERE id=NEW.event_id AND status IN
 ('Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure'))
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: links require approved active event'); END;
