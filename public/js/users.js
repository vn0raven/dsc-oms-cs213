import { safeExternalUrl } from "./safe-html.mjs";
import { api } from "./api.js";

import {
openChangeUserRole,
openCreateUser,
openEditUser,
toggleUserStatus,
} from "./user-manage.js";

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function getUsers(response) {
if (Array.isArray(response)) {
return response;
}

return Array.isArray(response?.users)
? response.users
: [];
}

function initials(name) {
const parts =
String(name || "")
.trim()
.split(/\s+/)
.filter(Boolean);

return parts
.slice(0, 2)
.map(
(part) =>
part.charAt(0).toUpperCase()
)
.join("") || "?";
}

function renderUserRows(users) {
if (!users.length) {
return `
<div class="empty">
No members found.
</div>
`;
}

return `
<div class="user-list">

${users.map(
(user) => `
<button
type="button"
class="user-row"
data-user-id="${escapeHtml(
user.id
)}"
>
<div class="user-avatar">
${escapeHtml(
initials(user.name)
)}
</div>

<div class="user-row-main">
<div class="user-row-name">
<strong>
${escapeHtml(
user.name
)}
</strong>

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

<div class="user-row-meta">
<span>
${escapeHtml(
user.position ||
"No position"
)}
</span>

<span>·</span>

<span>
${escapeHtml(
user.department?.name ||
"—"
)}
</span>

<span>·</span>

<span>
${escapeHtml(
user.role
)}
</span>
</div>
</div>
</button>
`
).join("")}

</div>
`;
}

function renderUserDetail(
user,
canManage
) {
return `
<div class="user-detail-content">

<div class="user-profile-heading">

<div class="user-profile-avatar">
${escapeHtml(
initials(user.name)
)}
</div>

<div>
<h2>
${escapeHtml(
user.name
)}
</h2>

<p>
${escapeHtml(
user.position ||
"No position"
)}
</p>

<div class="user-profile-tags">
<span>
${escapeHtml(
user.role
)}
</span>

<span>
${escapeHtml(
user.status
)}
</span>
</div>
</div>

</div>

<div class="detail-grid">

<div class="detail-item">
<span>Email</span>

<strong>
${escapeHtml(
user.email
)}
</strong>
</div>

<div class="detail-item">
<span>Department</span>

<strong>
${escapeHtml(
user.department?.name ||
"—"
)}
</strong>
</div>

<div class="detail-item">
<span>Position</span>

<strong>
${escapeHtml(
user.position ||
"—"
)}
</strong>
</div>

<div class="detail-item">
<span>System Role</span>

<strong>
${escapeHtml(
user.role
)}
</strong>
</div>

<div class="detail-item">
<span>Contact</span>

<strong>
${escapeHtml(
user.contactNumber ||
"—"
)}
</strong>
</div>

<div class="detail-item">
<span>Status</span>

<strong>
${escapeHtml(
user.status
)}
</strong>
</div>

</div>

${
safeExternalUrl(user.messengerUrl) ||
safeExternalUrl(user.facebookUrl)
? `
<div class="detail-section">
<h3>Social Links</h3>

<div class="user-social-links">

${safeExternalUrl(user.messengerUrl)
? `
<a
href="${escapeHtml(
safeExternalUrl(user.messengerUrl)
)}"
target="_blank"
rel="noopener noreferrer"
>
Messenger
</a>
`
: ""}

${safeExternalUrl(user.facebookUrl)
? `
<a
href="${escapeHtml(
safeExternalUrl(user.facebookUrl)
)}"
target="_blank"
rel="noopener noreferrer"
>
Facebook
</a>
`
: ""}

</div>
</div>
`
: ""
}

${
canManage
? `
<div class="detail-section">
<h3>Member Management</h3>

<div class="user-action-buttons">

<button
type="button"
class="button button-light"
data-user-action="edit"
>
Edit Profile
</button>

<button
type="button"
class="button button-light"
data-user-action="role"
>
Change Role
</button>

<button
type="button"
class="button ${
user.status === "Active"
? "button-danger-soft"
: "button-secondary"
}"
data-user-action="status"
>
${user.status === "Active"
? "Deactivate"
: "Activate"}
</button>

</div>
</div>
`
: ""
}

</div>
`;
}

export async function renderUsers(
container
) {
container.innerHTML = `
<div class="empty">
Loading members...
</div>
`;

const [
userResponse,
meResponse,
] = await Promise.all([
api.get("/api/users"),
api.get("/api/auth/me"),
]);

const rawUsers =
getUsers(userResponse);

const me =
meResponse.user ||
meResponse;

const canSeeTesting =
me.role === "Lead" ||
me.role === "Co-Lead";

const allUsers =
canSeeTesting
? rawUsers
: rawUsers.filter(
(user) =>
user.department?.id !==
"DEPT-TEST-001"
);

const canManage =
me.role === "Lead" ||
me.role === "Co-Lead";

const canChangeRole =
me.role === "Lead";

const canChangeStatus =
me.role === "Lead";

const departments =
[
...new Map(
allUsers
.filter(
(user) =>
user.department
)
.map(
(user) => [
user.department.id,
user.department,
]
)
).values(),
].sort(
(a, b) =>
a.name.localeCompare(
b.name
)
);

container.innerHTML = `
<section class="page-heading">

<div>
<h1>Members</h1>

<p>
View and manage the
organization directory.
</p>
</div>

${
canManage
? `
<button
type="button"
class="button button-secondary"
id="add-user-button"
>
+ Add Member
</button>
`
: ""
}

</section>

<section class="users-layout">

<div class="card users-panel">

<div class="users-toolbar">

<input
type="search"
id="user-search"
aria-label="Search members"
placeholder="Search members..."
>

<select id="user-department-filter"
aria-label="Filter members by department">
<option value="">
All departments
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

<select id="user-role-filter"
aria-label="Filter members by role">
<option value="">
All roles
</option>

<option value="Lead">
Lead
</option>

<option value="Executive">
Executive
</option>

<option value="Member">
Member
</option>
</select>

<select id="user-status-filter"
aria-label="Filter members by status">
<option value="">
All statuses
</option>

<option value="Active">
Active
</option>

<option value="Inactive">
Inactive
</option>
</select>

</div>

<div
class="users-result-count"
id="users-result-count"
>
${allUsers.length}
member${allUsers.length === 1
? ""
: "s"}
</div>

<div id="user-list-container">
${renderUserRows(
allUsers
)}
</div>

</div>

<aside
class="card user-detail"
id="user-detail"
>
<div class="empty">
Select a member.
</div>
</aside>

</section>
`;

const search =
container.querySelector(
"#user-search"
);

const departmentFilter =
container.querySelector(
"#user-department-filter"
);

const roleFilter =
container.querySelector(
"#user-role-filter"
);

const statusFilter =
container.querySelector(
"#user-status-filter"
);

const list =
container.querySelector(
"#user-list-container"
);

const detail =
container.querySelector(
"#user-detail"
);

const resultCount =
container.querySelector(
"#users-result-count"
);

function refreshList() {
const query =
search.value
.trim()
.toLowerCase();

const departmentId =
departmentFilter.value;

const role =
roleFilter.value;

const status =
statusFilter.value;

const filtered =
allUsers.filter(
(user) => {
const haystack = [
user.name,
user.email,
user.position,
user.role,
user.department?.name,
]
.join(" ")
.toLowerCase();

return (
(
!query ||
haystack.includes(
query
)
) &&
(
!departmentId ||
user.department?.id ===
departmentId
) &&
(
!role ||
user.role === role
) &&
(
!status ||
user.status ===
status
)
);
}
);

list.innerHTML =
renderUserRows(
filtered
);

resultCount.textContent =
`${filtered.length} member${
filtered.length === 1
? ""
: "s"
}`;
}

async function openUser(id) {
container
.querySelectorAll(
".user-row"
)
.forEach(
(row) =>
row.classList.toggle(
"selected",
row.dataset.userId ===
id
)
);

detail.innerHTML = `
<div class="empty">
Loading member...
</div>
`;

const response =
await api.get(
`/api/users/${encodeURIComponent(id)}`
);

const user =
response.user ||
response;

detail.innerHTML =
renderUserDetail(
user,
canManage
);

if (!canChangeRole) {
detail
.querySelector(
'[data-user-action="role"]'
)
?.remove();
}

if (!canChangeStatus) {
detail
.querySelector(
'[data-user-action="status"]'
)
?.remove();
}

const refresh =
async () => {
await renderUsers(
container
);
};

detail
.querySelector(
'[data-user-action="edit"]'
)
?.addEventListener(
"click",
() =>
openEditUser(
user,
refresh
)
);

detail
.querySelector(
'[data-user-action="role"]'
)
?.addEventListener(
"click",
() =>
openChangeUserRole(
user,
refresh
)
);

detail
.querySelector(
'[data-user-action="status"]'
)
?.addEventListener(
"click",
() =>
toggleUserStatus(
user,
refresh
)
);
}

[
search,
departmentFilter,
roleFilter,
statusFilter,
].forEach(
(control) =>
control.addEventListener(
control === search
? "input"
: "change",
refreshList
)
);

list.addEventListener(
"click",
async (event) => {
const row =
event.target.closest(
"[data-user-id]"
);

if (!row) return;

await openUser(
row.dataset.userId
);
}
);

container
.querySelector(
"#add-user-button"
)
?.addEventListener(
"click",
() =>
openCreateUser(
async () => {
await renderUsers(
container
);
}
)
);

if (allUsers.length) {
await openUser(
allUsers[0].id
);
}
}
