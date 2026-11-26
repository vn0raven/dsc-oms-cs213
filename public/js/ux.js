import { safeExternalUrl } from "./safe-html.mjs";
function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function initials(name) {
const parts = String(name || "")
.trim()
.split(/\s+/)
.filter(Boolean);

return parts
.slice(0, 2)
.map((part) =>
part.charAt(0).toUpperCase()
)
.join("") || "?";
}

function relativeTime(value) {
const date = new Date(value);

if (Number.isNaN(date.getTime())) {
return "";
}

const seconds =
Math.round(
(date.getTime() - Date.now()) /
1000
);

const abs =
Math.abs(seconds);

const formatter =
new Intl.RelativeTimeFormat(
"en",
{
numeric: "auto",
}
);

if (abs < 60) {
return formatter.format(
seconds,
"second"
);
}

const minutes =
Math.round(seconds / 60);

if (Math.abs(minutes) < 60) {
return formatter.format(
minutes,
"minute"
);
}

const hours =
Math.round(minutes / 60);

if (Math.abs(hours) < 24) {
return formatter.format(
hours,
"hour"
);
}

const days =
Math.round(hours / 24);

if (Math.abs(days) < 30) {
return formatter.format(
days,
"day"
);
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

async function navigateAndOpen(
navigate,
page,
buttonPattern = null
) {
await navigate(page);

if (!buttonPattern) return;

requestAnimationFrame(() => {
const buttons = [
...document.querySelectorAll(
"button"
),
];

const target =
buttons.find(
(button) =>
buttonPattern.test(
button.textContent
.trim()
)
);

target?.click();
});
}

function setupMobileSidebar() {
const sidebar =
document.querySelector(
".sidebar"
);

const topbar =
document.querySelector(
".topbar"
);

const title =
document.querySelector(
"#topbar-title"
);

const shell =
document.querySelector(
".app-shell"
);

if (
!sidebar ||
!topbar ||
!title ||
!shell
) {
return;
}

if (
!document.getElementById(
"mobile-menu-button"
)
) {
const button =
document.createElement(
"button"
);

button.id =
"mobile-menu-button";

button.type =
"button";

button.className =
"mobile-menu-button";

button.setAttribute(
"aria-label",
"Open navigation"
);

button.innerHTML = `
<svg viewBox="0 0 24 24">
<path d="M4 6h16"/>
<path d="M4 12h16"/>
<path d="M4 18h16"/>
</svg>
`;

topbar.insertBefore(
button,
title
);

button.addEventListener(
"click",
() => {
sidebar.classList.toggle(
"mobile-open"
);

document
.querySelector(
".sidebar-backdrop"
)
?.classList.toggle(
"visible"
);
}
);
}

if (
!document.querySelector(
".sidebar-backdrop"
)
) {
const backdrop =
document.createElement(
"button"
);

backdrop.type =
"button";

backdrop.className =
"sidebar-backdrop";

backdrop.setAttribute(
"aria-label",
"Close navigation"
);

shell.appendChild(
backdrop
);

backdrop.addEventListener(
"click",
() => {
sidebar.classList.remove(
"mobile-open"
);

backdrop.classList.remove(
"visible"
);
}
);
}

sidebar
.querySelectorAll(
"[data-page]"
)
.forEach(
(button) => {
button.addEventListener(
"click",
() => {
sidebar
.classList
.remove(
"mobile-open"
);

document
.querySelector(
".sidebar-backdrop"
)
?.classList
.remove(
"visible"
);
}
);
}
);
}

/* The application shell owns its header.  Do not replace .topbar-right here:
 * app.js renders it and header-controls.js/notification-popover.js attach
 * listeners to its descendants. The old setupAccountMenu() destroyed those
 * elements and prevented appearance/notification controls from working. */

function enhanceDashboard(
container,
user,
navigate
) {
const cards = [
...container.querySelectorAll(
".summary-card"
),
];

const destinations = [
"projects",
"tasks",
"requests",
"notifications",
];

cards.forEach(
(card, index) => {
if (
card.dataset.uxReady
) {
return;
}

const page =
destinations[index];

if (!page) return;

card.dataset.uxReady =
"true";

card.classList.add(
"summary-card-clickable"
);

card.tabIndex = 0;

card.setAttribute(
"role",
"button"
);

card.addEventListener(
"click",
() =>
navigate(page)
);

card.addEventListener(
"keydown",
(event) => {
if (
event.key ===
"Enter" ||
event.key ===
" "
) {
event.preventDefault();

navigate(
page
);
}
}
);
}
);

const summary =
container.querySelector(
".summary-grid"
);

if (
summary &&
!container.querySelector(
".quick-actions"
)
) {
const section =
document.createElement(
"section"
);

section.className =
"quick-actions";

const canCreateProject =
[
"Lead",
"Co-Lead",
"Executive",
].includes(
user.role
);

section.innerHTML = `
<div class="section-heading">
<div>
<h2>Quick Actions</h2>
<p>
Jump directly to common OMS actions.
</p>
</div>
</div>

<div class="quick-action-grid">

${canCreateProject
? `
<button
type="button"
class="quick-action-card"
data-ux-action="new-project"
>
<span class="quick-action-icon">
+
</span>

<span>
<strong>
New Project
</strong>

<small>
Create and organize work
</small>
</span>
</button>
`
: `
<button
type="button"
class="quick-action-card"
data-ux-page="projects"
>
<span class="quick-action-icon">
▣
</span>

<span>
<strong>
Projects
</strong>

<small>
View your active work
</small>
</span>
</button>
`
}

<button
type="button"
class="quick-action-card"
data-ux-page="tasks"
>
<span class="quick-action-icon">
✓
</span>

<span>
<strong>
Tasks
</strong>

<small>
Review current assignments
</small>
</span>
</button>



<button
type="button"
class="quick-action-card"
data-ux-page="members"
>
<span class="quick-action-icon">
◎
</span>

<span>
<strong>
Directory
</strong>

<small>
Find organization members
</small>
</span>
</button>

</div>
`;

summary.insertAdjacentElement(
"afterend",
section
);
}

container
.querySelectorAll(
"[data-ux-page]"
)
.forEach(
(button) => {
if (
button.dataset
.uxBound
) {
return;
}

button.dataset.uxBound =
"true";

button.addEventListener(
"click",
() =>
navigate(
button.dataset
.uxPage
)
);
}
);

container
.querySelector(
'[data-ux-action="new-project"]'
)
?.addEventListener(
"click",
() =>
navigateAndOpen(
navigate,
"projects",
/new project|create project/i
)
);



container
.querySelectorAll(
".panel"
)
.forEach(
(panel) => {
if (
panel.querySelector(
".panel-view-all"
)
) {
return;
}

const heading =
panel.querySelector(
".panel-header"
);

const title =
heading
?.querySelector(
"h2"
)
?.textContent ||
"";

let page = null;

if (
/Tasks/i.test(
title
)
) {
page = "tasks";
}

if (
/Requests/i.test(
title
)
) {
page =
"requests";
}

if (!page) return;

const button =
document.createElement(
"button"
);

button.type =
"button";

button.className =
"panel-view-all";

button.textContent =
"View all";

button.addEventListener(
"click",
() =>
navigate(
page
)
);

heading?.appendChild(
button
);
}
);

container
.querySelectorAll(
"[data-dashboard-reference][data-dashboard-id]"
)
.forEach(
(row) => {
if (
row.dataset.uxBound
) {
return;
}

row.dataset.uxBound =
"true";

row.addEventListener(
"click",
async () => {
const type =
row.dataset
.dashboardReference;

const id =
row.dataset
.dashboardId;

sessionStorage
.setItem(
"omsNotificationReference",
JSON.stringify({
type,
id,
})
);

const pages = {
TASK:
"tasks",
REQUEST:
"requests",
PROJECT:
"projects",
};

if (
pages[type]
) {
await navigate(
pages[
type
]
);
}
}
);
}
);
}

function enhanceEmptyStates(
container
) {
const configurations = [
{
pattern:
/^No projects found\.?$/i,
title:
"No projects yet",
description:
"Create a project to start organizing departments, members, and tasks.",
button:
/new project|create project/i,
label:
"+ New Project",
},
{
pattern:
/^No tasks found\.?$/i,
title:
"No tasks yet",
description:
"Tasks assigned to your workspace will appear here.",
button:
/new task|create task/i,
label:
"+ New Task",
},
{
pattern:
/^No requests found\.?$/i,
title:
"No requests yet",
description:
"Create a request when another department needs to take action.",
button:
/new request|create request/i,
label:
"+ New Request",
},
];

container
.querySelectorAll(
".empty"
)
.forEach(
(empty) => {
if (
empty.classList
.contains(
"ux-empty-state"
)
) {
return;
}

const text =
empty.textContent
.trim();

const config =
configurations.find(
(item) =>
item.pattern
.test(
text
)
);

if (!config) return;

const createButton =
[
...container
.querySelectorAll(
"button"
),
].find(
(button) =>
config.button
.test(
button
.textContent
.trim()
)
);

empty.classList.add(
"ux-empty-state"
);

empty.innerHTML = `
<div class="ux-empty-icon">
+
</div>

<strong>
${escapeHtml(
config.title
)}
</strong>

<p>
${escapeHtml(
config.description
)}
</p>

${createButton
? `
<button
type="button"
class="button button-secondary"
data-empty-create
>
${escapeHtml(
config.label
)}
</button>
`
: `
<span class="ux-empty-hint">
Adjust your filters or check back later.
</span>
`
}
`;

empty
.querySelector(
"[data-empty-create]"
)
?.addEventListener(
"click",
() =>
createButton
.click()
);
}
);
}

function enhanceMemberDetails(
container
) {
const detail =
container.querySelector(
"#user-detail"
);

if (!detail) return;

const enhance = () => {
const heading =
detail.querySelector(
".user-profile-heading"
);

if (
!heading ||
heading.dataset.uxReady
) {
return;
}

heading.dataset.uxReady =
"true";

const position =
heading.querySelector(
"p"
);

if (position) {
const value =
position.textContent
.trim();

position.innerHTML = `
<span class="ux-profile-label">
Position
</span>

${escapeHtml(
value
)}
`;
}

const tags =
heading.querySelectorAll(
".user-profile-tags span"
);

if (tags[0]) {
const role =
tags[0].textContent
.trim();

tags[0].textContent =
`System Role: ${role}`;
}

const findValue =
(label) => {
const item = [
...detail
.querySelectorAll(
".detail-item"
),
].find(
(element) =>
element
.querySelector(
"span"
)
?.textContent
.trim() ===
label
);

return item
?.querySelector(
"strong"
)
?.textContent
.trim() || "";
};

const email =
findValue("Email");

const contact =
findValue("Contact");

const socialLinks = [
...detail.querySelectorAll(
".user-social-links a"
),
];

const messenger =
socialLinks.find(
(link) =>
/Messenger/i.test(
link.textContent
)
);

const facebook =
socialLinks.find(
(link) =>
/Facebook/i.test(
link.textContent
)
);

if (
!detail.querySelector(
".member-contact-actions"
)
) {
const actions =
document.createElement(
"div"
);

actions.className =
"member-contact-actions";

if (
email &&
email !== "—"
) {
actions.insertAdjacentHTML(
"beforeend",
`
<a
class="member-contact-button"
href="mailto:${escapeHtml(
email
)}"
>
Email
</a>
`
);
}

if (
contact &&
contact !== "—"
) {
actions.insertAdjacentHTML(
"beforeend",
`
<a
class="member-contact-button"
href="tel:${escapeHtml(
contact.replace(
/\s+/g,
""
)
)}"
>
Call
</a>
`
);
}

if (messenger && safeExternalUrl(messenger.href)) {
actions.insertAdjacentHTML(
"beforeend",
`
<a
class="member-contact-button"
href="${escapeHtml(
safeExternalUrl(messenger.href)
)}"
target="_blank"
rel="noopener noreferrer"
>
Messenger
</a>
`
);
}

if (facebook && safeExternalUrl(facebook.href)) {
actions.insertAdjacentHTML(
"beforeend",
`
<a
class="member-contact-button"
href="${escapeHtml(
safeExternalUrl(facebook.href)
)}"
target="_blank"
rel="noopener noreferrer"
>
Facebook
</a>
`
);
}

if (
actions.children.length
) {
heading.insertAdjacentElement(
"afterend",
actions
);
}
}
};

enhance();

if (!detail.dataset.uxObserver) {
detail.dataset.uxObserver =
"true";

const observer =
new MutationObserver(
enhance
);

observer.observe(
detail,
{
childList: true,
subtree: true,
}
);
}
}

function enhanceNotifications(
container
) {
container
.querySelectorAll(
".notification-item.unread"
)
.forEach(
(item) => {
item.classList.add(
"notification-emphasis"
);
}
);

container
.querySelectorAll(
".notification-item time"
)
.forEach(
(time) => {
if (
time.dataset.uxReady
) {
return;
}

const raw =
time.getAttribute(
"datetime"
);

if (!raw) return;

time.dataset.uxReady =
"true";

time.title =
new Date(
raw
).toLocaleString();

time.textContent =
relativeTime(
raw
);
}
);

container
.querySelectorAll(
"[data-notification-open]"
)
.forEach(
(button) => {
button.classList.add(
"notification-primary-action"
);
}
);
}


async function enhanceTestingDepartmentControls(
container,
user
) {
/* TEST_ENVIRONMENT_CONTROL_FORBIDDEN_UI */
if (
(
user.role !== "Lead" &&
user.role !== "Co-Lead"
) ||
user.department?.id ===
"DEPT-TEST-001"
) {
return;
}

const panel =
container.querySelector(
"#department-detail-panel"
);

if (!panel) return;

const isTestingDepartment =
panel.textContent.includes(
"DEPT-TEST-001"
);

if (!isTestingDepartment) {
return;
}

if (
panel.querySelector(
".testing-admin-controls"
) ||
panel.dataset.testingControlsLoading ===
"true"
) {
return;
}

panel.dataset.testingControlsLoading =
"true";

try {
const response =
await fetch(
"/api/users",
{
headers: {
Accept:
"application/json",
},
}
);

if (!response.ok) {
return;
}

const body =
await response.json();

const users =
Array.isArray(body)
? body
: Array.isArray(
body.users
)
? body.users
: [];

const testers =
users.filter(
(testUser) =>
testUser.department
?.id ===
"DEPT-TEST-001"
);

const activeTesters =
testers.filter(
(testUser) =>
testUser.status ===
"Active"
);

const allInactive =
testers.length > 0 &&
activeTesters.length === 0;

const nextStatus =
allInactive
? "Active"
: "Inactive";

const controls =
document.createElement(
"div"
);

controls.className =
"testing-admin-controls";

controls.innerHTML = `
<div class="testing-admin-copy">
<strong>
Testing Environment
</strong>

<span>
${activeTesters.length}
of
${testers.length}
tester${testers.length === 1
? ""
: "s"}
active
</span>
</div>

<button
type="button"
class="
button
${allInactive
? "button-secondary"
: "button-danger-soft"}
"
data-testing-toggle
>
${allInactive
? "Reactivate All Testers"
: "Disable All Testers"}
</button>
`;

const header =
panel.querySelector(
".department-detail-head"
);

if (header) {
header.insertAdjacentElement(
"afterend",
controls
);
}
else {
panel.prepend(
controls
);
}

const button =
controls.querySelector(
"[data-testing-toggle]"
);

button?.addEventListener(
"click",
async () => {
const disabling =
nextStatus ===
"Inactive";

const confirmed =
window.confirm(
disabling
? `Disable all ${testers.length} System Testing account(s)?

They will immediately lose OMS access. Historical records will remain intact.`
: `Reactivate all ${testers.length} System Testing account(s)?

They will regain OMS access immediately.`
);

if (!confirmed) {
return;
}

button.disabled =
true;

try {
const updateResponse =
await fetch(
"/api/users/testing/status",
{
method:
"PATCH",

headers: {
"Content-Type":
"application/json",
Accept:
"application/json",
},

body:
JSON.stringify({
status:
nextStatus,
}),
}
);

const result =
await updateResponse
.json()
.catch(
() => ({})
);

if (
!updateResponse.ok
) {
throw new Error(
result.message ||
"Unable to update testing accounts."
);
}

/*
 * If a tester disables the
 * testing environment, their
 * own account is now inactive.
 */
if (
disabling &&
user.department?.id ===
"DEPT-TEST-001"
) {
window.alert(
"System Testing has been disabled. Your testing account is now inactive and you will be signed out."
);

window.location.href =
"/cdn-cgi/access/logout";

return;
}

await window
.omsNavigate?.(
"departments"
);
}
catch (error) {
window.alert(
error.message ||
"Unable to update testing accounts."
);

button.disabled =
false;
}
}
);
}
finally {
panel.dataset
.testingControlsLoading =
"false";
}
}

function enhancePage(
container,
user,
navigate
) {
if (!container) return;

if (
container.querySelector(
".summary-grid"
)
) {
enhanceDashboard(
container,
user,
navigate
);
}

enhanceEmptyStates(
container
);

enhanceMemberDetails(
container
);

void enhanceTestingDepartmentControls(
container,
user
);

if (
container.querySelector(
".notifications-panel"
)
) {
enhanceNotifications(
container
);
}
}

export function initializeUX(
user,
navigate
) {
window.omsNavigate =
navigate;

setupMobileSidebar();



const container =
document.getElementById(
"page-content"
);

if (!container) return;

let scheduled = false;

const run = () => {
if (scheduled) return;

scheduled = true;

requestAnimationFrame(
() => {
scheduled = false;

enhancePage(
container,
user,
navigate
);
}
);
};

const observer =
new MutationObserver(
run
);

observer.observe(
container,
{
childList: true,
subtree: true,
}
);

run();
}




/* Topbar notification navigation */

if (!window.__omsTopbarNotificationHandler) {
window.__omsTopbarNotificationHandler = true;

document.addEventListener(
"click",
(event) => {
const button =
event.target.closest(
"[data-topbar-notifications]"
);

if (!button) return;

event.preventDefault();

if (
typeof window.omsNavigate ===
"function"
) {
window.omsNavigate(
"notifications"
);
}
else {
location.hash =
"#notifications";
}
}
);
}

