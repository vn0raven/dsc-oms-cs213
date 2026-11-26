import { api } from "./api.js";
import { showToast } from "./ui.js";

function getItems(response, key) {
if (Array.isArray(response)) return response;
return Array.isArray(response?.[key])
? response[key]
: [];
}

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

export async function openCreateRequest(
onCreated
) {
const [
departmentResponse,
meResponse,
] = await Promise.all([
api.get("/api/departments"),
api.get("/api/auth/me"),
]);

const me =
meResponse.user ||
meResponse;

const departments =
getItems(
departmentResponse,
"departments"
)
.filter(
(department) =>
department.status === "Active" &&
department.id !==
me.department?.id &&
department.id !==
me.departmentId
);

const overlay =
document.createElement("div");

overlay.className =
"modal-overlay show";

overlay.innerHTML = `
<div class="project-form-modal">
<div class="project-form-header">
<div>
<h2>New Request</h2>
<p>
Send a request to another
DSC department.
</p>
</div>

<button
type="button"
class="modal-close"
data-close
>&times;</button>
</div>

<form id="create-request-form">
<div class="form-grid">

<label
class="form-field form-span"
>
<span>Request Title</span>

<input
name="title"
required
maxlength="200"
placeholder="Enter request title"
>
</label>

<label class="form-field">
<span>Request Type</span>

<select
name="type"
required
>
<option value="">
Select type
</option>

<option value="Task Request">
Task Request
</option>

<option value="Assistance Request">
Assistance Request
</option>

<option value="Resource Request">
Resource Request
</option>
</select>
</label>

<label class="form-field">
<span>
Receiving Department
</span>

<select
name="receiverDepartmentId"
required
>
<option value="">
Select department
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
</label>

<label
class="form-field form-span"
>
<span>Description</span>

<textarea
name="description"
rows="5"
maxlength="5000"
placeholder="Describe what you need..."
></textarea>
</label>

</div>

<div class="project-form-actions">
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
Send Request
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
"#create-request-form"
);

form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const data =
new FormData(form);

const payload = {
title:
data.get("title"),

type:
data.get("type"),

receiverDepartmentId:
data.get(
"receiverDepartmentId"
),

description:
data.get("description") ||
null,
};

const submit =
form.querySelector(
'[type="submit"]'
);

submit.disabled = true;

try {
const response =
await api.post(
"/api/requests",
payload
);

showToast(
"Request sent successfully.",
"success"
);

close();

await onCreated?.(
response.request ||
response
);
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
