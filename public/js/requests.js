import { api } from "./api.js";

import {
openCreateRequest,
} from "./request-create.js";

import {
openConvertRequest,
} from "./request-convert.js";

import {
approveRequestAction,
archiveRequestAction,
openRejectRequest,
restoreRequestAction,
withdrawRequestAction,
} from "./request-lifecycle.js";

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function getRequests(response) {
if (Array.isArray(response)) {
return response;
}

return Array.isArray(response?.requests)
? response.requests
: [];
}

function formatDate(value) {
if (!value) return "—";

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
return value;
}

return date.toLocaleDateString(
undefined,
{
year: "numeric",
month: "short",
day: "numeric",
}
);
}

function displayStatus(request) {
if (request.isArchived) return "Archived";
if (request.isWithdrawn) return "Withdrawn";
return request.status;
}

function statusClass(status) {
return String(status || "")
.toLowerCase()
.replaceAll(" ", "-");
}

function renderRows(requests) {
if (!requests.length) {
return `
<div class="empty">
No requests found.
</div>
`;
}

return `
<div class="request-list">
${requests.map(
(request) => {
const status =
displayStatus(request);

return `
<button
type="button"
class="request-row"
data-request-id="${escapeHtml(
request.id
)}"
>
<div class="request-row-main">
<div class="request-row-title">
<strong>
${escapeHtml(
request.title
)}
</strong>

<span
class="
status
${statusClass(status)}
"
>
${escapeHtml(status)}
</span>
</div>

<div class="request-row-meta">
<span>
${escapeHtml(
request.type
)}
</span>

<span>Â·</span>

<span>
${escapeHtml(
request.requesterDepartmentName
)}
</span>

<span>â†’</span>

<span>
${escapeHtml(
request.receiverDepartmentName
)}
</span>
</div>
</div>

<div class="request-date">
<span>Requested</span>

<strong>
${formatDate(
request.createdAt
)}
</strong>
</div>
</button>
`;
}
).join("")}
</div>
`;
}

function renderDetail(request) {
const permissions =
request.permissions || {};

const status =
displayStatus(request);

return `
<div class="request-detail-content">

<div class="request-detail-title">
<div>
<h2>
${escapeHtml(
request.title
)}
</h2>

<span
class="
status
${statusClass(status)}
"
>
${escapeHtml(status)}
</span>
</div>
</div>

<p class="request-description">
${escapeHtml(
request.description ||
"No description provided."
)}
</p>

<div class="detail-grid">
<div class="detail-item">
<span>Type</span>
<strong>
${escapeHtml(request.type)}
</strong>
</div>

<div class="detail-item">
<span>Requested By</span>
<strong>
${escapeHtml(
request.requestedByName ||
"—"
)}
</strong>
</div>

<div class="detail-item">
<span>From</span>
<strong>
${escapeHtml(
request.requesterDepartmentName
)}
</strong>
</div>

<div class="detail-item">
<span>To</span>
<strong>
${escapeHtml(
request.receiverDepartmentName
)}
</strong>
</div>

<div class="detail-item">
<span>Created</span>
<strong>
${formatDate(
request.createdAt
)}
</strong>
</div>

<div class="detail-item">
<span>Status</span>
<strong>
${escapeHtml(status)}
</strong>
</div>
</div>

${request.approvedByName
? `
<div class="detail-section">
<h3>Approval</h3>

<p class="request-description">
Approved by
<strong>
${escapeHtml(
request.approvedByName
)}
</strong>
on
${formatDate(
request.approvedAt
)}.
</p>
</div>
`
: ""}

${request.rejectionRemarks
? `
<div class="detail-section">
<h3>Rejection Remarks</h3>

<p class="request-description">
${escapeHtml(
request.rejectionRemarks
)}
</p>
</div>
`
: ""}

${request.convertedTaskId
? `
<div class="detail-section">
<h3>Converted Task</h3>

<p class="request-description">
${escapeHtml(
request.convertedTaskId
)}
</p>
</div>
`
: ""}

<div class="detail-section">
<h3>Available Actions</h3>

<div class="request-action-buttons">

${permissions.canApprove
? `
<button
class="button button-secondary"
data-request-action="approve"
>
Approve
</button>
`
: ""}

${permissions.canReject
? `
<button
class="button button-danger-soft"
data-request-action="reject"
>
Reject
</button>
`
: ""}

${permissions.canConvert
? `
<button
class="button button-secondary"
data-request-action="convert"
>
Convert to Task
</button>
`
: ""}

${permissions.canWithdraw
? `
<button
class="button button-danger-soft"
data-request-action="withdraw"
>
Withdraw Request
</button>
`
: ""}

${permissions.canArchive
? `
<button
class="button button-light"
data-request-action="archive"
>
Archive
</button>
`
: ""}

${permissions.canRestore
? `
<button
class="button button-secondary"
data-request-action="restore"
>
Restore
</button>
`
: ""}

${!permissions.canApprove &&
!permissions.canReject &&
!permissions.canConvert &&
!permissions.canWithdraw &&
!permissions.canArchive &&
!permissions.canRestore
? `
<span class="muted">
No actions available.
</span>
`
: ""}
</div>
</div>

</div>
`;
}

export async function renderRequests(
container
) {
container.innerHTML = `
<div class="empty">
Loading requests...
</div>
`;

const response =
await api.get(
"/api/requests"
);

const allRequests =
getRequests(response);

container.innerHTML = `
<section class="page-heading">
<div>
<h1>Requests</h1>

<p>
Coordinate tasks, assistance
and resources across departments.
</p>
</div>

<button
type="button"
class="button button-secondary"
id="new-request-button"
>
+ New Request
</button>
</section>

<section class="requests-layout">

<div class="card requests-panel">

<div class="requests-toolbar">
<input
type="search"
id="request-search"
aria-label="Search requests"
placeholder="Search requests..."
>

<select id="request-status-filter"
aria-label="Filter requests by status">
<option value="">
All statuses
</option>

<option value="Pending">
Pending
</option>

<option value="Approved">
Approved
</option>

<option value="Converted">
Converted
</option>

<option value="Rejected">
Rejected
</option>

<option value="Withdrawn">
Withdrawn
</option>

<option value="Archived">
Archived
</option>
</select>
</div>

<div id="request-list-container">
${renderRows(allRequests)}
</div>

</div>

<aside
class="card request-detail"
id="request-detail"
>
<div class="empty">
Select a request.
</div>
</aside>

</section>
`;

const search =
document.getElementById(
"request-search"
);

const filter =
document.getElementById(
"request-status-filter"
);

const list =
document.getElementById(
"request-list-container"
);

const detail =
document.getElementById(
"request-detail"
);

function refreshList() {
const query =
search.value
.trim()
.toLowerCase();

const status =
filter.value;

const filtered =
allRequests.filter(
(request) => {
const text = [
request.title,
request.type,
request.requestedByName,
request.requesterDepartmentName,
request.receiverDepartmentName,
]
.join(" ")
.toLowerCase();

const matchSearch =
!query ||
text.includes(query);

const matchStatus =
!status ||
displayStatus(request) ===
status;

return (
matchSearch &&
matchStatus
);
}
);

list.innerHTML =
renderRows(filtered);
}

async function openRequest(id) {
document
.querySelectorAll(
".request-row"
)
.forEach(
(row) =>
row.classList.toggle(
"selected",
row.dataset.requestId ===
id
)
);

detail.innerHTML = `
<div class="empty">
Loading request...
</div>
`;

const response =
await api.get(
`/api/requests/${encodeURIComponent(id)}`
);

const request =
response.request ||
response;

detail.innerHTML =
renderDetail(request);

const refreshRequests =
async () => {
await renderRequests(
container
);
};

detail
.querySelector(
'[data-request-action="approve"]'
)
?.addEventListener(
"click",
() =>
approveRequestAction(
request,
refreshRequests
)
);

detail
.querySelector(
'[data-request-action="reject"]'
)
?.addEventListener(
"click",
() =>
openRejectRequest(
request,
refreshRequests
)
);

detail
.querySelector(
'[data-request-action="convert"]'
)
?.addEventListener(
"click",
() =>
openConvertRequest(
request,
refreshRequests
)
);

detail
.querySelector(
'[data-request-action="withdraw"]'
)
?.addEventListener(
"click",
() =>
withdrawRequestAction(
request,
refreshRequests
)
);

detail
.querySelector(
'[data-request-action="archive"]'
)
?.addEventListener(
"click",
() =>
archiveRequestAction(
request,
refreshRequests
)
);

detail
.querySelector(
'[data-request-action="restore"]'
)
?.addEventListener(
"click",
() =>
restoreRequestAction(
request,
refreshRequests
)
);
}

search.addEventListener(
"input",
refreshList
);

filter.addEventListener(
"change",
refreshList
);

list.addEventListener(
"click",
async (event) => {
const row =
event.target.closest(
"[data-request-id]"
);

if (!row) return;

await openRequest(
row.dataset.requestId
);
}
);

document
.getElementById(
"new-request-button"
)
?.addEventListener(
"click",
() =>
openCreateRequest(
async () => {
await renderRequests(
container
);
}
)
);

if (allRequests.length) {
await openRequest(
allRequests[0].id
);
}
}






