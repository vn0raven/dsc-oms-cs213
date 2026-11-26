function ensureToastRoot() {
let root =
document.getElementById(
"toast-root"
);

if (!root) {
root =
document.createElement(
"div"
);

root.id =
"toast-root";

root.className =
"toast-root";

document.body.appendChild(
root
);
}

return root;
}

export function showToast(
message,
type = "info"
) {
const root =
ensureToastRoot();

const toast =
document.createElement(
"div"
);

toast.className =
`toast toast-${type}`;

toast.innerHTML = `
<div class="toast-indicator"></div>

<div class="toast-message">
${escapeHtml(message)}
</div>

<button
type="button"
class="toast-close"
aria-label="Close notification"
>
×
</button>
`;

root.appendChild(
toast
);

requestAnimationFrame(
() => {
toast.classList.add(
"show"
);
}
);

const close = () => {
toast.classList.remove(
"show"
);

setTimeout(
() => toast.remove(),
180
);
};

toast
.querySelector(
".toast-close"
)
.addEventListener(
"click",
close
);

setTimeout(
close,
4500
);
}

import { decisionModal } from './modal-manager.js';
export function confirmAction(options){return decisionModal(options);}

function escapeHtml(
value
) {
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
