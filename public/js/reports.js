import { api } from "./api.js";

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function reportValue(response) {
return response?.report ?? response;
}

function formatDate(value) {
if (!value) return "—";

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
return String(value);
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
return String(value || "")
.replaceAll("_", " ")
.toLowerCase()
.replace(
/\b\w/g,
(character) =>
character.toUpperCase()
);
}

function clampPercent(value) {
const number =
Number(value || 0);

return Math.min(
100,
Math.max(0, number)
);
}

function renderStatCard(
label,
value,
note
) {
return `
<div class="report-stat-card">
<span>${escapeHtml(label)}</span>

<strong>
${escapeHtml(value)}
</strong>

<small>
${escapeHtml(note)}
</small>
</div>
`;
}

function renderTaskStatuses(report) {
const statuses = [
["Created", report.created],
["Assigned", report.assigned],
["Ongoing", report.ongoing],
["For Review", report.forReview],
["Approved", report.approved],
["Completed", report.completed],
["Archived", report.archived],
];

return `
<div class="report-status-grid">
${statuses.map(
([label, value]) => `
<div class="report-status-item">
<span>
${escapeHtml(label)}
</span>

<strong>
${Number(value || 0)}
</strong>
</div>
`
).join("")}
</div>
`;
}

function renderProjects(projects) {
if (!projects.length) {
return `
<div class="empty">
No projects available.
</div>
`;
}

return `
<div class="report-project-list">
${projects.map(
(project) => {
const progress =
clampPercent(
project.progress
);

return `
<div class="report-project-row">
<div class="report-project-head">
<div>
<strong>
${escapeHtml(
project.name
)}
</strong>

<span>
${escapeHtml(
project.type
)}
·
${escapeHtml(
project.status
)}
</span>
</div>

<strong>
${progress}%
</strong>
</div>

<div class="report-progress-track">
<div
class="report-progress-fill"
style="width:${progress}%"
></div>
</div>

<div class="report-project-meta">
<span>
${Number(
project.taskCount || 0
)}
tasks
</span>

<span>
${Number(
project.ongoingTaskCount || 0
)}
ongoing
</span>

<span>
${Number(
project.forReviewTaskCount || 0
)}
for review
</span>

<span>
${Number(
project.completedTaskCount || 0
)}
completed
</span>
</div>
</div>
`;
}
).join("")}
</div>
`;
}

function renderDepartmentWorkload(
departments
) {
if (!departments.length) {
return `
<div class="empty">
No department data available.
</div>
`;
}

return `
<div class="report-table-wrap">
<table class="report-table">
<thead>
<tr>
<th>Department</th>
<th>Users</th>
<th>Projects</th>
<th>Tasks</th>
<th>Assigned</th>
<th>Ongoing</th>
<th>Review</th>
<th>Completed</th>
</tr>
</thead>

<tbody>
${departments.map(
(department) => `
<tr>
<td>
<strong>
${escapeHtml(
department.name
)}
</strong>
</td>

<td>
${Number(
department.activeUsers || 0
)}
</td>

<td>
${Number(
department.activeProjects || 0
)}
</td>

<td>
${Number(
department.taskCount || 0
)}
</td>

<td>
${Number(
department.assignedTasks || 0
)}
</td>

<td>
${Number(
department.ongoingTasks || 0
)}
</td>

<td>
${Number(
department.forReviewTasks || 0
)}
</td>

<td>
${Number(
department.completedTasks || 0
)}
</td>

</tr>
`
).join("")}
</tbody>
</table>
</div>
`;
}

function renderRequestOutcomes(report) {
const total =
Number(report.total || 0);

const statuses = [
["Pending", report.pending],
["Approved", report.approved],
["Converted", report.converted],
["Rejected", report.rejected],
["Archived", report.archived],
];

return `
<div class="request-outcome-list">

${statuses.map(
([label, value]) => {
const count =
Number(value || 0);

const percent =
total
? Math.round(
(count / total) *
100
)
: 0;

return `
<div class="request-outcome-row">
<div class="request-outcome-head">
<span>
${escapeHtml(label)}
</span>

<strong>
${count}
</strong>
</div>

<div class="report-progress-track">
<div
class="report-progress-fill"
style="width:${percent}%"
></div>
</div>
</div>
`;
}
).join("")}

</div>
`;
}

function renderActivity(activity) {
if (!activity.length) {
return `
<div class="empty">
No recent activity.
</div>
`;
}

return `
<div class="report-activity-list">

${activity.slice(0, 30).map(
(item) => `
<div class="report-activity-row">

<div class="report-activity-marker"></div>

<div class="report-activity-content">
<div class="report-activity-head">
<strong>
${escapeHtml(
actionLabel(
item.action
)
)}
</strong>

<time>
${formatDate(
item.occurredAt
)}
</time>
</div>

<p>
${escapeHtml(
item.actorName ||
"Unknown user"
)}

<span>
${escapeHtml(
item.actorRole ||
""
)}
</span>
</p>

${
item.referenceType &&
item.referenceId
? `
<button
type="button"
class="report-reference-button"
data-report-reference-type="${escapeHtml(
item.referenceType
)}"
data-report-reference-id="${escapeHtml(
item.referenceId
)}"
>
${escapeHtml(
item.referenceType
)}
·
View record
</button>
`
: ""
}
</div>

</div>
`
).join("")}

</div>
`;
}

function renderDetailedReportSection(detailed) {
if (!detailed) return "";
const rows = Array.isArray(detailed.rows) ? detailed.rows : [];
return `
<div class="report-card-header">
<div>
<h2>Detailed Task Records Report</h2>
<p>Filtered operational task records (excluding archived tasks unless explicitly filtered).</p>
</div>
<span class="muted">${Number(detailed.totalCount || 0)} record${Number(detailed.totalCount || 0) === 1 ? "" : "s"}</span>
</div>
${rows.length ? `
<div class="report-table-wrap">
<table class="report-table">
<thead>
<tr>
<th>Task</th>
<th>Department</th>
<th>Context</th>
<th>Status</th>
<th>Priority</th>
<th>Created</th>
<th>Deadline</th>
<th>Assignee</th>
</tr>
</thead>
<tbody>
${rows.map((r) => `
<tr>
<td><strong>${escapeHtml(r.title)}</strong></td>
<td>${escapeHtml(r.departmentName)}</td>
<td>${escapeHtml(r.eventName ? `Event: ${r.eventName}` : r.projectName ? `Project: ${r.projectName}` : "Independent")}</td>
<td><span class="status ${escapeHtml(String(r.status || "").toLowerCase().replaceAll(" ", "-"))}">${escapeHtml(r.status)}</span></td>
<td>${escapeHtml(r.priority)}</td>
<td>${escapeHtml(String(r.createdAt || "").slice(0, 10))}</td>
<td>${escapeHtml(r.deadline || "—")}</td>
<td>${escapeHtml(r.assigneeName || "Unassigned")}</td>
</tr>
`).join("")}
</tbody>
</table>
</div>
` : `<div class="empty">No task records match the selected filters.</div>`}
`;
}

function renderSummaryReportSection(summary) {
if (!summary) return "";
const depts = Array.isArray(summary.departments) ? summary.departments : [];
const totals = summary.totals || {};
const excl = summary.exclusions || {};
return `
<div class="report-card-header">
<div>
<h2>Grouped Summary Report (Drafts &amp; Archived Excluded)</h2>
<p>Department-level grouped task totals excluding Archived tasks and Draft projects/events.</p>
</div>
<span class="muted">Excluded: ${Number(excl.excludedArchivedTasks || 0)} archived tasks · ${Number(excl.excludedDraftProjects || 0)} draft projects · ${Number(excl.excludedDraftEvents || 0)} draft events</span>
</div>
<div class="report-table-wrap">
<table class="report-table">
<thead>
<tr>
<th>Department</th>
<th>Total (Non-Archived)</th>
<th>Created</th>
<th>Active (Assigned–Approved)</th>
<th>Completed</th>
<th>Avg Progress</th>
</tr>
</thead>
<tbody>
${depts.map((d) => `
<tr>
<td><strong>${escapeHtml(d.departmentName)}</strong>${d.departmentStatus === "Inactive" ? ` <span class="muted">(Inactive)</span>` : ""}</td>
<td>${Number(d.totalTasks || 0)}</td>
<td>${Number(d.createdTasks || 0)}</td>
<td>${Number(d.activeTasks || 0)}</td>
<td>${Number(d.completedTasks || 0)}</td>
<td>${Number(d.avgProgress || 0)}%</td>
</tr>
`).join("")}
<tr>
<td><strong>Organization Total</strong></td>
<td><strong>${Number(totals.totalTasks || 0)}</strong></td>
<td><strong>${Number(totals.createdTasks || 0)}</strong></td>
<td><strong>${Number(totals.activeTasks || 0)}</strong></td>
<td><strong>${Number(totals.completedTasks || 0)}</strong></td>
<td>—</td>
</tr>
</tbody>
</table>
</div>
`;
}

function renderExceptionReportSection(exc) {
if (!exc) return "";
const overdue = Array.isArray(exc.overdueTasks) ? exc.overdueTasks : [];
const unassigned = Array.isArray(exc.unassignedPriorityTasks) ? exc.unassignedPriorityTasks : [];
const issues = Array.isArray(exc.unresolvedHighEventIssues) ? exc.unresolvedHighEventIssues : [];
return `
<div class="report-card-header">
<div>
<h2>Exception Report</h2>
<p>Actionable operational exceptions as of <strong>${escapeHtml(exc.asOfDate)}</strong>.</p>
</div>
<span class="muted">${overdue.length} overdue · ${unassigned.length} unassigned high/critical · ${issues.length} high/urgent event issues</span>
</div>
<div style="display:grid;gap:14px;">
<div>
<h3 style="margin:0 0 6px;font-size:15px;">Overdue Incomplete Tasks (${overdue.length})</h3>
${overdue.length ? `
<div class="report-table-wrap">
<table class="report-table">
<thead><tr><th>Task</th><th>Department</th><th>Priority</th><th>Status</th><th>Deadline</th><th>Assignee</th></tr></thead>
<tbody>
${overdue.map((t) => `<tr><td><strong>${escapeHtml(t.title)}</strong></td><td>${escapeHtml(t.departmentName)}</td><td>${escapeHtml(t.priority)}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.deadline)}</td><td>${escapeHtml(t.assigneeName || "Unassigned")}</td></tr>`).join("")}
</tbody>
</table>
</div>` : `<div class="empty">No overdue incomplete tasks as of ${escapeHtml(exc.asOfDate)}.</div>`}
</div>
<div>
<h3 style="margin:0 0 6px;font-size:15px;">Unassigned High / Critical Tasks (${unassigned.length})</h3>
${unassigned.length ? `
<div class="report-table-wrap">
<table class="report-table">
<thead><tr><th>Task</th><th>Department</th><th>Priority</th><th>Deadline</th></tr></thead>
<tbody>
${unassigned.map((t) => `<tr><td><strong>${escapeHtml(t.title)}</strong></td><td>${escapeHtml(t.departmentName)}</td><td>${escapeHtml(t.priority)}</td><td>${escapeHtml(t.deadline || "—")}</td></tr>`).join("")}
</tbody>
</table>
</div>` : `<div class="empty">No unassigned High or Critical tasks.</div>`}
</div>
<div>
<h3 style="margin:0 0 6px;font-size:15px;">Unresolved High / Urgent Event Issues (${issues.length})</h3>
${issues.length ? `
<div class="report-table-wrap">
<table class="report-table">
<thead><tr><th>Event</th><th>Issue</th><th>Severity</th><th>Status</th><th>Due</th></tr></thead>
<tbody>
${issues.map((i) => `<tr><td><strong>${escapeHtml(i.eventName)}</strong></td><td>${escapeHtml(i.title)}</td><td>${escapeHtml(i.severity)}</td><td>${escapeHtml(i.status)}</td><td>${escapeHtml(i.dueAt || "—")}</td></tr>`).join("")}
</tbody>
</table>
</div>` : `<div class="empty">No unresolved High or Urgent event issues.</div>`}
</div>
</div>
`;
}

function renderDataMartSection(dm) {
if (!dm) return "";
const rec = dm.reconciliation || {};
const rows = Array.isArray(dm.monthlyRows) ? dm.monthlyRows : [];
const run = dm.latestRun;
const reconciledBadge = rec.reconciled
? `<span class="status approved" data-dm-reconciled="true">RECONCILED (Mart == OLTP: ${Number(rec.martTotalTaskCount || 0)})</span>`
: rec.dimensionsSynced === false && Number(rec.martTotalTaskCount || 0) === Number(rec.oltpNonArchivedTaskCount || 0)
? `<span class="status rejected" data-dm-reconciled="false">NEEDS ETL REFRESH (Department dimensions changed — Run ETL Load)</span>`
: `<span class="status rejected" data-dm-reconciled="false">NEEDS ETL REFRESH (Mart ${Number(rec.martTotalTaskCount || 0)} vs OLTP ${Number(rec.oltpNonArchivedTaskCount || 0)})</span>`;
return `
<div class="report-card-header">
<div>
<h2>Operations Analytics Data Mart (Star Schema &amp; ETL)</h2>
<p>Monthly department fact table (<code>dm_fact_department_monthly_tasks</code>) reconciled against non-archived OLTP tasks.</p>
</div>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
${reconciledBadge}
<button type="button" class="button button-primary" id="run-datamart-etl-button">Run ETL Load &amp; Reconcile</button>
</div>
</div>
<div style="margin-bottom:12px;font-size:13px;" class="muted">
${run ? `Last ETL Run: <strong>${escapeHtml(formatDate(run.completedAt))}</strong> by ${escapeHtml(run.triggeredByName || run.triggeredBy)} · Source OLTP Non-Archived: <strong>${Number(rec.oltpNonArchivedTaskCount || 0)}</strong> · Mart Total: <strong>${Number(rec.martTotalTaskCount || 0)}</strong> · Excluded Archived: <strong>${Number(rec.excludedArchivedTaskCount || 0)}</strong>` : "No ETL run recorded yet. Click Run ETL Load & Reconcile to populate the star schema."}
</div>
${rows.length ? `
<div class="report-table-wrap">
<table class="report-table">
<thead>
<tr>
<th>Month</th>
<th>Quarter</th>
<th>Department</th>
<th>Open / Active (Created–Approved)</th>
<th>Completed Tasks</th>
<th>Overdue Tasks</th>
<th>Avg Progress</th>
</tr>
</thead>
<tbody>
${rows.map((r) => `
<tr>
<td><strong>${escapeHtml(r.monthLabel)}</strong> (<code>${escapeHtml(r.monthKey)}</code>)</td>
<td>Q${Number(r.quarter)} ${Number(r.year)}</td>
<td>${escapeHtml(r.departmentName)}</td>
<td>${Number(r.activeTaskCount || 0)}</td>
<td>${Number(r.completedTaskCount || 0)}</td>
<td>${Number(r.overdueTaskCount || 0)}</td>
<td>${Number(r.avgProgress || 0)}%</td>
</tr>
`).join("")}
</tbody>
</table>
</div>
` : `<div class="empty">Data Mart fact table is empty. Run ETL Load &amp; Reconcile to populate monthly metrics.</div>`}
`;
}

export async function renderReports(
container
) {
container.innerHTML = `
<div class="empty">
Loading reports...
</div>
`;

try {
const [
taskResponse,
projectResponse,
departmentResponse,
activityResponse,
] = await Promise.all([
api.get(
"/api/reports/task-status"
),

api.get(
"/api/reports/project-progress"
),

api.get(
"/api/reports/department-workload"
),

api.get(
"/api/reports/activity"
),
]);

const taskReport =
reportValue(taskResponse) || {};

const projects =
Array.isArray(
reportValue(
projectResponse
)
)
? reportValue(
projectResponse
)
: [];

const departments =
Array.isArray(
reportValue(
departmentResponse
)
)
? reportValue(
departmentResponse
)
: [];

const activity =
Array.isArray(
reportValue(
activityResponse
)
)
? reportValue(
activityResponse
)
: [];

const activeProjects =
projects.filter(
(project) =>
project.status ===
"Active"
).length;

const activeUsers =
departments.reduce(
(total, department) =>
total +
Number(
department.activeUsers ||
0
),
0
);

container.innerHTML = `
<section class="page-heading">
<div>
<h1>Reports</h1>

<p>
Organization performance,
workload and activity overview.
</p>
</div>

<button
type="button"
class="button button-light"
id="refresh-reports-button"
>
Refresh
</button>
</section>

<section class="report-stat-grid">

${renderStatCard(
"Total Tasks",
Number(
taskReport.total || 0
),
"Across visible scope"
)}

${renderStatCard(
"Active Projects",
activeProjects,
`${projects.length} total projects`
)}

${renderStatCard(
"Active Users",
activeUsers,
`${departments.length} departments`
)}


</section>

<section class="reports-grid">

<div class="card report-card">
<div class="report-card-header">
<div>
<h2>Task Status</h2>

<p>
Current task distribution.
</p>
</div>
</div>

${renderTaskStatuses(
taskReport
)}
</div>


</section>

<section class="card report-card">
<div class="report-card-header">
<div>
<h2>Project Progress</h2>

<p>
Task completion across projects.
</p>
</div>
</div>

${renderProjects(
projects
)}
</section>

<section class="card report-card">
<div class="report-card-header">
<div>
<h2>Department Workload</h2>

<p>
Users, projects and task workloads
by department.
</p>
</div>
</div>

${renderDepartmentWorkload(
departments
)}
</section>

<section class="card report-card">
<div class="report-card-header">
<div>
<h2>Recent Activity</h2>

<p>
Latest recorded organization actions.
</p>
</div>

<span class="muted">
Showing latest
${Math.min(
30,
activity.length
)}
</span>
</div>

${renderActivity(
activity
)}
</section>
`;

container
.querySelector(
"#refresh-reports-button"
)
?.addEventListener(
"click",
() =>
renderReports(
container
)
);

container.addEventListener(
"click",
(event) => {
const button =
event.target.closest(
"[data-report-reference-type]"
);

if (!button) return;

const type =
button.dataset
.reportReferenceType;

const id =
button.dataset
.reportReferenceId;

sessionStorage.setItem(
"omsNotificationReference",
JSON.stringify({
type,
id,
})
);

switch (type) {
case "TASK":
location.hash =
"#tasks";
break;

case "PROJECT":
location.hash =
"#projects";
break;

}
}
);
try {
 const m3=await api.get('/api/m3/summary');
 const section=document.createElement('section');section.className='card m3-report-summary';
 section.innerHTML=`<h2>Event and Announcement Operations</h2><div class="m3-report-stats">
 ${[['Pending event approvals',m3.pendingEventApprovals],['Unresolved event issues',m3.unresolvedEventIssues],['Pending appointments',m3.pendingAppointments],['Event closures awaiting action',m3.awaitingEventClosure],['Unread announcements',m3.unreadAnnouncements]].map(([label,count])=>`<div class="event-info"><small>${escapeHtml(label)}</small><strong>${Number(count)||0}</strong></div>`).join('')}</div>`;
 container.appendChild(section);
} catch(error) {console.warn('Event report summary unavailable',error.code||error.message);}

try {
 const _now = new Date();
 const todayIso = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
 const filterState = { startDate: "", endDate: "", departmentId: "", asOfDate: todayIso };
 const deptResp = await api.get("/api/departments").catch(() => ({ departments: [] }));
 const deptList = Array.isArray(deptResp?.departments) ? deptResp.departments : [];

 const filterCard = document.createElement("section");
 filterCard.className = "card report-card";
 filterCard.innerHTML = `
  <div class="report-card-header">
   <div>
    <h2>Report Filters (Detailed, Summary &amp; Exception)</h2>
    <p>Filter records by creation date range, department, and exception cutoff date.</p>
   </div>
  </div>
  <form id="cs213-report-filters" class="form-grid" style="align-items:end;">
   <label class="form-field"><span>Start Date</span><input type="date" name="startDate" value=""></label>
   <label class="form-field"><span>End Date</span><input type="date" name="endDate" value=""></label>
   <label class="form-field"><span>Department</span>
    <select name="departmentId">
     <option value="">All Departments</option>
     ${deptList.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("")}
    </select>
   </label>
   <label class="form-field"><span>Exception As-Of Date</span><input type="date" name="asOfDate" value="${escapeHtml(todayIso)}"></label>
   <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <button type="submit" class="button button-primary" id="apply-report-filters-btn">Apply Filters</button>
    <button type="button" class="button button-light" id="reset-report-filters-btn">Reset</button>
   </div>
  </form>
 `;

 const detailedCard = document.createElement("section");
 detailedCard.className = "card report-card";
 const summaryCard = document.createElement("section");
 summaryCard.className = "card report-card";
 const exceptionCard = document.createElement("section");
 exceptionCard.className = "card report-card";
 const dataMartCard = document.createElement("section");
 dataMartCard.className = "card report-card";

 container.append(filterCard, detailedCard, summaryCard, exceptionCard, dataMartCard);

 async function loadFilteredAnalytics() {
  const qsDet = new URLSearchParams();
  if (filterState.startDate) qsDet.set("startDate", filterState.startDate);
  if (filterState.endDate) qsDet.set("endDate", filterState.endDate);
  if (filterState.departmentId) qsDet.set("departmentId", filterState.departmentId);

  const qsSum = new URLSearchParams();
  if (filterState.startDate) qsSum.set("startDate", filterState.startDate);
  if (filterState.endDate) qsSum.set("endDate", filterState.endDate);

  const qsExc = new URLSearchParams();
  if (filterState.asOfDate) qsExc.set("asOfDate", filterState.asOfDate);

  const [detRes, sumRes, excRes, dmRes] = await Promise.all([
   api.get(`/api/reports/detailed?${qsDet.toString()}`),
   api.get(`/api/reports/summary?${qsSum.toString()}`),
   api.get(`/api/reports/exceptions?${qsExc.toString()}`),
   api.get("/api/reports/datamart"),
  ]);

  detailedCard.innerHTML = renderDetailedReportSection(reportValue(detRes));
  summaryCard.innerHTML = renderSummaryReportSection(reportValue(sumRes));
  exceptionCard.innerHTML = renderExceptionReportSection(reportValue(excRes));
  dataMartCard.innerHTML = renderDataMartSection(reportValue(dmRes));

  dataMartCard.querySelector("#run-datamart-etl-button")?.addEventListener("click", async (ev) => {
   const btn = ev.currentTarget;
   btn.disabled = true;
   try {
    await api.post("/api/reports/datamart/load", { asOfDate: filterState.asOfDate });
    await loadFilteredAnalytics();
   } catch (err) {
    console.warn("Data Mart ETL load failed:", err?.message || err);
   } finally {
    btn.disabled = false;
   }
  });
 }

 const form = filterCard.querySelector("#cs213-report-filters");
 form?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(form);
  filterState.startDate = String(fd.get("startDate") || "");
  filterState.endDate = String(fd.get("endDate") || "");
  filterState.departmentId = String(fd.get("departmentId") || "");
  filterState.asOfDate = String(fd.get("asOfDate") || todayIso);
  await loadFilteredAnalytics();
 });
 filterCard.querySelector("#reset-report-filters-btn")?.addEventListener("click", async () => {
  form.reset();
  form.elements.namedItem("asOfDate").value = todayIso;
  filterState.startDate = "";
  filterState.endDate = "";
  filterState.departmentId = "";
  filterState.asOfDate = todayIso;
  await loadFilteredAnalytics();
 });

 await loadFilteredAnalytics();
} catch (error) {
 console.warn("CS213 extended analytics unavailable", error?.code || error?.message);
}
}
catch (error) {
container.innerHTML = `
<section class="page-heading">
<div>
<h1>Reports</h1>

<p>
Organization performance
and analytics.
</p>
</div>
</section>

<div class="card report-access-error">
<h2>
Reports unavailable
</h2>

<p>
${escapeHtml(
error.message ||
"You do not have permission to view reports."
)}
</p>
</div>
`;
}
}

