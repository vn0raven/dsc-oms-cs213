-- CS 213 SA 3 synthetic credentials and deterministic test records for TC08-TC11.
-- Run after migrations 0001-0010 and scripts/m3_local_demo_seed.sql.
INSERT OR IGNORE INTO user_credentials (user_id, password_hash, password_salt, iterations, updated_at) VALUES
 ('demo_user_lead','7c23e09533d5060821f22608c9b07eb4ade46b68c0099f68e48119e688e5a7f5','a1b2c3d4e5f60718293a4b5c6d7e8f90',100000,'2026-11-25T00:00:00Z'),
 ('demo_user_colead','9e0c650c9b50b4195b09f095a9d977927e917beb61e0c9d2ce733a94818eea9a','b2c3d4e5f60718293a4b5c6d7e8f90a1',100000,'2026-11-25T00:00:00Z'),
 ('demo_user_executive','9d7ea01e8a36a0de5c431221f6f7216e2a69831929fad1848d88d1781edcc0c0','c3d4e5f60718293a4b5c6d7e8f90a1b2',100000,'2026-11-25T00:00:00Z'),
 ('demo_user_member','54c9b582ab189d90d7fadba82c57dfd41378befe602996fb4ecfca07482b9f35','d4e5f60718293a4b5c6d7e8f90a1b2c3',100000,'2026-11-25T00:00:00Z'),
 ('m3demo_member_tech','ff80007562040d186ff2dcc4f574df935495181a8d6a515628bd8302d95efc38','e5f60718293a4b5c6d7e8f90a1b2c3d4',100000,'2026-11-25T00:00:00Z'),
 ('m3demo_member_design','6f0914d63acc849efb5360d09b60b50a070c7fa56a427c539daed7eb3db1f60d','f60718293a4b5c6d7e8f90a1b2c3d4e5',100000,'2026-11-25T00:00:00Z');

-- Deterministic draft project for Summary exclusion test (TC09)
INSERT OR IGNORE INTO projects
 (id,name,type,created_by,status,start_date,end_date,description,created_at,updated_at) VALUES
 ('cs213_project_draft','CS213 Draft Proposal Project','Department','demo_user_lead','Draft','2026-11-01','2026-12-30','Draft project excluded from active summary totals.','2026-11-01T09:00:00Z','2026-11-01T09:00:00Z');

-- Deterministic tasks for Detailed Date Filter (TC08), Summary Exclusion (TC09), Exception (TC10), and Data Mart (TC11)
INSERT OR IGNORE INTO tasks
 (id,title,description,department_id,project_id,created_by,priority,start_date,deadline,status,progress,instructions,created_at,updated_at,completed_at,archived_at) VALUES
 ('cs213_task_oct_completed','CS213 October Completed Deliverable','Completed October synthetic task for date-range and Data Mart tests.','demo_dept_eng','demo_project_site','demo_user_lead','Medium','2026-10-15','2026-10-25','Completed',100,'Verify completed delivery.','2026-10-15T09:00:00Z','2026-10-25T16:00:00Z','2026-10-25T16:00:00Z',NULL),
 ('cs213_task_nov_overdue','CS213 November Overdue Task','Overdue November task for Exception report test.','demo_dept_eng','demo_project_site','demo_user_lead','High','2026-11-05','2026-11-12','Ongoing',40,'Escalate overdue task.','2026-11-05T09:00:00Z','2026-11-10T09:00:00Z',NULL,NULL),
 ('cs213_task_nov_future','CS213 November Upcoming Task','Future-deadline November task not overdue as of 2026-11-25.','demo_dept_creative','demo_project_poster','demo_user_executive','Medium','2026-11-20','2026-12-15','Assigned',20,'Continue normal work.','2026-11-20T09:00:00Z','2026-11-20T09:00:00Z',NULL,NULL),
 ('cs213_task_archived_excl','CS213 Archived Task Excluded','Archived task excluded from active summary and Data Mart.','demo_dept_eng',NULL,'demo_user_lead','Low','2026-11-02','2026-11-10','Archived',100,'Historical archived record.','2026-11-10T09:00:00Z','2026-11-11T09:00:00Z','2026-11-10T18:00:00Z','2026-11-11T09:00:00Z');

INSERT OR IGNORE INTO task_assignments
 (id,task_id,user_id,assigned_by,assignment_role,status,assigned_at,completed_at) VALUES
 ('cs213_ta_oct','cs213_task_oct_completed','demo_user_member','demo_user_lead','Assignee','Completed','2026-10-15T09:05:00Z','2026-10-25T16:00:00Z'),
 ('cs213_ta_nov_ov','cs213_task_nov_overdue','demo_user_member','demo_user_lead','Assignee','Active','2026-11-05T09:05:00Z',NULL),
 ('cs213_ta_nov_fut','cs213_task_nov_future','m3demo_member_design','demo_user_executive','Assignee','Active','2026-11-20T09:05:00Z',NULL);

INSERT OR IGNORE INTO event_issues
 (id,event_id,title,description,severity,status,owner_id,due_at,resolution,created_by,created_at,updated_at) VALUES
 ('cs213_issue_urgent','m3demo_event_workshop','CS213 Unresolved High Readiness Issue','Backup projector and registration laptop need confirmation.','High','Open','demo_user_member','2026-11-19',NULL,'demo_user_lead','2026-11-10T10:00:00Z','2026-11-10T10:00:00Z');
