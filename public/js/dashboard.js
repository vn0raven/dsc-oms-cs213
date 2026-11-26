import {
api,
} from "./api.js";

function escapeHtml(value) {
return String(
value ?? ""
)
.replaceAll(
"&",
"&amp;"
)
.replaceAll(
"<",
"&lt;"
)
.replaceAll(
">",
"&gt;"
)
.replaceAll(
'"',
"&quot;"
)
.replaceAll(
"'",
"&#039;"
);
}

function statusClass(
status
) {
return String(status)
.toLowerCase()
.replaceAll(
" ",
"-"
);
}

function renderTasks(
tasks
) {
if (!tasks.length) {
return `
<div class="empty">
No recent tasks.
</div>
`;
}

return `
<div class="table-wrap">
<table class="data-table dashboard-task-table">
<thead>
<tr>
<th>Task</th>
<th>Department</th>
<th>Status</th>
<th>Progress</th>
</tr>
</thead>

<tbody>
${tasks.map(
(task) => `
<tr
class="dashboard-link-row"
data-dashboard-reference="TASK"
data-dashboard-id="${escapeHtml(task.id)}"
>
<td>
<div class="primary-text">
${escapeHtml(task.title)}
</div>

<div class="secondary-text">
${escapeHtml(task.priority)}
</div>
</td>

<td>
${escapeHtml(
task.departmentName
)}
</td>

<td>
<span
class="
status
${statusClass(task.status)}
"
>
${escapeHtml(task.status)}
</span>
</td>

<td>
<div class="progress">
<div
class="progress-bar"
style="
width:
${Number(
task.progress || 0
)}%
"
></div>
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

function renderRequests(
requests
) {
if (!requests.length) {
return `
<div class="empty">
No recent requests.
</div>
`;
}

return `
<div class="table-wrap">
<table class="data-table">
<thead>
<tr>
<th>Request</th>
<th>Status</th>
</tr>
</thead>

<tbody>
${requests.map(
(request) => `
<tr
class="dashboard-link-row"
data-dashboard-reference="REQUEST"
data-dashboard-id="${escapeHtml(request.id)}"
>
<td>
<div class="primary-text">
${escapeHtml(
request.title
)}
</div>

<div class="secondary-text">
${escapeHtml(
request.receiverDepartmentName
)}
</div>
</td>

<td>
<span
class="
status
${statusClass(
request.status
)}
"
>
${escapeHtml(
request.status
)}
</span>
</td>
</tr>
`
).join("")}
</tbody>
</table>
</div>
`;
}

export async function renderDashboard(
container
) {
container.innerHTML = `
<div class="empty">
Loading dashboard...
</div>
`;

const response =
await api.get(
"/api/dashboard"
);

const dashboard =
response.dashboard;

const summary =
dashboard.summary;

/* OMS_EMPTY_DASHBOARD_ONBOARDING */

const isEmptyDashboard =
Number(summary.projects?.total || 0) === 0 &&
Number(summary.tasks?.total || 0) === 0 &&
true;

container.innerHTML = `

${isEmptyDashboard
? `
<section class="card dashboard-onboarding">
<div class="dashboard-onboarding-copy">

<span class="dashboard-onboarding-eyebrow">
Getting Started
</span>

<h2>
Welcome to DSC OMS
</h2>

<p>
Start organizing your team's work in three simple steps.
</p>

</div>

<div class="dashboard-onboarding-steps">

<button
type="button"
class="dashboard-onboarding-step"
data-onboarding-page="projects"
>
<span class="dashboard-onboarding-number">
1
</span>

<div>
<strong>Create a project</strong>
<span>
Set up the work your organization needs to accomplish.
</span>
</div>

<span class="dashboard-onboarding-arrow">
→
</span>
</button>

<button
type="button"
class="dashboard-onboarding-step"
data-onboarding-page="tasks"
>
<span class="dashboard-onboarding-number">
2
</span>

<div>
<strong>Add tasks</strong>
<span>
Assign responsibilities and track progress.
</span>
</div>

<span class="dashboard-onboarding-arrow">
→
</span>
</button>

<button
type="button"
class="dashboard-onboarding-step"
data-onboarding-page="events"
>
<span class="dashboard-onboarding-number">
3
</span>

<div>
<strong>Plan events</strong>
<span>
Coordinate organizational activities and appointments.
</span>
</div>

<span class="dashboard-onboarding-arrow">
→
</span>
</button>

</div>
</section>
`
: ""}

<section class="page-heading">
<div>
<h1>Dashboard</h1>

<p>
Overview of your current
organization workspace.
</p>
</div>
</section>

<section class="summary-grid">
<div class="card summary-card">
<div class="summary-label">
Projects
</div>

<div class="summary-value">
${summary.projects.total}
</div>

<div class="summary-sub">
${summary.projects.active}
active
</div>
</div>

<div class="card summary-card">
<div class="summary-label">
Tasks
</div>

<div class="summary-value">
${summary.tasks.total}
</div>

<div class="summary-sub">
${summary.tasks.ongoing}
ongoing
</div>
</div>

<div class="card summary-card">
<div class="summary-label">
Notifications
</div>

<div
class="summary-value"
data-dashboard-notification-count
>
${summary.unreadNotifications}
</div>

<div class="summary-sub">
unread
</div>
</div>
</section>

<section class="dashboard-grid">
<div class="card panel">
<div class="panel-header">
<h2>Recent Tasks</h2>
<span>
Latest activity
</span>
</div>

${renderTasks(
dashboard.recentTasks
)}
</div>


</section>
`;

try {
 const m3=await api.get('/api/m3/summary');
 const cards=[['Upcoming events',m3.upcomingEventCount],['Event approvals',m3.pendingEventApprovals],['Operational issues',m3.unresolvedEventIssues],['Unread announcements',m3.unreadAnnouncements]];
 const panel=document.createElement('section');panel.className='m3-dashboard-summary';
 panel.innerHTML=`<h2>Events & Communications</h2><div class="summary-grid">${cards.map(([label,count])=>`<div class="card summary-card"><div class="summary-label">${escapeHtml(label)}</div><div class="summary-value">${Number(count)||0}</div></div>`).join('')}</div>
 <div class="card m3-upcoming"><h3>Upcoming Events</h3>${m3.upcomingEvents.map(e=>`<p><strong>${escapeHtml(e.name)}</strong> · ${escapeHtml(e.status)} ${e.startsAt?' · '+escapeHtml(e.startsAt):''}</p>`).join('')||'<p>No upcoming events currently scheduled.</p>'}</div>`;
 container.appendChild(panel);
} catch(error) {console.warn('Event summary unavailable',error.code||error.message);}

container
.querySelectorAll(
"[data-onboarding-page]"
)
.forEach(
(button) => {
button.addEventListener(
"click",
() => {
const page =
button.dataset.onboardingPage;

if (
page &&
typeof window.omsNavigate ===
"function"
) {
window.omsNavigate(page);
}
}
);
}
);
}
