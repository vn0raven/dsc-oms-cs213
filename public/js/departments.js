import { presentDetail, closeActiveModal, formModal, decisionModal } from './modal-manager.js';
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

function list(response, key) {
if (Array.isArray(response)) {
return response;
}

return Array.isArray(response?.[key])
? response[key]
: [];
}

function initials(name) {
return String(name || "")
.split(/\s+/)
.filter(Boolean)
.slice(0, 2)
.map(
(part) =>
part.charAt(0).toUpperCase()
)
.join("");
}

export async function renderDepartments(
container
) {
closeActiveModal();
container.innerHTML = `
<div class="empty">
Loading departments...
</div>
`;

const [
departmentResponse,
userResponse,
meResponse,
] = await Promise.all([
api.get("/api/departments"),
api.get("/api/users"),
api.get("/api/auth/me"),
]);

const rawDepartments =
list(
departmentResponse,
"departments"
);

const rawUsers =
list(
userResponse,
"users"
);

const me =
meResponse.user ||
meResponse;

const canSeeTesting =
me.role === "Lead" ||
me.role === "Co-Lead";
const isLead = me.role === "Lead";

const departments =
canSeeTesting
? rawDepartments
: rawDepartments.filter(
(department) =>
department.id !==
"DEPT-TEST-001"
);

const users =
canSeeTesting
? rawUsers
: rawUsers.filter(
(user) =>
user.department?.id !==
"DEPT-TEST-001"
);

const enriched =
departments.map(
(department) => {
const members =
users.filter(
(user) =>
user.department?.id ===
department.id
);

const activeMembers =
members.filter(
(user) =>
user.status ===
"Active"
);

const executives =
members.filter(
(user) =>
user.role ===
"Executive"
);

const leads =
members.filter(
(user) =>
user.role ===
"Lead"
);

return {
...department,
members,
activeMembers,
executives,
leads,
};
}
);

container.innerHTML = `
<section class="page-heading">

<div>
<h1>Departments</h1>

<p>
Organization structure and
department membership overview.
</p>
</div>

<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
<span class="muted">
${departments.length}
department${departments.length === 1
? ""
: "s"}
</span>
${isLead ? `<button type="button" class="button button-primary" id="new-department-button">+ New Department</button>` : ""}
</div>

</section>

<section class="department-grid">

${enriched.map(
(department) => `
<button
type="button"
class="card department-card"
data-department-id="${escapeHtml(
department.id
)}"
>
<div class="department-card-head">

<div class="department-avatar">
${escapeHtml(
initials(
department.name
)
)}
</div>

<div>
<h2>
${escapeHtml(
department.name
)}
</h2>

<span
class="status ${String(
department.status
).toLowerCase()}"
>
${escapeHtml(
department.status
)}
</span>
</div>

</div>

<div class="department-card-stats">

<div>
<strong>
${department.members.length}
</strong>

<span>
Members
</span>
</div>

<div>
<strong>
${department.activeMembers.length}
</strong>

<span>
Active
</span>
</div>

<div>
<strong>
${department.leads.length +
department.executives.length}
</strong>

<span>
Leadership
</span>
</div>

</div>

<small>
${escapeHtml(
department.id
)}
</small>
</button>
`
).join("")}

</section>

<section
class="card department-detail-panel" data-detail-host
id="department-detail-panel"
>
<div class="empty">
Select a department.
</div>
</section>
`;

const detail =
container.querySelector(
"#department-detail-panel"
);

let deptDialog=null;
function openDepartment(id, actionError = "") {
const department =
enriched.find(
(item) =>
item.id === id
);

if (!department) return;

container
.querySelectorAll(
"[data-department-id]"
)
.forEach(
(card) =>
card.classList.toggle(
"selected",
card.dataset.departmentId ===
id
)
);

const isActive = department.status === "Active";
const nextStatus = isActive ? "Inactive" : "Active";

detail.innerHTML = `
<div class="department-detail-head">

<div>
<h2>
${escapeHtml(
department.name
)}
</h2>

<p>
${escapeHtml(
department.id
)}
</p>
</div>

<span
class="status ${String(
department.status
).toLowerCase()}"
>
${escapeHtml(
department.status
)}
</span>

</div>

${isLead ? `
<p role="alert" data-dept-action-error style="color:var(--dsc-red,#d71920);font-weight:600;margin:8px 0;" ${actionError ? "" : "hidden"}>${escapeHtml(actionError)}</p>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
<button type="button" class="button button-light" data-dept-rename>Rename Department</button>
<button type="button" class="button ${isActive ? "button-danger" : "button-primary"}" data-dept-toggle-status>${isActive ? "Deactivate Department" : "Reactivate Department"}</button>
</div>
` : ""}

<div class="department-member-list">

${department.members.length
? department.members.map(
(user) => `
<div class="department-member-row">

<div class="user-avatar">
${escapeHtml(
initials(
user.name
)
)}
</div>

<div>
<strong>
${escapeHtml(
user.name
)}
</strong>

<p>
${escapeHtml(
user.position ||
"No position"
)}
·
${escapeHtml(
user.role
)}
</p>
</div>

<span
class="status ${String(
user.status
).toLowerCase()}"
>
${escapeHtml(
user.status
)}
</span>

</div>
`
).join("")
: `
<div class="empty">
No members in this department.
</div>
`
}

</div>
`;

if (isLead) {
detail.querySelector("[data-dept-rename]")?.addEventListener("click", async () => {
const updated = await formModal({
title: "Rename Department",
submitLabel: "Save Name",
values: { name: department.name },
fields: `<label class="form-field form-span"><span>Department Name</span><input name="name" required minlength="2" maxlength="120" placeholder="Department name"></label>`,
onSubmit: async (data) => {
await api.patch(`/api/departments/${encodeURIComponent(department.id)}`, { name: data.name });
},
});
if (updated) {
showToast("Department renamed.");
await renderDepartments(container);
}
});

detail.querySelector("[data-dept-toggle-status]")?.addEventListener("click", async () => {
const confirmed = await decisionModal({
title: isActive ? "Deactivate Department" : "Reactivate Department",
message: isActive
? `Deactivate "${department.name}"? Existing historical records are preserved, and the department will be marked Inactive.`
: `Reactivate "${department.name}" so it can be used for active operations?`,
confirmText: isActive ? "Deactivate" : "Reactivate",
danger: isActive,
});
if (!confirmed) return;
try {
await api.patch(`/api/departments/${encodeURIComponent(department.id)}/status`, { status: nextStatus });
showToast(isActive ? "Department deactivated." : "Department reactivated.");
await renderDepartments(container);
} catch (err) {
openDepartment(department.id, err?.message || "Unable to update department status.");
}
});
}

if(deptDialog)deptDialog.close(true);
deptDialog=presentDetail(detail, department.name || 'Department details');
}

container.querySelector("#new-department-button")?.addEventListener("click", async () => {
const created = await formModal({
title: "New Department",
submitLabel: "Create Department",
fields: `<label class="form-field form-span"><span>Department Name</span><input name="name" required minlength="2" maxlength="120" placeholder="e.g. Operations"></label>`,
onSubmit: async (data) => {
await api.post("/api/departments", { name: data.name });
},
});
if (created) {
showToast("Department created.");
await renderDepartments(container);
}
});

container.querySelector(".department-grid")?.addEventListener(
"click",
(event) => {
const card =
event.target.closest(
"[data-department-id]"
);

if (!card) return;

openDepartment(
card.dataset.departmentId
);
}
);


}
