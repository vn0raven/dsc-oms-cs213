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

function arrayFrom(response, key) {
if (Array.isArray(response)) return response;
return Array.isArray(response?.[key])
? response[key]
: [];
}

export async function openEditProject(
project,
onUpdated
) {
const [
departmentResponse,
userResponse,
] = await Promise.all([
api.get("/api/departments"),
api.get("/api/users"),
]);

const departments =
arrayFrom(
departmentResponse,
"departments"
).filter(
(item) =>
item.status === "Active"
);

const users =
arrayFrom(
userResponse,
"users"
).filter(
(item) =>
item.status === "Active"
);

const memberIds =
new Set(
(project.team || [])
.filter(
(member) =>
member.projectRole === "Member"
)
.map(
(member) =>
member.userId
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
<h2>Edit Project</h2>
<p>
Update project information,
departments, manager and team.
</p>
</div>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<form id="edit-project-form">
<div class="form-grid">
<label class="form-field form-span">
<span>Project Name</span>

<input
name="name"
required
maxlength="180"
value="${escapeHtml(project.name)}"
>
</label>

<label class="form-field">
<span>Type</span>

<input
value="${escapeHtml(project.type)}"
disabled
>
</label>

<label class="form-field">
<span>Status</span>

<input
value="${escapeHtml(project.status)}"
disabled
>
</label>

<label class="form-field">
<span>Start Date</span>

<input
type="date"
name="startDate"
value="${escapeHtml(
project.startDate || ""
)}"
>
</label>

<label class="form-field">
<span>End Date</span>

<input
type="date"
name="endDate"
value="${escapeHtml(
project.endDate || ""
)}"
>
</label>

<label class="form-field form-span">
<span>Description</span>

<textarea
name="description"
rows="3"
maxlength="5000"
>${escapeHtml(
project.description || ""
)}</textarea>
</label>

<div class="form-field form-span">
<span>Departments</span>

<div class="check-list">
${departments.map(
(department) => `
<label>
<input
type="checkbox"
name="departmentIds"
value="${escapeHtml(department.id)}"
${
project.departmentIds
?.includes(
department.id
)
? "checked"
: ""
}
>

${escapeHtml(department.name)}
</label>
`
).join("")}
</div>
</div>

<label class="form-field form-span">
<span>Project Manager</span>

<select
name="managerUserId"
required
>
${users.map(
(user) => `
<option
value="${escapeHtml(user.id)}"
data-department-id="${escapeHtml(user.department?.id || user.departmentId || "")}"
${
project.manager?.userId ===
user.id
? "selected"
: ""
}
>
${escapeHtml(user.name)}
-
${escapeHtml(
user.department?.name ||
user.departmentName ||
""
)}
</option>
`
).join("")}
</select>
</label>

<div class="form-field form-span">
<span>Project Members</span>

<div class="check-list">
${users.map(
(user) => `
<label>
<input
type="checkbox"
name="memberUserIds"
value="${escapeHtml(user.id)}"
data-department-id="${escapeHtml(user.department?.id || user.departmentId || "")}"
${
memberIds.has(user.id)
? "checked"
: ""
}
>

${escapeHtml(user.name)}
</label>
`
).join("")}
</div>
</div>
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

document.body.appendChild(
overlay
);

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
"#edit-project-form"
);

const managerSelect =
form.querySelector(
'[name="managerUserId"]'
);

const departmentBoxes =
[
...form.querySelectorAll(
'[name="departmentIds"]'
),
];

const memberBoxes =
[
...form.querySelectorAll(
'[name="memberUserIds"]'
),
];

function selectedDepartments() {
return new Set(
departmentBoxes
.filter((box) => box.checked)
.map((box) => box.value)
);
}

function syncSelections() {
const organizationProject =
project.type === "Organization";

if (organizationProject) {
departmentBoxes.forEach(
(box) => {
box.checked = true;
box.disabled = true;
}
);
}

const departments =
selectedDepartments();

[
...managerSelect.options,
].forEach(
(option) => {
if (!option.value) return;

const allowed =
departments.has(
option.dataset.departmentId
);

option.hidden = !allowed;
option.disabled = !allowed;
}
);

const selectedManager =
managerSelect.selectedOptions[0];

if (
selectedManager?.value &&
!departments.has(
selectedManager.dataset.departmentId
)
) {
managerSelect.value = "";
}

const managerId =
managerSelect.value;

memberBoxes.forEach(
(box) => {
const allowed =
departments.has(
box.dataset.departmentId
) &&
box.value !== managerId;

box.disabled = !allowed;

box.closest("label")
.style.display =
allowed ? "" : "none";

if (!allowed) {
box.checked = false;
}
}
);
}

departmentBoxes.forEach(
(box) =>
box.addEventListener(
"change",
syncSelections
)
);

managerSelect.addEventListener(
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

const managerUserId =
data.get(
"managerUserId"
);

const payload = {
name:
data.get("name"),

startDate:
data.get("startDate") ||
null,

endDate:
data.get("endDate") ||
null,

description:
data.get("description") ||
null,

departmentIds:
project.type === "Organization"
? departmentBoxes.map(
(box) => box.value
)
: departmentBoxes
.filter(
(box) => box.checked
)
.map(
(box) => box.value
),

managerUserId,

memberUserIds:
data.getAll(
"memberUserIds"
).filter(
(id) =>
id !== managerUserId
),
};

const submit =
form.querySelector(
'[type="submit"]'
);

submit.disabled = true;

try {
const response =
await api.patch(
`/api/projects/${encodeURIComponent(
project.id
)}`,
payload
);

showToast(
"Project updated successfully.",
"success"
);

close();

await onUpdated?.(
response.project ||
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
