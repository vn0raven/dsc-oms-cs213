import { api } from "./api.js";
import {
confirmAction,
showToast,
} from "./ui.js";

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

export async function startTaskAction(
task,
onUpdated
) {
try {
await api.post(
`/api/tasks/${encodeURIComponent(task.id)}/start`
);

showToast(
"Task started.",
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

export function openSubmitTask(
task,
onUpdated
) {
const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="confirm-modal">
<div class="confirm-modal-header">
<h2>Submit Task</h2>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<p>
Submit evidence for
"${escapeHtml(task.title)}".
</p>

<form id="submit-task-form">
<label class="form-field">
<span>Evidence URL</span>

<input
type="url"
name="evidence"
required
placeholder="https://..."
value="${escapeHtml(task.evidence || "")}"
>
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
Submit for Review
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

overlay
.querySelector(
"#submit-task-form"
)
.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(
event.currentTarget
);

try {
await api.post(
`/api/tasks/${encodeURIComponent(task.id)}/submit`,
{
evidence:
data.get("evidence"),
}
);

showToast(
"Task submitted for review.",
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

export function openReviewTask(
task,
onUpdated
) {
const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="confirm-modal">
<div class="confirm-modal-header">
<h2>Review Task</h2>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<p>
Review "${escapeHtml(task.title)}".
</p>

<label class="form-field">
<span>Remarks</span>

<textarea
id="review-remarks"
rows="4"
placeholder="Enter review remarks..."
></textarea>
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
type="button"
class="button button-danger-soft"
id="reject-task"
>
Return for Revision
</button>

<button
type="button"
class="button button-secondary"
id="approve-task"
>
Approve
</button>
</div>
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

const remarks =
overlay.querySelector(
"#review-remarks"
);

async function review(action) {
const value =
remarks.value.trim();

if (!value) {
showToast(
"Review remarks are required.",
"error"
);

return;
}

try {
await api.post(
`/api/tasks/${encodeURIComponent(task.id)}/${action}`,
{
remarks: value,
}
);

showToast(
action === "approve"
? "Task approved and completed."
: "Task returned for revision.",
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

overlay
.querySelector("#approve-task")
.addEventListener(
"click",
() => review("approve")
);

overlay
.querySelector("#reject-task")
.addEventListener(
"click",
() => review("reject")
);
}

export async function archiveTaskAction(
task,
onUpdated
) {
const confirmed =
await confirmAction({
title: "Archive task",
message:
`Archive "${task.title}"? It will be removed from active task views. Its history will remain available and the task can be restored later.`,
confirmText: "Archive",
danger: true,
});

if (!confirmed) return;

try {
await api.post(
`/api/tasks/${encodeURIComponent(task.id)}/archive`
);

showToast(
"Task archived.",
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

export async function restoreTaskAction(
task,
onUpdated
) {
try {
await api.post(
`/api/tasks/${encodeURIComponent(task.id)}/restore`
);

showToast(
"Task restored.",
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
