/** Event workspace. Temporary event roles are granted solely by the server. */
import { api } from './api.js';
import { showToast, confirmAction } from './ui.js';
import { escapeHtml as h } from './safe-html.mjs';
import { formModal, openModal, closeActiveModal } from './modal-manager.js';
import { openTaskInspector } from './tasks.js';
const apiRoot='/api/events';
let selectedId=null;
let activeTab='Overview';
let listSearch='';
const stageNames=['Draft','For Approval','Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure','Completed'];
const nextStage=status=>stageNames[stageNames.indexOf(status)+1]||'Next';
const dateText=s=>s?new Date(s).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Not scheduled';
const safeStatus=s=>String(s||'').toLowerCase().replaceAll(/[^a-z0-9]+/g,'-');
const option=(value,label,selected=false)=>`<option value="${h(value)}" ${selected?'selected':''}>${h(label)}</option>`;
function selectOptions(items,label,id){return items.map(row=>option(row[id],label(row))).join('');}
function field(name,label,value='',extra=''){
 return `<label class="form-field"><span>${h(label)}</span><input name="${h(name)}" value="${h(value??'')}" ${extra}></label>`;
}
async function dialog(title, fields, submitLabel='Save'){return formModal({title,fields,submitLabel,size:fields.includes('event-fields-grid')?'large':'form'});}
const multiFields=(d)=>`<div class="event-fields-grid">${d}</div>`;
function header(items,pending){
 return `<section class="page-heading event-page-heading"><div><h1>Events</h1><p>Organize DSC activities with event-specific teams, appointments and approvals.</p></div><div class="event-heading-actions"><button type="button" class="button button-light" data-event-action="refresh" aria-label="Refresh Events only">↻ Refresh Events</button><button type="button" class="button button-primary" data-event-action="create">+ New Event</button></div></section>
  <div class="event-overview-stats"><div class="card"><strong>${items.length}</strong><span>Visible events</span></div><div class="card"><strong>${items.filter(e=>e.status==='For Approval').length}</strong><span>Awaiting approval</span></div><div class="card"><strong>${pending.length}</strong><span>My pending appointments</span></div></div>`;
}
function eventList(items){
 return `<section class="event-list card"><div class="event-list-search"><label for="event-search">Search events</label><input id="event-search" type="search" placeholder="Name, type, or status" autocomplete="off"></div><div data-event-list-items>
 ${items.map(e=>`<button type="button" data-event-id="${h(e.id)}" class="event-list-row ${e.id===selectedId?'is-selected':''}"><strong>${h(e.name)}</strong><span class="status ${safeStatus(e.status)}">${h(e.status)}</span><small>${h(e.eventType)} · ${h(dateText(e.startsAt))}${e.projectName?' · '+h(e.projectName):''}</small></button>`).join('')||'<p class="empty">No visible events yet.</p>'}</div></section>`;
}
function appointmentInbox(pending){
 if(!pending.length)return '';
 return `<section class="card event-inbox"><h2>Appointment requests</h2><p>Accept or decline event roles. Acceptance does not change your permanent DSC position.</p>
 ${pending.map(a=>`<div class="event-inbox-row"><div><strong>${h(a.role)}</strong><small>${h(a.eventName)} · ${h(a.responsibilities)}</small></div><div class="event-action-row"><button class="button button-primary" data-event-action="accept" data-appointment-id="${h(a.id)}">Accept</button><button class="button button-light" data-event-action="decline" data-appointment-id="${h(a.id)}">Decline</button></div></div>`).join('')}</section>`;
}
function actions(e){const p=e.permissions;
 return `<div class="event-action-row">
 ${p.canEdit?'<button class="button button-light" data-event-action="edit">Edit brief</button>':''}
 ${p.canSubmit?'<button class="button button-primary" data-event-action="submit">Submit for approval</button>':''}
 ${p.canApprove?'<button class="button button-primary" data-event-action="approve">Approve</button><button class="button button-light" data-event-action="return">Return</button><button class="button button-light" data-event-action="reject">Reject</button>':''}
 ${e.status==='Rejected'&&(e.createdBy===window.omsCurrentUser?.id||['Lead','Co-Lead'].includes(window.omsCurrentUser?.role))?'<button class="button button-light" data-event-action="revise">Revise proposal</button>':''}
 ${p.canAdvance?`<button class="button button-primary" data-event-action="advance">Advance to ${h(nextStage(e.status))}</button>`:''}
 ${p.canClose?'<button class="button button-primary" data-event-action="close">Approve closure</button>':''}
 </div>`;
}
function taskRow(t){return `<div class="event-task-row"><button type="button" class="button button-light event-task-open" data-event-action="task-detail" data-task-id="${h(t.taskId||t.id)}">${h(t.title)}</button><div><span class="status ${safeStatus(t.status)}">${h(t.status)}</span><small>${h(t.assignee?.name||'Unassigned')} · ${h(t.priority||'Medium')} · ${h(dateText(t.deadline))}${t.projectName?' · '+h(t.projectName):''}</small></div></div>`;}
function eventTasksPane(w){const p=w.event.permissions,canCreate=p.canCreateEventTask||p.canCreateTeamTask;
 const groups=[{id:null,name:'No Team'},...w.teams];
 return `<div class="event-pane-toolbar"><h3>Event tasks</h3>${canCreate?'<button class="button button-primary" data-event-action="new-task">+ New Task</button>':''}${p.canLinkTasks?'<button class="button button-light" data-event-action="link">Link Existing Task</button>':''}</div>
 <p>${w.tasks.length} total · ${w.tasks.filter(t=>t.status==='Ongoing').length} in progress · ${w.tasks.filter(t=>t.status==='For Review').length} awaiting review</p>
 ${w.tasks.length?groups.map(g=>{const tasks=w.tasks.filter(t=>(t.teamId||null)===g.id);return tasks.length?`<section class="event-task-group"><h4>${h(g.name)} (${tasks.length})</h4>${tasks.map(t=>taskRow(t)+(p.canLinkTasks?`<button class="button button-light" data-event-action="unlink" data-task-id="${h(t.taskId)}" aria-label="Unlink ${h(t.title)}">Unlink</button>`:'')).join('')}</section>`:'';}).join(''):'<p class="empty">No event tasks yet.</p>'}`;
}
function appointmentCard(a,w){const parent=w.appointments.find(x=>x.id===a.reportsToId);return `<div class="event-appointment"><div><strong>${h(a.userName)}</strong><small>${h(a.role)} · ${h(a.status)}</small><p>${h(a.responsibilities||'')}</p>${parent?`<small>Reports to ${h(parent.userName)} (${h(parent.role)})</small>`:''}</div>${w.event.permissions.canManageTeams&&['Proposed','Accepted'].includes(a.status)?`<button class="button button-light" data-event-action="end" data-appointment-id="${h(a.id)}">End appointment</button>`:''}</div>`;}
function organizationPane(w){const p=w.event.permissions,lead=w.appointments.filter(a=>!a.teamId&&a.status==='Accepted');return `
 <div class="event-pane-toolbar"><h3>Event Leadership</h3>${p.canManageTeams?'<button class="button button-light" data-event-action="team">+ Activate team</button>':''}${p.canProposeAppointment?'<button class="button button-primary" data-event-action="appoint">+ Propose appointment</button>':''}</div>
 <p class="event-policy-note">Temporary Event appointments preserve each member’s permanent department and organizational oversight.</p>
 <div class="event-org-leadership">${lead.map(a=>appointmentCard(a,w)).join('')||'<p>No accepted Event Director yet.</p>'}</div>
 ${w.appointments.some(a=>!a.teamId&&a.status==='Proposed')?`<h4>Pending leadership invitations</h4>${w.appointments.filter(a=>!a.teamId&&a.status==='Proposed').map(a=>appointmentCard(a,w)).join('')}`:''}
 <h3>Activated Teams (${w.teams.length})</h3><div class="event-org-teams">${w.teams.map(t=>{const roster=w.appointments.filter(a=>a.teamId===t.id),accepted=roster.filter(a=>a.status==='Accepted');return `<button type="button" class="event-team event-team-card" data-event-action="team-detail" data-team-id="${h(t.id)}"><strong>${h(t.name)}</strong><p>${h(t.purpose||'Functional Event Team')}</p><p>Head: ${h(accepted.find(a=>a.role==='Team Head')?.userName||'Awaiting acceptance')}</p>${accepted.some(a=>a.role==='Team Co-Head')?`<p>Co-Head: ${h(accepted.find(a=>a.role==='Team Co-Head').userName)}</p>`:''}<small>${accepted.length} accepted · ${roster.filter(a=>a.status==='Proposed').length} pending · ${w.tasks.filter(x=>x.teamId===t.id).length} tasks</small></button>`;}).join('')||'<p class="empty">No Event Teams activated.</p>'}</div>`;}
function eventDetails(workspace,operations=null){const {event:e,teams,appointments,approvals,stages,tasks,closure}=workspace,p=e.permissions;
 const tabs=['Overview','Organization','Tasks','Readiness','Operations','Records','Approvals','Activity'];
 let pane='';
 if(activeTab==='Overview')pane=`<div class="event-grid-info">
 ${[['Event type',e.eventType],['Date',dateText(e.startsAt)],['Venue',e.venue||'Not set'],['Project',e.projectName||'Independent event'],['Attendance estimate',e.expectedAttendance??'Not set'],['Proposed director',appointments.find(a=>a.role==='Event Director'&&a.status==='Accepted')?.userName||'Awaiting appointment']].map(([label,value])=>`<div class="event-info"><small>${h(label)}</small><strong>${h(value)}</strong></div>`).join('')}</div>
 <h3>Objectives</h3><p>${h(e.objectives||'No objectives recorded.')}</p><h3>Description</h3><p>${h(e.description||'No description recorded.')}</p>
 ${closure?`<h3>Official closure</h3><div class="event-grid-info"><div class="event-info"><small>Final attendance</small><strong>${h(closure.finalAttendance)}</strong></div><div class="event-info"><small>Final expense</small><strong>${h(closure.finalExpense)}</strong></div><div class="event-info"><small>Evidence reference</small><strong>${h(closure.evidenceReference)}</strong></div><div class="event-info"><small>Approved at</small><strong>${h(closure.approvedAt)}</strong></div></div>`:''}
 <p class="event-policy-note">Event approvals are performed by the Lead or Co-Lead within delegated authority. Permanent financial and university controls remain outside temporary Event appointments.</p>`;
 if(activeTab==='Organization')pane=organizationPane(workspace);
 if(activeTab==='Tasks')pane=eventTasksPane(workspace);
 if(activeTab==='Readiness' && operations){
 const items=operations.requirements.filter(x=>x.phase==='Readiness');
 pane=`<div class="event-pane-toolbar"><h3>Readiness requirements</h3>${p.canManageTeams?'<button class="button button-primary" data-m3-action="requirement" data-m3-phase="Readiness">+ Add requirement</button>':''}</div><p class="event-policy-note">Submitted evidence requires separate authorized verification. Activated incomplete requirements and unresolved High/Urgent issues block the READY stage.</p><p><strong>${items.filter(x=>x.status==='Verified').length} / ${items.length}</strong> readiness requirements verified</p>${items.map(x=>`<div class="event-task-row"><div><strong>${h(x.title)}</strong><small>${h(x.status)}</small></div>${(p.canManageTeams||x.owner_id===window.omsCurrentUser?.id)&&x.status==='Pending'?`<button class="button button-light" data-m3-action="submit" data-m3-id="${h(x.id)}">Submit evidence</button>`:''}${p.canManageTeams&&x.status==='Submitted'?`<button class="button button-primary" data-m3-action="verify" data-m3-id="${h(x.id)}">Verify</button>`:''}</div>`).join('')||'<p class="empty">No event-specific requirements activated. SOP templates have not been adopted.</p>'}`;
 }
 if(activeTab==='Operations' && operations){
 const issues=operations.issues.filter(x=>x.status!=='Resolved');
 pane=`<p class="event-ops-summary">${operations.schedule.length} activities · ${issues.length} open issues · ${(operations.notes||[]).length} coordination notes</p><div class="event-operations-grid">
 <section class="event-ops-panel"><div class="event-pane-toolbar"><h3>Program Schedule</h3>${p.canManageTeams?'<button class="button button-light" data-m3-action="schedule">+ Add activity</button>':''}</div>
 ${[...operations.schedule].sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))).map(x=>`<div class="event-task-row"><strong>${h(x.title)}</strong><small>${h(new Date(x.starts_at).toLocaleString())}${x.ends_at?' – '+h(new Date(x.ends_at).toLocaleTimeString()):''}</small></div>`).join('')||'<p class="empty">No activities scheduled.</p>'}</section>
 <section class="event-ops-panel"><div class="event-pane-toolbar"><h3>Issues &amp; Blockers</h3><button class="button button-light" data-m3-action="issue">Report issue</button></div>
 <p class="event-policy-note">Urgent safety or security concerns may be escalated directly.</p>
 ${issues.map(x=>`<div class="event-task-row"><div><strong>${h(x.title)}</strong><small>${h(x.severity)} · ${h(x.status)}${x.owner_name?' · '+h(x.owner_name):''}</small><p>${h(x.description||'')}</p></div>${x.status==='Open'?`<button class="button button-light" data-m3-action="escalate" data-m3-id="${h(x.id)}">Escalate</button>`:''}${p.canManageTeams?`<button class="button button-light" data-m3-action="resolve" data-m3-id="${h(x.id)}">Resolve</button>`:''}</div>`).join('')||'<p class="empty">No open issues.</p>'}
 ${operations.issues.some(x=>x.status==='Resolved')?`<details><summary>Resolved issues</summary>${operations.issues.filter(x=>x.status==='Resolved').map(x=>`<p>${h(x.title)} · ${h(x.resolution||'Resolved')}</p>`).join('')}</details>`:''}</section>
 <section class="event-ops-panel"><div class="event-pane-toolbar"><h3>Coordination Notes</h3><button class="button button-light" data-m3-action="note">+ Add note</button></div>
 ${[...(operations.notes||[])].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(n=>`<details class="event-note"><summary>${h(n.title)} · ${h(n.category)}</summary><small>${h(n.created_at)}</small><p>${h(n.details)}</p></details>`).join('')||'<p class="empty">No coordination notes yet.</p>'}</section></div>`;
 }
 if(activeTab==='Records' && operations){
 const items=operations.requirements.filter(x=>x.phase==='Closure');
 pane=`<div class="event-pane-toolbar"><h3>Document references</h3>${p.canManageTeams?'<button class="button button-primary" data-m3-action="record">+ Add record reference</button>':''}</div>${operations.records.map(x=>`<div class="event-task-row"><div><strong>${h(x.title)}</strong><small>${h(x.category)} · ${h(x.status||'Submitted')} · Reference: ${h(x.reference)}</small></div>${p.canManageTeams&&x.status==='Submitted'?`<button class="button button-primary" data-m3-action="review" data-m3-id="${h(x.id)}">Verify record</button>`:''}</div>`).join('')||'<p class="empty">No accessible records.</p>'}<div class="event-pane-toolbar"><h3>Closure requirements</h3>${p.canManageTeams?'<button class="button button-primary" data-m3-action="requirement" data-m3-phase="Closure">+ Add requirement</button>':''}</div>${items.map(x=>`<div class="event-task-row"><div><strong>${h(x.title)}</strong><small>${h(x.status)}</small></div>${(p.canManageTeams||x.owner_id===window.omsCurrentUser?.id)&&x.status==='Pending'?`<button class="button button-light" data-m3-action="submit" data-m3-id="${h(x.id)}">Submit evidence</button>`:''}${p.canManageTeams&&x.status==='Submitted'?`<button class="button button-primary" data-m3-action="verify" data-m3-id="${h(x.id)}">Verify</button>`:''}</div>`).join('')||'<p class="empty">No closure checklist activated.</p>'}
 <div class="event-pane-toolbar"><h3>Post-event debrief</h3>${p.canManageTeams&&!operations.debrief?'<button class="button button-primary" data-m3-action="debrief">Submit debrief</button>':''}</div>
 ${operations.debrief?`<p><strong>Summary:</strong> ${h(operations.debrief.summary)}</p><p><strong>Lessons learned:</strong> ${h(operations.debrief.lessons)}</p>`:'<p class="empty">No post-event debrief submitted.</p>'}`;
 }
 if(activeTab==='Approvals')pane=`<h3>Approval decisions</h3>${approvals.map(a=>`<div class="event-log-item"><strong>${h(a.decision)}</strong><small>${h(a.createdAt)}</small><p>${h(a.remarks)}</p></div>`).join('')||'<div class="empty">No approval decisions recorded.</div>'}`;
 if(activeTab==='Activity')pane=`<h3>Event lifecycle history</h3>${stages.map(s=>`<div class="event-log-item"><strong>${h(s.fromStatus||'New')} → ${h(s.toStatus)}</strong><small>${h(s.createdAt)}</small><p>${h(s.remarks||'')}</p></div>`).join('')}`;
 return `<section class="event-detail card"><div class="event-detail-head"><div><h2>${h(e.name)}</h2><p>${h(e.description||'Event governance workspace')}</p></div><span class="status ${safeStatus(e.status)}">${h(e.status)}</span></div>${actions(e)}
 <div class="event-tabs" role="tablist" aria-label="Event detail sections">${tabs.map(t=>`<button type="button" role="tab" aria-selected="${t===activeTab}" data-event-tab="${h(t)}" class="${t===activeTab?'selected':''}">${h(t)}</button>`).join('')}</div>
 <div class="event-tab-content">${pane}</div></section>`;
}
let currentRoot=null;let currentEvents=[];let currentWorkspace=null;let currentOperations=null;
async function refresh(){
 if(!currentRoot)return;
 // Preserve local Events state; never trigger whole-app navigation or reload.
 const searchText=currentRoot.querySelector('#event-search')?.value ?? listSearch;
 const listScroll=currentRoot.querySelector('.event-list')?.scrollTop || 0;
 const paneScroll=currentRoot.querySelector('.event-tab-content')?.scrollTop || 0;
 const focusAction=currentRoot.contains(document.activeElement)?document.activeElement?.dataset?.eventAction:null;
 const focusTab=currentRoot.contains(document.activeElement)?document.activeElement?.dataset?.eventTab:null;
 currentRoot.setAttribute('aria-busy','true');
 try{
  const [eventsResponse,appointmentsResponse]=await Promise.all([api.get(apiRoot),api.get(apiRoot+'/my-appointments')]);
  currentEvents=eventsResponse.events||[];const inbox=appointmentsResponse.appointments||[];
  if(selectedId&&!currentEvents.some(e=>e.id===selectedId)){selectedId=null;window.omsUpdateView?.('events');}
  // No auto-selection: events list is a browsing page, workspace opens on demand.
  currentWorkspace=selectedId?await api.get(`${apiRoot}/${encodeURIComponent(selectedId)}/workspace`):null;
  currentOperations=selectedId&&['Readiness','Operations','Records'].includes(activeTab)?await api.get(`/api/m3/events/${encodeURIComponent(selectedId)}/operations`):null;
  currentRoot.innerHTML=selectedId && currentWorkspace
    ? `<div class="event-fullpage"><nav class="event-breadcrumb"><button type="button" class="button button-light" data-event-back>← Back to Events</button><span>Events / ${h(currentWorkspace.event.name)}</span></nav>${eventDetails(currentWorkspace,currentOperations)}</div>`
    : header(currentEvents,inbox)+appointmentInbox(inbox)+`<div class="event-list-page">${eventList(currentEvents)}</div>`;
  const search=currentRoot.querySelector('#event-search');
  const filter=()=>{const term=(search?.value||'').toLowerCase();currentRoot.querySelectorAll('.event-list-row[data-event-id]').forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(term);});};
  if(search){search.value=searchText;listSearch=searchText;search.addEventListener('input',()=>{listSearch=search.value;filter();});filter();}
  if(currentRoot.querySelector('.event-list'))currentRoot.querySelector('.event-list').scrollTop=listScroll;
  if(currentRoot.querySelector('.event-tab-content'))currentRoot.querySelector('.event-tab-content').scrollTop=paneScroll;
  if(focusAction)[...currentRoot.querySelectorAll('[data-event-action]')].find(x=>x.dataset.eventAction===focusAction)?.focus({preventScroll:true});
  if(focusTab)[...currentRoot.querySelectorAll('[data-event-tab]')].find(x=>x.dataset.eventTab===focusTab)?.focus({preventScroll:true});
 }catch(err){currentRoot.innerHTML=`<div class="card event-load-error" role="alert"><h2>Events unavailable</h2><p>${h(err.message)}</p><button class="button button-light" data-event-action="retry">Try again</button></div>`;}
 finally {currentRoot?.removeAttribute('aria-busy');}
}
async function editDialog(e){
 const projects=await api.get('/api/projects');const users=await api.get('/api/users');
 const projectOpts=(projects.projects||[]).filter(p=>p.status!=='Archived').map(p=>option(p.id,p.name,p.id===e?.projectId)).join('');
 const directorOpts=(users.users||[]).filter(u=>u.status==='Active').map(u=>option(u.id,u.name+' — '+u.role,u.id===e?.proposedDirectorId)).join('');
 const data=await dialog(e?'Edit event brief':'Create event brief',multiFields(`
 ${field('name','Event name',e?.name||'','required maxlength="180"')}
 ${field('eventType','Event type',e?.eventType||'Workshop')}
 ${field('startsAt','Start (local time)',e?.startsAt?.slice(0,16)||'','type="datetime-local"')}
 ${field('endsAt','End (local time)',e?.endsAt?.slice(0,16)||'','type="datetime-local"')}
 ${field('venue','Venue or platform',e?.venue||'')}
 ${field('expectedAttendance','Expected attendance',e?.expectedAttendance??'','type="number" min="0"')}
 ${field('proposedBudget','Proposed budget',e?.proposedBudget??'','type="number" min="0" step="0.01"')}
 <label class="form-field"><span>Optional project</span><select name="projectId">${option('','Independent event')}${projectOpts}</select></label>
 <label class="form-field"><span>Proposed Event Director</span><select name="proposedDirectorId">${option('','To be nominated')}${directorOpts}</select></label>
 <label class="form-field form-span"><span>Objectives</span><textarea name="objectives">${h(e?.objectives||'')}</textarea></label>
 <label class="form-field form-span"><span>Description</span><textarea name="description">${h(e?.description||'')}</textarea></label>`));
 if(!data)return;
 const payload={name:data.name,eventType:data.eventType,startsAt:data.startsAt||null,endsAt:data.endsAt||null,venue:data.venue,objectives:data.objectives,description:data.description,
 expectedAttendance:data.expectedAttendance===''?null:Number(data.expectedAttendance),proposedBudget:data.proposedBudget===''?null:Number(data.proposedBudget),projectId:data.projectId||null,proposedDirectorId:data.proposedDirectorId||null};
 const res=e?await api.patch(`${apiRoot}/${encodeURIComponent(e.id)}`,payload):await api.post(apiRoot,payload);
 selectedId=res.event.id;activeTab='Overview';window.omsUpdateView?.('events',selectedId,activeTab);showToast(e?'Event brief updated.':'Event draft created.','success');await refresh();
}
async function actionClick(action,element){
 const eventId=currentWorkspace?.event?.id, e=currentWorkspace?.event;
 if(action==='retry'||action==='refresh')return refresh();
 if(action==='create'||action==='edit')return editDialog(action==='edit'?e:null);
 if(action==='accept'||action==='decline'){
  const ok=await confirmAction({title:action==='accept'?'Accept event appointment':'Decline event appointment',message:action==='accept'?'Confirm acceptance of this temporary, event-scoped appointment?':'Decline this proposed event role? This will not change your permanent DSC role.'});
  if(!ok)return;
  await api.post(`${apiRoot}/appointments/${encodeURIComponent(element.dataset.appointmentId)}/${action}`);
  showToast(`Appointment ${action==='accept'?'accepted':'declined'}.`,'success');return refresh();
 }
 if(!eventId)return;
 if(['submit','approve','return','reject','revise','advance','cancel','close'].includes(action)){
  let payload={};
  if(['return','reject','cancel','approve','close'].includes(action) || (action==='advance' && e.status==='Preparation')){
   const values=await dialog(action==='close'?'Official closure verification':action==='advance'?'Readiness verification':`${action[0].toUpperCase()+action.slice(1)} event`,
    `<label class="form-field"><span>Remarks ${action==='approve'?'(optional)':''}</span><textarea name="remarks" ${action==='approve'?'':'required'}></textarea></label>`+
    (action==='advance'?`${field('readinessEvidence','Readiness evidence reference','','required')}<label><input type="checkbox" name="readinessVerified" required> Applicable readiness requirements were verified by an authorized event officer</label>`:'')+
    (action==='close'?`${field('finalAttendance','Final attendance','0','type="number" min="0" required')}${field('finalExpense','Final expense','0','type="number" min="0" step="0.01" required')}${field('closureEvidence','Closure reference','','required')}<label><input type="checkbox" name="financialValidated" required> Financial records verified by an authorized officer</label><label><input type="checkbox" name="recordsValidated" required> Operational records verified by an authorized officer</label>`:''),action==='close'?'Record closure':'Confirm');
   if(!values)return;
   payload={remarks:values.remarks};if(action==='advance')Object.assign(payload,{readinessVerified:values.readinessVerified==='on',readinessEvidence:values.readinessEvidence});if(action==='close')Object.assign(payload,{finalAttendance:Number(values.finalAttendance),finalExpense:Number(values.finalExpense),closureEvidence:values.closureEvidence,financialValidated:values.financialValidated==='on',recordsValidated:values.recordsValidated==='on'});
  }
  if(action==='submit'||(action==='advance'&&e.status!=='Preparation')){const ok=await confirmAction({title:action==='submit'?'Submit event proposal':'Advance event stage',message:action==='submit'?'Submit the event brief for Lead/Co-Lead approval?':`Advance from ${e.status} to ${nextStage(e.status)}?`});if(!ok)return;}
  await api.post(`${apiRoot}/${encodeURIComponent(eventId)}/${action}`,payload);showToast('Event workflow updated.','success');return refresh();
 }
 if(action==='team'){
  const v=await dialog('Activate event team',`${field('name','Team name','','required maxlength="120"')}${field('purpose','Purpose')}`);if(!v)return;
  await api.post(`${apiRoot}/${encodeURIComponent(eventId)}/teams`,v);activeTab='Organization';showToast('Team activated.','success');return refresh();
 }
 if(action==='appoint'){
  const directory=await api.get('/api/users'),members=(directory.users||[]).filter(u=>u.status==='Active');
  const teamOptions=selectOptions(currentWorkspace.teams,t=>t.name,'id');
  const v=await dialog('Propose a temporary event appointment',`<label class="form-field"><span>Member</span><select name="userId" required>${option('','Choose member')}${selectOptions(members,u=>u.name+' — '+u.role,'id')}</select></label>
  <label class="form-field"><span>Event role</span><select name="role" required>${['Event Director','Event Co-Director','Team Head','Team Co-Head','Team Member'].map(x=>option(x,x)).join('')}</select></label>
  <label class="form-field"><span>Event team (required for team roles)</span><select name="teamId">${option('','Event leadership')}${teamOptions}</select></label>
  <label class="form-field"><span>Responsibilities</span><textarea name="responsibilities" required></textarea></label>`);
  if(!v)return;
  await api.post(`${apiRoot}/${encodeURIComponent(eventId)}/appointments`,{...v,teamId:v.teamId||null});activeTab='Organization';showToast('Appointment proposed; member acceptance required.','success');return refresh();
 }
 if(action==='end'){
  const reason=await dialog('End appointment',`<label class="form-field"><span>Reason</span><textarea name="remarks" required></textarea></label>`);
  if(!reason)return;await api.post(`${apiRoot}/${encodeURIComponent(eventId)}/appointments/${encodeURIComponent(element.dataset.appointmentId)}/end`,reason);showToast('Appointment ended.','success');return refresh();
 }
 if(action==='new-task'){
  const p=e.permissions,allowed=currentWorkspace.teams.filter(t=>p.creatableTeamIds?.includes(t.id));
  const requestId=crypto.randomUUID();
  const teamField=!p.canCreateEventTask&&allowed.length===1
   ? `${field('teamName','Event Team',allowed[0].name,'readonly')}<input type="hidden" name="teamId" value="${h(allowed[0].id)}">`
   : `<label class="form-field"><span>Event Team</span><select name="teamId" aria-label="Event Team" ${p.canCreateEventTask?'':'required'}>${p.canCreateEventTask?option('','No Team'):option('','Choose your team')}${selectOptions(allowed,t=>t.name,'id')}</select></label>`;
  const saved=await formModal({title:'New Event task',size:'large',submitLabel:'Create Task',fields:multiFields(`
   ${field('eventName','Event',e.name,'readonly')}${teamField}
   ${field('title','Task title','','required maxlength="200"')}
   <label class="form-field"><span>Priority</span><select name="priority">${['Low','Medium','High','Critical'].map(x=>option(x,x,x==='Medium')).join('')}</select></label>
   ${field('startDate','Start date','','type="date"')}${field('deadline','Deadline','','type="date"')}
   <label class="form-field form-span"><span>Description</span><textarea name="description" maxlength="5000"></textarea></label>
   <label class="form-field form-span"><span>Instructions / required output</span><textarea name="instructions" maxlength="5000"></textarea></label>
   <p class="event-policy-note form-span">Created unassigned, owned by your permanent department. Assignment, editing and review use existing OMS permissions.</p>`),
   onSubmit:async v=>{await api.post(`${apiRoot}/${encodeURIComponent(eventId)}/tasks/create`,{requestId,teamId:v.teamId||null,title:v.title,priority:v.priority,startDate:v.startDate||null,deadline:v.deadline||null,description:v.description,instructions:v.instructions});}});
  if(saved){showToast('Event task created.','success');await refresh();}return;
 }
 if(action==='task-detail')return openTaskInspector(element.dataset.taskId,refresh);
 if(action==='team-detail'){
  const team=currentWorkspace.teams.find(t=>t.id===element.dataset.teamId);if(!team)return;
  const roster=currentWorkspace.appointments.filter(a=>a.teamId===team.id);
  const modal=openModal({title:team.name,size:'detail',content:`<p>${h(team.purpose||'Functional Event Team')}</p><h3>Accepted team</h3>${roster.filter(a=>a.status==='Accepted').map(a=>appointmentCard(a,currentWorkspace)).join('')||'<p>No accepted members.</p>'}<h3>Invitations and history</h3>${roster.filter(a=>a.status!=='Accepted').map(a=>appointmentCard(a,currentWorkspace)).join('')||'<p>No invitations.</p>'}<h3>Team tasks</h3>${currentWorkspace.tasks.filter(t=>t.teamId===team.id).map(taskRow).join('')||'<p>No tasks yet.</p>'}`});
  modal.body.addEventListener('click',async ev=>{const btn=ev.target.closest('[data-event-action]');if(!btn)return;try{modal.close(true);await actionClick(btn.dataset.eventAction,btn);}catch(err){showToast(err.message,'error');}});return;
 }
 if(action==='link'){
  const response=await api.get('/api/tasks');const candidates=(response.tasks||[]).filter(t=>t.permissions?.canEdit&&!currentWorkspace.tasks.some(x=>x.taskId===t.id));
  if(!candidates.length){showToast('No editable tasks available to link.','info');return;}
  const values=await dialog('Link existing task',`<label class="form-field"><span>Task</span><select name="taskId" required>${selectOptions(candidates,t=>t.title+' — '+(t.projectName||'Independent'), 'id')}</select></label><label class="form-field"><span>Event team (optional)</span><select name="teamId">${option('','Unassigned team')}${selectOptions(currentWorkspace.teams,t=>t.name,'id')}</select></label>`);
  if(!values)return;await api.post(`${apiRoot}/${encodeURIComponent(eventId)}/tasks`,{taskId:values.taskId,teamId:values.teamId||null});activeTab='Tasks';showToast('Task linked.','success');return refresh();
 }
 if(action==='unlink'){
  const ok=await confirmAction({title:'Unlink task',message:'Remove this event association? The underlying OMS task will remain intact.'});if(!ok)return;
  await api.del(`${apiRoot}/${encodeURIComponent(eventId)}/tasks/${encodeURIComponent(element.dataset.taskId)}`);showToast('Task unlinked.','success');return refresh();
 }
}
async function m3Action(element){
 const action=element.dataset.m3Action,root=`/api/m3/events/${encodeURIComponent(selectedId)}`;
 if(action==='requirement'){
  const choices=(currentWorkspace?.appointments||[]).filter(a=>a.status==='Accepted');
  const payload=await dialog('Add event requirement',field('title','Requirement','','required maxlength="180"')+
   `<label class="form-field"><span>Responsible member (optional)</span><select name="ownerId">${option('','Unassigned')}${choices.map(a=>option(a.userId,a.userName+' — '+a.role)).join('')}</select></label>`+field('dueAt','Deadline (optional)','','type="datetime-local"'));
  if(!payload)return;await api.post(root+'/requirements',{title:payload.title,phase:element.dataset.m3Phase,ownerId:payload.ownerId||null,dueAt:payload.dueAt||null});
 }else if(action==='submit'){
  const payload=await dialog('Submit evidence for review',field('evidenceReference','Evidence reference','','required maxlength="1000"'));
  if(!payload)return;await api.post(root+'/requirements/'+encodeURIComponent(element.dataset.m3Id)+'/submit',payload);
 }else if(action==='verify'){
  const ok=await confirmAction({title:'Verify readiness requirement',message:'Confirm you have reviewed the submitted evidence and are authorized to verify it.'});if(!ok)return;
  await api.post(root+'/requirements/'+encodeURIComponent(element.dataset.m3Id)+'/verify',{});
 }else if(action==='issue'){
  const payload=await dialog('Report operational issue',field('title','Issue title','','required maxlength="180"')+`<label class="form-field"><span>Severity</span><select name="severity">${['Low','Medium','High','Urgent'].map(x=>option(x,x)).join('')}</select></label>`+field('description','Description'));
  if(!payload)return;await api.post(root+'/issues',payload);
 }else if(action==='escalate'){
  const ok=await confirmAction({title:'Escalate issue',message:'Alert event leadership and organizational authorities about this issue?'});
  if(!ok)return;await api.post(root+'/issues/'+encodeURIComponent(element.dataset.m3Id)+'/escalate',{});
 }else if(action==='resolve'){
  const payload=await dialog('Resolve issue',field('resolution','Resolution','','required maxlength="2000"'));
  if(!payload)return;await api.post(root+'/issues/'+encodeURIComponent(element.dataset.m3Id)+'/resolve',payload);
 }else if(action==='schedule'){
  const payload=await dialog('Add event activity',field('title','Activity title','','required maxlength="180"')+field('startsAt','Start date and time','','type="datetime-local" required')+field('endsAt','End (optional)','','type="datetime-local"'));
  if(!payload)return;await api.post(root+'/schedule',payload);
 }else if(action==='debrief'){
  const payload=await dialog('Record event debrief',`<label class="form-field"><span>Summary</span><textarea name="summary" required maxlength="4000"></textarea></label><label class="form-field"><span>Lessons learned</span><textarea name="lessons" required maxlength="4000"></textarea></label>`);
  if(!payload)return;await api.post(root+'/debrief',payload);
 }else if(action==='note'){
  const payload=await dialog('Record coordination note',field('title','Subject','','required maxlength="180"')+
   `<label class="form-field"><span>Type</span><select name="category">${['Meeting','Decision','Update'].map(x=>option(x,x)).join('')}</select></label>`+
   `<label class="form-field"><span>Details</span><textarea name="details" maxlength="4000" required></textarea></label>`);
  if(!payload)return;await api.post(root+'/notes',payload);
 }else if(action==='review'){
  const ok=await confirmAction({title:'Verify event record',message:'Confirm the referenced document or record has been reviewed under your event authority.'});if(!ok)return;
  await api.post(root+'/records/'+encodeURIComponent(element.dataset.m3Id)+'/review',{});
 }else if(action==='record'){
  const payload=await dialog('Add document reference',field('title','Record title','','required maxlength="180"')+field('category','Category','','required maxlength="80"')+field('reference','Protected reference / record ID','','required maxlength="1000"'));
  if(!payload)return;await api.post(root+'/records',payload);
 }
 showToast('Event record updated.','success');await refresh();
}
export async function renderEvents(root, view={}){
 currentRoot=root;
 selectedId=view.id || null;activeTab=view.tab || 'Overview';
 if(!root.dataset.eventsDelegated){root.dataset.eventsDelegated='1';root.addEventListener('click',async event=>{
  if(root.dataset.omsActiveModule && root.dataset.omsActiveModule!=='events')return;
  const back=event.target.closest('[data-event-back]');if(back){selectedId=null;activeTab='Overview';window.omsUpdateView?.('events',null,null);return refresh();}
  const tab=event.target.closest('[data-event-tab]');if(tab){activeTab=tab.dataset.eventTab;window.omsUpdateView?.('events',selectedId,activeTab);return refresh();}
  const row=event.target.closest('[data-event-id]');if(row){selectedId=row.dataset.eventId;activeTab='Overview';window.omsUpdateView?.('events',selectedId,activeTab);return refresh();}
  const m3=event.target.closest('[data-m3-action]');
  if(m3&&selectedId){if(m3.dataset.pending)return;m3.dataset.pending='1';m3.setAttribute('aria-disabled','true');try{await m3Action(m3);}catch(err){showToast(err.message||'Operation failed.','error');}finally{delete m3.dataset.pending;m3.removeAttribute('aria-disabled');}return;}
  const btn=event.target.closest('[data-event-action]');if(!btn)return;
  if(btn.dataset.pending)return;btn.dataset.pending='1';btn.setAttribute('aria-disabled','true');try{await actionClick(btn.dataset.eventAction,btn);}catch(err){showToast(err.message||'Event action failed.','error');}finally{delete btn.dataset.pending;btn.removeAttribute('aria-disabled');}
 });}
 await refresh();
}
