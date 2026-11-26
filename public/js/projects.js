import { presentDetail, closeActiveModal } from './modal-manager.js';
import {
api,
} from "./api.js";

import {
confirmAction,
showToast,
} from "./ui.js";

import {
openCreateProject,
} from "./project-create.js";

import {
openEditProject,
} from "./project-edit.js";

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function statusClass(status) {
return String(status ?? "")
.toLowerCase()
.replaceAll(" ", "-");
}

function getProjects(response) {
if (Array.isArray(response)) {
return response;
}

if (Array.isArray(response?.projects)) {
return response.projects;
}

return [];
}

function getProject(response) {
return response?.project ?? response;
}

function getManagerName(project) {
return (
project.managerName ||
project.projectManagerName ||
project.manager?.name ||
project.projectManager?.name ||
"Not assigned"
);
}

function getDepartments(project) {
if (
Array.isArray(project.departmentNames) &&
project.departmentNames.length
) {
return project.departmentNames;
}

const departments =
project.departments ||
project.projectDepartments ||
project.departmentAssignments ||
[];

if (!Array.isArray(departments)) {
return [];
}

return departments
.map(
(department) =>
typeof department === "string"
? department
: department?.name ||
  department?.departmentName ||
  department?.department?.name ||
  ""
)
.filter(Boolean);
}
function getTeam(project) {
return Array.isArray(project.team)
? project.team
: [];
}
function projectProgress(project) {
const value =
Number(project.progress ?? 0);

if (Number.isNaN(value)) {
return 0;
}

return Math.max(
0,
Math.min(100, value)
);
}

function renderProjectRows(projects) {
if (!projects.length) {
return `
<div class="empty">
No projects found.
</div>
`;
}

return `
<div class="project-list">
${projects.map(
(project) => `
<button
type="button"
class="project-row"
data-project-id="${escapeHtml(project.id)}"
>
<div class="project-row-main">
<div class="project-row-heading">
<strong>
${escapeHtml(project.name)}
</strong>

<span
class="
status
${statusClass(project.status)}
"
>
${escapeHtml(project.status)}
</span>
</div>

<div class="project-row-meta">
<span>
${escapeHtml(project.type || "Project")}
</span>

<span>•</span>

<span>
${escapeHtml(getManagerName(project))}
</span>
</div>

<div class="project-progress-row">
<div class="progress">
<div
class="progress-bar"
style="
width:
${projectProgress(project)}%
"
></div>
</div>

<span>
${projectProgress(project)}%
</span>
</div>
</div>

<div class="project-row-stats">
<div>
<strong>
${Number(project.taskCount ?? 0)}
</strong>
<span>Tasks</span>
</div>

<div>
<strong>
${Number(
project.completedTaskCount ??
0
)}
</strong>
<span>Done</span>
</div>
</div>
</button>
`
).join("")}
</div>
`;
}

function renderDetailEmpty() {
return `
<div class="project-detail-empty">
<div>
<strong>
Select a project
</strong>

<p>
Choose a project from the list
to view its details.
</p>
</div>
</div>
`;
}

function renderDetailLoading() {
return `
<div class="empty">
Loading project...
</div>
`;
}

function renderProjectDetail(project) {
const departments =
getDepartments(project);

const team =
getTeam(project);

const permissions =
project.permissions || {};

const canArchive =
Boolean(permissions.canArchive);

const canRestore =
Boolean(permissions.canRestore);

const archived =
project.status === "Archived";

const canComplete =
project.status === "Active" &&
Boolean(
permissions.canEdit ||
permissions.canManageTeam ||
permissions.canArchive
);

return `
<div class="project-detail-content">
<div class="project-detail-header">
<div>
<div class="project-detail-title-row">
<h2>
${escapeHtml(project.name)}
</h2>

<span
class="
status
${statusClass(project.status)}
"
>
${escapeHtml(project.status)}
</span>
</div>

<p>
${escapeHtml(
project.description ||
"No project description."
)}
</p>
</div>
</div>

<div class="project-progress-block">
<div class="project-progress-label">
<span>Progress</span>

<strong>
${projectProgress(project)}%
</strong>
</div>

<div class="progress progress-large">
<div
class="progress-bar"
style="
width:
${projectProgress(project)}%
"
></div>
</div>
</div>

<div class="detail-grid">
<div class="detail-item">
<span>Type</span>
<strong>
${escapeHtml(project.type || "—")}
</strong>
</div>

<div class="detail-item">
<span>Manager</span>
<strong>
${escapeHtml(getManagerName(project))}
</strong>
</div>

<div class="detail-item">
<span>Tasks</span>
<strong>
${Number(project.taskCount ?? 0)}
</strong>
</div>

<div class="detail-item">
<span>Completed</span>
<strong>
${Number(
project.completedTaskCount ??
0
)}
</strong>
</div>

<div class="detail-item">
<span>Ongoing</span>
<strong>
${Number(
project.ongoingTaskCount ??
0
)}
</strong>
</div>

<div class="detail-item">
<span>For Review</span>
<strong>
${Number(
project.forReviewTaskCount ??
0
)}
</strong>
</div>
</div>

<div class="detail-section">
<h3>Departments</h3>

<div class="chip-list">
${
departments.length
? departments.map(
(name) => `
<span class="chip">
${escapeHtml(name)}
</span>
`
).join("")
: `
<span class="muted-text">
No departments listed.
</span>
`
}
</div>
</div>

<div class="detail-section">
<h3>
Project Team
<span class="section-count">
${team.length}
</span>
</h3>

<div class="team-list">
${
team.length
? team.map(
(member) => `
<div class="team-member">
<div class="team-avatar">
${escapeHtml(
String(
member.name || "?"
)
.charAt(0)
.toUpperCase()
)}
</div>

<div class="team-member-info">
<strong>
${escapeHtml(member.name)}
</strong>

<span>
${escapeHtml(
member.position ||
member.departmentName ||
""
)}
</span>
</div>

<span class="team-role">
${escapeHtml(
member.projectRole
)}
</span>
</div>
`
).join("")
: `
<span class="muted-text">
No project members.
</span>
`
}
</div>
</div>

<div class="detail-section">
<h3>Project Information</h3>

<div class="detail-stack">
<div>
<span>Created</span>
<strong>
${formatDate(project.createdAt)}
</strong>
</div>

<div>
<span>Last Updated</span>
<strong>
${formatDate(project.updatedAt)}
</strong>
</div>
</div>
</div>

${
canComplete || canArchive || canRestore || permissions.canEdit || permissions.canManageTeam
? `
<div class="project-actions">
${
permissions.canEdit ||
permissions.canManageTeam
? `
<button
type="button"
class="button button-secondary"
id="edit-project"
>
Edit Project
</button>
`
: ""
}
${
canComplete
? `
<button
type="button"
class="button button-secondary"
id="complete-project"
>
Complete Project
</button>
`
: ""
}

${
canArchive && !archived
? `
<button
type="button"
class="
button
button-danger-soft
"
id="archive-project"
>
Archive Project
</button>
`
: ""
}

${
canRestore
? `
<button
type="button"
class="
button
button-secondary
"
id="restore-project"
>
Restore Project
</button>
`
: ""
}
</div>
`
: ""
}
</div>
`;
}

function formatDate(value) {
if (!value) {
return "—";
}

const date =
new Date(value);

if (
Number.isNaN(
date.getTime()
)
) {
return escapeHtml(value);
}

return date.toLocaleString(
undefined,
{
year: "numeric",
month: "short",
day: "numeric",
}
);
}

export async function renderProjects(
container
) {
closeActiveModal();
container.innerHTML = `
<div class="empty">
Loading projects...
</div>
`;

const response =
await api.get(
"/api/projects"
);

const allProjects =
getProjects(response);

container.innerHTML = `
<section class="page-heading">
<div>
<h1>Projects</h1>

<p>
Manage organization projects,
progress, and ownership.
</p>
</div>

<button
type="button"
class="button button-secondary"
id="new-project-button"
>
+ New Project
</button>
</section>

<section class="projects-layout">
<div class="card projects-panel">
<div class="projects-toolbar">
<div class="search-box">
<input
type="search"
id="project-search"
aria-label="Search projects"
placeholder="Search projects..."
autocomplete="off"
>
</div>

<select
id="project-status-filter"
aria-label="Filter projects by status"
class="select-control"
>
<option value="">
All statuses
</option>

<option value="Draft">
Draft
</option>

<option value="Active">
Active
</option>

<option value="Completed">
Completed
</option>

<option value="Archived">
Archived
</option>
</select>
</div>

<div
id="project-list-container"
>
${renderProjectRows(allProjects)}
</div>
</div>

<aside
class="card project-detail"
id="project-detail"
>
${renderDetailEmpty()}
</aside>
</section>
`;

const searchInput =
document.getElementById(
"project-search"
);

const statusFilter =
document.getElementById(
"project-status-filter"
);

const listContainer =
document.getElementById(
"project-list-container"
);

const detailContainer =
document.getElementById(
"project-detail"
);

let selectedProjectId = null;
let projectDialog = null;

function refreshList() {
const query =
searchInput.value
.trim()
.toLowerCase();

const status =
statusFilter.value;

const filtered =
allProjects.filter(
(project) => {
const matchesSearch =
!query ||
String(
project.name || ""
)
.toLowerCase()
.includes(query) ||
String(
project.type || ""
)
.toLowerCase()
.includes(query);

const matchesStatus =
!status ||
project.status === status;

return (
matchesSearch &&
matchesStatus
);
}
);

listContainer.innerHTML =
renderProjectRows(filtered);

if (selectedProjectId) {
document
.querySelector(
`[data-project-id="${CSS.escape(
selectedProjectId
)}"]`
)
?.classList
.add("selected");
}
}

async function openProject(id) {
selectedProjectId = id;

document
.querySelectorAll(
".project-row"
)
.forEach(
(row) =>
row.classList.toggle(
"selected",
row.dataset.projectId === id
)
);

detailContainer.innerHTML =
renderDetailLoading();

try {
const response =
await api.get(
`/api/projects/${encodeURIComponent(id)}`
);

const project =
getProject(response);

detailContainer.innerHTML =
renderProjectDetail(project);
if(projectDialog)projectDialog.close(true);
projectDialog=presentDetail(detailContainer, project.name || "Project details");

const editButton =
document.getElementById(
"edit-project"
);

editButton?.addEventListener(
"click",
() =>
openEditProject(
project,
async () => {
await reloadProjects(
id
);
}
)
);

/* OMS_COMPLETE_PROJECT_ACTION */

const completeButton =
document.getElementById(
"complete-project"
);

const archiveButton =
document.getElementById(
"archive-project"
);

const restoreButton =
document.getElementById(
"restore-project"
);

completeButton?.addEventListener(
"click",
async () => {
const taskCount =
Number(
project.taskCount || 0
);

const archivedTasks =
Number(
project.archivedTaskCount || 0
);

const completedTasks =
Number(
project.completedTaskCount || 0
);

const remaining =
Math.max(
0,
taskCount -
archivedTasks -
completedTasks
);

if (remaining > 0) {
showToast(
`${remaining} task${
remaining === 1
? " is"
: "s are"
} still incomplete or awaiting review.`,
"error"
);

return;
}

const confirmed =
await confirmAction({
title:
"Complete project",

message:
`Mark "${project.name}" as Completed? All active project tasks must already be completed and approved.`,

confirmText:
"Complete",

danger:
false,
});

if (!confirmed) {
return;
}

completeButton.disabled =
true;

try {
await api.patch(
`/api/projects/${encodeURIComponent(id)}`,
{
status:
"Completed",
}
);

showToast(
"Project completed successfully.",
"success"
);

await reloadProjects(
id
);
}
catch (error) {
showToast(
error.message,
"error"
);

completeButton.disabled =
false;
}
}
);

archiveButton?.addEventListener(
"click",
async () => {
const confirmed =
await confirmAction({
title:
"Archive project",

message:
`Archive "${project.name}"? It will be removed from active project views. Active work must be completed or archived first. Historical records will remain available.`,

confirmText:
"Archive",

danger:
true,
});

if (!confirmed) {
return;
}

archiveButton.disabled = true;

try {
await api.post(
`/api/projects/${encodeURIComponent(id)}/archive`
);

showToast(
"Project archived successfully.",
"success"
);

await reloadProjects(
id
);
}
catch (error) {
showToast(error.message, "error");
archiveButton.disabled = false;
}
}
);

restoreButton?.addEventListener(
"click",
async () => {
restoreButton.disabled = true;

try {
await api.post(
`/api/projects/${encodeURIComponent(id)}/restore`
);

showToast(
"Project restored successfully.",
"success"
);

await reloadProjects(
id
);
}
catch (error) {
showToast(error.message, "error");
restoreButton.disabled = false;
}
}
);
}
catch (error) {
detailContainer.innerHTML = `
<div class="empty">
${escapeHtml(error.message)}
</div>
`;
}
}

async function reloadProjects(
openId = null
) {
const refreshed =
await api.get(
"/api/projects"
);

const items =
getProjects(refreshed);

allProjects.splice(
0,
allProjects.length,
...items
);

refreshList();

if (openId) {
await openProject(openId);
}
}

searchInput.addEventListener(
"input",
refreshList
);

statusFilter.addEventListener(
"change",
refreshList
);

listContainer.addEventListener(
"click",
async (event) => {
const row =
event.target.closest(
"[data-project-id]"
);

if (!row) {
return;
}

await openProject(
row.dataset.projectId
);
}
);

document
.getElementById(
"new-project-button"
)
?.addEventListener(
"click",
() =>
openCreateProject(
async (project) => {
await reloadProjects(
project.id
);
}
)
);


}
