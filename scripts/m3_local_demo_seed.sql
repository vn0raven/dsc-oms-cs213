-- DSC OMS M3 SYNTHETIC LOCAL fixtures. Never run against a remote D1 database.
-- Re-running is safe: fixed IDs and INSERT OR IGNORE; existing rows are not updated.
-- Requirements: migrations 0001-0007 already applied to the local D1 database.

-- Four demo roles and two departments, consistent with earlier local testing.
INSERT OR IGNORE INTO departments (id,name) VALUES
 ('demo_dept_eng','Demo Engineering'),('demo_dept_creative','Demo Creative');
INSERT OR IGNORE INTO users (id,name,email,department_id,position,role,status) VALUES
 ('demo_user_lead','Demo Lead','demo.lead@example.test','demo_dept_eng','Organization Lead','Lead','Active'),
 ('demo_user_colead','Demo Co-Lead','demo.colead@example.test','demo_dept_creative','Co-Lead','Co-Lead','Active'),
 ('demo_user_executive','Demo Executive','demo.executive@example.test','demo_dept_creative','Department Executive','Executive','Active'),
 ('demo_user_member','Demo Member','demo.member@example.test','demo_dept_eng','Member','Member','Active');

INSERT OR IGNORE INTO projects
 (id,name,type,created_by,status,start_date,end_date,description,created_at,updated_at) VALUES
 ('demo_project_site','Demo Community Website','Organization','demo_user_lead','Active','2026-10-01','2027-01-15','Synthetic website project for local testing.','2026-10-01T00:00:00Z','2026-10-22T00:00:00Z'),
 ('demo_project_poster','Demo Event Promotion','Department','demo_user_executive','Active','2026-10-01','2026-12-15','Synthetic promotional work, not an actual DSC event.','2026-10-01T00:00:00Z','2026-10-22T00:00:00Z');
INSERT OR IGNORE INTO project_departments(id,project_id,department_id,assigned_by,assigned_at) VALUES
 ('demo_pd_1','demo_project_site','demo_dept_eng','demo_user_lead','2026-10-01T00:00:00Z'),
 ('demo_pd_2','demo_project_site','demo_dept_creative','demo_user_lead','2026-10-01T00:00:00Z'),
 ('demo_pd_3','demo_project_poster','demo_dept_creative','demo_user_lead','2026-10-01T00:00:00Z');
INSERT OR IGNORE INTO project_members(id,project_id,user_id,project_role,assigned_by,assigned_at,status) VALUES
 ('demo_pm_1','demo_project_site','demo_user_lead','Manager','demo_user_lead','2026-10-01T00:00:00Z','Active'),
 ('demo_pm_2','demo_project_site','demo_user_member','Member','demo_user_lead','2026-10-01T00:00:00Z','Active'),
 ('demo_pm_3','demo_project_poster','demo_user_executive','Manager','demo_user_lead','2026-10-01T00:00:00Z','Active');

INSERT OR IGNORE INTO tasks
 (id,title,description,department_id,project_id,created_by,priority,start_date,deadline,status,progress,instructions,created_at,updated_at) VALUES
 ('demo_task_site','Build sample landing page','Project-linked synthetic task.','demo_dept_eng','demo_project_site','demo_user_lead','High','2026-10-20','2026-11-10','Assigned',0,'Create an accessible sample landing page.','2026-10-20T00:00:00Z','2026-10-22T00:00:00Z'),
 ('demo_task_copy','Draft sample announcement','Project-linked synthetic task.','demo_dept_creative','demo_project_poster','demo_user_executive','Medium','2026-10-20','2026-11-05','Created',0,'Prepare a sample notice.','2026-10-20T00:00:00Z','2026-10-22T00:00:00Z'),
 ('m3demo_task_independent','Prepare member orientation checklist','Independent organization task.','demo_dept_eng',NULL,'demo_user_lead','Medium','2026-10-24','2026-11-14','Created',0,'Synthetic orientation task.','2026-10-24T00:00:00Z','2026-10-24T00:00:00Z');
INSERT OR IGNORE INTO task_assignments
 (id,task_id,user_id,assigned_by,assignment_role,status,assigned_at) VALUES
 ('demo_ta_1','demo_task_site','demo_user_member','demo_user_lead','Assignee','Active','2026-10-20T00:00:00Z');

-- Three intentionally different event stages to exercise the M2/M3 workflow.
INSERT OR IGNORE INTO events
 (id,name,description,objectives,event_type,venue,starts_at,ends_at,expected_attendance,proposed_budget,
 project_id,proposed_director_id,created_by,status,created_at,updated_at) VALUES
 ('m3demo_event_workshop','Demo Git Workshop','Synthetic approved workshop for event operations.','Teach Git basics to members.','Workshop','Demo Computer Laboratory','2026-11-20T09:00:00Z','2026-11-20T16:00:00Z',40,2500,
 'demo_project_site','demo_user_member','demo_user_lead','Planning','2026-10-24T01:00:00Z','2026-10-24T01:10:00Z'),
 ('m3demo_event_hackathon','Demo Campus Hackathon','Synthetic proposal awaiting organizational approval.','Practice teamwork and programming.','Hackathon','Demo Main Hall','2026-12-05T08:00:00Z','2026-12-05T17:00:00Z',120,12000,
 NULL,'demo_user_colead','demo_user_member','For Approval','2026-10-24T02:00:00Z','2026-10-24T02:05:00Z'),
 ('m3demo_event_assembly','Demo General Assembly','Synthetic independent event draft.','Share organization updates.','Assembly','Demo Conference Room','2026-11-15T13:00:00Z','2026-11-15T15:00:00Z',60,0,
 NULL,NULL,'demo_user_lead','Draft','2026-10-24T03:00:00Z','2026-10-24T03:00:00Z');

-- Synthetic approval/stage history reflects the pre-seeded Planning state.
INSERT OR IGNORE INTO event_approvals(id,event_id,decision,actor_id,remarks,created_at) VALUES
 ('m3demo_approval_workshop','m3demo_event_workshop','Approved','demo_user_colead','Synthetic local-only approval.','2026-10-24T01:03:00Z');
INSERT OR IGNORE INTO event_stage_history(id,event_id,from_status,to_status,actor_id,remarks,created_at) VALUES
 ('m3demo_stage_1','m3demo_event_workshop',NULL,'Draft','demo_user_lead','Local seed.','2026-10-24T01:00:00Z'),
 ('m3demo_stage_2','m3demo_event_workshop','Draft','For Approval','demo_user_lead','Local seed.','2026-10-24T01:01:00Z'),
 ('m3demo_stage_3','m3demo_event_workshop','For Approval','Approved','demo_user_colead','Synthetic approval.','2026-10-24T01:03:00Z'),
 ('m3demo_stage_4','m3demo_event_workshop','Approved','Team Formation','demo_user_lead','Local seed.','2026-10-24T01:05:00Z'),
 ('m3demo_stage_5','m3demo_event_workshop','Team Formation','Planning','demo_user_lead','Local seed.','2026-10-24T01:10:00Z');
INSERT OR IGNORE INTO event_teams(id,event_id,name,purpose,created_by,created_at) VALUES
 ('m3demo_team_program','m3demo_event_workshop','Program','Event schedule and facilitation.','demo_user_lead','2026-10-24T01:11:00Z'),
 ('m3demo_team_creative','m3demo_event_workshop','Creatives & Communications','Workshop materials.','demo_user_lead','2026-10-24T01:11:00Z');
INSERT OR IGNORE INTO event_appointments
 (id,event_id,team_id,user_id,role,status,reports_to_id,responsibilities,proposed_by,proposed_at,responded_at,ended_at) VALUES
 ('m3demo_ap_director','m3demo_event_workshop',NULL,'demo_user_member','Event Director','Accepted',NULL,'Coordinate the workshop.','demo_user_lead','2026-10-24T01:12:00Z','2026-10-24T01:15:00Z',NULL),
 ('m3demo_ap_head','m3demo_event_workshop','m3demo_team_creative','demo_user_executive','Team Head','Accepted','m3demo_ap_director','Coordinate sample event communications.','demo_user_lead','2026-10-24T01:14:00Z','2026-10-24T01:16:00Z',NULL);
INSERT OR IGNORE INTO event_task_links(task_id,event_id,team_id,linked_by,linked_at) VALUES
 ('demo_task_copy','m3demo_event_workshop','m3demo_team_creative','demo_user_lead','2026-10-24T01:20:00Z');

-- Additional synthetic examples so Events, Projects, Members and Announcements
-- have useful list/card content on a fresh local installation.
INSERT OR IGNORE INTO users(id,name,email,department_id,position,role,status) VALUES
 ('m3demo_member_tech','Demo Technology Volunteer','demo.tech@example.test','demo_dept_eng','Technology Member','Member','Active'),
 ('m3demo_member_design','Demo Design Volunteer','demo.design@example.test','demo_dept_creative','Creative Member','Member','Active');
INSERT OR IGNORE INTO projects(id,name,type,created_by,status,start_date,end_date,description,created_at,updated_at) VALUES
 ('m3demo_project_resources','Demo Learning Resources','Organization','demo_user_lead','Active','2026-10-24','2027-02-01','Synthetic resource library project.','2026-10-24T00:00:00Z','2026-10-24T00:00:00Z');
INSERT OR IGNORE INTO project_departments(id,project_id,department_id,assigned_by,assigned_at) VALUES
 ('m3demo_pd_res','m3demo_project_resources','demo_dept_eng','demo_user_lead','2026-10-24T00:00:00Z');
INSERT OR IGNORE INTO project_members(id,project_id,user_id,project_role,assigned_by,assigned_at,status) VALUES
 ('m3demo_pm_res_manager','m3demo_project_resources','demo_user_lead','Manager','demo_user_lead','2026-10-24T00:00:00Z','Active'),
 ('m3demo_pm_res_member','m3demo_project_resources','m3demo_member_tech','Member','demo_user_lead','2026-10-24T00:00:00Z','Active');
INSERT OR IGNORE INTO tasks(id,title,description,department_id,project_id,created_by,priority,start_date,deadline,status,progress,instructions,created_at,updated_at) VALUES
 ('m3demo_task_slides','Prepare workshop slides','Synthetic example task.','demo_dept_eng','m3demo_project_resources','demo_user_lead','Medium','2026-10-24','2026-11-18','Created',0,'Draft presentation materials.','2026-10-24T00:00:00Z','2026-10-24T00:00:00Z'),
 ('m3demo_task_logistics','Prepare demo technical checklist','Synthetic standalone task.','demo_dept_eng',NULL,'demo_user_lead','Low','2026-10-24','2026-11-17','Created',0,'Check projector and internet connection.','2026-10-24T00:00:00Z','2026-10-24T00:00:00Z');
INSERT OR IGNORE INTO events(id,name,description,objectives,event_type,venue,starts_at,ends_at,expected_attendance,proposed_budget,project_id,proposed_director_id,created_by,status,created_at,updated_at) VALUES
 ('m3demo_event_talk','Demo Technology Talk','Synthetic approved session awaiting team formation.','Explore modern web development.','Tech Talk','Demo Lecture Hall','2026-12-10T13:00:00Z','2026-12-10T16:00:00Z',80,1000,
 'm3demo_project_resources',NULL,'demo_user_lead','Approved','2026-10-24T04:00:00Z','2026-10-24T04:10:00Z');
INSERT OR IGNORE INTO event_approvals(id,event_id,decision,actor_id,remarks,created_at) VALUES
 ('m3demo_approval_talk','m3demo_event_talk','Approved','demo_user_lead','Synthetic local approval for approved-stage example.','2026-10-24T04:10:00Z');
INSERT OR IGNORE INTO event_schedule_items(id,event_id,title,starts_at,ends_at,owner_id,notes,created_by,created_at) VALUES
 ('m3demo_schedule_workshop','m3demo_event_workshop','Demo introduction session','2026-11-20T09:00:00Z','2026-11-20T10:00:00Z','demo_user_member','Synthetic schedule entry.','demo_user_lead','2026-10-24T05:00:00Z');
INSERT OR IGNORE INTO announcements(id,title,body,category,audience,department_id,event_id,project_id,status,pinned,created_by,published_at,created_at,updated_at) VALUES
 ('m3demo_announcement_org','Welcome to the DSC OMS Demo','This is an entirely fictional announcement for local interface testing.','General','Organization',NULL,NULL,NULL,'Published',1,'demo_user_lead','2026-10-24T06:00:00Z','2026-10-24T05:59:00Z','2026-10-24T06:00:00Z'),
 ('m3demo_announcement_creative','Demo Creative Team Briefing','Synthetic department-only notice for validating audience isolation.','Department','Department','demo_dept_creative','m3demo_event_workshop',NULL,'Published',0,'demo_user_executive','2026-10-24T07:00:00Z','2026-10-24T06:59:00Z','2026-10-24T07:00:00Z');
