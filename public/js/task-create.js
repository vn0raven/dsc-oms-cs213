import { api } from "./api.js";
import { showToast } from "./ui.js";

function list(response, key) {
if (Array.isArray(response)) return response;
return Array.isArray(response?.[key])
? response[key]
: [];
}

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

export async function openCreateTask(onCreated) {
const [
departmentResponse,
projectResponse,
userResponse,
] = await Promise.all([
api.get("/api/departments"),
api.get("/api/projects"),
api.get("/api/users"),
]);

const departments =
list(departmentResponse, "departments")
.filter((item) => item.status === "Active");

const projects =
list(projectResponse, "projects")
.filter((item) => item.status === "Active");

const users =
list(userResponse, "users")
.filter((item) => item.status === "Active");

const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="project-form-modal">
<div class="project-form-header">
<div>
<h2>New Task</h2>
<p>
Create and optionally assign a task.
</p>
</div>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<form id="create-task-form">
<div class="form-grid">

<label class="form-field form-span">
<span>Task Title</span>

<input
name="title"
required
maxlength="200"
placeholder="Enter task title"
>
</label>

<label class="form-field">
<span>Department</span>

<select
name="departmentId"
required
>
<option value="">
Select department
</option>

${departments.map(
(department) => `
<option value="${escapeHtml(department.id)}">
${escapeHtml(department.name)}
</option>
`
).join("")}
</select>
</label>

<label class="form-field">
<span>Priority</span>

<select name="priority">
<option value="Medium">
Medium
</option>

<option value="Low">
Low
</option>

<option value="High">
High
</option>

<option value="Critical">
Critical
</option>
</select>
</label>

<label class="form-field form-span">
<span>Project</span>

<select name="projectId">
<option value="">
No project
</option>

${projects.map(
(project) => `
<option
value="${escapeHtml(project.id)}"
data-departments="${escapeHtml(
(project.departmentIds || []).join(",")
)}"
>
${escapeHtml(project.name)}
</option>
`
).join("")}
</select>
</label>

<label class="form-field form-span">
<span>Assignee</span>

<select name="assigneeUserId">
<option value="">
Unassigned
</option>

${users.map(
(user) => `
<option
value="${escapeHtml(user.id)}"
data-department-id="${escapeHtml(
user.department?.id ||
user.departmentId ||
""
)}"
>
${escapeHtml(user.name)}
-
${escapeHtml(user.position || "")}
</option>
`
).join("")}
</select>
</label>

<label class="form-field">
<span>Start Date</span>

<input
type="date"
name="startDate"
>
</label>

<label class="form-field">
<span>Deadline</span>

<input
type="date"
name="deadline"
>
</label>

<label class="form-field form-span">
<span>Description</span>

<textarea
name="description"
rows="3"
placeholder="Task description"
></textarea>
</label>

<label class="form-field form-span">
<span>Instructions</span>

<textarea
name="instructions"
rows="3"
placeholder="Task instructions"
></textarea>
</label>

</div>

<div class="project-form-actions">
<button
type="button"
class="button button-light"
data-close
>
Cancel
</button>

<button
type="submit"
class="button button-secondary"
>
Create Task
</button>
</div>
</form>
</div>
`;

document.body.appendChild(overlay);

const close = () =>
overlay.remove();

overlay
.querySelectorAll("[data-close]")
.forEach(
(button) =>
button.addEventListener(
"click",
close
)
);

const form =
overlay.querySelector(
"#create-task-form"
);

const departmentSelect =
form.querySelector(
'[name="departmentId"]'
);

const projectSelect =
form.querySelector(
'[name="projectId"]'
);

const assigneeSelect =
form.querySelector(
'[name="assigneeUserId"]'
);

function syncSelections() {
const departmentId =
departmentSelect.value;

[
...projectSelect.options,
].forEach(
(option) => {
if (!option.value) return;

const departments =
String(
option.dataset.departments || ""
)
.split(",")
.filter(Boolean);

const allowed =
departmentId &&
departments.includes(
departmentId
);

option.hidden = !allowed;
option.disabled = !allowed;
}
);

if (
projectSelect.value &&
projectSelect
.selectedOptions[0]
.disabled
) {
projectSelect.value = "";
}

const selectedProject =
projects.find(
(project) =>
project.id ===
projectSelect.value
);

const projectMemberIds =
selectedProject
? new Set(
(selectedProject.team || [])
.map(
(member) =>
member.userId
)
)
: null;

[
...assigneeSelect.options,
].forEach(
(option) => {
if (!option.value) return;

const correctDepartment =
option.dataset.departmentId ===
departmentId;

const projectAllowed =
!projectMemberIds ||
projectMemberIds.has(
option.value
);

const allowed =
correctDepartment &&
projectAllowed;

option.hidden = !allowed;
option.disabled = !allowed;
}
);

if (
assigneeSelect.value &&
assigneeSelect
.selectedOptions[0]
.disabled
) {
assigneeSelect.value = "";
}
}

departmentSelect.addEventListener(
"change",
syncSelections
);

projectSelect.addEventListener(
"change",
syncSelections
);

syncSelections();

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

const payload = {
title:
data.get("title"),

departmentId:
data.get("departmentId"),

projectId:
data.get("projectId") ||
null,

assigneeUserId:
data.get("assigneeUserId") ||
null,

priority:
data.get("priority"),

startDate:
data.get("startDate") ||
null,

deadline:
data.get("deadline") ||
null,

description:
data.get("description") ||
null,

instructions:
data.get("instructions") ||
null,
};

const submit =
form.querySelector(
'[type="submit"]'
);

submit.disabled = true;

try {
const response =
await api.post(
"/api/tasks",
payload
);

showToast(
"Task created successfully.",
"success"
);

close();

await onCreated?.(
response.task ||
response
);
}
catch (error) {
showToast(
error.message,
"error"
);

submit.disabled = false;
}
}
);
}
