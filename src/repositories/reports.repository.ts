import type { Env } from "../types/env";

import type {
ActivityReportItem,
DepartmentWorkloadReport,
DetailedReportFilters,
DetailedTaskReportRow,
DetailedTasksReport,
ExceptionEventIssue,
ExceptionOverdueTask,
ExceptionReport,
ExceptionUnassignedTask,
OverviewReport,
ProjectProgressReport,
RequestOutcomeReport,
SummaryDepartmentRow,
SummaryReport,
TaskStatusReport,
} from "../types/report";

export async function getTaskStatusReport(
env: Env
): Promise<TaskStatusReport> {
const row = await env.DB
.prepare(`
SELECT
COUNT(*) AS total,

SUM(
CASE
WHEN status = 'Created'
THEN 1 ELSE 0
END
) AS created,

SUM(
CASE
WHEN status = 'Assigned'
THEN 1 ELSE 0
END
) AS assigned,

SUM(
CASE
WHEN status = 'Ongoing'
THEN 1 ELSE 0
END
) AS ongoing,

SUM(
CASE
WHEN status = 'For Review'
THEN 1 ELSE 0
END
) AS forReview,

SUM(
CASE
WHEN status = 'Approved'
THEN 1 ELSE 0
END
) AS approved,

SUM(
CASE
WHEN status = 'Completed'
THEN 1 ELSE 0
END
) AS completed,

SUM(
CASE
WHEN status = 'Archived'
THEN 1 ELSE 0
END
) AS archived

FROM tasks
`)
.first<TaskStatusReport>();

return {
total: Number(row?.total ?? 0),
created: Number(row?.created ?? 0),
assigned: Number(row?.assigned ?? 0),
ongoing: Number(row?.ongoing ?? 0),
forReview: Number(row?.forReview ?? 0),
approved: Number(row?.approved ?? 0),
completed: Number(row?.completed ?? 0),
archived: Number(row?.archived ?? 0),
};
}

export async function getRequestOutcomeReport(
env: Env
): Promise<RequestOutcomeReport> {
const row = await env.DB
.prepare(`
SELECT
COUNT(*) AS total,

SUM(
CASE
WHEN status = 'Pending'
AND is_archived = 0
THEN 1 ELSE 0
END
) AS pending,

SUM(
CASE
WHEN status = 'Approved'
AND is_archived = 0
THEN 1 ELSE 0
END
) AS approved,

SUM(
CASE
WHEN status = 'Converted'
AND is_archived = 0
THEN 1 ELSE 0
END
) AS converted,

SUM(
CASE
WHEN status = 'Rejected'
AND is_archived = 0
THEN 1 ELSE 0
END
) AS rejected,

SUM(
CASE
WHEN is_archived = 1
THEN 1 ELSE 0
END
) AS archived

FROM requests
`)
.first<RequestOutcomeReport>();

return {
total: Number(row?.total ?? 0),
pending: Number(row?.pending ?? 0),
approved: Number(row?.approved ?? 0),
converted: Number(row?.converted ?? 0),
rejected: Number(row?.rejected ?? 0),
archived: Number(row?.archived ?? 0),
};
}

export async function getProjectProgressReport(
env: Env
): Promise<ProjectProgressReport[]> {
const result = await env.DB
.prepare(`
SELECT
p.id,
p.name,
p.type,
p.status,

COUNT(
CASE
WHEN t.status <> 'Archived'
THEN t.id
END
) AS taskCount,

SUM(
CASE
WHEN t.status = 'Completed'
THEN 1 ELSE 0
END
) AS completedTaskCount,

SUM(
CASE
WHEN t.status = 'Ongoing'
THEN 1 ELSE 0
END
) AS ongoingTaskCount,

SUM(
CASE
WHEN t.status = 'For Review'
THEN 1 ELSE 0
END
) AS forReviewTaskCount,

COALESCE(
ROUND(
AVG(
CASE
WHEN t.status <> 'Archived'
THEN t.progress
ELSE NULL
END
)
),
0
) AS progress

FROM projects p

LEFT JOIN tasks t
ON t.project_id = p.id

GROUP BY
p.id,
p.name,
p.type,
p.status

ORDER BY
p.updated_at DESC,
p.name ASC
`)
.all<ProjectProgressReport>();

return result.results.map(
(row) => ({
...row,
taskCount:
Number(row.taskCount ?? 0),
completedTaskCount:
Number(row.completedTaskCount ?? 0),
ongoingTaskCount:
Number(row.ongoingTaskCount ?? 0),
forReviewTaskCount:
Number(row.forReviewTaskCount ?? 0),
progress:
Number(row.progress ?? 0),
})
);
}

export async function getDepartmentWorkloadReport(
env: Env
): Promise<DepartmentWorkloadReport[]> {
const result = await env.DB
.prepare(`
SELECT
d.id,
d.name,

(
SELECT COUNT(*)
FROM users u
WHERE
u.department_id = d.id
AND u.status = 'Active'
) AS activeUsers,

(
SELECT COUNT(
DISTINCT pd.project_id
)
FROM project_departments pd
INNER JOIN projects p
ON p.id = pd.project_id
WHERE
pd.department_id = d.id
AND p.status <> 'Archived'
) AS activeProjects,

(
SELECT COUNT(*)
FROM tasks t
WHERE
t.department_id = d.id
AND t.status <> 'Archived'
) AS taskCount,

(
SELECT COUNT(*)
FROM tasks t
WHERE
t.department_id = d.id
AND t.status = 'Created'
) AS createdTasks,

(
SELECT COUNT(*)
FROM tasks t
WHERE
t.department_id = d.id
AND t.status = 'Assigned'
) AS assignedTasks,

(
SELECT COUNT(*)
FROM tasks t
WHERE
t.department_id = d.id
AND t.status = 'Ongoing'
) AS ongoingTasks,

(
SELECT COUNT(*)
FROM tasks t
WHERE
t.department_id = d.id
AND t.status = 'For Review'
) AS forReviewTasks,

(
SELECT COUNT(*)
FROM tasks t
WHERE
t.department_id = d.id
AND t.status = 'Completed'
) AS completedTasks,

(
SELECT COUNT(*)
FROM requests r
WHERE
r.receiver_department_id = d.id
AND r.status = 'Pending'
AND r.is_archived = 0
) AS pendingRequestsReceived

FROM departments d

WHERE d.status = 'Active' OR EXISTS (
SELECT 1 FROM tasks tx WHERE tx.department_id = d.id AND tx.status <> 'Archived'
)

ORDER BY d.name ASC
`)
.all<DepartmentWorkloadReport>();

return result.results.map(
(row) => ({
...row,
activeUsers:
Number(row.activeUsers ?? 0),
activeProjects:
Number(row.activeProjects ?? 0),
taskCount:
Number(row.taskCount ?? 0),
createdTasks:
Number(row.createdTasks ?? 0),
assignedTasks:
Number(row.assignedTasks ?? 0),
ongoingTasks:
Number(row.ongoingTasks ?? 0),
forReviewTasks:
Number(row.forReviewTasks ?? 0),
completedTasks:
Number(row.completedTasks ?? 0),
pendingRequestsReceived:
Number(
row.pendingRequestsReceived ??
0
),
})
);
}

export async function getRecentActivityReport(
env: Env,
limit: number
): Promise<ActivityReportItem[]> {
const result = await env.DB
.prepare(`
SELECT
id,
occurred_at
AS occurredAt,

actor_user_id
AS actorUserId,

actor_name
AS actorName,

actor_role
AS actorRole,

action,

reference_type
AS referenceType,

reference_id
AS referenceId,

old_value
AS oldValue,

new_value
AS newValue

FROM activity_log

ORDER BY occurred_at DESC

LIMIT ?
`)
.bind(limit)
.all<ActivityReportItem>();

return result.results;
}

export async function getOverviewReport(
env: Env
): Promise<OverviewReport> {
const [
users,
departments,
projects,
tasks,
requests,
] = await Promise.all([
env.DB
.prepare(`
SELECT
COUNT(*) AS total,

SUM(
CASE
WHEN status = 'Active'
THEN 1 ELSE 0
END
) AS active,

SUM(
CASE
WHEN status = 'Inactive'
THEN 1 ELSE 0
END
) AS inactive

FROM users
`)
.first<{
total: number;
active: number;
inactive: number;
}>(),

env.DB
.prepare(`
SELECT
COUNT(*) AS total,

SUM(
CASE
WHEN status = 'Active'
THEN 1 ELSE 0
END
) AS active,

SUM(
CASE
WHEN status = 'Inactive'
THEN 1 ELSE 0
END
) AS inactive

FROM departments
`)
.first<{
total: number;
active: number;
inactive: number;
}>(),

env.DB
.prepare(`
SELECT
COUNT(*) AS total,

SUM(
CASE
WHEN status = 'Draft'
THEN 1 ELSE 0
END
) AS draft,

SUM(
CASE
WHEN status = 'Active'
THEN 1 ELSE 0
END
) AS active,

SUM(
CASE
WHEN status = 'Completed'
THEN 1 ELSE 0
END
) AS completed,

SUM(
CASE
WHEN status = 'Archived'
THEN 1 ELSE 0
END
) AS archived

FROM projects
`)
.first<{
total: number;
draft: number;
active: number;
completed: number;
archived: number;
}>(),

getTaskStatusReport(env),

getRequestOutcomeReport(env),
]);

return {
users: {
total:
Number(users?.total ?? 0),
active:
Number(users?.active ?? 0),
inactive:
Number(users?.inactive ?? 0),
},

departments: {
total:
Number(
departments?.total ?? 0
),
active:
Number(
departments?.active ?? 0
),
inactive:
Number(
departments?.inactive ?? 0
),
},

projects: {
total:
Number(projects?.total ?? 0),
draft:
Number(projects?.draft ?? 0),
active:
Number(projects?.active ?? 0),
completed:
Number(
projects?.completed ?? 0
),
archived:
Number(
projects?.archived ?? 0
),
},

tasks,

requests,
};
}

export async function getDetailedTasksReport(
env: Env,
filters: DetailedReportFilters
): Promise<DetailedTasksReport> {
const conditions: string[] = [];
const bindings: unknown[] = [];

if (filters.status) {
conditions.push("t.status = ?");
bindings.push(filters.status);
} else {
conditions.push("t.status <> 'Archived'");
}

if (filters.departmentId) {
conditions.push("t.department_id = ?");
bindings.push(filters.departmentId);
}

if (filters.startDate) {
conditions.push("substr(t.created_at, 1, 10) >= ?");
bindings.push(filters.startDate);
}

if (filters.endDate) {
conditions.push("substr(t.created_at, 1, 10) <= ?");
bindings.push(filters.endDate);
}

const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

const query = `
SELECT
t.id,
t.title,
t.department_id AS departmentId,
d.name AS departmentName,
t.project_id AS projectId,
p.name AS projectName,
etl.event_id AS eventId,
e.name AS eventName,
t.priority,
t.status,
t.progress,
t.start_date AS startDate,
t.deadline,
t.created_at AS createdAt,
u.name AS assigneeName
FROM tasks t
INNER JOIN departments d ON d.id = t.department_id
LEFT JOIN projects p ON p.id = t.project_id
LEFT JOIN event_task_links etl ON etl.task_id = t.id
LEFT JOIN events e ON e.id = etl.event_id
LEFT JOIN task_assignments ta ON ta.task_id = t.id AND ta.status = 'Active'
LEFT JOIN users u ON u.id = ta.user_id
${whereClause}
ORDER BY t.created_at DESC, t.title ASC
`;

const result = await env.DB.prepare(query).bind(...bindings).all<DetailedTaskReportRow>();
const rows = result.results.map((row) => ({
...row,
progress: Number(row.progress ?? 0),
}));

return {
filters,
totalCount: rows.length,
rows,
};
}

export async function getSummaryReport(
env: Env,
filters: { startDate: string | null; endDate: string | null }
): Promise<SummaryReport> {
const joinConditions = ["t.department_id = d.id", "t.status <> 'Archived'"];
const archiveConditions = ["status = 'Archived'"];
const joinBindings: unknown[] = [];
const archiveBindings: unknown[] = [];

if (filters.startDate) {
joinConditions.push("substr(t.created_at, 1, 10) >= ?");
joinBindings.push(filters.startDate);
archiveConditions.push("substr(created_at, 1, 10) >= ?");
archiveBindings.push(filters.startDate);
}
if (filters.endDate) {
joinConditions.push("substr(t.created_at, 1, 10) <= ?");
joinBindings.push(filters.endDate);
archiveConditions.push("substr(created_at, 1, 10) <= ?");
archiveBindings.push(filters.endDate);
}

const [deptResult, archivedTasksRow, draftProjectsRow, draftEventsRow] = await Promise.all([
env.DB.prepare(`
SELECT
d.id AS departmentId,
d.name AS departmentName,
d.status AS departmentStatus,
COUNT(t.id) AS totalTasks,
SUM(CASE WHEN t.status = 'Created' THEN 1 ELSE 0 END) AS createdTasks,
SUM(CASE WHEN t.status IN ('Assigned', 'Ongoing', 'For Review', 'Approved') THEN 1 ELSE 0 END) AS activeTasks,
SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) AS completedTasks,
COALESCE(ROUND(AVG(t.progress), 1), 0) AS avgProgress
FROM departments d
LEFT JOIN tasks t ON ${joinConditions.join(" AND ")}
WHERE d.status = 'Active' OR EXISTS (
  SELECT 1 FROM tasks tx WHERE tx.department_id = d.id AND tx.status <> 'Archived'
)
GROUP BY d.id, d.name, d.status
ORDER BY d.name ASC
`).bind(...joinBindings).all<SummaryDepartmentRow>(),
env.DB.prepare(`SELECT COUNT(*) AS cnt FROM tasks WHERE ${archiveConditions.join(" AND ")}`).bind(...archiveBindings).first<{ cnt: number }>(),
env.DB.prepare(`SELECT COUNT(*) AS cnt FROM projects WHERE status = 'Draft'`).first<{ cnt: number }>(),
env.DB.prepare(`SELECT COUNT(*) AS cnt FROM events WHERE status = 'Draft'`).first<{ cnt: number }>(),
]);

const departments = deptResult.results.map((r) => ({
departmentId: r.departmentId,
departmentName: r.departmentName,
departmentStatus: r.departmentStatus,
totalTasks: Number(r.totalTasks ?? 0),
createdTasks: Number(r.createdTasks ?? 0),
activeTasks: Number(r.activeTasks ?? 0),
completedTasks: Number(r.completedTasks ?? 0),
avgProgress: Number(r.avgProgress ?? 0),
}));

const totals = departments.reduce(
(acc, d) => ({
totalTasks: acc.totalTasks + d.totalTasks,
createdTasks: acc.createdTasks + d.createdTasks,
activeTasks: acc.activeTasks + d.activeTasks,
completedTasks: acc.completedTasks + d.completedTasks,
}),
{ totalTasks: 0, createdTasks: 0, activeTasks: 0, completedTasks: 0 }
);

return {
filters,
departments,
totals,
exclusions: {
excludedArchivedTasks: Number(archivedTasksRow?.cnt ?? 0),
excludedDraftProjects: Number(draftProjectsRow?.cnt ?? 0),
excludedDraftEvents: Number(draftEventsRow?.cnt ?? 0),
},
};
}

export async function getExceptionReport(
env: Env,
asOfDate: string
): Promise<ExceptionReport> {
const [overdueRes, unassignedRes, issuesRes] = await Promise.all([
env.DB.prepare(`
SELECT
t.id,
t.title,
t.department_id AS departmentId,
d.name AS departmentName,
t.priority,
t.status,
t.deadline,
u.name AS assigneeName
FROM tasks t
INNER JOIN departments d ON d.id = t.department_id
LEFT JOIN task_assignments ta ON ta.task_id = t.id AND ta.status = 'Active'
LEFT JOIN users u ON u.id = ta.user_id
WHERE t.deadline IS NOT NULL
  AND substr(t.deadline, 1, 10) <= ?
  AND t.status NOT IN ('Completed', 'Archived')
ORDER BY t.deadline ASC, t.title ASC
`).bind(asOfDate).all<ExceptionOverdueTask>(),

env.DB.prepare(`
SELECT
t.id,
t.title,
t.department_id AS departmentId,
d.name AS departmentName,
t.priority,
t.deadline,
t.created_at AS createdAt
FROM tasks t
INNER JOIN departments d ON d.id = t.department_id
WHERE t.priority IN ('High', 'Critical')
  AND t.status = 'Created'
  AND NOT EXISTS (
    SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND ta.status = 'Active'
  )
ORDER BY t.created_at DESC, t.title ASC
`).all<ExceptionUnassignedTask>(),

env.DB.prepare(`
SELECT
ei.id,
ei.event_id AS eventId,
e.name AS eventName,
ei.title,
ei.severity,
ei.status,
ei.due_at AS dueAt
FROM event_issues ei
INNER JOIN events e ON e.id = ei.event_id
WHERE ei.severity IN ('High', 'Urgent')
  AND ei.status <> 'Resolved'
ORDER BY ei.created_at DESC
`).all<ExceptionEventIssue>(),
]);

return {
asOfDate,
rules: {
overdue: `deadline <= ${asOfDate} AND status NOT IN ('Completed', 'Archived')`,
unassignedPriority: "priority IN ('High', 'Critical') AND status = 'Created' AND no active assignee",
unresolvedHighEventIssues: "severity IN ('High', 'Urgent') AND status <> 'Resolved'",
},
overdueTasks: overdueRes.results,
unassignedPriorityTasks: unassignedRes.results,
unresolvedHighEventIssues: issuesRes.results,
};
}
