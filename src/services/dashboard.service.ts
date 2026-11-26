import {
listProjects,
} from "./project.service";

import {
listTasks,
} from "./task.service";

import {
listRequests,
} from "./request.service";

import {
getUnreadCount,
} from "./notification.service";

import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";
import type { DashboardDto } from "../types/dashboard";

export async function getDashboard(
env: Env,
user: AuthenticatedUser
): Promise<DashboardDto> {
const [
projects,
tasks,
requests,
unreadNotifications,
] = await Promise.all([
listProjects(
env,
user
),

listTasks(
env,
user
),

listRequests(
env,
user
),

getUnreadCount(
env,
user
),
]);

const projectSummary = {
total:
projects.length,

active:
projects.filter(
(project) =>
project.status === "Active"
).length,

archived:
projects.filter(
(project) =>
project.status === "Archived"
).length,
};

const taskSummary = {
total:
tasks.length,

created:
tasks.filter(
(task) =>
task.status === "Created"
).length,

assigned:
tasks.filter(
(task) =>
task.status === "Assigned"
).length,

ongoing:
tasks.filter(
(task) =>
task.status === "Ongoing"
).length,

forReview:
tasks.filter(
(task) =>
task.status === "For Review"
).length,

completed:
tasks.filter(
(task) =>
task.status === "Completed"
).length,

archived:
tasks.filter(
(task) =>
task.status === "Archived"
).length,
};

const requestSummary = {
total:
requests.length,

pending:
requests.filter(
(request) =>
request.status === "Pending" &&
!request.isArchived
).length,

approved:
requests.filter(
(request) =>
request.status === "Approved" &&
!request.isArchived
).length,

converted:
requests.filter(
(request) =>
request.status === "Converted" &&
!request.isArchived
).length,

rejected:
requests.filter(
(request) =>
request.status === "Rejected" &&
!request.isArchived
).length,

archived:
requests.filter(
(request) =>
request.isArchived
).length,
};

const dashboardProjects =
projects
.filter(
(project) =>
project.status !== "Archived"
)
.sort(
(a, b) =>
new Date(
b.updatedAt
).getTime() -
new Date(
a.updatedAt
).getTime()
)
.slice(
0,
6
)
.map(
(project) => ({
id:
project.id,

name:
project.name,

type:
project.type,

status:
project.status,

progress:
project.progress,

taskCount:
project.taskCount,

completedTaskCount:
project.completedTaskCount,

ongoingTaskCount:
project.ongoingTaskCount,

forReviewTaskCount:
project.forReviewTaskCount,
})
);

const recentTasks =
[...tasks]
.sort(
(a, b) =>
new Date(
b.updatedAt
).getTime() -
new Date(
a.updatedAt
).getTime()
)
.slice(
0,
8
);

const recentRequests =
[...requests]
.sort(
(a, b) =>
new Date(
b.createdAt
).getTime() -
new Date(
a.createdAt
).getTime()
)
.slice(
0,
8
);

return {
scope: {
role:
user.role,

departmentId:
user.department.id,

departmentName:
user.department.name,
},

summary: {
projects:
projectSummary,

tasks:
taskSummary,

requests:
requestSummary,

unreadNotifications,
},

projects:
dashboardProjects,

recentTasks,

recentRequests,
};
}
