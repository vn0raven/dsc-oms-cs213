import { api } from "./api.js";
import { showToast } from "./ui.js";
import { escapeHtml } from "./safe-html.mjs";
import { trapModalFocus } from "./modal-focus.js";

function arrayFrom(response, key) {
if (Array.isArray(response)) return response;
return Array.isArray(response?.[key])
? response[key]
: [];
}

export async function openCreateProject(onCreated) {
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

const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="project-form-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-heading" tabindex="-1">
<div class="project-form-header">
<div>
<h2 id="new-project-heading">New Project</h2>
<p>
Create a new DSC project.
</p>
</div>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<form id="create-project-form">
<div class="form-grid">
<label class="form-field form-span">
<span>Project Name</span>

<input
name="name"
required
maxlength="180"
placeholder="Enter project name"
>
</label>

<label class="form-field">
<span>Type</span>

<select name="type" required>
<option value="Department">
Department
</option>

<option value="Organization">
Organization
</option>
</select>
</label>

<label class="form-field">
<span>Status</span>

<select name="status">
<option value="Active">
Active
</option>

<option value="Draft">
Draft
</option>
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
<span>End Date</span>
<input
type="date"
name="endDate"
>
</label>

<label class="form-field form-span">
<span>Description</span>

<textarea
name="description"
rows="3"
maxlength="5000"
placeholder="Project description"
></textarea>
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
<option value="">
Select manager
</option>

${users.map(
(user) => `
<option value="${escapeHtml(user.id)}"
data-department-id="${escapeHtml(user.department?.id || user.departmentId || "")}">
${escapeHtml(user.name)}
- ${escapeHtml(user.department?.name || user.departmentName || "")}
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
Create Project
</button>
</div>
</form>
</div>
`;

document.body.appendChild(
overlay
);

let releaseFocus = () => {};
function close() {
overlay.remove();
releaseFocus();
}
releaseFocus = trapModalFocus(overlay, close, '[name="name"]');

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
"#create-project-form"
);

const typeSelect =
form.querySelector(
'[name="type"]'
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

function getSelectedDepartments() {
return new Set(
departmentBoxes
.filter(
(box) =>
box.checked
)
.map(
(box) =>
box.value
)
);
}

function syncProjectSelections() {
const organizationProject =
typeSelect.value ===
"Organization";

if (organizationProject) {
departmentBoxes.forEach(
(box) => {
box.checked = true;
box.disabled = true;
}
);
}
else {
departmentBoxes.forEach(
(box) => {
box.disabled = false;
}
);
}

const selectedDepartments =
getSelectedDepartments();

const managerOptions =
[
...managerSelect.options,
];

managerOptions.forEach(
(option) => {
if (!option.value) {
return;
}

const allowed =
selectedDepartments.has(
option.dataset
.departmentId
);

option.hidden =
!allowed;

option.disabled =
!allowed;
}
);

const selectedManagerOption =
managerSelect
.selectedOptions[0];

if (
selectedManagerOption?.value &&
!selectedDepartments.has(
selectedManagerOption
.dataset
.departmentId
)
) {
managerSelect.value = "";
}

const managerUserId =
managerSelect.value;

memberBoxes.forEach(
(box) => {
const departmentAllowed =
selectedDepartments.has(
box.dataset
.departmentId
);

const isManager =
box.value ===
managerUserId;

const allowed =
departmentAllowed &&
!isManager;

box.disabled =
!allowed;

box.closest("label")
.style.display =
allowed
? ""
: "none";

if (!allowed) {
box.checked = false;
}
}
);
}

typeSelect.addEventListener(
"change",
syncProjectSelections
);

departmentBoxes.forEach(
(box) =>
box.addEventListener(
"change",
syncProjectSelections
)
);

managerSelect.addEventListener(
"change",
syncProjectSelections
);

syncProjectSelections();

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

const departmentIds =
typeSelect.value ===
"Organization"
? departmentBoxes.map(
(box) =>
box.value
)
: departmentBoxes
.filter(
(box) =>
box.checked
)
.map(
(box) =>
box.value
);

const managerUserId =
data.get(
"managerUserId"
);

const memberUserIds =
data.getAll(
"memberUserIds"
)
.filter(
(id) =>
id !== managerUserId
);

const payload = {
name:
data.get("name"),

type:
data.get("type"),

status:
data.get("status"),

startDate:
data.get("startDate") ||
null,

endDate:
data.get("endDate") ||
null,

description:
data.get("description") ||
null,

departmentIds,
managerUserId,
memberUserIds,
};

const submit =
form.querySelector(
'[type="submit"]'
);

submit.disabled = true;

try {
const response =
await api.post(
"/api/projects",
payload
);

showToast(
"Project created successfully.",
"success"
);

close();

await onCreated?.(
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
