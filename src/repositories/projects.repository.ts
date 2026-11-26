import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";

import type {
ProjectRole,
ProjectStatus,
ProjectTeamMember,
ProjectType,
} from "../types/project";

export interface ProjectRow {
id: string;
name: string;
type: ProjectType;
created_by: string;
status: ProjectStatus;
start_date: string | null;
end_date: string | null;
description: string | null;
created_at: string;
updated_at: string;
}

export interface ProjectDepartmentRow {
id: string;
department_id: string;
department_name: string;
}

interface ProjectMemberRow {
id: string;
user_id: string;
name: string;
email: string;
department_id: string;
department_name: string;
position: string | null;
organization_role: AuthenticatedUser["role"];
project_role: ProjectRole;
status: "Active" | "Removed";
assigned_by: string;
assigned_at: string;
}

export interface ProjectTaskStats {
totalTaskCount: number;
taskCount: number;
completedTaskCount: number;
ongoingTaskCount: number;
forReviewTaskCount: number;
archivedTaskCount: number;
incompleteTaskCount: number;
activeTaskCount: number;
progress: number;
}

export interface ProjectAggregate {
project: ProjectRow;
departments: ProjectDepartmentRow[];
team: ProjectTeamMember[];
stats: ProjectTaskStats;
}

export interface ProjectActivityRow {
id: string;
occurredAt: string;
actorUserId: string | null;
actorName: string;
actorRole: string;
action: string;
oldValue: string | null;
newValue: string | null;
}

export interface CreateProjectWrite {
id: string;
name: string;
type: ProjectType;
status: ProjectStatus;
startDate: string | null;
endDate: string | null;
description: string | null;
departmentIds: string[];
managerUserId: string;
memberUserIds: string[];
}

export interface UpdateProjectWrite {
id: string;
name: string;
type: ProjectType;
status: ProjectStatus;
startDate: string | null;
endDate: string | null;
description: string | null;

departmentIds: string[];
managerUserId: string;
memberUserIds: string[];

syncDepartments: boolean;
syncTeam: boolean;

oldManagerUserId: string;
oldMemberUserIds: string[];

notificationUserIds: string[];
}

function activityStatement(
env: Env,
actor: AuthenticatedUser,
action: string,
projectId: string,
oldValue: unknown,
newValue: unknown
): D1PreparedStatement {
return env.DB
.prepare(`
INSERT INTO activity_log (
id,
occurred_at,
actor_user_id,
actor_name,
actor_role,
action,
reference_type,
reference_id,
old_value,
new_value
)
VALUES (?, ?, ?, ?, ?, ?, 'PROJECT', ?, ?, ?)
`)
.bind(
`act_${crypto.randomUUID()}`,
new Date().toISOString(),
actor.id,
actor.name,
actor.role,
action,
projectId,
oldValue === null
? null
: JSON.stringify(oldValue),
newValue === null
? null
: JSON.stringify(newValue)
);
}

function notificationStatement(
env: Env,
userId: string,
type:
| "Project Updated"
| "Project Assigned"
| "Project Archived",
title: string,
message: string,
projectId: string
): D1PreparedStatement {
return env.DB
.prepare(`
INSERT INTO notifications (
id,
user_id,
type,
title,
message,
reference_type,
reference_id,
status,
created_at
)
VALUES (?, ?, ?, ?, ?, 'PROJECT', ?, 'Unread', ?)
`)
.bind(
`notif_${crypto.randomUUID()}`,
userId,
type,
title,
message,
projectId,
new Date().toISOString()
);
}

export async function listVisibleProjectRows(
env: Env,
user: AuthenticatedUser
): Promise<ProjectRow[]> {
const leader =
user.role === "Lead" ||
user.role === "Co-Lead";

if (leader) {
const result = await env.DB
.prepare(`
SELECT *
FROM projects
ORDER BY updated_at DESC, name ASC
`)
.all<ProjectRow>();

return result.results;
}

const result = await env.DB
.prepare(`
SELECT DISTINCT p.*
FROM projects p
WHERE EXISTS (
SELECT 1
FROM project_members pm
WHERE pm.project_id = p.id
AND pm.user_id = ?
AND pm.status = 'Active'
)
OR EXISTS (
SELECT 1
FROM project_departments pd
WHERE pd.project_id = p.id
AND pd.department_id = ?
)
ORDER BY p.updated_at DESC, p.name ASC
`)
.bind(
user.id,
user.department.id
)
.all<ProjectRow>();

return result.results;
}

export async function findProjectRowById(
env: Env,
id: string
): Promise<ProjectRow | null> {
return await env.DB
.prepare(`
SELECT *
FROM projects
WHERE id = ?
LIMIT 1
`)
.bind(id)
.first<ProjectRow>();
}

export async function getProjectDepartments(
env: Env,
projectId: string
): Promise<ProjectDepartmentRow[]> {
const result = await env.DB
.prepare(`
SELECT
pd.id,
pd.department_id,
d.name AS department_name
FROM project_departments pd
INNER JOIN departments d
ON d.id = pd.department_id
WHERE pd.project_id = ?
ORDER BY d.name ASC
`)
.bind(projectId)
.all<ProjectDepartmentRow>();

return result.results;
}

export async function getProjectTeam(
env: Env,
projectId: string
): Promise<ProjectTeamMember[]> {
const result = await env.DB
.prepare(`
SELECT
pm.id,
pm.user_id,
u.name,
u.email,
u.department_id,
d.name AS department_name,
u.position,
u.role AS organization_role,
pm.project_role,
pm.status,
pm.assigned_by,
pm.assigned_at
FROM project_members pm
INNER JOIN users u
ON u.id = pm.user_id
INNER JOIN departments d
ON d.id = u.department_id
WHERE pm.project_id = ?
AND pm.status = 'Active'
ORDER BY
CASE
WHEN pm.project_role = 'Manager'
THEN 0
ELSE 1
END,
u.name ASC
`)
.bind(projectId)
.all<ProjectMemberRow>();

return result.results.map(
(row): ProjectTeamMember => ({
id: row.id,
userId: row.user_id,
name: row.name,
email: row.email,
departmentId:
row.department_id,
departmentName:
row.department_name,
position: row.position,
organizationRole:
row.organization_role,
projectRole:
row.project_role,
status: row.status,
assignedBy:
row.assigned_by,
assignedAt:
row.assigned_at,
})
);
}

export async function getProjectTaskStats(
env: Env,
projectId: string
): Promise<ProjectTaskStats> {
const row = await env.DB
.prepare(`
SELECT
COUNT(*) AS total_task_count,

SUM(
CASE
WHEN status <> 'Archived'
THEN 1 ELSE 0
END
) AS task_count,

SUM(
CASE
WHEN status = 'Completed'
THEN 1 ELSE 0
END
) AS completed_task_count,

SUM(
CASE
WHEN status = 'Ongoing'
THEN 1 ELSE 0
END
) AS ongoing_task_count,

SUM(
CASE
WHEN status = 'For Review'
THEN 1 ELSE 0
END
) AS for_review_task_count,

SUM(
CASE
WHEN status = 'Archived'
THEN 1 ELSE 0
END
) AS archived_task_count,

SUM(
CASE
WHEN status NOT IN (
'Completed',
'Archived'
)
THEN 1 ELSE 0
END
) AS incomplete_task_count,

SUM(
CASE
WHEN status IN (
'Created',
'Assigned',
'Ongoing',
'For Review',
'Approved'
)
THEN 1 ELSE 0
END
) AS active_task_count,

COALESCE(
ROUND(
AVG(
CASE
WHEN status <> 'Archived'
THEN progress
ELSE NULL
END
)
),
0
) AS progress
FROM tasks
WHERE project_id = ?
`)
.bind(projectId)
.first<{
total_task_count: number;
task_count: number;
completed_task_count: number;
ongoing_task_count: number;
for_review_task_count: number;
archived_task_count: number;
incomplete_task_count: number;
active_task_count: number;
progress: number;
}>();

return {
totalTaskCount:
row?.total_task_count ?? 0,
taskCount:
row?.task_count ?? 0,
completedTaskCount:
row?.completed_task_count ?? 0,
ongoingTaskCount:
row?.ongoing_task_count ?? 0,
forReviewTaskCount:
row?.for_review_task_count ?? 0,
archivedTaskCount:
row?.archived_task_count ?? 0,
incompleteTaskCount:
row?.incomplete_task_count ?? 0,
activeTaskCount:
row?.active_task_count ?? 0,
progress:
Number(row?.progress ?? 0),
};
}

export async function getProjectAggregate(
env: Env,
projectId: string
): Promise<ProjectAggregate | null> {
const project =
await findProjectRowById(
env,
projectId
);

if (!project) {
return null;
}

const [
departments,
team,
stats,
] = await Promise.all([
getProjectDepartments(
env,
projectId
),
getProjectTeam(
env,
projectId
),
getProjectTaskStats(
env,
projectId
),
]);

return {
project,
departments,
team,
stats,
};
}

/** Bulk-load project list details. One set of queries per bounded batch rather
 * than issuing a separate project/departments/team/stats round trip per row.
 * Maintain the same filtering and member ordering as getProjectAggregate.
 */
export async function getProjectAggregatesForRows(
env: Env,
projects: ProjectRow[]
): Promise<ProjectAggregate[]> {
const byId = new Map<string, ProjectAggregate>();
for (const project of projects) {
byId.set(project.id, {
project,
departments: [],
team: [],
stats: {
totalTaskCount: 0, taskCount: 0, completedTaskCount: 0,
ongoingTaskCount: 0, forReviewTaskCount: 0, archivedTaskCount: 0,
incompleteTaskCount: 0, activeTaskCount: 0, progress: 0,
},
});
}

// D1/SQLite parameter limits and response sizes are bounded per batch.
const batchSize = 100;
for (let offset = 0; offset < projects.length; offset += batchSize) {
const ids = projects.slice(offset, offset + batchSize).map((p) => p.id);
const placeholders = ids.map(() => "?").join(",");
const [departments, members, stats] = await Promise.all([
env.DB.prepare(`
SELECT pd.project_id, pd.id, pd.department_id, d.name AS department_name
FROM project_departments pd
INNER JOIN departments d ON d.id = pd.department_id
WHERE pd.project_id IN (${placeholders})
ORDER BY d.name ASC
`).bind(...ids).all<ProjectDepartmentRow & {project_id: string}>(),
env.DB.prepare(`
SELECT pm.project_id, pm.id, pm.user_id, u.name, u.email,
u.department_id, d.name AS department_name, u.position,
u.role AS organization_role, pm.project_role, pm.status,
pm.assigned_by, pm.assigned_at
FROM project_members pm
INNER JOIN users u ON u.id = pm.user_id
INNER JOIN departments d ON d.id = u.department_id
WHERE pm.project_id IN (${placeholders}) AND pm.status = 'Active'
ORDER BY CASE WHEN pm.project_role = 'Manager' THEN 0 ELSE 1 END, u.name ASC
`).bind(...ids).all<ProjectMemberRow & {project_id: string}>(),
env.DB.prepare(`
SELECT project_id,
COUNT(*) AS total_task_count,
SUM(CASE WHEN status <> 'Archived' THEN 1 ELSE 0 END) AS task_count,
SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_task_count,
SUM(CASE WHEN status = 'Ongoing' THEN 1 ELSE 0 END) AS ongoing_task_count,
SUM(CASE WHEN status = 'For Review' THEN 1 ELSE 0 END) AS for_review_task_count,
SUM(CASE WHEN status = 'Archived' THEN 1 ELSE 0 END) AS archived_task_count,
SUM(CASE WHEN status NOT IN ('Completed', 'Archived') THEN 1 ELSE 0 END) AS incomplete_task_count,
SUM(CASE WHEN status IN ('Created','Assigned','Ongoing','For Review','Approved') THEN 1 ELSE 0 END) AS active_task_count,
COALESCE(ROUND(AVG(CASE WHEN status <> 'Archived' THEN progress ELSE NULL END)), 0) AS progress
FROM tasks WHERE project_id IN (${placeholders}) GROUP BY project_id
`).bind(...ids).all<{
project_id: string;
total_task_count: number; task_count: number; completed_task_count: number;
ongoing_task_count: number; for_review_task_count: number; archived_task_count: number;
incomplete_task_count: number; active_task_count: number; progress: number;
}>(),
]);
for (const d of departments.results) {
byId.get(d.project_id)?.departments.push({
id: d.id, department_id: d.department_id, department_name: d.department_name,
});
}
for (const m of members.results) {
byId.get(m.project_id)?.team.push({
id: m.id, userId: m.user_id, name: m.name, email: m.email,
departmentId: m.department_id, departmentName: m.department_name,
position: m.position, organizationRole: m.organization_role,
projectRole: m.project_role, status: m.status,
assignedBy: m.assigned_by, assignedAt: m.assigned_at,
});
}
for (const row of stats.results) {
const aggregate = byId.get(row.project_id);
if (aggregate) {
aggregate.stats = {
totalTaskCount: row.total_task_count,
taskCount: row.task_count, completedTaskCount: row.completed_task_count,
ongoingTaskCount: row.ongoing_task_count, forReviewTaskCount: row.for_review_task_count,
archivedTaskCount: row.archived_task_count,
incompleteTaskCount: row.incomplete_task_count,
activeTaskCount: row.active_task_count, progress: Number(row.progress),
};
}
}
}
return projects.map((project) => byId.get(project.id)!);
}

export async function hasProjectTasksInDepartment(
env: Env,
projectId: string,
departmentId: string
): Promise<boolean> {
const row = await env.DB
.prepare(`
SELECT 1 AS found
FROM tasks
WHERE project_id = ?
AND department_id = ?
LIMIT 1
`)
.bind(
projectId,
departmentId
)
.first<{ found: number }>();

return !!row;
}

export async function hasActiveProjectTasksAssignedToUser(
env: Env,
projectId: string,
userId: string
): Promise<boolean> {
const row = await env.DB
.prepare(`
SELECT 1 AS found
FROM task_assignments a
INNER JOIN tasks t
ON t.id = a.task_id
WHERE t.project_id = ?
AND a.user_id = ?
AND a.status = 'Active'
AND t.status NOT IN (
'Completed',
'Archived'
)
LIMIT 1
`)
.bind(
projectId,
userId
)
.first<{ found: number }>();

return !!row;
}

export async function countMeaningfulProjectActivity(
env: Env,
projectId: string
): Promise<number> {
const row = await env.DB
.prepare(`
SELECT COUNT(*) AS count
FROM activity_log
WHERE reference_type = 'PROJECT'
AND reference_id = ?
AND action NOT IN (
'PROJECT_CREATED',
'PROJECT_MEMBER_ADDED',
'PROJECT_MANAGER_CHANGED'
)
`)
.bind(projectId)
.first<{ count: number }>();

return row?.count ?? 0;
}

export async function listProjectActivity(
env: Env,
projectId: string,
limit = 100
): Promise<ProjectActivityRow[]> {
const result = await env.DB
.prepare(`
SELECT
id,
occurred_at AS occurredAt,
actor_user_id AS actorUserId,
actor_name AS actorName,
actor_role AS actorRole,
action,
old_value AS oldValue,
new_value AS newValue
FROM activity_log
WHERE reference_type = 'PROJECT'
AND reference_id = ?
ORDER BY occurred_at DESC
LIMIT ?
`)
.bind(
projectId,
limit
)
.all<ProjectActivityRow>();

return result.results;
}

export async function createProjectTransaction(
env: Env,
input: CreateProjectWrite,
actor: AuthenticatedUser
): Promise<void> {
const now =
new Date().toISOString();

const teamIds = [
input.managerUserId,
...input.memberUserIds,
].filter(
(value, index, array) =>
array.indexOf(value) === index
);

const statements:
D1PreparedStatement[] = [];

statements.push(
env.DB
.prepare(`
INSERT INTO projects (
id,
name,
type,
created_by,
status,
start_date,
end_date,
description,
created_at,
updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
.bind(
input.id,
input.name,
input.type,
actor.id,
input.status,
input.startDate,
input.endDate,
input.description,
now,
now
)
);

for (
const departmentId
of input.departmentIds
) {
statements.push(
env.DB
.prepare(`
INSERT INTO project_departments (
id,
project_id,
department_id,
assigned_by,
assigned_at
)
VALUES (?, ?, ?, ?, ?)
`)
.bind(
`pdept_${crypto.randomUUID()}`,
input.id,
departmentId,
actor.id,
now
)
);
}

for (const userId of teamIds) {
const projectRole:
ProjectRole =
userId ===
input.managerUserId
? "Manager"
: "Member";

statements.push(
env.DB
.prepare(`
INSERT INTO project_members (
id,
project_id,
user_id,
project_role,
assigned_by,
assigned_at,
status
)
VALUES (?, ?, ?, ?, ?, ?, 'Active')
`)
.bind(
`pmember_${crypto.randomUUID()}`,
input.id,
userId,
projectRole,
actor.id,
now
)
);

statements.push(
activityStatement(
env,
actor,
projectRole === "Manager"
? "PROJECT_MANAGER_CHANGED"
: "PROJECT_MEMBER_ADDED",
input.id,
null,
userId
)
);

if (userId !== actor.id) {
statements.push(
notificationStatement(
env,
userId,
"Project Assigned",
"Project Team Updated",
`You are part of the project team for ${input.name}.`,
input.id
)
);
}
}

statements.push(
activityStatement(
env,
actor,
"PROJECT_CREATED",
input.id,
null,
input.name
)
);

await env.DB.batch(statements);
}

export async function updateProjectTransaction(
env: Env,
input: UpdateProjectWrite,
actor: AuthenticatedUser
): Promise<void> {
const now =
new Date().toISOString();

const statements:
D1PreparedStatement[] = [];

statements.push(
env.DB
.prepare(`
UPDATE projects
SET
name = ?,
type = ?,
status = ?,
start_date = ?,
end_date = ?,
description = ?,
updated_at = ?
WHERE id = ?
`)
.bind(
input.name,
input.type,
input.status,
input.startDate,
input.endDate,
input.description,
now,
input.id
)
);

if (input.syncDepartments) {
statements.push(
env.DB
.prepare(`
DELETE FROM project_departments
WHERE project_id = ?
`)
.bind(input.id)
);

for (
const departmentId
of input.departmentIds
) {
statements.push(
env.DB
.prepare(`
INSERT INTO project_departments (
id,
project_id,
department_id,
assigned_by,
assigned_at
)
VALUES (?, ?, ?, ?, ?)
`)
.bind(
`pdept_${crypto.randomUUID()}`,
input.id,
departmentId,
actor.id,
now
)
);
}
}

if (input.syncTeam) {
const oldTeam = [
input.oldManagerUserId,
...input.oldMemberUserIds,
].filter(Boolean);

const newTeam = [
input.managerUserId,
...input.memberUserIds,
].filter(
(value, index, array) =>
array.indexOf(value) === index
);

statements.push(
env.DB
.prepare(`
UPDATE project_members
SET
status = 'Removed',
assigned_by = ?,
assigned_at = ?
WHERE project_id = ?
AND status = 'Active'
`)
.bind(
actor.id,
now,
input.id
)
);

for (const userId of newTeam) {
const projectRole:
ProjectRole =
userId ===
input.managerUserId
? "Manager"
: "Member";

statements.push(
env.DB
.prepare(`
INSERT INTO project_members (
id,
project_id,
user_id,
project_role,
assigned_by,
assigned_at,
status
)
VALUES (?, ?, ?, ?, ?, ?, 'Active')
ON CONFLICT(
project_id,
user_id
)
DO UPDATE SET
project_role =
excluded.project_role,
assigned_by =
excluded.assigned_by,
assigned_at =
excluded.assigned_at,
status = 'Active'
`)
.bind(
`pmember_${crypto.randomUUID()}`,
input.id,
userId,
projectRole,
actor.id,
now
)
);
}

for (const userId of newTeam) {
if (!oldTeam.includes(userId)) {
statements.push(
activityStatement(
env,
actor,
userId ===
input.managerUserId
? "PROJECT_MANAGER_CHANGED"
: "PROJECT_MEMBER_ADDED",
input.id,
null,
userId
)
);
}
}

for (const userId of oldTeam) {
if (!newTeam.includes(userId)) {
statements.push(
activityStatement(
env,
actor,
"PROJECT_MEMBER_REMOVED",
input.id,
userId,
null
)
);
}
}

if (
input.oldManagerUserId !==
input.managerUserId
) {
statements.push(
activityStatement(
env,
actor,
"PROJECT_MANAGER_CHANGED",
input.id,
input.oldManagerUserId,
input.managerUserId
)
);
}
}

statements.push(
activityStatement(
env,
actor,
"PROJECT_UPDATED",
input.id,
null,
"Project updated"
)
);

for (
const userId
of input.notificationUserIds
) {
if (userId === actor.id) {
continue;
}

statements.push(
notificationStatement(
env,
userId,
"Project Updated",
"Project Updated",
`${input.name} has been updated.`,
input.id
)
);
}

await env.DB.batch(statements);
}

export async function archiveProjectTransaction(
env: Env,
project: ProjectRow,
actor: AuthenticatedUser,
notifyUserIds: string[]
): Promise<void> {
const now =
new Date().toISOString();

const statements:
D1PreparedStatement[] = [
env.DB
.prepare(`
UPDATE projects
SET
status = 'Archived',
updated_at = ?
WHERE id = ?
`)
.bind(
now,
project.id
),

activityStatement(
env,
actor,
"PROJECT_ARCHIVED",
project.id,
project.status,
"Archived"
),
];

for (const userId of notifyUserIds) {
if (userId === actor.id) {
continue;
}

statements.push(
notificationStatement(
env,
userId,
"Project Archived",
"Project Archived",
`${project.name} has been archived.`,
project.id
)
);
}

await env.DB.batch(statements);
}

export async function restoreProjectTransaction(
env: Env,
project: ProjectRow,
actor: AuthenticatedUser,
notifyUserIds: string[]
): Promise<void> {
const now =
new Date().toISOString();

const statements:
D1PreparedStatement[] = [
env.DB
.prepare(`
UPDATE projects
SET
status = 'Active',
updated_at = ?
WHERE id = ?
`)
.bind(
now,
project.id
),

activityStatement(
env,
actor,
"PROJECT_RESTORED",
project.id,
"Archived",
"Active"
),
];

for (const userId of notifyUserIds) {
if (userId === actor.id) {
continue;
}

statements.push(
notificationStatement(
env,
userId,
"Project Updated",
"Project Restored",
`${project.name} has been restored.`,
project.id
)
);
}

await env.DB.batch(statements);
}

export async function deleteProjectTransaction(
env: Env,
project: ProjectRow,
actor: AuthenticatedUser
): Promise<void> {
await env.DB.batch([
env.DB
.prepare(`
DELETE FROM projects
WHERE id = ?
`)
.bind(project.id),

activityStatement(
env,
actor,
"PROJECT_DELETED",
project.id,
project.name,
"Deleted"
),
]);
}
