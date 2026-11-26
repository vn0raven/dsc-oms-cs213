import { escapeHtml } from "./safe-html.mjs";
import { api } from "./api.js";
import { closeActiveModal } from "./modal-manager.js";
import { installLegacyModalBridge } from "./legacy-modal-bridge.js";
import { showToast } from "./ui.js";
import {
initializeUX,
} from "./ux.js";
import {
loadCurrentUser,
canViewReports,
} from "./auth.js";

import {
renderDashboard,
} from "./dashboard.js?v=m3-ui1";

import {
renderProjects,
} from "./projects.js";

import {
renderTasks,
} from "./tasks.js";
import { renderEvents } from "./events.js?v=m35";
import { renderAnnouncements } from "./announcements.js?v=m35";



import {
refreshNotificationBadge,
renderNotifications,
startNotificationLiveSync,
} from "./notifications.js";

import {
renderReports,
} from "./reports.js";

import {
renderAuditLog,
} from "./audit-log.js";

import {
renderUsers,
} from "./users.js";

import {
renderDepartments,
} from "./departments.js";

const app =
document.getElementById(
"app"
);

import {
initializeHeaderControls,
} from "./header-controls.js";

import {
initializeNotificationPopover,
} from "./notification-popover.js";

async function openStoredReference(page) {
const raw =
sessionStorage.getItem(
"omsNotificationReference"
);

if (!raw) return;

let reference;

try {
reference =
JSON.parse(raw);
}
catch {
sessionStorage.removeItem(
"omsNotificationReference"
);

return;
}

const pageByType = {
TASK: "tasks",
PROJECT: "projects",
REQUEST: "requests",
};

const targetPage =
pageByType[reference.type];

if (
!targetPage ||
targetPage !== page ||
!reference.id
) {
return;
}

const config = {
tasks: {
selector: "[data-task-id]",
key: "taskId",
},

projects: {
selector: "[data-project-id]",
key: "projectId",
},

requests: {
selector: "[data-request-id]",
key: "requestId",
},
}[page];

if (!config) return;

const target =
[
...document.querySelectorAll(
config.selector
),
].find(
(element) =>
element.dataset[
config.key
] === reference.id
);

if (!target) {
console.warn(
"Referenced record is not visible:",
reference
);

return;
}

sessionStorage.removeItem(
"omsNotificationReference"
);

target.click();

target.scrollIntoView({
behavior: "smooth",
block: "center",
});
}
function icon(name) {
const icons = {
dashboard: "▦",
projects: "▣",
tasks: "✓",
events: "▣",
announcements: "✦",
requests: "↔",
notifications: "●",
members: "👥",
departments: "▦",
reports: "▤",
};

if (name === "audit-log") {
return icons.reports || "";
}

return icons[name] || "";
}
function navItems() {
const items = [
{
id: "dashboard",
label: "Dashboard",
},
{ id: "announcements", label: "Announcements" },
{
id: "events",
label: "Events",
},
{
id: "projects",
label: "Projects",
},
{
id: "tasks",
label: "Tasks",
},
{
id: "notifications",
label: "Notifications",
},
{
id: "members",
label: "Members",
},
{
id: "departments",
label: "Departments",
},
];

if (canViewReports()) {
items.push({
id: "reports",
label: "Reports",
});

items.push({
id: "audit-log",
label: "Audit Log",
});
}

return items;
}
function renderShell(
user
) {
app.innerHTML = `
<div class="app-shell">
<aside class="sidebar">
<div class="brand">
<div class="brand-mark"><span class="dsc-terminal-mark" aria-hidden="true"><span>[</span><b>&gt;_</b><span>]</span></span></div>

<div class="brand-copy">
<strong>Developer Student Community</strong>
<span>Operations Management System</span>
</div>
</div>

<nav
class="nav"
id="navigation"
aria-label="Primary navigation"
>
${navItems().map(
(item) => `
<button
class="
nav-item
${item.id === "dashboard"
? "active"
: ""
}
"
data-page="${item.id}"
${item.id === "dashboard" ? 'aria-current="page"' : ""}
>
<span class="nav-icon">
${icon(item.id)}
</span>

${item.label}
</button>
`
).join("")}
</nav>

<div class="sidebar-user">
<strong>
${escapeHtml(user.name)}
</strong>

<span>
${escapeHtml(user.position || user.role)}
</span>

<span>
${escapeHtml(user.department?.name || "")}
</span>

<button
type="button"
class="button button-light"
id="logout-button"
style="margin-top:10px;width:100%;"
>
Sign Out
</button>
</div>
</aside>

<div class="main">
<header class="topbar">
<div
class="page-title"
id="topbar-title"
>
Dashboard
</div>

<div class="topbar-right">

<div
class="dsc-header-actions"
data-dsc-header-static
>

<div
class="dsc-theme-switcher"
role="group"
aria-label="Appearance"
>
<button
type="button"
class="dsc-theme-choice"
data-theme-choice="system"
>
System
</button>

<button
type="button"
class="dsc-theme-choice"
data-theme-choice="light"
>
Light
</button>

<button
type="button"
class="dsc-theme-choice"
data-theme-choice="dark"
>
Dark
</button>
</div>


<div
class="topbar-notifications"
data-notification-menu
>

<button
type="button"
class="topbar-notification-button"
data-topbar-notifications
aria-label="Notifications"
aria-expanded="false"
title="Notifications"
>
<span
class="dsc-css-bell"
aria-hidden="true"
></span>
</button>

<div
class="notification-popover"
data-notification-panel
hidden
>

<div
class="notification-popover-header"
>
<div>
<strong>Notifications</strong>
<span>Recent updates</span>
</div>

<button
type="button"
class="notification-popover-mark-all"
data-notification-mark-all
>
Mark all read
</button>
</div>

<div
class="notification-preview-list"
data-notification-preview-list
></div>

<div
class="notification-popover-footer"
>
<button
type="button"
class="notification-view-all"
data-notification-view-all
>
View all notifications
</button>
</div>

</div>
</div>

</div>

<span class="role-badge">
${escapeHtml(user.role)}
</span>

<div
class="topbar-profile"
data-profile-menu
>
<button
type="button"
class="topbar-profile-button"
data-profile-toggle
aria-expanded="false"
aria-label="Open profile menu"
>
<span
class="profile-avatar"
data-profile-avatar
></span>

<span class="topbar-profile-copy">
<strong>
${escapeHtml(user.name)}
</strong>
<span>
${escapeHtml(user.position || user.role)}
</span>
</span>

<svg
class="profile-chevron"
viewBox="0 0 24 24"
aria-hidden="true"
>
<path d="m8 10 4 4 4-4"/>
</svg>
</button>

<div
class="profile-menu"
data-profile-panel
hidden
>
<div class="profile-menu-header">
<strong>
${escapeHtml(user.name)}
</strong>
<span>
${escapeHtml(user.position || user.role)}
</span>
<small>
${escapeHtml(user.department?.name || "")}
</small>
</div>

<a
href="/cdn-cgi/access/logout"
class="profile-menu-logout"
>
Sign out
</a>
</div>
</div>
</div>
</header>

<main
class="content"
id="page-content"
></main>
</div>
</div>
`;
}

function renderComingSoon(
page
) {
const content =
document.getElementById(
"page-content"
);
// The same page-content node is reused by the SPA. Release module-owned click
// handlers before switching pages; delegated listeners must check ownership.
content.onclick = null;
content.dataset.omsActiveModule = page;

content.innerHTML = `
<section class="page-heading">
<div>
<h1>${escapeHtml(page)}</h1>

<p>
This module is connected next.
</p>
</div>
</section>

<div class="card panel">
<div class="empty">
${escapeHtml(page)} frontend migration
is the next step.
</div>
</div>
`;
}

function readRoute(){
 const [name,id,tab]=location.hash.replace(/^#\/?/,'').split('/').map(part=>{try{return decodeURIComponent(part||'');}catch{return '';}});
 const pages=new Set(['dashboard','announcements','events','projects','tasks','notifications','members','departments','reports','audit-log']);
 return {page:pages.has(name)?name:'dashboard',view:{id:id||null,tab:tab||'Overview'}};
}
function routeHash(page,id,tab){return '#/'+[page,id,tab].filter(Boolean).map(encodeURIComponent).join('/');}
window.omsUpdateView = (page,id=null,tab=null) => {const url=routeHash(page,id,tab);if(location.hash!==url)history.pushState({},'',url);};
async function navigate(page,{fromHistory=false,view=null}={}) {
if(page==='requests') {page='notifications';sessionStorage.removeItem('omsNotificationReference');showToast('Requests are no longer available in the main workspace. Historical records remain preserved.','info');}
if(!fromHistory)window.omsUpdateView(page);
closeActiveModal();

document
.querySelectorAll(
".nav-item"
)
.forEach(
(item) => {
item.classList.toggle(
"active",
item.dataset.page === page
);
if (item.dataset.page === page) item.setAttribute("aria-current", "page");
else item.removeAttribute("aria-current");
}
);

const title =
document.getElementById(
"topbar-title"
);

title.textContent =
navItems().find(item => item.id === page)?.label ||
page.charAt(0).toUpperCase() + page.slice(1);

const content =
document.getElementById(
"page-content"
);
// The same page-content node is reused by the SPA. Release module-owned click
// handlers before switching pages; delegated listeners must check ownership.
content.onclick = null;
content.dataset.omsActiveModule = page;

if (page === "dashboard") {
await renderDashboard(
content
);

return;
}

if (page === "projects") {
await renderProjects(
content
);

await openStoredReference(
"projects"
);

return;
}

if (page === "events" || page === "announcements") {
 let requestedView = view || readRoute().view;
 try {
  const reference=JSON.parse(sessionStorage.getItem('omsNotificationReference')||'null');
  const expected=page==='events'?'EVENT':'ANNOUNCEMENT';
  if(reference?.type===expected && reference.id){
   requestedView={id:reference.id,tab:'Overview'};
   sessionStorage.removeItem('omsNotificationReference');
   window.omsUpdateView(page,reference.id);
  }
 } catch {sessionStorage.removeItem('omsNotificationReference');}
 if(page==='events')await renderEvents(content,requestedView);
 else await renderAnnouncements(content,requestedView);
 return;
}

if (page === "tasks") {
await renderTasks(
content
);

await openStoredReference(
"tasks"
);

return;
}


if (page === "notifications") {
await renderNotifications(
content
);

return;
}

if (page === "reports") {
await renderReports(
content
);

return;
}

if (page === "audit-log") {
await renderAuditLog(
content
);

return;
}

if (
page === "users" ||
page === "members"
) {
await renderUsers(
content
);

return;
}

if (page === "departments") {
await renderDepartments(
content
);

return;
}

renderComingSoon(
title.textContent
);
}

function renderLoginScreen(initialMessage = "") {
app.innerHTML = `
<div class="error-screen">
<div class="card error-card" style="max-width:460px;width:100%;">
<div class="brand" style="margin-bottom:14px;">
<div class="brand-mark"><span class="dsc-terminal-mark" aria-hidden="true"><span>[</span><b>&gt;_</b><span>]</span></span></div>
<div class="brand-copy">
<strong>Developer Student Community</strong>
<span>Operations Management System</span>
</div>
</div>
<h1>Sign In</h1>
<p>Sign in with your registered DSC OMS account and password.</p>
<p id="login-error" role="alert" style="color:var(--dsc-red,#d71920);font-weight:600;margin:8px 0;" ${initialMessage ? "" : "hidden"}>${escapeHtml(initialMessage)}</p>
<form id="login-form" class="form-grid" style="grid-template-columns:1fr;gap:12px;margin-top:12px;">
<label class="form-field">
<span>Email</span>
<input type="email" name="email" autocomplete="username" required placeholder="demo.lead@example.test">
</label>
<label class="form-field">
<span>Password</span>
<input type="password" name="password" autocomplete="current-password" required placeholder="Enter your password">
</label>
<div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
<button type="submit" class="button button-primary" id="login-submit-button" style="width:100%;">Sign In</button>
</div>
</form>
<details style="margin-top:16px;font-size:13px;">
<summary style="cursor:pointer;">CS 213 Synthetic Demo Accounts</summary>
<ul style="margin:8px 0 0;padding-left:18px;line-height:1.5;">
<li><code>demo.lead@example.test</code> — Lead (Full Admin &amp; Reports)</li>
<li><code>demo.colead@example.test</code> — Co-Lead (Operations &amp; Reports)</li>
<li><code>demo.executive@example.test</code> — Executive (Dept + Team Head)</li>
<li><code>demo.member@example.test</code> — Member (Standard + Event Director)</li>
</ul>
</details>
</div>
</div>
`;
const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const submitBtn = document.getElementById("login-submit-button");
form?.addEventListener("submit", async (ev) => {
ev.preventDefault();
const fd = new FormData(form);
const email = String(fd.get("email") || "").trim();
const password = String(fd.get("password") || "");
errorEl.hidden = true;
errorEl.textContent = "";
submitBtn.disabled = true;
try {
await api.post("/api/auth/login", { email, password });
await start();
} catch (err) {
errorEl.textContent = err?.message || "Invalid email or password.";
errorEl.hidden = false;
submitBtn.disabled = false;
}
});
}

async function start() {
try {
const user =
await loadCurrentUser();

window.omsCurrentUser = user;
renderShell(user);
installLegacyModalBridge();
initializeHeaderControls(user);
initializeNotificationPopover(navigate);



/* OMS_START_NOTIFICATION_LIVE_SYNC */
startNotificationLiveSync();
initializeUX(
user,
navigate
);

const icons = {
dashboard: "▦",
projects: "▣",
tasks: "✓",
events: "▣",
announcements: "✦",
requests: "↔",
notifications: "●",
members: "👥",
departments: "▦",
reports: "▤",
};

document
.querySelectorAll("[data-icon]")
.forEach((element) => {
element.textContent =
icons[element.dataset.icon] || "";
});

document
.getElementById("logout-button")
?.addEventListener("click", async () => {
try {
await api.post("/api/auth/logout");
} finally {
window.omsCurrentUser = null;
renderLoginScreen();
}
});

document
.getElementById(
"navigation"
)
.addEventListener(
"click",
async (event) => {
const button =
event.target.closest(
"[data-page]"
);

if (!button) {
return;
}

await navigate(
button.dataset.page
);
}
);

window.omsNavigate = navigate;
window.addEventListener('popstate',()=>{const route=readRoute();navigate(route.page,{fromHistory:true,view:route.view});});
const route=readRoute();await navigate(route.page,{fromHistory:true,view:route.view});
}
catch (error) {
console.error(error);

if (error?.status === 401 || error?.code === "UNAUTHENTICATED") {
renderLoginScreen();
return;
}

const message =
String(error?.message || "");

const wrongAccount =
message.toLowerCase().includes(
"not registered"
);

if (wrongAccount) {
app.innerHTML = `
<div class="error-screen">
<div class="card error-card">
<h1>
Wrong account
</h1>

<p>
The account you signed in with is
not registered in the Developer Student Community OMS.
</p>

<p>
Please sign in using the
registered @usep.edu.ph account
assigned to you.
</p>

<div
style="
display:flex;
gap:8px;
flex-wrap:wrap;
margin-top:18px;
"
>
<a
class="button button-secondary"
href="/cdn-cgi/access/logout"
>
Sign in with a different account
</a>
</div>
</div>
</div>
`;

return;
}

app.innerHTML = `
<div class="error-screen">
<div class="card error-card">
<h1>
Unable to load DSC OMS
</h1>

<p>
${escapeHtml(message || "An unexpected error occurred.")}
</p>

<p>
Please try again. If the problem
continues, contact the Developer Student Community OMS
administrator.
</p>

<div
style="
display:flex;
gap:8px;
flex-wrap:wrap;
margin-top:18px;
"
>
<button
type="button"
class="button button-secondary"
data-retry-load
>
Try Again
</button>
</div>
</div>
</div>
`;
app.querySelector("[data-retry-load]")?.addEventListener("click", () => window.location.reload());
}
}

start();
