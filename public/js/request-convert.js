import { api } from "./api.js";
import { showToast } from "./ui.js";

function items(response, key) {
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

export async function openConvertRequest(
request,
onUpdated
) {
const [
projectResponse,
userResponse,
] = await Promise.all([
api.get("/api/projects"),
api.get("/api/users"),
]);

const projects =
items(projectResponse, "projects")
.filter(
(project) =>
project.status !== "Archived" &&
(
project.departmentIds || []
).includes(
request.receiverDepartmentId
)
);

const users =
items(userResponse, "users")
.filter(
(user) =>
user.status === "Active" &&
(
user.department?.id ===
request.receiverDepartmentId ||
user.departmentId ===
request.receiverDepartmentId
)
);

const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="project-form-modal">

<div class="project-form-header">
<div>
<h2>Convert to Task</h2>

<p>
Create a task for
${escapeHtml(
request.receiverDepartmentName
)}.
</p>
</div>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<form id="convert-request-form">

<div class="form-grid">

<label
class="form-field form-span"
>
<span>Task Title</span>

<input
name="title"
required
maxlength="200"
value="${escapeHtml(
request.title
)}"
>
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

<label class="form-field">
<span>Project</span>

<select name="projectId">
<option value="">
No project
</option>

${projects.map(
(project) => `
<option
value="${escapeHtml(
project.id
)}"
>
${escapeHtml(
project.name
)}
</option>
`
).join("")}
</select>
</label>

<label
class="form-field form-span"
>
<span>Assignee</span>

<select name="assigneeUserId">
<option value="">
Unassigned
</option>

${users.map(
(user) => `
<option
value="${escapeHtml(
user.id
)}"
>
${escapeHtml(
user.name
)}
-
${escapeHtml(
user.position || ""
)}
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

<label
class="form-field form-span"
>
<span>Description</span>

<textarea
name="description"
rows="3"
maxlength="5000"
>${escapeHtml(
request.description || ""
)}</textarea>
</label>

<label
class="form-field form-span"
>
<span>Instructions</span>

<textarea
name="instructions"
rows="4"
maxlength="5000"
placeholder="Instructions for the assigned member..."
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
Convert to Task
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
"#convert-request-form"
);

const projectSelect =
form.querySelector(
'[name="projectId"]'
);

const assigneeSelect =
form.querySelector(
'[name="assigneeUserId"]'
);

async function syncAssignees() {
const projectId =
projectSelect.value;

let eligibleIds = null;

if (projectId) {
try {
const response =
await api.get(
`/api/projects/${encodeURIComponent(projectId)}`
);

const project =
response.project ||
response;

eligibleIds =
new Set(
(project.team || [])
.map(
(member) =>
member.userId
)
);
}
catch (error) {
showToast(
error.message,
"error"
);

projectSelect.value = "";
}
}

[
...assigneeSelect.options,
].forEach(
(option) => {
if (!option.value) return;

const allowed =
!eligibleIds ||
eligibleIds.has(
option.value
);

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

projectSelect.addEventListener(
"change",
syncAssignees
);

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

const payload = {
title:
data.get("title"),

description:
data.get("description") ||
null,

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
`/api/requests/${encodeURIComponent(request.id)}/convert`,
payload
);

showToast(
"Request converted to task.",
"success"
);

close();

await onUpdated?.(
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
