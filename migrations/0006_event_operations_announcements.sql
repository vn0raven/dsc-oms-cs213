-- M3 additive records. Apply to a staging copy before any live deployment.
CREATE TABLE event_requirements (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 phase TEXT NOT NULL CHECK(phase IN ('Readiness','Closure')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
 owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 due_at TEXT, status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Submitted','Verified','Not Applicable')),
 evidence_reference TEXT, verified_by TEXT REFERENCES users(id),verified_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 CHECK(status NOT IN ('Verified') OR (evidence_reference IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX idx_event_requirements_phase ON event_requirements(event_id,phase,status);
CREATE TABLE event_requirement_history (
 id TEXT PRIMARY KEY,requirement_id TEXT NOT NULL REFERENCES event_requirements(id) ON DELETE RESTRICT,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 from_status TEXT,to_status TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),
 evidence_reference TEXT,created_at TEXT NOT NULL
);
CREATE INDEX idx_requirement_history_item ON event_requirement_history(requirement_id,created_at);
CREATE TABLE event_issues (
 id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180), description TEXT,
 severity TEXT NOT NULL CHECK(severity IN ('Low','Medium','High','Urgent')),
 status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Escalated','Resolved')),
 owner_id TEXT REFERENCES users(id), due_at TEXT, resolution TEXT, created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX idx_event_issues_event ON event_issues(event_id,status);
CREATE TABLE event_records (
 id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 category TEXT NOT NULL CHECK(length(category) BETWEEN 1 AND 80),title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
 reference TEXT NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 1000),
 classification TEXT NOT NULL DEFAULT 'Restricted' CHECK(classification IN ('Restricted','Event Team')),
 owner_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted','Verified')),
 reviewed_by TEXT REFERENCES users(id),reviewed_at TEXT,
 CHECK(status<>'Verified' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX idx_event_records_event ON event_records(event_id,classification);
CREATE TABLE announcements (
 id TEXT PRIMARY KEY,title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 10000),
 category TEXT NOT NULL DEFAULT 'General', audience TEXT NOT NULL CHECK(audience IN ('Organization','Department')),
 department_id TEXT REFERENCES departments(id) ON DELETE RESTRICT,
 event_id TEXT REFERENCES events(id) ON DELETE RESTRICT,
 project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Published','Archived')),
 pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
 created_by TEXT NOT NULL REFERENCES users(id),published_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 CHECK((audience='Department' AND department_id IS NOT NULL) OR (audience='Organization' AND department_id IS NULL))
);
CREATE INDEX idx_announcements_audience ON announcements(status,audience,department_id,published_at);
CREATE TABLE announcement_reads (
 announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE RESTRICT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,read_at TEXT NOT NULL,
 PRIMARY KEY(announcement_id,user_id)
);
-- These guards apply only where an organizer actually activated checklist items.
-- No unapproved SOP templates are automatically imposed.
CREATE TRIGGER m3_ready_requirements BEFORE UPDATE OF status ON events
WHEN NEW.status='Ready for Event' AND OLD.status='Preparation' AND EXISTS(
 SELECT 1 FROM event_requirements WHERE event_id=OLD.id AND phase='Readiness' AND status NOT IN ('Verified','Not Applicable')
) BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: readiness requirements'); END;
CREATE TRIGGER m3_closure_requirements BEFORE UPDATE OF status ON events
WHEN NEW.status='Completed' AND OLD.status='For Closure' AND EXISTS(
 SELECT 1 FROM event_requirements WHERE event_id=OLD.id AND phase='Closure' AND status NOT IN ('Verified','Not Applicable')
) BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: closure requirements'); END;

-- Existing notifications CHECK constraint does not support ANNOUNCEMENT.
-- Dedicated announcement inbox/read receipts are authoritative; notification dispatch
-- requires a separately rehearsed notification-type migration.
CREATE TRIGGER m3_verify_once BEFORE UPDATE OF status ON event_requirements
WHEN OLD.status='Verified' AND NEW.status='Verified'
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: requirement already verified'); END;
CREATE TRIGGER m3_resolve_once BEFORE UPDATE OF status ON event_issues
WHEN OLD.status='Resolved' AND NEW.status='Resolved'
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: issue already resolved'); END;
CREATE TRIGGER m3_publish_once BEFORE UPDATE OF status ON announcements
WHEN OLD.status<>'Draft' AND NEW.status='Published'
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: already published'); END;
CREATE TABLE event_schedule_items (
 id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),starts_at TEXT NOT NULL,ends_at TEXT,
 owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,notes TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,
 CHECK(ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX idx_event_schedule_event ON event_schedule_items(event_id,starts_at);
CREATE TABLE event_debriefs (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE RESTRICT,
 summary TEXT NOT NULL CHECK(length(trim(summary))>0),lessons TEXT NOT NULL CHECK(length(trim(lessons))>0),
 unresolved TEXT,submitted_by TEXT NOT NULL REFERENCES users(id),submitted_at TEXT NOT NULL
);
CREATE TABLE announcement_history (
 id TEXT PRIMARY KEY,announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,
 previous_title TEXT,previous_body TEXT,occurred_at TEXT NOT NULL
);
CREATE TRIGGER m3_blocking_issues BEFORE UPDATE OF status ON events
WHEN NEW.status='Ready for Event' AND OLD.status='Preparation' AND EXISTS(
 SELECT 1 FROM event_issues WHERE event_id=OLD.id AND severity IN ('High','Urgent') AND status<>'Resolved'
) BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: unresolved readiness blocker'); END;

CREATE TRIGGER m3_requirement_transition BEFORE UPDATE OF status ON event_requirements
WHEN OLD.status<>NEW.status AND NOT (
 (OLD.status='Pending' AND NEW.status='Submitted') OR
 (OLD.status='Submitted' AND NEW.status='Verified')
) BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: requirement transition'); END;

CREATE TRIGGER m3_submit_once BEFORE UPDATE OF status ON event_requirements
WHEN NEW.status='Submitted' AND OLD.status<>'Pending'
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: requirement already submitted'); END;
CREATE TRIGGER m3_escalate_once BEFORE UPDATE OF status ON event_issues
WHEN NEW.status='Escalated' AND OLD.status<>'Open'
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: issue already escalated'); END;
CREATE TRIGGER m3_archive_once BEFORE UPDATE OF status ON announcements
WHEN NEW.status='Archived' AND OLD.status='Archived'
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: already archived'); END;

CREATE TABLE event_coordination_notes (
 id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 category TEXT NOT NULL CHECK(category IN ('Meeting','Decision','Update')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
 details TEXT NOT NULL CHECK(length(trim(details)) BETWEEN 1 AND 4000),
 created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL
);
CREATE INDEX idx_event_coordination_notes_event ON event_coordination_notes(event_id,created_at DESC);
CREATE TRIGGER m3_record_verify_once BEFORE UPDATE OF status ON event_records
WHEN OLD.status='Verified' AND NEW.status='Verified'
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: record already verified'); END;
CREATE INDEX idx_event_issues_active_report ON event_issues(status,severity,event_id);
