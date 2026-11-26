/** Pure task-list transformations. M1 context is either independent or Project.
 * A later Events milestone may extend taskContext without changing existing records.
 */
export function taskContext(task) {
  return task.eventId ? { type: 'event', id:task.eventId, name:task.eventName||'Event' } : task.projectId ? { type: 'project', id: task.projectId, name: task.projectName || 'Project' } : { type: 'independent', id: null, name: 'Independent' };
}
export const PRIORITY_RANK = Object.freeze({ Critical: 4, Urgent: 4, High: 3, Medium: 2, Normal: 2, Low: 1 });
export const TASK_SORTS = Object.freeze(['updated-desc','updated-asc','deadline-asc','deadline-desc','title-asc','title-desc','department-asc','department-desc','priority-desc','priority-asc','status-asc','status-desc','assignee-asc','assignee-desc','project-asc','project-desc','progress-desc','progress-asc']);

export function filterAndSortTasks(tasks, filter = {}, now = new Date()) {
  const query = String(filter.search || '').trim().toLocaleLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const byDate = (t) => String(t.deadline || '').slice(0, 10);
  const output = tasks.filter(task => {
    if (query && ![task.id, task.title, task.eventName, task.eventTeamName, task.projectName, task.departmentName, task.assignee?.name, task.priority, task.status, task.description].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) return false;
    for (const [key, value] of [['status', task.status],['department',task.departmentName],['project',task.projectName],['event',task.eventId],['assignee',task.assignee?.name],['priority',task.priority]]) {
      if (filter[key] && filter[key] !== value) return false;
    }
    if (filter.context === 'independent' && (task.projectId || task.eventId)) return false;
    if (filter.context === 'project' && (!task.projectId || task.eventId)) return false;
    if (filter.context === 'event' && !task.eventId) return false;
    if (filter.deadlineFrom && (!byDate(task) || byDate(task) < filter.deadlineFrom)) return false;
    if (filter.deadlineTo && (!byDate(task) || byDate(task) > filter.deadlineTo)) return false;
    if (filter.overdue && (!task.deadline || new Date(`${byDate(task)}T00:00:00`).getTime() >= today || ['Completed', 'Archived'].includes(task.status))) return false;
    return true;
  });
  const sort = TASK_SORTS.includes(filter.sort) ? filter.sort : 'updated-desc';
  const stringCompare = (a,b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base', numeric:true });
  const time = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };
  const due = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
  const compare = (a,b) => {
    switch (sort) {
      case 'updated-asc': return time(a.updatedAt)-time(b.updatedAt);
      case 'deadline-asc': return (due(a.deadline) ?? Infinity)-(due(b.deadline) ?? Infinity);
      case 'deadline-desc': return (due(b.deadline) ?? -Infinity)-(due(a.deadline) ?? -Infinity);
      case 'title-asc': return stringCompare(a.title,b.title);
      case 'title-desc': return stringCompare(b.title,a.title);
      case 'department-asc': return stringCompare(a.departmentName,b.departmentName);
      case 'department-desc': return stringCompare(b.departmentName,a.departmentName);
      case 'priority-desc': return (PRIORITY_RANK[b.priority] || 0)-(PRIORITY_RANK[a.priority] || 0);
      case 'priority-asc': return (PRIORITY_RANK[a.priority] || 0)-(PRIORITY_RANK[b.priority] || 0);
      case 'status-asc': return stringCompare(a.status,b.status);
      case 'status-desc': return stringCompare(b.status,a.status);
      case 'assignee-asc': return stringCompare(a.assignee?.name,b.assignee?.name);
      case 'assignee-desc': return stringCompare(b.assignee?.name,a.assignee?.name);
      case 'project-asc': return stringCompare(a.projectName,b.projectName);
      case 'project-desc': return stringCompare(b.projectName,a.projectName);
      case 'progress-desc': return Number(b.progress || 0)-Number(a.progress || 0);
      case 'progress-asc': return Number(a.progress || 0)-Number(b.progress || 0);
      default: return time(b.updatedAt)-time(a.updatedAt);
    }
  };
  // Stable tie-break to avoid changing row positions on identical sort values.
  return output.map((task, index) => ({task,index})).sort((a,b) => compare(a.task,b.task) || a.index-b.index).map(({task}) => task);
}

export function safeColumnWidths(input = {}, allowedIds = []) {
  const clean = {};
  for (const id of allowedIds) {
    const n = Number(input[id]);
    if (Number.isFinite(n) && n >= 96 && n <= 720) clean[id] = Math.round(n);
  }
  return clean;
}

/** Coherent context changes for both Board and Sheet. */
export function normalizeTaskFilters(filter,changed='context') {
 const next={...filter};
 if(changed==='project'&&next.project){next.context='project';next.event='';}
 if(changed==='event'&&next.event){next.context='event';next.project='';}
 if(next.context==='independent'){next.project='';next.event='';}
 if(next.context==='event')next.project='';
 if(next.context==='project')next.event='';
 return next;
}
