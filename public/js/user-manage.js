import { api } from "./api.js";
import {
confirmAction,
showToast,
} from "./ui.js";

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

async function getDepartments() {
const response =
await api.get("/api/departments");

return items(
response,
"departments"
).filter(
(department) =>
department.status === "Active"
);
}

export async function openCreateUser(
onUpdated
) {
const departments =
await getDepartments();

const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="project-form-modal">

<div class="project-form-header">
<div>
<h2>Add Member</h2>

<p>
Create an organization account.
</p>
</div>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<form id="create-user-form">

<div class="form-grid">

<label
class="form-field form-span"
>
<span>Full Name</span>

<input
name="name"
maxlength="120"
required
>
</label>

<label class="form-field">
<span>Email</span>

<input
type="email"
name="email"
maxlength="254"
required
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
<option
value="${escapeHtml(
department.id
)}"
>
${escapeHtml(
department.name
)}
</option>
`
).join("")}
</select>
</label>

<label class="form-field">
<span>Position</span>

<input
name="position"
maxlength="120"
placeholder="e.g. Engineering Lead"
>
</label>

<label class="form-field">
<span>System Role</span>

<select
name="role"
required
>
<option value="Member">
Member
</option>

<option value="Executive">
Executive
</option>

<option value="Lead">
Lead
</option>
</select>
</label>

<label class="form-field">
<span>Contact Number</span>

<input
name="contactNumber"
maxlength="40"
>
</label>

<label class="form-field">
<span>Messenger URL</span>

<input
type="url"
name="messengerUrl"
maxlength="500"
>
</label>

<label
class="form-field form-span"
>
<span>Facebook URL</span>

<input
type="url"
name="facebookUrl"
maxlength="500"
>
</label>

<label
class="form-field form-span"
>
<span>Initial Password (optional, 8+ chars)</span>

<input
type="password"
name="password"
minlength="8"
maxlength="128"
autocomplete="new-password"
placeholder="Set password for local login"
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
Add Member
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
"#create-user-form"
);

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

const payload = {
name:
data.get("name"),

email:
data.get("email"),

departmentId:
data.get("departmentId"),

position:
data.get("position") ||
null,

role:
data.get("role"),

messengerUrl:
data.get("messengerUrl") ||
null,

facebookUrl:
data.get("facebookUrl") ||
null,

contactNumber:
data.get("contactNumber") ||
null,
};

const rawPassword = String(data.get("password") || "");
if (rawPassword) {
payload.password = rawPassword;
}

const submit =
form.querySelector(
'[type="submit"]'
);

submit.disabled = true;

try {
await api.post(
"/api/users",
payload
);

showToast(
"Member added successfully.",
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

export async function openEditUser(
user,
onUpdated
) {
const departments =
await getDepartments();

const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="project-form-modal">

<div class="project-form-header">
<div>
<h2>Edit Member</h2>

<p>
Update profile information.
</p>
</div>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<form id="edit-user-form">

<div class="form-grid">

<label
class="form-field form-span"
>
<span>Full Name</span>

<input
name="name"
value="${escapeHtml(
user.name
)}"
maxlength="120"
required
>
</label>

<label class="form-field">
<span>Email</span>

<input
type="email"
name="email"
value="${escapeHtml(
user.email
)}"
maxlength="254"
required
>
</label>

<label class="form-field">
<span>Department</span>

<select
name="departmentId"
required
>
${departments.map(
(department) => `
<option
value="${escapeHtml(
department.id
)}"
${department.id ===
user.department?.id
? "selected"
: ""}
>
${escapeHtml(
department.name
)}
</option>
`
).join("")}
</select>
</label>

<label class="form-field">
<span>Position</span>

<input
name="position"
value="${escapeHtml(
user.position || ""
)}"
maxlength="120"
>
</label>

<label class="form-field">
<span>Contact Number</span>

<input
name="contactNumber"
value="${escapeHtml(
user.contactNumber || ""
)}"
maxlength="40"
>
</label>

<label class="form-field">
<span>Messenger URL</span>

<input
type="url"
name="messengerUrl"
value="${escapeHtml(
user.messengerUrl || ""
)}"
maxlength="500"
>
</label>

<label
class="form-field form-span"
>
<span>Facebook URL</span>

<input
type="url"
name="facebookUrl"
value="${escapeHtml(
user.facebookUrl || ""
)}"
maxlength="500"
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
"#edit-user-form"
);

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

try {
await api.patch(
`/api/users/${encodeURIComponent(user.id)}`,
{
name:
data.get("name"),

email:
data.get("email"),

departmentId:
data.get(
"departmentId"
),

position:
data.get("position") ||
null,

contactNumber:
data.get(
"contactNumber"
) || null,

messengerUrl:
data.get(
"messengerUrl"
) || null,

facebookUrl:
data.get(
"facebookUrl"
) || null,
}
);

showToast(
"Member updated.",
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

export function openChangeUserRole(
user,
onUpdated
) {
const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="confirm-modal">

<div class="confirm-modal-header">
<h2>Change System Role</h2>

<button
class="modal-close"
type="button"
data-close
>&times;</button>
</div>

<form id="user-role-form">

<label class="form-field">
<span>Role</span>

<select
name="role"
required
>
<option
value="Member"
${user.role === "Member"
? "selected"
: ""}
>
Member
</option>

<option
value="Executive"
${user.role === "Executive"
? "selected"
: ""}
>
Executive
</option>

<option
value="Lead"
${user.role === "Lead"
? "selected"
: ""}
>
Lead
</option>
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
Update Role
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
"#user-role-form"
);

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

try {
await api.patch(
`/api/users/${encodeURIComponent(user.id)}/role`,
{
role:
data.get("role"),
}
);

showToast(
"Member role updated.",
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

export async function toggleUserStatus(
user,
onUpdated
) {
const newStatus =
user.status === "Active"
? "Inactive"
: "Active";

const confirmed =
await confirmAction({
title:
newStatus === "Inactive"
? "Deactivate member"
: "Activate member",

message:
newStatus === "Inactive"
? `Deactivate "${user.name}"? They will immediately lose OMS access. Their account history and related records will remain intact.`
: `Activate "${user.name}"? They will regain OMS access according to their current system role.`,

confirmText:
newStatus === "Inactive"
? "Deactivate"
: "Activate",

danger:
newStatus === "Inactive",
});

if (!confirmed) return;

try {
await api.patch(
`/api/users/${encodeURIComponent(user.id)}/status`,
{
status:
newStatus,
}
);

showToast(
newStatus === "Inactive"
? "Member deactivated."
: "Member activated.",
"success"
);

await onUpdated?.();
}
catch (error) {
showToast(
error.message,
"error"
);
}
}
