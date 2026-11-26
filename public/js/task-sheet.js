/** Task spreadsheet view. Pure HTML rendering; interaction delegated by tasks.js. */
function escapeHtml(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function statusClass(status) { return String(status || '').toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function date(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? escapeHtml(value) : escapeHtml(d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}));
}
function updated(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? escapeHtml(value) : escapeHtml(d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}));
}
function p(task) { return Math.max(0,Math.min(100,Number(task.progress)||0)); }
const cell = (id, content, title = '', editable = false) => `<td data-sheet-cell="${id}" ${editable?`data-sheet-edit="${id}" title="Double-click to edit; Enter to open task"`:''} ${title?`title="${escapeHtml(title)}"`:''}>${content}</td>`;
export const TASK_SHEET_COLUMNS = [
  {id:'task', label:'Task', width:258, render:t=>cell('task',`<strong class="sheet-task-name" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</strong><small class="sheet-task-ref">${escapeHtml(t.id)}</small>`)},
  {id:'project',label:'Project / Context',width:198,render:t=>cell('project',escapeHtml(t.eventName || t.projectName || 'Independent'),t.eventName || t.projectName || 'Independent')},
  {id:'department',label:'Department',width:175,render:t=>cell('department',escapeHtml(t.departmentName || '—'))},
  {id:'assignee',label:'Assignee',width:165,render:t=>cell('assignee',escapeHtml(t.assignee?.name || 'Unassigned'))},
  {id:'priority',label:'Priority',width:116,render:t=>cell('priority',`<span class="sheet-priority sheet-priority-${escapeHtml(String(t.priority || '').toLowerCase())}">${escapeHtml(t.priority||'—')}</span>`,'',true)},
  {id:'status',label:'Status',width:144,render:t=>cell('status',`<span class="status ${statusClass(t.status)}">${escapeHtml(t.status||'—')}</span>`)},
  {id:'progress',label:'Progress',width:155,render:t=>cell('progress',`<div class="task-sheet-progress"><span>${p(t)}%</span><div class="task-sheet-progress-track"><i style="width:${p(t)}%"></i></div></div>`,'',true)},
  {id:'startDate',label:'Start Date',width:140,render:t=>cell('startDate',date(t.startDate))},
  {id:'deadline',label:'Deadline',width:145,render:t=>cell('deadline',date(t.deadline),'',true)},
  {id:'updated',label:'Updated',width:160,render:t=>cell('updated',updated(t.updatedAt))},
];
export const DEFAULT_TASK_SHEET_COLUMNS = ['task','project','assignee','status','deadline','priority','progress'];
export const COLUMN_SORT = Object.freeze({task:'title-asc',project:'project-asc',department:'department-asc',assignee:'assignee-asc',priority:'priority-desc',status:'status-asc',progress:'progress-desc',deadline:'deadline-asc',updated:'updated-desc'});
export const REVERSE_COLUMN_SORT = Object.freeze({task:'title-desc',project:'project-desc',department:'department-desc',assignee:'assignee-desc',priority:'priority-asc',status:'status-desc',progress:'progress-asc',deadline:'deadline-desc',updated:'updated-asc'});
export function renderTaskSheet(tasks, visible = DEFAULT_TASK_SHEET_COLUMNS, settings = {}) {
  const ids = new Set(visible);
  const cols = [...ids].map(id=>TASK_SHEET_COLUMNS.find(c=>c.id===id)).filter(Boolean);
  if (!cols.length) cols.push(TASK_SHEET_COLUMNS[0]);
  const widths = settings.widths || {};
  const sort = settings.sort || 'updated-desc';
  const measured = (c) => Math.min(720,Math.max(96,Number(widths[c.id])||c.width));
  const totalWidth = 52 + cols.reduce((sum,c)=>sum+measured(c),0);
  const direction = (v) => v.endsWith('-desc') ? 'descending' : 'ascending';
  const colSort = c => [COLUMN_SORT[c.id],REVERSE_COLUMN_SORT[c.id]].includes(sort);
  return `<div class="task-sheet-mobile-hint">Scroll sideways to see more columns. Double-click editable fields to modify permitted values.</div>
  <div class="task-sheet-wrap" role="region" aria-label="Task spreadsheet" tabindex="0">
  <table class="task-sheet-table" aria-label="Task spreadsheet" style="width:${totalWidth}px"><colgroup><col class="sheet-index-col" style="width:52px">${cols.map(c=>`<col data-column-width="${c.id}" style="width:${Math.min(720,Math.max(96,Number(widths[c.id])||c.width))}px">`).join('')}</colgroup>
  <thead><tr><th scope="col" class="sheet-index-heading">#</th>${cols.map(c=>`<th scope="col" data-sheet-heading="${c.id}" aria-sort="${colSort(c) ? direction(sort) : 'none'}"><div class="sheet-heading-inner">${COLUMN_SORT[c.id]?`<button type="button" data-sheet-sort="${COLUMN_SORT[c.id]}" aria-label="Sort by ${escapeHtml(c.label)}">${escapeHtml(c.label)}<span aria-hidden="true">${colSort(c)?(sort.endsWith('-desc')?' ▾':' ▴'):' ↕'}</span></button>`:`<span>${escapeHtml(c.label)}</span>`}<span class="sheet-column-resizer" role="separator" aria-orientation="vertical" aria-label="Resize ${escapeHtml(c.label)} column" tabindex="0" data-resize-col="${c.id}"></span></div></th>`).join('')}</tr></thead>
  <tbody>${tasks.length?tasks.map((task,i)=>`<tr class="task-sheet-row task-row ${task.id===settings.selectedId?'selected':''}" data-task-id="${escapeHtml(task.id)}" tabindex="0" aria-selected="${task.id===settings.selectedId}" aria-label="${escapeHtml(task.title)}"><td class="sheet-row-number">${i+1}</td>${cols.map(c=>c.render(task)).join('')}</tr>`).join(''):`<tr><td colspan="${cols.length+1}" class="sheet-empty-cell"><div class="empty">No tasks match your filters. Try resetting the filters.</div></td></tr>`}</tbody></table></div>`;
}
