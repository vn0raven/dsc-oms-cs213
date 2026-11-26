import {
api,
} from "./api.js";

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function formatDate(value) {
if (!value) return "—";

const date =
new Date(value);

if (
Number.isNaN(
date.getTime()
)
) {
return value;
}

return date.toLocaleString(
undefined,
{
year: "numeric",
month: "short",
day: "numeric",
hour: "numeric",
minute: "2-digit",
}
);
}

function actionLabel(value) {
return String(value || "Unknown action")
.replaceAll("_", " ")
.replace(/\b\w/g, (character) =>
character.toUpperCase()
);
}

function referenceLabel(value) {
const labels = {
USER: "Member",
PROJECT: "Project",
TASK: "Task",
REQUEST: "Request",
DEPARTMENT: "Department",
NOTIFICATION: "Notification",
};

return labels[value] || value || "—";
}

function parseStoredValue(value) {
if (
value === null ||
value === undefined ||
value === ""
) {
return "—";
}

try {
const parsed =
JSON.parse(value);

if (
typeof parsed === "object" &&
parsed !== null
) {
return JSON.stringify(
parsed,
null,
2
);
}

return String(parsed);
}
catch {
return String(value);
}
}

function renderRows(items) {
if (!items.length) {
return `
<div class="audit-empty">
<div class="audit-empty-icon">
⌕
</div>

<strong>
No audit events match these filters.
</strong>

<span>
Try changing the user, action or date range.
</span>
</div>
`;
}

return `
<div class="audit-table-wrap">
<table class="audit-table">
<thead>
<tr>
<th>Date / Time</th>
<th>User</th>
<th>Action</th>
<th>Reference</th>
<th>Changes</th>
</tr>
</thead>

<tbody>
${items.map(
(item) => `
<tr>
<td>
<div class="audit-date">
${escapeHtml(
formatDate(
item.occurredAt
)
)}
</div>
</td>

<td>
<div class="audit-user">
<strong>
${escapeHtml(
item.actorName ||
"Unknown user"
)}
</strong>

<span>
${escapeHtml(
item.actorRole || ""
)}
</span>
</div>
</td>

<td>
<span class="audit-action">
${escapeHtml(
actionLabel(
item.action
)
)}
</span>
</td>

<td>
<div class="audit-reference">
<strong>
${escapeHtml(
referenceLabel(
item.referenceType
)
)}
</strong>

<span>
${escapeHtml(
item.referenceId ||
"—"
)}
</span>
</div>
</td>

<td>
<button
type="button"
class="audit-details-button"
data-audit-details="${escapeHtml(
item.id
)}"
>
View
</button>
</td>
</tr>

<tr
class="audit-details-row"
data-audit-details-row="${escapeHtml(
item.id
)}"
hidden
>
<td colspan="5">
<div class="audit-change-grid">

<div>
<span>Previous value</span>

<pre>${escapeHtml(
parseStoredValue(
item.oldValue
)
)}</pre>
</div>

<div>
<span>New value</span>

<pre>${escapeHtml(
parseStoredValue(
item.newValue
)
)}</pre>
</div>

</div>
</td>
</tr>
`
).join("")}
</tbody>
</table>
</div>
`;
}

export async function renderAuditLog(
container
) {
container.innerHTML = `
<div class="empty">
Loading audit log...
</div>
`;

try {
const response =
await api.get(
"/api/reports/activity?limit=200"
);

const activity =
Array.isArray(response)
? response
: Array.isArray(
response.report
)
? response.report
: [];

const users =
[
...new Set(
activity
.map(
(item) =>
item.actorName
)
.filter(Boolean)
)
].sort(
(a, b) =>
a.localeCompare(b)
);

const actions =
[
...new Set(
activity
.map(
(item) =>
item.action
)
.filter(Boolean)
)
].sort(
(a, b) =>
a.localeCompare(b)
);

const referenceTypes =
[
...new Set(
activity
.map(
(item) =>
item.referenceType
)
.filter(Boolean)
)
].sort();

container.innerHTML = `
<section class="page-heading">
<div>
<h1>Audit Log</h1>

<p>
Administrative and organization activity history.
</p>
</div>

<button
type="button"
class="button button-light"
id="refresh-audit-button"
>
Refresh
</button>
</section>

<section class="card audit-summary">
<div>
<span>Loaded Events</span>
<strong>
${activity.length}
</strong>
</div>

<div>
<span>Unique Users</span>
<strong>
${users.length}
</strong>
</div>

<div>
<span>Action Types</span>
<strong>
${actions.length}
</strong>
</div>

<div>
<span>Data Range</span>
<strong>
Latest 200
</strong>
</div>
</section>

<section class="card audit-filter-card">
<div class="audit-filter-grid">

<label>
<span>User</span>

<select
id="audit-user-filter"
>
<option value="">
All users
</option>

${users.map(
(user) => `
<option
value="${escapeHtml(user)}"
>
${escapeHtml(user)}
</option>
`
).join("")}
</select>
</label>

<label>
<span>Action</span>

<select
id="audit-action-filter"
>
<option value="">
All actions
</option>

${actions.map(
(action) => `
<option
value="${escapeHtml(action)}"
>
${escapeHtml(
actionLabel(action)
)}
</option>
`
).join("")}
</select>
</label>

<label>
<span>Reference</span>

<select
id="audit-reference-filter"
>
<option value="">
All types
</option>

${referenceTypes.map(
(type) => `
<option
value="${escapeHtml(type)}"
>
${escapeHtml(
referenceLabel(type)
)}
</option>
`
).join("")}
</select>
</label>

<label>
<span>From</span>

<input
type="date"
id="audit-date-from"
>
</label>

<label>
<span>To</span>

<input
type="date"
id="audit-date-to"
>
</label>

<div class="audit-filter-actions">
<button
type="button"
class="button button-light"
id="audit-clear-filters"
>
Clear Filters
</button>
</div>

</div>
</section>

<section class="card audit-log-card">
<div class="audit-log-header">
<div>
<h2>Activity History</h2>

<p id="audit-result-count">
${activity.length}
events
</p>
</div>
</div>

<div id="audit-results">
${renderRows(activity)}
</div>
</section>
`;

const userFilter =
container.querySelector(
"#audit-user-filter"
);

const actionFilter =
container.querySelector(
"#audit-action-filter"
);

const referenceFilter =
container.querySelector(
"#audit-reference-filter"
);

const dateFrom =
container.querySelector(
"#audit-date-from"
);

const dateTo =
container.querySelector(
"#audit-date-to"
);

const results =
container.querySelector(
"#audit-results"
);

const resultCount =
container.querySelector(
"#audit-result-count"
);

function applyFilters() {
const user =
userFilter.value;

const action =
actionFilter.value;

const reference =
referenceFilter.value;

const from =
dateFrom.value
? new Date(
`${dateFrom.value}T00:00:00`
)
: null;

const to =
dateTo.value
? new Date(
`${dateTo.value}T23:59:59.999`
)
: null;

const filtered =
activity.filter(
(item) => {
if (
user &&
item.actorName !== user
) {
return false;
}

if (
action &&
item.action !== action
) {
return false;
}

if (
reference &&
item.referenceType !==
reference
) {
return false;
}

const timestamp =
new Date(
item.occurredAt
);

if (
from &&
timestamp < from
) {
return false;
}

if (
to &&
timestamp > to
) {
return false;
}

return true;
}
);

resultCount.textContent =
`${filtered.length} event${
filtered.length === 1
? ""
: "s"
}`;

results.innerHTML =
renderRows(filtered);
}

[
userFilter,
actionFilter,
referenceFilter,
dateFrom,
dateTo,
].forEach(
(control) => {
control.addEventListener(
"change",
applyFilters
);
}
);

container
.querySelector(
"#audit-clear-filters"
)
?.addEventListener(
"click",
() => {
userFilter.value = "";
actionFilter.value = "";
referenceFilter.value = "";
dateFrom.value = "";
dateTo.value = "";

applyFilters();
}
);

container
.querySelector(
"#refresh-audit-button"
)
?.addEventListener(
"click",
() =>
renderAuditLog(
container
)
);

container.addEventListener(
"click",
(event) => {
const button =
event.target.closest(
"[data-audit-details]"
);

if (!button) return;

const id =
button.dataset.auditDetails;

const row =
container.querySelector(
`[data-audit-details-row="${CSS.escape(
id
)}"]`
);

if (!row) return;

const opening =
row.hidden;

row.hidden =
!opening;

button.textContent =
opening
? "Hide"
: "View";
}
);
}
catch (error) {
container.innerHTML = `
<section class="card">
<div class="empty">
<strong>
Unable to load audit log.
</strong>

<p>
${escapeHtml(
error.message ||
"Unknown error."
)}
</p>
</div>
</section>
`;
}
}
