import { openTaskImport } from './task-import.mjs';
import { presentDetail, closeActiveModal } from './modal-manager.js';
import { api } from "./api.js";

import {
openCreateTask,
} from "./task-create.js";
import { confirmAction, showToast } from "./ui.js";

import {
openAssignTask,
openEditTask,
} from "./task-manage.js";

import {
archiveTaskAction,
openReviewTask,
openSubmitTask,
restoreTaskAction,
startTaskAction,
} from "./task-lifecycle.js";

import {
exportTaskCsv,
} from "./task-export.js";

import {
getCurrentUser,
} from "./auth.js";
import {
DEFAULT_TASK_SHEET_COLUMNS,
TASK_SHEET_COLUMNS,
renderTaskSheet,
COLUMN_SORT,
REVERSE_COLUMN_SORT,
} from "./task-sheet.js";
import { filterAndSortTasks, safeColumnWidths, normalizeTaskFilters } from "./task-workspace.mjs";

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

function getTasks(response) {
if (Array.isArray(response)) return response;
if (Array.isArray(response?.tasks)) return response.tasks;
return [];
}

function statusClass(status) {
return String(status ?? "")
.toLowerCase()
.replaceAll(" ", "-");
}

function progress(task) {
return Math.max(
0,
Math.min(
100,
Number(task.progress || 0)
)
);
}

function formatDate(value) {
if (!value) return "—";

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
return escapeHtml(value);
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

function renderRows(tasks) {
if (!tasks.length) {
return `
<div class="empty">
No tasks found.
</div>
`;
}

return `
<div class="task-list">
${tasks.map(
(task) => `
<button
type="button"
class="task-row"
data-task-id="${escapeHtml(task.id)}"
>
<div class="task-row-main">
<div class="task-row-title">
<strong>
${escapeHtml(task.title)}
</strong>

<span
class="
status
${statusClass(task.status)}
"
>
${escapeHtml(task.status)}
</span>
</div>

<div class="task-row-meta">
<span>
${escapeHtml(task.eventName || task.projectName || "Independent")} · ${escapeHtml(task.departmentName)}
</span>

<span>·</span>

<span>
${escapeHtml(
task.assignee?.name ||
"Unassigned"
)}
</span>

<span>·</span>

<span>
${escapeHtml(task.priority)}
</span>
</div>

<div class="task-progress-row">
<div class="progress">
<div
class="progress-bar"
style="width:${progress(task)}%"
></div>
</div>

<span>
${progress(task)}%
</span>
</div>
</div>

<div class="task-deadline">
<span>Deadline</span>
<strong>
${formatDate(task.deadline)}
</strong>
</div>
</button>
`
).join("")}
</div>
`;
}

function renderDetail(task) {
const permissions =
task.permissions || {};

return `
<div class="task-detail-content">
<div class="task-detail-header">
<div>
<div class="task-detail-title">
<h2>
${escapeHtml(task.title)}
</h2>

<span
class="
status
${statusClass(task.status)}
"
>
${escapeHtml(task.status)}
</span>
</div>

<p>
${escapeHtml(
task.description ||
"No task description."
)}
</p>
</div>
</div>

<div class="task-progress-card">
<div>
<span>Progress</span>
<strong>${progress(task)}%</strong>
</div>

<div class="progress progress-large">
<div
class="progress-bar"
style="width:${progress(task)}%"
></div>
</div>
</div>

<div class="detail-grid">
<div class="detail-item">
<span>Priority</span>
<strong>
${escapeHtml(task.priority)}
</strong>
</div>

<div class="detail-item">
<span>Department</span>
<strong>
${escapeHtml(task.departmentName)}
</strong>
</div>

<div class="detail-item">
<span>Assignee</span>
<strong>
${escapeHtml(
task.assignee?.name ||
"Unassigned"
)}
</strong>
</div>

<div class="detail-item">
<span>Context</span>
<strong>
${escapeHtml(
task.projectName ||
"None"
)}
</strong>
</div>

<div class="detail-item">
<span>Start Date</span>
<strong>
${formatDate(task.startDate)}
</strong>
</div>

<div class="detail-item">
<span>Deadline</span>
<strong>
${formatDate(task.deadline)}
</strong>
</div>
</div>

<div class="detail-section">
<h3>Instructions</h3>

<p class="task-detail-text">
${escapeHtml(
task.instructions ||
"No instructions."
)}
</p>
</div>

<div class="detail-section">
<h3>Notes</h3>

<p class="task-detail-text">
${escapeHtml(
task.notes ||
"No notes yet."
)}
</p>
</div>

<div class="detail-section">
<h3>Available Actions</h3>

<div class="task-action-buttons">
${permissions.canStart
? `<button class="button button-secondary" data-task-action="start">Start Task</button>`
: ""}

${permissions.canEdit
? `<button class="button button-light" data-task-action="edit">Edit</button>`
: ""}

${permissions.canAssign
? `<button class="button button-light" data-task-action="assign">Assign</button>`
: ""}

${permissions.canSubmit
? `<button class="button button-secondary" data-task-action="submit">Submit</button>`
: ""}

${permissions.canReview
? `<button class="button button-secondary" data-task-action="review">Review</button>`
: ""}

${permissions.canArchive
? `<button class="button button-danger-soft" data-task-action="archive">Archive</button>`
: ""}

${permissions.canRestore
? `<button class="button button-secondary" data-task-action="restore">Restore</button>`
: ""}
</div>
</div>
</div>
`;
}

/** Same M1 inspector and mutation controls, usable without leaving an Event. */
export async function openTaskInspector(id,onChanged=async()=>{}) {
 const response=await api.get(`/api/tasks/${encodeURIComponent(id)}`),task=response.task||response;
 const detail=document.createElement('div');detail.innerHTML=renderDetail(task);
 const dialog=presentDetail(detail,task.title||'Task details');
 const changed=async()=>{dialog.close(true);await onChanged();await openTaskInspector(id,onChanged);};
 const actions={edit:()=>openEditTask(task,changed),assign:()=>openAssignTask(task,changed),start:()=>startTaskAction(task,changed),submit:()=>openSubmitTask(task,changed),review:()=>openReviewTask(task,changed),archive:()=>archiveTaskAction(task,changed),restore:()=>restoreTaskAction(task,changed)};
 detail.addEventListener('click',async e=>{const action=e.target.closest('[data-task-action]')?.dataset.taskAction;if(!actions[action])return;try{await actions[action]();}catch(err){showToast(err.message,'error');}});
 const history=document.createElement('section');history.className='detail-section task-history';history.innerHTML='<h3>Activity history</h3><p>Loading…</p>';detail.append(history);
 try{const data=await api.get(`/api/tasks/${encodeURIComponent(id)}/activity`);history.innerHTML=`<h3>Activity history</h3>${(data.activity||[]).map(x=>`<p>${escapeHtml(x.action)} · ${escapeHtml(x.actorName)} · ${escapeHtml(formatDate(x.occurredAt))}</p>`).join('')||'<p>No recorded activity.</p>'}`;}catch{history.textContent='Activity history unavailable.';}
 return dialog;
}

export async function renderTasks(container, options = {}) {
closeActiveModal();
container.innerHTML = `
<div class="empty">
Loading tasks...
</div>
`;

let response;
try {
  response = await api.get('/api/tasks');
} catch (error) {
  container.innerHTML = `<div class="card task-load-error" role="alert"><h2>Couldn't load tasks</h2><p>${escapeHtml(error.message || 'Please try again.')}</p><button type="button" class="button button-secondary" data-task-retry>Try again</button></div>`;
  container.querySelector('[data-task-retry]')?.addEventListener('click', () => renderTasks(container, options));
  return;
}

const allTasks =
getTasks(response);

container.innerHTML = `
<section class="page-heading">
<div>
<h1>Tasks</h1>

<p>
Track assignments, progress,
deadlines and reviews.
</p>
</div>

<button
type="button"
class="button button-secondary"
id="new-task-button"
>
+ New Task
</button>
</section>

<section class="tasks-layout">
<div class="card tasks-panel">
<div class="tasks-toolbar">
<input
type="search"
id="task-search"
aria-label="Search tasks"
placeholder="Search tasks..."
>

<select id="task-status-filter"
aria-label="Filter tasks by status">
<option value="">
All statuses
</option>

<option value="Created">
Created
</option>

<option value="Assigned">
Assigned
</option>

<option value="Ongoing">
Ongoing
</option>

<option value="For Review">For Review</option>
<option value="Approved">Approved</option>
<option value="Archived">Archived</option>

<option value="Completed">
Completed
</option>

</select>
</div>

<div id="task-list-container">
${renderRows(allTasks)}
</div>
</div>

<aside
class="card task-detail"
id="task-detail"
>
<div class="empty">
Select a task.
</div>
</aside>
</section>
`;

const search =
document.getElementById(
"task-search"
);

const filter =
document.getElementById(
"task-status-filter"
);

const list =
document.getElementById(
"task-list-container"
);

const detail =
document.getElementById(
"task-detail"
);
let taskDialog=null;

let selectedId = options.selectedId || null;
let taskOpenGeneration = 0;

let visibleTasks =
[...allTasks];

let currentPage = Number.isInteger(options.page) && options.page >= 0 ? options.page : 0;
const PAGE_SIZE = 100;

let currentView =
localStorage.getItem("dsc-oms-task-view") === "sheet"
? "sheet"
: "board";

const viewSwitch =
document.createElement("div");

viewSwitch.className =
"task-view-switch";

viewSwitch.innerHTML = `
<button
type="button"
class="task-view-button ${currentView === "board" ? "active" : ""}"
data-task-view="board"
aria-pressed="${currentView === "board"}"
>
Board
</button>

<button
type="button"
class="task-view-button ${currentView === "sheet" ? "active" : ""}"
data-task-view="sheet"
aria-pressed="${currentView === "sheet"}"
>
Sheet
</button>
`;

list.parentNode?.insertBefore(
viewSwitch,
list
);

/* DSC_TASK_ADVANCED_CONTROLS */

const preferenceKey =
"dsc-oms-task-preferences";

let savedPreferences = {};

try {
  savedPreferences =
    JSON.parse(
      localStorage.getItem(preferenceKey) || "{}"
    ) || {};
}
catch {
  savedPreferences = {};
}

const validColumnIds =
new Set(
  TASK_SHEET_COLUMNS.map(
    (column) => column.id
  )
);

const savedColumns =
Array.isArray(savedPreferences.columns)
? savedPreferences.columns.filter(
    (id) => validColumnIds.has(id)
  )
: [];

const taskPreferences = {
  search:
    String(savedPreferences.search || ""),

  status:
    String(savedPreferences.status || ""),

  department:
    String(savedPreferences.department || ""),

  project:
    String(savedPreferences.project || ""),

  assignee:
    String(savedPreferences.assignee || ""),

  priority:
    String(savedPreferences.priority || ""),

  overdue:
    savedPreferences.overdue === true,

  deadlineFrom:
    String(savedPreferences.deadlineFrom || ""),

  deadlineTo:
    String(savedPreferences.deadlineTo || ""),

  sort: String(savedPreferences.sort || 'updated-desc'),
  context: String(savedPreferences.context || ''),
  event: String(savedPreferences.event || ''),
  widths: safeColumnWidths(savedPreferences.widths, TASK_SHEET_COLUMNS.map(c => c.id)),

  columns:
    savedColumns.length
    ? savedColumns
    : [...DEFAULT_TASK_SHEET_COLUMNS],
};

function uniqueTaskValues(selector) {
  return [
    ...new Set(
      allTasks
        .map(selector)
        .filter(Boolean)
    ),
  ].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function selectOptions(values, selected) {
  return values.map((value) => `
    <option
      value="${escapeHtml(value)}"
      ${String(value) === String(selected)
        ? "selected"
        : ""}
    >
      ${escapeHtml(value)}
    </option>
  `).join("");
}

const departments =
uniqueTaskValues(
  (task) => task.departmentName
);

const projects =
uniqueTaskValues(
  (task) => task.projectName
);

const assignees =
uniqueTaskValues(
  (task) =>
    task.assignee?.name || null
);

const priorities =
uniqueTaskValues(
  (task) => task.priority
);

const advancedControls =
document.createElement("div");

advancedControls.className =
"task-advanced-controls";

advancedControls.innerHTML = `
  <select data-task-filter="department" aria-label="Filter tasks by department">
    <option value="">All departments</option>
    ${selectOptions(
      departments,
      taskPreferences.department
    )}
  </select>

  <select data-task-filter="context" aria-label="Filter by task context">
    <option value="">All task contexts</option>
    <option value="independent">Independent tasks</option>
    <option value="project">Project tasks</option>
    ${allTasks.some(t=>t.eventId)?'<option value="event">Event tasks</option>':''}
  </select>

  <select data-task-filter="project" aria-label="Filter tasks by project">
    <option value="">All projects</option>
    ${selectOptions(
      projects,
      taskPreferences.project
    )}
  </select>

  <select data-task-filter="event" aria-label="Filter tasks by Event">
    <option value="">All Events</option>${[...new Map(allTasks.filter(t=>t.eventId).map(t=>[t.eventId,t.eventName])).entries()].map(([id,name])=>`<option value="${escapeHtml(id)}" ${taskPreferences.event===id?'selected':''}>${escapeHtml(name)}</option>`).join('')}
  </select>
  <select data-task-filter="assignee" aria-label="Filter tasks by assignee">
    <option value="">All assignees</option>
    ${selectOptions(
      assignees,
      taskPreferences.assignee
    )}
  </select>

  <select data-task-filter="priority" aria-label="Filter tasks by priority">
    <option value="">All priorities</option>
    ${selectOptions(
      priorities,
      taskPreferences.priority
    )}
  </select>

  <label class="task-overdue-filter">
    <input
      type="checkbox"
      data-task-filter="overdue"
      ${taskPreferences.overdue
        ? "checked"
        : ""}
    >
    <span>Overdue</span>
  </label>

  <label class="task-date-filter">
    <span>Deadline from</span>
    <input
      type="date"
      data-task-filter="deadline-from"
      value="${escapeHtml(
        taskPreferences.deadlineFrom
      )}"
    >
  </label>

  <label class="task-date-filter">
    <span>Deadline to</span>
    <input
      type="date"
      data-task-filter="deadline-to"
      value="${escapeHtml(
        taskPreferences.deadlineTo
      )}"
    >
  </label>

  <select data-task-sort aria-label="Sort tasks">
    <option value="updated-desc">
      Updated — newest
    </option>

    <option value="updated-asc">
      Updated — oldest
    </option>

    <option value="deadline-asc">
      Deadline — earliest
    </option>

    <option value="deadline-desc">
      Deadline — latest
    </option>

    <option value="title-asc">
      Task — A to Z
    </option>

    <option value="department-asc">
      Department — A to Z
    </option>

    <option value="priority-desc">Priority — high to low</option>
    <option value="status-asc">Status — A to Z</option>
    <option value="assignee-asc">Assignee — A to Z</option>
    <option value="project-asc">Project — A to Z</option>
    <option value="progress-desc">Progress — highest</option>
    <option value="progress-asc">Progress — lowest</option>
    <option value="title-desc">Task — Z to A</option>
    <option value="department-desc">Department — Z to A</option>
    <option value="status-desc">Status — Z to A</option>
    <option value="assignee-desc">Assignee — Z to A</option>
    <option value="project-desc">Project — Z to A</option>
    <option value="priority-asc">Priority — low to high</option>
  </select>

  <details
    class="task-column-picker"
    data-sheet-columns-control
  >
    <summary>Columns</summary>

    <div class="task-column-picker-menu">
      ${TASK_SHEET_COLUMNS.map(
        (column) => `
          <label>
            <input
              type="checkbox"
              value="${escapeHtml(column.id)}"
              data-task-column
              ${taskPreferences.columns.includes(
                column.id
              )
                ? "checked"
                : ""}
            >
            <span>
              ${escapeHtml(column.label)}
            </span>
          </label>
        `
      ).join("")}
    </div>
  </details>

  <button
    type="button"
    class="button button-light task-filter-reset"
    data-task-filter-reset
  >
    Reset
  </button>
`;

list.parentNode?.insertBefore(
advancedControls,
list
);

const filterDisclosure=document.createElement('details');filterDisclosure.className='task-filter-disclosure';
const filterToggle=document.createElement('summary');filterToggle.textContent='Filters';filterDisclosure.append(filterToggle);
advancedControls.before(filterDisclosure);filterDisclosure.append(advancedControls);
const commonContext=advancedControls.querySelector('[data-task-filter="context"]');
container.querySelector('.tasks-toolbar').append(commonContext);
const filterChips=document.createElement('div');filterChips.className='task-filter-chips';filterChips.setAttribute('aria-live','polite');
filterDisclosure.after(filterChips);
const taskTools=document.createElement('div');taskTools.className='task-tools';filterDisclosure.after(taskTools);
const picker=advancedControls.querySelector('[data-sheet-columns-control]');if(picker)taskTools.append(picker);
const toolbarActions=document.createElement('div');toolbarActions.className='task-toolbar-actions';
// Move existing control nodes so event listeners and saved preferences remain authoritative.
viewSwitch.before(toolbarActions);toolbarActions.append(viewSwitch,filterDisclosure,taskTools);
filterDisclosure.append(advancedControls);toolbarActions.after(filterChips);
filterToggle.setAttribute('aria-label','Advanced task filters');
/* DSC_TASK_EXPORT_CONTROL */

const currentUser =
getCurrentUser();

const canExportTasks =
[
  "Lead",
  "Co-Lead",
  "Executive",
].includes(
  currentUser?.role
);

let exportButton = null;

if (canExportTasks) {
  exportButton =
    document.createElement(
      "button"
    );

  exportButton.type =
    "button";

  exportButton.className =
    "button button-light task-export-button";

  exportButton.dataset.taskExport =
    "";

  exportButton.textContent =
    "Export CSV";

  taskTools.appendChild(exportButton);
  const importButton=document.createElement('button');importButton.type='button';importButton.className='button button-light';importButton.textContent='Import CSV';
  importButton.onclick=async()=>{try{await openTaskImport(async()=>{const result=await api.get('/api/tasks');allTasks.splice(0,allTasks.length,...getTasks(result));refreshList();});}catch(err){showToast(err.message,'error');}};taskTools.append(importButton);
}

/* DSC_TASK_RESULTS_SUMMARY */

const taskSummary =
document.createElement("div");

taskSummary.className =
"task-results-summary";

taskSummary.setAttribute(
"aria-live",
"polite"
);

taskSummary.innerHTML = `
  <div class="task-results-summary-main">
    <strong data-task-result-count>
      ${allTasks.length} tasks
    </strong>

    <span data-task-filter-count>
      No filters active
    </span>
  </div>

  <div class="task-page-controls" data-task-page-controls hidden>
    <button type="button" data-task-page="prev" aria-label="Previous task page">‹ Previous</button>
    <span data-task-page-label></span>
    <button type="button" data-task-page="next" aria-label="Next task page">Next ›</button>
  </div>
  <span
    class="task-results-view-label"
    data-task-view-label
  >
    ${currentView === "sheet"
      ? "Sheet view"
      : "Board view"}
  </span>
`;

list.parentNode?.insertBefore(
taskSummary,
list
);

const pageControls = taskSummary.querySelector('[data-task-page-controls]');
const pageLabel = taskSummary.querySelector('[data-task-page-label]');
const prevPage = taskSummary.querySelector('[data-task-page="prev"]');
const nextPage = taskSummary.querySelector('[data-task-page="next"]');
const taskResultCount =
taskSummary.querySelector(
  "[data-task-result-count]"
);

const taskFilterCount =
taskSummary.querySelector(
  "[data-task-filter-count]"
);

const taskViewLabel =
taskSummary.querySelector(
  "[data-task-view-label]"
);
const departmentFilter =
advancedControls.querySelector(
  '[data-task-filter="department"]'
);

const contextFilter = container.querySelector('[data-task-filter="context"]');
contextFilter.value = taskPreferences.context;
const eventFilter=advancedControls.querySelector('[data-task-filter="event"]');

const projectFilter =
advancedControls.querySelector(
  '[data-task-filter="project"]'
);

const assigneeFilter =
advancedControls.querySelector(
  '[data-task-filter="assignee"]'
);

const priorityFilter =
advancedControls.querySelector(
  '[data-task-filter="priority"]'
);

const overdueFilter =
advancedControls.querySelector(
  '[data-task-filter="overdue"]'
);

const deadlineFromFilter =
advancedControls.querySelector(
  '[data-task-filter="deadline-from"]'
);

const deadlineToFilter =
advancedControls.querySelector(
  '[data-task-filter="deadline-to"]'
);

const sortControl =
advancedControls.querySelector(
  "[data-task-sort]"
);

const columnsControl =
container.querySelector(
  "[data-sheet-columns-control]"
);

sortControl.value =
taskPreferences.sort;

search.value =
taskPreferences.search;

filter.value =
taskPreferences.status;

function saveTaskPreferences() {
  localStorage.setItem(
    preferenceKey,
    JSON.stringify(taskPreferences)
  );
}

function refreshList() {
  const query =
    search.value
      .trim()
      .toLowerCase();

  const status =
    filter.value;

  taskPreferences.search =
    search.value;

  taskPreferences.status =
    status;

  taskPreferences.department =
    departmentFilter.value;

  taskPreferences.project = projectFilter.value;
  taskPreferences.context = contextFilter.value;
  taskPreferences.event = eventFilter.value;

  taskPreferences.assignee =
    assigneeFilter.value;

  taskPreferences.priority =
    priorityFilter.value;

  taskPreferences.overdue =
    overdueFilter.checked;

  taskPreferences.deadlineFrom =
    deadlineFromFilter.value;

  taskPreferences.deadlineTo =
    deadlineToFilter.value;

  taskPreferences.sort =
    sortControl.value;

  Object.assign(taskPreferences,normalizeTaskFilters(taskPreferences,'context'));
  projectFilter.value=taskPreferences.project;eventFilter.value=taskPreferences.event;
  projectFilter.disabled=['independent','event'].includes(taskPreferences.context);
  eventFilter.disabled=['independent','project'].includes(taskPreferences.context);
  const sorted = filterAndSortTasks(allTasks, taskPreferences);
  /* DSC_TASK_RESULTS_UPDATE */

  const activeFilterCount =
    [
      query,
      status,
      taskPreferences.department,
      taskPreferences.project,
      taskPreferences.context,
      taskPreferences.event,
      taskPreferences.assignee,
      taskPreferences.priority,
      taskPreferences.deadlineFrom,
      taskPreferences.deadlineTo,
    ].filter(Boolean).length +
    (
      taskPreferences.overdue
      ? 1
      : 0
    );
/* DSC_TASK_VISIBLE_EXPORT_SET */
  visibleTasks = [...sorted];
  currentPage = Math.min(currentPage, Math.max(0,Math.ceil(sorted.length/PAGE_SIZE)-1));
  const pageTasks = sorted.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
  pageControls.hidden = sorted.length <= PAGE_SIZE;
  pageLabel.textContent = `${currentPage+1} / ${Math.max(1,Math.ceil(sorted.length/PAGE_SIZE))}`;
  prevPage.disabled = currentPage === 0;
  nextPage.disabled = currentPage >= Math.ceil(sorted.length/PAGE_SIZE)-1;

  if (taskResultCount) {
    taskResultCount.textContent =
      `${visibleTasks.length} of ${allTasks.length} tasks`;
  }

  if (taskFilterCount) {
    taskFilterCount.textContent =
      activeFilterCount
      ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active`
      : "No filters active";
  }

  filterToggle.textContent=`Filters (${activeFilterCount})`;
  const controls=[['Search',search],['Status',filter],['Context',contextFilter],['Department',departmentFilter],['Project',projectFilter],['Event',eventFilter],['Assignee',assigneeFilter],['Priority',priorityFilter],['From',deadlineFromFilter],['To',deadlineToFilter],['Overdue',overdueFilter]];
  filterChips.replaceChildren();
  for(const [label,control] of controls){const value=control.type==='checkbox'?control.checked:control.value;if(!value)continue;
   const chip=document.createElement('button');chip.type='button';chip.className='button button-light';
   chip.textContent=`${label}: ${control.selectedOptions?.[0]?.textContent|| (value===true?'Yes':value)} ×`;
   chip.setAttribute('aria-label',`Remove ${label} filter`);chip.onclick=()=>{if(control.type==='checkbox')control.checked=false;else control.value='';currentPage=0;refreshList();};filterChips.append(chip);
  }
  if(activeFilterCount){const clear=document.createElement('button');clear.type='button';clear.className='button button-light';clear.textContent='Clear all';clear.onclick=()=>advancedControls.querySelector('[data-task-filter-reset]').click();filterChips.append(clear);}
  if (taskViewLabel) {
    taskViewLabel.textContent =
      currentView === "sheet"
      ? "Sheet view"
      : "Board view";
  }

  taskSummary?.classList.toggle(
    "is-filtered",
    activeFilterCount > 0
  );

  if (exportButton) {
    exportButton.disabled =
      visibleTasks.length === 0;
  }

  list.innerHTML =
    currentView === "sheet"
    ? renderTaskSheet(pageTasks, taskPreferences.columns, {
        sort: taskPreferences.sort,
        widths: taskPreferences.widths,
        selectedId,
      })
    : renderRows(pageTasks);

  container.querySelector('.tasks-layout')?.classList.toggle('sheet-mode', currentView === 'sheet');
  if (columnsControl) {
    columnsControl.hidden =
      currentView !== "sheet";
  }

  if (selectedId) {
    list
      .querySelectorAll(
        "[data-task-id]"
      )
      .forEach((row) => {
        const active = row.dataset.taskId === selectedId;
        row.classList.toggle('selected', active);
        if (row.matches('tr')) row.setAttribute('aria-selected', String(active));
      });
  }

  saveTaskPreferences();
}

async function openTask(id) {
if (!id) return;
selectedId = id;
const generation = ++taskOpenGeneration;

document
.querySelectorAll(
".task-row"
)
.forEach(
(row) =>
row.classList.toggle(
"selected",
row.dataset.taskId === id
)
);

detail.innerHTML = `
<div class="empty">
Loading task...
</div>
`;

let task;
try {
  const response = await api.get(`/api/tasks/${encodeURIComponent(id)}`);
  if (generation !== taskOpenGeneration) return;
  task = response.task || response;
} catch (error) {
  if (generation === taskOpenGeneration) detail.innerHTML = `<div class="empty" role="alert">${escapeHtml(error.message || 'Unable to open task.')}</div>`;
  return;
}
detail.innerHTML = renderDetail(task);
if(taskDialog)taskDialog.close(true);
taskDialog=presentDetail(detail, task.title || 'Task details');
list.querySelectorAll('[data-task-id]').forEach(row => {
  const selected = row.dataset.taskId === selectedId;
  row.classList.toggle('selected', selected);
  if (row.matches('tr')) row.setAttribute('aria-selected', String(selected));
});
// Existing API applies task-level access checks to historical activity.
const history = document.createElement('section');
history.className = 'detail-section task-history';
history.innerHTML = '<h3>Activity history</h3><p class="task-history-state">Loading activity…</p>';
detail.querySelector('.task-detail-content')?.appendChild(history);
api.get(`/api/tasks/${encodeURIComponent(id)}/activity`).then(result => {
  if (generation !== taskOpenGeneration || !history.isConnected) return;
  const entries = Array.isArray(result) ? result : (result.activity || []);
  history.innerHTML = `<h3>Activity history</h3>${entries.length ? `<ol class="task-history-list">${entries.slice(0,30).map(e=>`<li><strong>${escapeHtml(e.action || 'Updated')}</strong><span>${escapeHtml(e.actorName || '')} · ${escapeHtml(formatDate(e.occurredAt))}</span></li>`).join('')}</ol>` : '<p class="task-history-state">No recorded activity yet.</p>'}`;
}).catch(() => { if (generation === taskOpenGeneration && history.isConnected) history.querySelector('.task-history-state').textContent = 'Activity history is unavailable.'; });

detail
.querySelector(
'[data-task-action="edit"]'
)
?.addEventListener(
"click",
() =>
openEditTask(
task,
async () => {
await renderTasks(container, { selectedId: id, page: currentPage });
}
)
);

detail
.querySelector(
'[data-task-action="assign"]'
)
?.addEventListener(
"click",
() =>
openAssignTask(
task,
async () => {
await renderTasks(container, { selectedId: id, page: currentPage });
}
)
);

const refreshTaskPage =
async () => {
await renderTasks(container, { selectedId: id, page: currentPage });
};

detail
.querySelector(
'[data-task-action="start"]'
)
?.addEventListener(
"click",
() =>
startTaskAction(
task,
refreshTaskPage
)
);

detail
.querySelector(
'[data-task-action="submit"]'
)
?.addEventListener(
"click",
() =>
openSubmitTask(
task,
refreshTaskPage
)
);

detail
.querySelector(
'[data-task-action="review"]'
)
?.addEventListener(
"click",
() =>
openReviewTask(
task,
refreshTaskPage
)
);

detail
.querySelector(
'[data-task-action="archive"]'
)
?.addEventListener(
"click",
() =>
archiveTaskAction(
task,
refreshTaskPage
)
);

detail
.querySelector(
'[data-task-action="restore"]'
)
?.addEventListener(
"click",
() =>
restoreTaskAction(
task,
refreshTaskPage
)
);
}

search.addEventListener('input',()=>{currentPage=0;refreshList();});
filter.addEventListener('change',()=>{currentPage=0;refreshList();});
pageControls.addEventListener('click', event => {
  const direction = event.target.closest('[data-task-page]')?.dataset.taskPage;
  if (!direction) return;
  currentPage += direction === 'next' ? 1 : -1;
  refreshList();
  list.querySelector('[data-task-id]')?.focus?.();
});

/* task-view-button-handler */
viewSwitch.addEventListener(
"click",
(event) => {
const button =
event.target.closest(
"[data-task-view]"
);

if (!button) return;

const nextView =
button.dataset.taskView;

if (
nextView !== "board" &&
nextView !== "sheet"
) {
return;
}

currentView = nextView;

localStorage.setItem(
"dsc-oms-task-view",
currentView
);

viewSwitch
.querySelectorAll("[data-task-view]")
.forEach((control) => {
const active =
control.dataset.taskView === currentView;

control.classList.toggle(
"active",
active
);

control.setAttribute(
"aria-pressed",
String(active)
);
});

refreshList();
}
);
/* DSC_TASK_EXPORT_EVENT */

exportButton?.addEventListener(
"click",
() => {
  exportTaskCsv(
    visibleTasks,
    taskPreferences.columns
  );
}
);
/* DSC_TASK_ADVANCED_EVENTS */

container.addEventListener(
"change",
(event) => {
  if (event.target.matches('[data-task-filter], [data-task-sort]')) {
    const changed=event.target.dataset.taskFilter;
    if(changed==='project'&&projectFilter.value){contextFilter.value='project';eventFilter.value='';}
    if(changed==='event'&&eventFilter.value){contextFilter.value='event';projectFilter.value='';}
    currentPage=0;
    refreshList();
  }

  if (
    event.target.matches(
      "[data-task-column]"
    )
  ) {
    const selectedColumns =
      [
        ...container.querySelectorAll(
          "[data-task-column]:checked"
        ),
      ].map(
        (input) => input.value
      );

    taskPreferences.columns =
      selectedColumns.length
      ? selectedColumns
      : ["task"];

    refreshList();
  }
}
);

advancedControls
.querySelector("[data-task-filter-reset]")
?.addEventListener(
"click",
() => {
  search.value = "";
  filter.value = "";

  departmentFilter.value = "";
  projectFilter.value = "";
  contextFilter.value = "";
  eventFilter.value = "";
  assigneeFilter.value = "";
  priorityFilter.value = "";

  overdueFilter.checked = false;

  deadlineFromFilter.value = "";
  deadlineToFilter.value = "";

  sortControl.value =
    "updated-desc";

  // Clearing filters preserves column preferences.
  currentPage = 0;

  container
    .querySelectorAll(
      "[data-task-column]"
    )
    .forEach((input) => {
      input.checked = taskPreferences.columns.includes(input.value);
    });

  refreshList();
}
);
/* Spreadsheet interactions use the same task API and validation as the detail editor.
 * Status / assignee always use the existing workflow dialogs, never PATCH shortcuts. */
list.addEventListener('click', event => {
  const sortButton = event.target.closest('[data-sheet-sort]');
  if (!sortButton) return;
  const desired = sortButton.dataset.sheetSort;
  const heading = sortButton.closest('[data-sheet-heading]')?.dataset.sheetHeading;
  taskPreferences.sort = taskPreferences.sort === desired ? (REVERSE_COLUMN_SORT[heading] || desired) : desired;
  sortControl.value = taskPreferences.sort;
  refreshList();
});

list.addEventListener('pointerdown', event => {
  const handle = event.target.closest('[data-resize-col]');
  if (!handle || event.button !== 0) return;
  event.preventDefault();
  const id = handle.dataset.resizeCol;
  const initial = handle.closest('th').getBoundingClientRect().width;
  const x0 = event.clientX;
  const move = ev => {
    taskPreferences.widths[id] = Math.max(96, Math.min(720, Math.round(initial + ev.clientX - x0)));
    const col = list.querySelector(`[data-column-width="${id}"]`);
    if (col) {
      col.style.width = `${taskPreferences.widths[id]}px`;
      const table = col.closest('table');
      table.style.width = `${[...table.querySelectorAll('col')].reduce((sum,c)=>sum+(parseFloat(c.style.width)||52),0)}px`;
    }
  };
  const finish = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', finish);
    saveTaskPreferences();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', finish, {once:true});
});
list.addEventListener('keydown', event => {
  const handle = event.target.closest('[data-resize-col]');
  if (handle && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    const id = handle.dataset.resizeCol;
    const col = list.querySelector(`[data-column-width="${id}"]`);
    taskPreferences.widths[id] = Math.max(96, Math.min(720, (taskPreferences.widths[id] || col.getBoundingClientRect().width) + (event.key==='ArrowRight'?16:-16)));
    col.style.width = `${taskPreferences.widths[id]}px`;
    const table = col.closest('table');
    table.style.width = `${[...table.querySelectorAll('col')].reduce((sum,c)=>sum+(parseFloat(c.style.width)||52),0)}px`;
    saveTaskPreferences();
    return;
  }
  const row = event.target.closest('.task-sheet-row');
  if (!row || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const rows = [...list.querySelectorAll('.task-sheet-row')];
  const i = rows.indexOf(row);
  const next = event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,i+(event.key==='ArrowDown'?1:-1)));
  rows[next]?.focus();
});

list.addEventListener('dblclick', async event => {
  const target = event.target.closest('[data-sheet-edit]');
  if(currentView!=='sheet')return;
  if(!target){const row=event.target.closest('[data-task-id]');if(row)await openTask(row.dataset.taskId);return;}
  const id = target.closest('[data-task-id]')?.dataset.taskId;
  if (!id) return;
  const field = target.dataset.sheetEdit;
  try {
    const response = await api.get(`/api/tasks/${encodeURIComponent(id)}`);
    const task = response.task || response;
    // Governance fields require management privileges. Assignees can change
    // progress only in Ongoing; the backend remains the ultimate authority.
    const allowed = field === 'progress'
      ? task.permissions?.canEdit && (task.permissions?.canAssign || task.status === 'Ongoing')
      : task.permissions?.canAssign && task.permissions?.canEdit;
    if (!allowed) {
      showToast('This field is not editable with your current task permissions.', 'error');
      return;
    }
    const old = field === 'progress' ? Number(task.progress || 0) : task[field];
    const input = document.createElement(field === 'priority' ? 'select' : 'input');
    input.className = 'sheet-inline-input';
    input.setAttribute('aria-label', `Edit ${field} for ${task.title}`);
    if (field === 'priority') {
      for (const value of ['Critical','High','Medium','Low']) {
        input.add(new Option(value, value));
      }
    } else if (field === 'progress') { input.type='number'; input.min='0'; input.max='100'; input.step='1'; }
    else { input.type='date'; }
    input.value = old == null ? '' : String(old).slice(0, field === 'deadline' ? 10 : undefined);
    target.replaceChildren(input);
    input.focus();
    let finished = false;
    const restore = () => { if (finished) return; finished=true; refreshList(); };
    const commit = async () => {
      if (finished) return;
      const raw = input.value;
      let value = raw;
      if (field === 'progress') {
        if (!/^\d+$/.test(raw) || Number(raw) > 100) { showToast('Progress must be between 0 and 100.', 'error'); input.focus(); return; }
        value = Number(raw);
      }
      if (field === 'priority' && !['Critical','High','Medium','Low'].includes(value)) return;
      if (field === 'deadline' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
      if (value === old || (field === 'deadline' && (value || null) === (old || null))) { restore(); return; }
      input.disabled = true;
      try {
        // Recheck the record against the value originally loaded before sending.
        // This improves feedback but isn't an atomic versioned PATCH operation.
        const latestResponse = await api.get(`/api/tasks/${encodeURIComponent(id)}`);
        const latest = latestResponse.task || latestResponse;
        if (latest.updatedAt !== task.updatedAt) throw new Error('Task changed while editing. Reloaded the latest version.');
        await api.patch(`/api/tasks/${encodeURIComponent(id)}`, {[field]: value === '' ? null : value});
        showToast('Task updated.', 'success');
        finished = true;
        await renderTasks(container, {selectedId:id, page: currentPage});
      } catch (error) {
        showToast(error.status === 409 ? 'Task changed or is locked. Reloading its latest state.' : error.message, 'error');
        finished = true;
        await renderTasks(container, {selectedId:id, page: currentPage});
      }
    };
    input.addEventListener('keydown', e => { if (e.key==='Escape') { e.stopPropagation(); restore(); } else if (e.key==='Enter') { e.preventDefault(); commit(); }});
    input.addEventListener('blur', () => { if (!finished) commit(); }, {once:true});
  } catch(error) { showToast(error.message || 'Unable to edit task.', 'error'); }
});

/* DSC_TASK_KEYBOARD_ROWS */

list.addEventListener(
"keydown",
async (event) => {
  if (
    event.key !== "Enter" &&
    event.key !== " "
  ) {
    return;
  }

  const row =
    event.target.closest(
      ".task-sheet-row[data-task-id]"
    );

  if (!row) return;

  event.preventDefault();

  await openTask(
    row.dataset.taskId
  );
}
);
list.addEventListener("click", async event => {
 const row=event.target.closest('[data-task-id]');
 if(!row || event.target.closest('.sheet-inline-input,[data-resize-col],[data-sheet-sort]'))return;
 if(currentView==='sheet'){
   selectedId=row.dataset.taskId;
   list.querySelectorAll('[data-task-id]').forEach(item=>{const selected=item.dataset.taskId===selectedId;item.classList.toggle('selected',selected);if(item.matches('tr'))item.setAttribute('aria-selected',String(selected));});
   return;
 }
 await openTask(row.dataset.taskId);
});


document
.getElementById(
"new-task-button"
)
?.addEventListener(
"click",
() =>
openCreateTask(
async () => {
await renderTasks(container, { selectedId, page: currentPage });
}
)
);

refreshList();
}









