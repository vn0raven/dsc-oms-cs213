import { api } from "./api.js";
import { showToast } from "./ui.js";

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function getUsers(response) {
if (Array.isArray(response)) return response;
return Array.isArray(response?.users)
? response.users
: [];
}

export function openEditTask(task, onUpdated) {
const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="project-form-modal">
<div class="project-form-header">
<div>
<h2>Edit Task</h2>
<p>Update task details and progress.</p>
</div>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<form id="edit-task-form">
<div class="form-grid">

<label class="form-field form-span">
<span>Title</span>
<input
name="title"
required
value="${escapeHtml(task.title)}"
>
</label>

<label class="form-field">
<span>Priority</span>

<select name="priority">
${[
"Critical",
"High",
"Medium",
"Low",
].map(
(value) => `
<option
value="${value}"
${task.priority === value
? "selected"
: ""}
>
${value}
</option>
`
).join("")}
</select>
</label>

<label class="form-field">
<span>Progress</span>

<input
type="number"
name="progress"
min="0"
max="100"
value="${Number(task.progress || 0)}"
>
</label>

<label class="form-field">
<span>Start Date</span>
<input
type="date"
name="startDate"
value="${escapeHtml(task.startDate || "")}"
>
</label>

<label class="form-field">
<span>Deadline</span>
<input
type="date"
name="deadline"
value="${escapeHtml(task.deadline || "")}"
>
</label>

<label class="form-field form-span">
<span>Description</span>

<textarea
name="description"
rows="3"
>${escapeHtml(task.description || "")}</textarea>
</label>

<label class="form-field form-span">
<span>Instructions</span>

<textarea
name="instructions"
rows="3"
>${escapeHtml(task.instructions || "")}</textarea>
</label>

<label class="form-field form-span">
<span>Notes</span>

<textarea
name="notes"
rows="3"
>${escapeHtml(task.notes || "")}</textarea>
</label>

<label class="form-field form-span">
<span>Evidence</span>

<input
name="evidence"
value="${escapeHtml(task.evidence || "")}"
placeholder="Evidence link or reference"
>
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
Save Changes
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
"#edit-task-form"
);

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

const payload = {
title: data.get("title"),
priority: data.get("priority"),
progress:
Number(data.get("progress")),
startDate:
data.get("startDate") || null,
deadline:
data.get("deadline") || null,
description:
data.get("description") || null,
instructions:
data.get("instructions") || null,
notes:
data.get("notes") || null,
evidence:
data.get("evidence") || null,
};

const submit =
form.querySelector(
'[type="submit"]'
);

submit.disabled = true;

try {
await api.patch(
`/api/tasks/${encodeURIComponent(task.id)}`,
payload
);

showToast(
"Task updated successfully.",
"success"
);

close();

await onUpdated?.();
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

export async function openAssignTask(
task,
onUpdated
) {
const userResponse =
await api.get("/api/users");

let users =
getUsers(userResponse)
.filter(
(user) =>
user.status === "Active" &&
(
user.department?.id ===
task.departmentId ||
user.departmentId ===
task.departmentId
)
);

if (task.projectId) {
const projectResponse =
await api.get(
`/api/projects/${encodeURIComponent(task.projectId)}`
);

const project =
projectResponse.project ||
projectResponse;

const memberIds =
new Set(
(project.team || []).map(
(member) =>
member.userId
)
);

users =
users.filter(
(user) =>
memberIds.has(user.id)
);
}

const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="confirm-modal">
<div class="confirm-modal-header">
<h2>Assign Task</h2>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<p>
Select the accountable assignee
for "${escapeHtml(task.title)}".
</p>

<form id="assign-task-form">
<label class="form-field">
<span>Assignee</span>

<select
name="userId"
required
>
<option value="">
Select member
</option>

${users.map(
(user) => `
<option
value="${escapeHtml(user.id)}"
${task.assigneeUserId === user.id
? "selected"
: ""}
>
${escapeHtml(user.name)}
-
${escapeHtml(
user.position || ""
)}
</option>
`
).join("")}
</select>
</label>

<div class="confirm-modal-actions">
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
Assign
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
"#assign-task-form"
);

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

try {
await api.post(
`/api/tasks/${encodeURIComponent(task.id)}/assign`,
{
userId:
data.get("userId"),
}
);

showToast(
"Task assigned successfully.",
"success"
);

close();

await onUpdated?.();
}
catch (error) {
showToast(
error.message,
"error"
);
}
}
);
}
