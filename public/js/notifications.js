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

function getNotifications(response) {
if (Array.isArray(response)) {
return response;
}

return Array.isArray(response?.notifications)
? response.notifications
: [];
}

function formatDate(value) {
if (!value) return "—";

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
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

function referenceLabel(notification) {
switch (notification.referenceType) {
case "REQUEST":
return "View Request";

case "TASK":
return "View Task";

case "PROJECT":
return "View Project";
case "EVENT":
return "View Event";
case "ANNOUNCEMENT":
return "View Announcement";

default:
return "";
}
}

function renderNotificationList(
notifications
) {
if (!notifications.length) {
return `
<div class="empty">
No notifications found.
</div>
`;
}

return `
<div class="notification-list">

${notifications.map(
(notification) => `
<div
class="
notification-item
${notification.status === "Unread"
? "unread"
: ""}
"
data-notification-id="${escapeHtml(
notification.id
)}"
>
<div class="notification-dot">
${notification.status === "Unread"
? `<span></span>`
: ""}
</div>

<div class="notification-content">

<div class="notification-header">
<div>
<strong>
${escapeHtml(
notification.title
)}
</strong>

<span class="notification-type">
${escapeHtml(
notification.type
)}
</span>
</div>

<time
datetime="${escapeHtml(notification.createdAt)}"
>
${formatDate(
notification.createdAt
)}
</time>
</div>

<p>
${escapeHtml(
notification.message
)}
</p>

<div class="notification-actions">

${notification.referenceId &&
referenceLabel(notification)
? `
<button
type="button"
class="button button-light"
data-notification-open
>
${referenceLabel(
notification
)}
</button>
`
: ""}

${notification.status === "Unread"
? `
<button
type="button"
class="button button-light"
data-notification-read
>
Mark as Read
</button>
`
: `
<span class="notification-read-label">
Read
</span>
`}

</div>

</div>
</div>
`
).join("")}

</div>
`;
}

export async function getUnreadNotificationCount() {
try {
const response =
await api.get(
"/api/notifications/unread-count"
);

return Number(
response.unreadCount || 0
);
}
catch {
return 0;
}
}

export async function refreshNotificationBadge(countOverride = null) {
const count =
countOverride === null
? await getUnreadNotificationCount()
: Number(countOverride);

const targets =
document.querySelectorAll(
[
'[data-page="notifications"]',
'[data-nav="notifications"]',
'[data-topbar-notifications]',
'[href="#notifications"]',
].join(",")
);

targets.forEach(
(target) => {
let badge =
target.querySelector(
".notification-nav-badge"
);

if (!count) {
badge?.remove();
return;
}

if (!badge) {
badge =
document.createElement(
"span"
);

badge.className =
"notification-nav-badge";

target.appendChild(
badge
);
}

badge.textContent =
count > 99
? "99+"
: String(count);
}
);
}


/* OMS_NOTIFICATION_LIVE_SYNC */

let notificationLiveSyncStarted =
false;

let notificationSyncRunning =
false;

export async function refreshNotificationIndicators() {
const count =
await getUnreadNotificationCount();

/*
 * Sidebar + topbar bell.
 */
await refreshNotificationBadge(
count
);


/*
 * Dashboard notification KPI.
 */
document
.querySelectorAll(
"[data-dashboard-notification-count]"
)
.forEach(
(element) => {
element.textContent =
String(count);
}
);


/*
 * Notifications page heading.
 */
const heading =
document.querySelector(
"#page-content .page-heading h1"
);

if (
heading &&
heading.textContent
.trim()
.startsWith("Notifications")
) {
let badge =
heading.querySelector(
".page-count-badge"
);

if (count > 0) {
if (!badge) {
badge =
document.createElement(
"span"
);

badge.className =
"page-count-badge";

heading.appendChild(
badge
);
}

badge.textContent =
String(count);
}
else {
badge?.remove();
}
}


/*
 * Mark All as Read state.
 */
const markAllButton =
document.getElementById(
"mark-all-notifications-read"
);

if (markAllButton) {
markAllButton.disabled =
count === 0;
}

return count;
}


export function startNotificationLiveSync() {
if (notificationLiveSyncStarted) {
return;
}

notificationLiveSyncStarted =
true;

const sync =
async () => {
if (
!window.omsCurrentUser ||
document.hidden ||
notificationSyncRunning
) {
return;
}

notificationSyncRunning =
true;

try {
await refreshNotificationIndicators();
}
catch (error) {
console.warn(
"Notification sync failed:",
error
);
}
finally {
notificationSyncRunning =
false;
}
};


/*
 * Initial sync.
 */
void sync();


/*
 * Check for new notifications every 20 seconds.
 */
window.setInterval(
() => {
void sync();
},
20000
);


/*
 * Refresh immediately when the user returns
 * to the tab/window instead of waiting 20 sec.
 */
window.addEventListener(
"focus",
() => {
void sync();
}
);

window.addEventListener(
"online",
() => {
void sync();
}
);

document.addEventListener(
"visibilitychange",
() => {
if (!document.hidden) {
void sync();
}
}
);
}

export async function renderNotifications(
container
) {
container.innerHTML = `
<div class="empty">
Loading notifications...
</div>
`;

let currentFilter = "All";

const loadNotifications =
async () => {
let endpoint =
"/api/notifications";

if (
currentFilter === "Unread" ||
currentFilter === "Read"
) {
endpoint +=
`?status=${encodeURIComponent(
currentFilter
)}`;
}

const response =
await api.get(endpoint);

return getNotifications(
response
);
};

let notifications =
await loadNotifications();

const unreadCount =
await getUnreadNotificationCount();

container.innerHTML = `
<section class="page-heading">
<div>
<h1>
Notifications

${unreadCount
? `
<span class="page-count-badge">
${unreadCount}
</span>
`
: ""}
</h1>

<p>
View task, request and
organization updates.
</p>
</div>

<button
type="button"
class="button button-light"
id="mark-all-notifications-read"
${unreadCount === 0
? "disabled"
: ""}
>
Mark All as Read
</button>
</section>

<section class="card notifications-panel">

<div class="notifications-toolbar">

<div class="notification-filters">

<button
type="button"
class="notification-filter active"
data-notification-filter="All"
>
All
</button>

<button
type="button"
class="notification-filter"
data-notification-filter="Unread"
>
Unread
</button>

<button
type="button"
class="notification-filter"
data-notification-filter="Read"
>
Read
</button>

</div>

<span id="notification-count-label">
${notifications.length}
notification${notifications.length === 1
? ""
: "s"}
</span>

</div>

<div id="notification-list-container">
${renderNotificationList(
notifications
)}
</div>

</section>
`;

const list =
container.querySelector(
"#notification-list-container"
);

const countLabel =
container.querySelector(
"#notification-count-label"
);

async function reloadList() {
notifications =
await loadNotifications();

list.innerHTML =
renderNotificationList(
notifications
);

countLabel.textContent =
`${notifications.length} notification${
notifications.length === 1
? ""
: "s"
}`;

await refreshNotificationIndicators();
}

container.addEventListener(
"click",
async (event) => {
const filterButton =
event.target.closest(
"[data-notification-filter]"
);

if (filterButton) {
currentFilter =
filterButton.dataset
.notificationFilter;

container
.querySelectorAll(
"[data-notification-filter]"
)
.forEach(
(button) =>
button.classList.toggle(
"active",
button ===
filterButton
)
);

await reloadList();

return;
}

const row =
event.target.closest(
"[data-notification-id]"
);

if (!row) return;

const notification =
notifications.find(
(item) =>
item.id ===
row.dataset.notificationId
);

if (!notification) return;

if (
event.target.closest(
"[data-notification-read]"
)
) {
try {
await api.post(
`/api/notifications/${encodeURIComponent(notification.id)}/read`
);

showToast(
"Notification marked as read.",
"success"
);

await reloadList();
}
catch (error) {
showToast(
error.message,
"error"
);
}

return;
}

if (
event.target.closest(
"[data-notification-open]"
)
) {
if (
notification.status ===
"Unread"
) {
try {
await api.post(
`/api/notifications/${encodeURIComponent(notification.id)}/read`
);
}
catch {
// Navigation can still continue.
}
}

sessionStorage.setItem(
"omsNotificationReference",
JSON.stringify({
type:
notification.referenceType,
id:
notification.referenceId,
})
);

switch (
notification.referenceType
) {
case "REQUEST":
window.omsNavigate?.(
"requests"
);
break;

case "TASK":
window.omsNavigate?.(
"tasks"
);
break;

case "PROJECT":
window.omsNavigate?.(
"projects"
);
break;
case "EVENT":
window.omsNavigate?.("events");
break;
case "ANNOUNCEMENT":
window.omsNavigate?.("announcements");
break;
}

await refreshNotificationIndicators();
}
}
);

container
.querySelector(
"#mark-all-notifications-read"
)
?.addEventListener(
"click",
async (event) => {
const button =
event.currentTarget;

button.disabled = true;

try {
await api.post(
"/api/notifications/read-all"
);

showToast(
"All notifications marked as read.",
"success"
);

await renderNotifications(
container
);

await refreshNotificationIndicators();
}
catch (error) {
showToast(
error.message,
"error"
);

button.disabled = false;
}
}
);

await refreshNotificationIndicators();
}
