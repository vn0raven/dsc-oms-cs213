import { api } from "./api.js";

import {
confirmAction,
showToast,
} from "./ui.js";

export async function approveRequestAction(
request,
onUpdated
) {
const confirmed =
await confirmAction({
title: "Approve request",
message:
`Approve "${request.title}"?`,
confirmText: "Approve",
danger: false,
});

if (!confirmed) return;

try {
await api.post(
`/api/requests/${encodeURIComponent(request.id)}/approve`
);

showToast(
"Request approved.",
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

export function openRejectRequest(
request,
onUpdated
) {
const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="confirm-modal">

<div class="confirm-modal-header">
<h2>Reject Request</h2>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<p>
Provide a reason for rejecting
this request.
</p>

<form id="reject-request-form">

<label class="form-field">
<span>Remarks</span>

<textarea
name="remarks"
rows="4"
maxlength="5000"
required
placeholder="Enter rejection remarks..."
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
type="submit"
class="button button-danger-soft"
>
Reject Request
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
"#reject-request-form"
);

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

const remarks =
String(
data.get("remarks") || ""
).trim();

if (!remarks) {
showToast(
"Rejection remarks are required.",
"error"
);

return;
}

const submit =
form.querySelector(
'[type="submit"]'
);

submit.disabled = true;

try {
await api.post(
`/api/requests/${encodeURIComponent(request.id)}/reject`,
{
remarks,
}
);

showToast(
"Request rejected.",
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

export async function withdrawRequestAction(
request,
onUpdated
) {
const confirmed =
await confirmAction({
title: "Withdraw request",
message:
`Withdraw "${request.title}"? The receiving department will no longer be able to approve or reject this request.`,
confirmText: "Withdraw Request",
danger: true,
});

if (!confirmed) return;

try {
await api.post(
`${"/api/requests/" + encodeURIComponent(request.id) + "/withdraw"}`
);

showToast(
"Request withdrawn.",
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

export async function archiveRequestAction(
request,
onUpdated
) {
const confirmed =
await confirmAction({
title: "Archive request",
message:
`Archive "${request.title}"? It will be removed from active request views. Its history will remain available and the request can be restored later.`,
confirmText: "Archive",
danger: true,
});

if (!confirmed) return;

try {
await api.post(
`/api/requests/${encodeURIComponent(request.id)}/archive`
);

showToast(
"Request archived.",
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

export async function restoreRequestAction(
request,
onUpdated
) {
try {
await api.post(
`/api/requests/${encodeURIComponent(request.id)}/restore`
);

showToast(
"Request restored.",
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
