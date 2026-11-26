-- Row-level import receipts permit safe retries without replacing legacy work.
CREATE TABLE task_import_receipts (
 actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 request_id TEXT NOT NULL,
 row_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 PRIMARY KEY(actor_id,request_id,row_id)
);
CREATE TRIGGER oms_task_import_guard BEFORE INSERT ON task_import_receipts
WHEN NOT EXISTS (
 SELECT 1 FROM users u JOIN tasks t ON t.id=NEW.task_id JOIN departments d ON d.id=t.department_id
 WHERE u.id=NEW.actor_id AND u.status='Active' AND d.status='Active'
 AND t.created_by=u.id AND t.project_id IS NULL AND t.status='Created'
 AND (u.role IN ('Lead','Co-Lead') OR (u.role='Executive' AND u.department_id=t.department_id))
)
BEGIN SELECT RAISE(ABORT,'OMS_STATE_CONFLICT: task import authority changed'); END;
