/** M2 event governance. Event-scoped capabilities NEVER grant permanent OMS permissions. */
import { ApiError } from '../utils/api-error';
import { getProject } from './project.service';
import { getTask, validateTaskCreationFields } from './task.service';
import { createTaskTransaction } from '../repositories/tasks.repository';
import { findDepartmentById } from '../repositories/departments.repository';
import type { Env } from '../types/env';
import type { AuthenticatedUser } from '../types/user';
import type { EventStatus, EventDto, EventRole, EventPermissions } from '../types/event';

const steps: EventStatus[] = ['Draft','For Approval','Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure','Completed'];
const eventRoles: EventRole[] = ['Event Director','Event Co-Director','Team Head','Team Co-Head','Team Member'];
const leadershipRoles: EventRole[] = ['Event Director','Event Co-Director'];
const activeStages: EventStatus[] = ['Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure'];
const taskCreationStages: EventStatus[] = ['Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event'];

async function eventTaskCapabilities(env:Env,user:AuthenticatedUser,eventId:string,status:EventStatus) {
 const denied={canCreateEventTask:false,canCreateTeamTask:false,creatableTeamIds:[] as string[]};
 if(user.status!=='Active'||!taskCreationStages.includes(status))return denied;
 const director=await env.DB.prepare(`SELECT 1 FROM event_appointments WHERE event_id=? AND user_id=? AND role='Event Director' AND status='Accepted' AND ended_at IS NULL`).bind(eventId,user.id).first();
 const eventAllowed=isLeader(user)||Boolean(director);
 const teams=await env.DB.prepare(`SELECT t.id FROM event_teams t WHERE t.event_id=? AND (?=1 OR EXISTS (
  SELECT 1 FROM event_appointments a WHERE a.team_id=t.id AND a.event_id=t.event_id AND a.user_id=? AND a.role='Team Head' AND a.status='Accepted' AND a.ended_at IS NULL))`).bind(eventId,eventAllowed?1:0,user.id).all<{id:string}>();
 return {canCreateEventTask:eventAllowed,canCreateTeamTask:teams.results.length>0,creatableTeamIds:teams.results.map(t=>t.id)};
}

/** Narrow creation grant; does not call the general endpoint as an elevated actor. */
export async function createEventTask(env:Env,user:AuthenticatedUser,eventId:string,payload:unknown) {
 const r=await visible(env,user,eventId), b=bodyObject(payload);
 fields(b,['requestId','teamId','title','description','instructions','priority','startDate','deadline']);
 const requestId=text(b.requestId,'Request ID',100,true)!;
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))throw bad('Request ID must be a stable random key of 16–100 characters.');
 const teamId=text(b.teamId,'Team ID',128);
 const capabilities=await eventTaskCapabilities(env,user,eventId,r.status);
 if(!capabilities.canCreateEventTask&&!(teamId&&capabilities.creatableTeamIds.includes(teamId)))throw forbidden();
 if(teamId&&!capabilities.creatableTeamIds.includes(teamId))throw forbidden();
 const department=await findDepartmentById(env,user.department.id);
 if(!department||department.status!=='Active')throw bad('Your permanent department must be active.');
 const values=validateTaskCreationFields(b);
 const canonical=JSON.stringify({teamId,departmentId:user.department.id,...values});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 const existing=()=>env.DB.prepare(`SELECT task_id AS taskId,payload_hash AS payloadHash FROM event_task_creation_requests WHERE event_id=? AND actor_id=? AND request_id=?`).bind(eventId,user.id,requestId).first<{taskId:string,payloadHash:string}>();
 const replay=async (record:{taskId:string,payloadHash:string})=>{
  if(record.payloadHash!==hash)throw conflict('This request ID was already used with different task fields.');
  return {task:await getTask(env,user,record.taskId),replayed:true};
 };
 const previous=await existing();if(previous)return replay(previous);
 const taskId=`task_${id()}`,at=now();
 try {
  await createTaskTransaction(env,{id:taskId,...values,departmentId:user.department.id,projectId:null,assigneeUserId:null},user,[
   env.DB.prepare(`INSERT INTO event_task_creation_requests(event_id,actor_id,request_id,payload_hash,task_id,team_id,department_id,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(eventId,user.id,requestId,hash,taskId,teamId,user.department.id,at),
   env.DB.prepare(`INSERT INTO event_task_links(task_id,event_id,team_id,linked_by,linked_at) VALUES(?,?,?,?,?)`).bind(taskId,eventId,teamId,user.id,at),
   audit(env,user,'EVENT_TASK_CREATED',eventId,null,JSON.stringify({taskId,teamId,requestId}),at)
  ]);
 }catch(error){
  // A concurrent identical submission may have committed after our initial read.
  const committed=await existing();if(committed)return replay(committed);
  if(String(error).includes('OMS_STATE_CONFLICT'))throw conflict('Event stage, appointment, account, or department changed. Refresh and try again.');
  throw error;
 }
 return {task:await getTask(env,user,taskId),replayed:false};
}
const isLeader=(user:AuthenticatedUser)=>user.role==='Lead'||user.role==='Co-Lead';
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const bad=(message:string)=>new ApiError(400,'VALIDATION_ERROR',message);
const forbidden=()=>new ApiError(403,'FORBIDDEN','You are not permitted to perform this event action.');
const conflict=(message:string)=>new ApiError(409,'EVENT_CONFLICT',message);
function bodyObject(value:unknown): Record<string,unknown> {
 if(!value || typeof value!=='object'||Array.isArray(value))throw bad('A JSON object is required.');
 return value as Record<string,unknown>;
}
function fields(b:Record<string,unknown>,names:string[]) {
 const extra=Object.keys(b).find(k=>!names.includes(k)); if(extra)throw bad(`Unsupported field: ${extra}.`);
}
function text(v:unknown,name:string,max=4000,required=false):string|null{
 if(v===null||v===undefined||v===''){if(required)throw bad(`${name} is required.`);return null;}
 if(typeof v!=='string')throw bad(`${name} must be text.`);
 const s=v.trim();if(s.length>max||(required&&!s))throw bad(`${name} is invalid.`);return s||null;
}
function integer(v:unknown,name:string):number|null{
 if(v===null||v===undefined||v==='')return null;
 if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>10000000)throw bad(`${name} must be a nonnegative integer.`);
 return v;
}
function money(v:unknown):number|null{
 if(v===null||v===undefined||v==='')return null;
 if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000000000)throw bad('Budget must be a nonnegative number.');return v;
}
function date(v:unknown,name:string):string|null{
 const s=text(v,name,40);if(s&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s))throw bad(`${name} must be an ISO datetime.`);
 if(s&&!Number.isFinite(Date.parse(s)))throw bad(`${name} is invalid.`);return s;
}
interface EventRow {
 id:string;name:string;description:string|null;objectives:string|null;eventType:string;venue:string|null;
 startsAt:string|null;endsAt:string|null;expectedAttendance:number|null;proposedBudget:number|null;
 projectId:string|null;projectName:string|null; proposedDirectorId:string|null;createdBy:string;status:EventStatus;createdAt:string;updatedAt:string;
}
const eventSelect=`SELECT e.id,e.name,e.description,e.objectives,e.event_type AS eventType,e.venue,
 e.starts_at AS startsAt,e.ends_at AS endsAt,e.expected_attendance AS expectedAttendance,
 e.proposed_budget AS proposedBudget,e.project_id AS projectId,p.name AS projectName,
 e.proposed_director_id AS proposedDirectorId,e.created_by AS createdBy,e.status,
 e.created_at AS createdAt,e.updated_at AS updatedAt FROM events e
 LEFT JOIN projects p ON p.id=e.project_id`;
async function row(env:Env,eventId:string):Promise<EventRow>{
 const found=await env.DB.prepare(`${eventSelect} WHERE e.id=?`).bind(eventId).first<EventRow>();
 if(!found)throw new ApiError(404,'EVENT_NOT_FOUND','Event not found.');return found;
}
async function appointmentRoles(env:Env,eventId:string,userId:string):Promise<Set<EventRole>>{
 const result=await env.DB.prepare(`SELECT a.role FROM event_appointments a JOIN users u ON u.id=a.user_id
 WHERE a.event_id=? AND a.user_id=? AND a.status='Accepted' AND u.status='Active'`).bind(eventId,userId).all<{role:EventRole}>();
 return new Set(result.results.map(r=>r.role));
}
function canSee(user:AuthenticatedUser,r:EventRow){return isLeader(user)||r.createdBy===user.id||!['Draft','For Approval','Rejected'].includes(r.status);}
async function permissions(env:Env,user:AuthenticatedUser,r:EventRow):Promise<EventPermissions>{
 const leader=isLeader(user), roles=await appointmentRoles(env,r.id,user.id);
 const director=roles.has('Event Director')||roles.has('Event Co-Director');
 const head=roles.has('Team Head');
 const editable= r.status==='Draft'&&(leader||r.createdBy===user.id);
 const stages=activeStages.includes(r.status);
 const creation=await eventTaskCapabilities(env,user,r.id,r.status);
 return {...creation,canEdit:editable,canSubmit:editable,canApprove:leader&&r.status==='For Approval',
 canAdvance:(leader||director)&&stages&&r.status!=='For Closure',
 canManageTeams:(leader||director)&&stages&&r.status!=='For Closure',
 canProposeAppointment:(leader||director||head)&&stages&&r.status!=='For Closure',
 canLinkTasks:(leader||director)&&stages,
 canClose:leader&&r.status==='For Closure'};
}
async function dto(env:Env,user:AuthenticatedUser,r:EventRow):Promise<EventDto>{
 const p=await permissions(env,user,r);
 const discloseBudget=isLeader(user)||p.canManageTeams||r.createdBy===user.id;
 // An approved event can be visible organization-wide, but the optional linked
 // project may be department-restricted. Do not leak its id/name via Events.
 let projectId=r.projectId,projectName=r.projectName;
 if(projectId){
  try{await getProject(env,user,projectId);}
  catch(error){if(error instanceof ApiError && (error.status===403||error.status===404)){projectId=null;projectName=null;}else throw error;}
 }
 return {...r,projectId,projectName,proposedBudget:discloseBudget?r.proposedBudget:null,permissions:p};
}
async function visible(env:Env,user:AuthenticatedUser,eventId:string){const r=await row(env,eventId);if(!canSee(user,r))throw forbidden();return r;}
function audit(env:Env,user:AuthenticatedUser,action:string,eventId:string,oldValue:string|null,newValue:string|null,at:string){
 return env.DB.prepare(`INSERT INTO activity_log(id,occurred_at,actor_user_id,actor_name,actor_role,action,reference_type,reference_id,old_value,new_value)
 VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id(),at,user.id,user.name,user.role,action,'EVENT',eventId,oldValue,newValue);
}
function eventNotice(env:Env,userId:string,eventId:string,title:string,message:string,at:string,type:'Event Decision'|'Event Appointment'){
 return env.DB.prepare(`INSERT INTO notifications(id,user_id,type,title,message,reference_type,reference_id,status,created_at)
 VALUES(?,?,?,?,?,'EVENT',?,'Unread',?)`).bind(id(),userId,type,title,message,eventId,at);
}
function history(env:Env,user:AuthenticatedUser,eventId:string,from:string|null,to:string,remarks:string|null,at:string){
 return env.DB.prepare(`INSERT INTO event_stage_history(id,event_id,from_status,to_status,actor_id,remarks,created_at) VALUES(?,?,?,?,?,?,?)`)
 .bind(id(),eventId,from,to,user.id,remarks,at);
}
function stageUpdate(env:Env,eventId:string,from:string,to:string,at:string){
 return env.DB.prepare(`UPDATE events SET status=?,updated_at=? WHERE id=?`).bind(to,at,eventId);
}
async function linkedProject(env:Env,user:AuthenticatedUser,projectId:string|null){
 if(!projectId)return;
 const p=await getProject(env,user,projectId);
 if(p.status==='Archived')throw conflict('An archived project cannot receive new events.');
}
export async function listEvents(env:Env,user:AuthenticatedUser){
 const where=isLeader(user)?'':`WHERE e.created_by=? OR e.status NOT IN ('Draft','For Approval','Rejected')`;
 const query=env.DB.prepare(`${eventSelect} ${where} ORDER BY e.created_at DESC LIMIT 200`);
 const result=await (isLeader(user)?query:query.bind(user.id)).all<EventRow>();
 return Promise.all(result.results.map(r=>dto(env,user,r)));
}
export async function getEvent(env:Env,user:AuthenticatedUser,eventId:string){return dto(env,user,await visible(env,user,eventId));}
export async function createEvent(env:Env,user:AuthenticatedUser,payload:unknown){
 const b=bodyObject(payload);
 fields(b,['name','description','objectives','eventType','venue','startsAt','endsAt','expectedAttendance','proposedBudget','projectId','proposedDirectorId']);
 const name=text(b.name,'Event name',180,true)!;const desc=text(b.description,'Description');
 const projectId=text(b.projectId,'Project ID',128),directorId=text(b.proposedDirectorId,'Proposed director',128);
 await linkedProject(env,user,projectId);
 if(directorId){const u=await env.DB.prepare("SELECT id FROM users WHERE id=? AND status='Active'").bind(directorId).first();if(!u)throw bad('Proposed director must be an active OMS member.');}
 const startsAt=date(b.startsAt,'Start date'),endsAt=date(b.endsAt,'End date');
 if(startsAt&&endsAt&&endsAt<startsAt)throw bad('End date cannot precede start date.');
 const at=now(),eventId=id();
 await env.DB.batch([
 env.DB.prepare(`INSERT INTO events(id,name,description,objectives,event_type,venue,starts_at,ends_at,expected_attendance,proposed_budget,project_id,proposed_director_id,created_by,status,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'Draft',?,?)`).bind(eventId,name,desc,text(b.objectives,'Objectives'),text(b.eventType,'Event type',80)||'Other',text(b.venue,'Venue',255),startsAt,endsAt,integer(b.expectedAttendance,'Expected attendance'),money(b.proposedBudget),projectId,directorId,user.id,at,at),
 history(env,user,eventId,null,'Draft','Event created',at), audit(env,user,'EVENT_CREATED',eventId,null,'Draft',at)
 ]);
 return getEvent(env,user,eventId);
}
export async function editEvent(env:Env,user:AuthenticatedUser,eventId:string,payload:unknown){
 const r=await visible(env,user,eventId);if(!((await permissions(env,user,r)).canEdit))throw forbidden();
 const b=bodyObject(payload);fields(b,['name','description','objectives','eventType','venue','startsAt','endsAt','expectedAttendance','proposedBudget','projectId','proposedDirectorId']);
 const updated={name:b.name===undefined?r.name:text(b.name,'Event name',180,true)!,description:b.description===undefined?r.description:text(b.description,'Description'),
 objectives:b.objectives===undefined?r.objectives:text(b.objectives,'Objectives'),eventType:b.eventType===undefined?r.eventType:text(b.eventType,'Event type',80,true)!,
 venue:b.venue===undefined?r.venue:text(b.venue,'Venue',255),startsAt:b.startsAt===undefined?r.startsAt:date(b.startsAt,'Start date'),
 endsAt:b.endsAt===undefined?r.endsAt:date(b.endsAt,'End date'),expectedAttendance:b.expectedAttendance===undefined?r.expectedAttendance:integer(b.expectedAttendance,'Expected attendance'),
 proposedBudget:b.proposedBudget===undefined?r.proposedBudget:money(b.proposedBudget),projectId:b.projectId===undefined?r.projectId:text(b.projectId,'Project ID',128),
 proposedDirectorId:b.proposedDirectorId===undefined?r.proposedDirectorId:text(b.proposedDirectorId,'Proposed director',128)};
 if(updated.startsAt&&updated.endsAt&&updated.endsAt<updated.startsAt)throw bad('End date cannot precede start date.');
 await linkedProject(env,user,updated.projectId);
 if(updated.proposedDirectorId){const found=await env.DB.prepare("SELECT 1 FROM users WHERE id=? AND status='Active'").bind(updated.proposedDirectorId).first();if(!found)throw bad('Director must be an active member.');}
 const at=now();const result=await env.DB.batch([
 env.DB.prepare(`UPDATE events SET name=?,description=?,objectives=?,event_type=?,venue=?,starts_at=?,ends_at=?,expected_attendance=?,proposed_budget=?,project_id=?,proposed_director_id=?,updated_at=? WHERE id=?`)
 .bind(updated.name,updated.description,updated.objectives,updated.eventType,updated.venue,updated.startsAt,updated.endsAt,updated.expectedAttendance,updated.proposedBudget,updated.projectId,updated.proposedDirectorId,at,eventId),
 audit(env,user,'EVENT_UPDATED',eventId,null,JSON.stringify({fields:Object.keys(b)}),at)
 ]);
 if(result[0].meta.changes!==1)throw conflict('Event is no longer editable.');
 return getEvent(env,user,eventId);
}
export async function transitionEvent(env:Env,user:AuthenticatedUser,eventId:string,action:string,payload:unknown={}){
 const r=await visible(env,user,eventId);const b=bodyObject(payload);fields(b,['remarks','finalAttendance','finalExpense','financialValidated','recordsValidated','closureEvidence','readinessVerified','readinessEvidence']);
 const remarks=text(b.remarks,'Remarks',2000),at=now(); let target:EventStatus;
 let decision:string|null=null;
 if(action==='submit'){
  if(r.status!=='Draft'||!(await permissions(env,user,r)).canSubmit)throw forbidden();
  if(!r.name||!r.objectives||!r.startsAt||!r.venue)throw bad('Event brief requires name, objectives, proposed date, and venue/platform before submission.');
  target='For Approval';
 }else if(action==='approve'||action==='return'||action==='reject'){
  if(!isLeader(user)||r.status!=='For Approval')throw forbidden();
  if(action!=='approve'&&!remarks)throw bad('A reason is required.');
  target=action==='approve'?'Approved':action==='return'?'Draft':'Rejected';
  decision=action==='approve'?'Approved':action==='return'?'Returned':'Rejected';
 }else if(action==='revise'){
  if(r.status!=='Rejected'||!(isLeader(user)||r.createdBy===user.id))throw forbidden();
  target='Draft';
 }else if(action==='advance'){
  const p=await permissions(env,user,r);if(!p.canAdvance)throw forbidden();
  const index=steps.indexOf(r.status);target=steps[index+1];if(!target||target==='Completed')throw forbidden();
  if(r.status==='Preparation'){
   if(b.readinessVerified!==true||!remarks||!text(b.readinessEvidence,'Readiness evidence',500,true))
    throw bad('Readiness requires documented human verification and an evidence reference.');
  }
  if(r.status==='Team Formation'){
   const director=await env.DB.prepare(`SELECT 1 FROM event_appointments WHERE event_id=? AND role='Event Director' AND status='Accepted'`).bind(eventId).first();
   if(!director)throw conflict('An accepted Event Director is required before Planning.');
  }
 }else if(action==='close'){
  if(!isLeader(user)||r.status!=='For Closure')throw forbidden();
  // Records and financial verification are human attestations, NOT a substitute for the pending SOP.
  if(b.recordsValidated!==true||b.financialValidated!==true||!remarks||!text(b.closureEvidence,'Closure reference',500,true))
   throw bad('Closure requires documented record/financial review, evidence reference and remarks.');
  if(b.finalAttendance===null||b.finalAttendance===undefined||b.finalExpense===null||b.finalExpense===undefined)throw bad('Final attendance and expense amounts are required.');
  integer(b.finalAttendance,'Final attendance');money(b.finalExpense);
  target='Completed';decision='Closure Approved';
 }else if(action==='cancel'){
  if(!isLeader(user)||r.status==='Completed'||r.status==='Cancelled'||!remarks)throw forbidden();target='Cancelled';
 }else throw bad('Unknown event action.');
 const statements=[];
 if(action==='close')statements.push(env.DB.prepare(`INSERT INTO event_closure_records(event_id,final_attendance,final_expense,financial_validated,records_validated,evidence_reference,remarks,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?)`)
  .bind(eventId,b.finalAttendance,b.finalExpense,1,1,b.closureEvidence,remarks,user.id,at));
 if(decision)statements.push(env.DB.prepare(`INSERT INTO event_approvals(id,event_id,decision,actor_id,remarks,created_at) VALUES(?,?,?,?,?,?)`).bind(id(),eventId,decision,user.id,remarks||'Approved by authorized organizational officer',at));
 if(['approve','return','reject','close'].includes(action) && r.createdBy!==user.id){
  statements.push(eventNotice(env,r.createdBy,eventId,'Event decision',`Event ${r.name}: ${target}`,at,'Event Decision'));
 }
 if(action==='submit'){
  const leaders=await env.DB.prepare("SELECT id FROM users WHERE role IN ('Lead','Co-Lead') AND status='Active'").all<{id:string}>();
  for(const recipient of leaders.results){if(recipient.id!==user.id)statements.push(eventNotice(env,recipient.id,eventId,'Event awaiting approval',`Review event proposal: ${r.name}`,at,'Event Decision'));}
 }
 statements.push(stageUpdate(env,eventId,r.status,target,at),history(env,user,eventId,r.status,target,remarks,at),
 audit(env,user,decision?'EVENT_'+decision.toUpperCase().replaceAll(' ','_'):'EVENT_STAGE_CHANGED',eventId,r.status,JSON.stringify({status:target,remarks,...(action==='close'?{finalAttendance:b.finalAttendance??null,finalExpense:b.finalExpense??null,closureEvidence:b.closureEvidence}: {}),...(r.status==='Preparation'?{readinessEvidence:b.readinessEvidence}: {})}),at));
 // Closure and appointment termination must commit atomically.
 if(target==='Completed'||target==='Cancelled') statements.push(
  env.DB.prepare(`UPDATE event_appointments SET status='Ended',ended_at=? WHERE event_id=? AND status IN ('Proposed','Accepted')`).bind(at,eventId)
 );
 await env.DB.batch(statements);
 return getEvent(env,user,eventId);
}
export async function getEventWorkspace(env:Env,user:AuthenticatedUser,eventId:string){
 const r=await visible(env,user,eventId),p=await permissions(env,user,r);
 const [teams,appointments,approvals,stages,linked,closure]=await Promise.all([
 env.DB.prepare('SELECT id,event_id AS eventId,name,purpose,created_at AS createdAt FROM event_teams WHERE event_id=? ORDER BY created_at').bind(eventId).all(),
 env.DB.prepare(`SELECT a.id,a.team_id AS teamId,a.user_id AS userId,u.name AS userName,a.role,a.status,a.responsibilities,a.proposed_by AS proposedBy,a.proposed_at AS proposedAt,a.responded_at AS respondedAt,a.reports_to_id AS reportsToId FROM event_appointments a JOIN users u ON u.id=a.user_id WHERE a.event_id=? ORDER BY a.proposed_at`).bind(eventId).all(),
 env.DB.prepare(`SELECT id,decision,actor_id AS actorId,remarks,created_at AS createdAt FROM event_approvals WHERE event_id=? ORDER BY created_at DESC`).bind(eventId).all(),
 env.DB.prepare(`SELECT from_status AS fromStatus,to_status AS toStatus,actor_id AS actorId,remarks,created_at AS createdAt FROM event_stage_history WHERE event_id=? ORDER BY created_at DESC`).bind(eventId).all(),
 env.DB.prepare(`SELECT l.task_id AS taskId,t.title,t.status,t.project_id AS projectId,l.team_id AS teamId FROM event_task_links l JOIN tasks t ON t.id=l.task_id WHERE l.event_id=? ORDER BY t.updated_at DESC`).bind(eventId).all<{taskId:string,title:string,status:string,projectId:string|null,teamId:string|null}>(),
 env.DB.prepare(`SELECT final_attendance AS finalAttendance,final_expense AS finalExpense,evidence_reference AS evidenceReference,remarks,approved_at AS approvedAt FROM event_closure_records WHERE event_id=?`).bind(eventId).first()
 ]);
 // Event visibility must not bypass task permission checks.
 const tasks=[];
 for(const item of linked.results){try{const task=await getTask(env,user,item.taskId);tasks.push({...item,...task});}catch(e){if(!(e instanceof ApiError)||![403,404].includes(e.status))throw e;}}
 return {event:await dto(env,user,r),teams:teams.results,appointments:appointments.results.filter((a:any)=>p.canManageTeams||isLeader(user)||a.userId===user.id||!['Proposed','Declined'].includes(a.status)),approvals:approvals.results,stages:stages.results,tasks,closure:closure??null};
}
export async function addEventTeam(env:Env,user:AuthenticatedUser,eventId:string,payload:unknown){
 const r=await visible(env,user,eventId);if(!(await permissions(env,user,r)).canManageTeams)throw forbidden();
 const b=bodyObject(payload);fields(b,['name','purpose']);const name=text(b.name,'Team name',120,true)!,purpose=text(b.purpose,'Team purpose',1500);
 const teamId=id(),at=now();await env.DB.batch([
 env.DB.prepare(`INSERT INTO event_teams(id,event_id,name,purpose,created_by,created_at) VALUES(?,?,?,?,?,?)`).bind(teamId,eventId,name,purpose,user.id,at),
 audit(env,user,'EVENT_TEAM_CREATED',eventId,null,name,at)
 ]);return {id:teamId,name,purpose};
}
export async function proposeEventAppointment(env:Env,user:AuthenticatedUser,eventId:string,payload:unknown){
 const r=await visible(env,user,eventId);if(!(await permissions(env,user,r)).canProposeAppointment)throw forbidden();
 const b=bodyObject(payload);fields(b,['userId','teamId','role','responsibilities','reportsToId']);
 const userId=text(b.userId,'Member ID',128,true)!,role=b.role as EventRole;
 if(!eventRoles.includes(role))throw bad('Invalid event role.');
 const teamId=text(b.teamId,'Team ID',128),reportsToId=text(b.reportsToId,'Reports-to appointment ID',128);
 if(leadershipRoles.includes(role)!==(!teamId))throw bad('Event directors cannot belong to a functional team; team positions require a team.');
 const target=await env.DB.prepare(`SELECT status FROM users WHERE id=?`).bind(userId).first<{status:string}>();
 if(!target||target.status!=='Active')throw bad('Appointee must be an active user.');
 const roles=await appointmentRoles(env,eventId,user.id),director=roles.has('Event Director')||roles.has('Event Co-Director');
 if(leadershipRoles.includes(role)&&!isLeader(user))throw forbidden();
 if(!isLeader(user)&&!director){
  if(!roles.has('Team Head')||!teamId)throw forbidden();
  const owned=await env.DB.prepare(`SELECT 1 FROM event_appointments WHERE event_id=? AND team_id=? AND user_id=? AND role='Team Head' AND status='Accepted'`).bind(eventId,teamId,user.id).first();
  if(!owned||!['Team Member','Team Co-Head'].includes(role))throw forbidden();
 }
 if(teamId){const team=await env.DB.prepare(`SELECT 1 FROM event_teams WHERE id=? AND event_id=?`).bind(teamId,eventId).first();if(!team)throw bad('Invalid event team.');}
 if(reportsToId){const report=await env.DB.prepare(`SELECT 1 FROM event_appointments WHERE id=? AND event_id=? AND status='Accepted'`).bind(reportsToId,eventId).first();if(!report)throw bad('Reports-to appointment must be accepted in this event.');}
 if(role==='Event Director'){
  const assigned=await env.DB.prepare(`SELECT 1 FROM event_appointments WHERE event_id=? AND role='Event Director' AND status IN ('Proposed','Accepted')`).bind(eventId).first();
  if(assigned)throw conflict('An Event Director is already proposed or appointed.');
  if(r.proposedDirectorId&&r.proposedDirectorId!==userId)throw conflict('Director differs from the approved event brief; revise through organizational approval.');
 }
 const appointmentId=id(),at=now(),responsibilities=text(b.responsibilities,'Responsibilities',2000,true)!;
 await env.DB.batch([
 env.DB.prepare(`INSERT INTO event_appointments(id,event_id,team_id,user_id,role,status,reports_to_id,responsibilities,proposed_by,proposed_at) VALUES(?,?,?,?,?,'Proposed',?,?,?,?)`).bind(appointmentId,eventId,teamId,userId,role,reportsToId,responsibilities,user.id,at),
 audit(env,user,'EVENT_APPOINTMENT_PROPOSED',eventId,null,JSON.stringify({appointmentId,userId,role,teamId}),at),
 eventNotice(env,userId,eventId,'Event appointment proposed',`${r.name}: ${role}. Accept or decline in Events.`,at,'Event Appointment')
 ]);
 return {id:appointmentId,status:'Proposed',userId,role};
}
export async function respondEventAppointment(env:Env,user:AuthenticatedUser,appointmentId:string,decision:'accept'|'decline'){
 const a=await env.DB.prepare(`SELECT id,event_id AS eventId,user_id AS userId,role,status FROM event_appointments WHERE id=?`).bind(appointmentId).first<{id:string,eventId:string,userId:string,role:EventRole,status:string}>();
 if(!a)throw new ApiError(404,'APPOINTMENT_NOT_FOUND','Appointment not found.');
 if(a.userId!==user.id)throw forbidden();
 const r=await visible(env,user,a.eventId);
 if(!activeStages.includes(r.status)||a.status!=='Proposed')throw conflict('Appointment is no longer available.');
 const at=now(),status=decision==='accept'?'Accepted':'Declined';
 const check=decision==='accept'&&a.role==='Event Director'?await env.DB.prepare(`SELECT 1 FROM event_appointments WHERE event_id=? AND role='Event Director' AND status='Accepted'`).bind(a.eventId).first():null;
 if(check)throw conflict('The Event Director position is already occupied.');
 await env.DB.batch([
 env.DB.prepare(`UPDATE event_appointments SET status=?,responded_at=? WHERE id=? AND status='Proposed'`).bind(status,at,appointmentId),
 audit(env,user,'EVENT_APPOINTMENT_'+status.toUpperCase(),a.eventId,'Proposed',JSON.stringify({appointmentId,role:a.role,status}),at)
 ]);
 return {id:appointmentId,status};
}
export async function endEventAppointment(env:Env,user:AuthenticatedUser,eventId:string,appointmentId:string,payload:unknown){
 const r=await visible(env,user,eventId);if(!(await permissions(env,user,r)).canManageTeams)throw forbidden();
 const b=bodyObject(payload);fields(b,['remarks']);const remarks=text(b.remarks,'Remarks',2000,true)!;
 const appointment=await env.DB.prepare(`SELECT role,status FROM event_appointments WHERE id=? AND event_id=?`).bind(appointmentId,eventId).first<{role:EventRole,status:string}>();
 if(!appointment||!['Accepted','Proposed'].includes(appointment.status))throw conflict('Appointment not active.');
 if(appointment.role==='Event Director'&&!isLeader(user))throw forbidden();
 const at=now();await env.DB.batch([
 env.DB.prepare(`UPDATE event_appointments SET status='Ended',ended_at=? WHERE id=? AND event_id=? AND status IN ('Accepted','Proposed')`).bind(at,appointmentId,eventId),
 audit(env,user,'EVENT_APPOINTMENT_ENDED',eventId,appointment.status,JSON.stringify({appointmentId,remarks}),at)
 ]);
 return {id:appointmentId,status:'Ended'};
}
export async function linkEventTask(env:Env,user:AuthenticatedUser,eventId:string,payload:unknown){
 const r=await visible(env,user,eventId);if(!(await permissions(env,user,r)).canLinkTasks)throw forbidden();
 const b=bodyObject(payload);fields(b,['taskId','teamId']);const taskId=text(b.taskId,'Task ID',128,true)!,teamId=text(b.teamId,'Team ID',128);
 const task=await getTask(env,user,taskId);
 if(!task.permissions.canEdit)throw forbidden(); // Event appointment cannot override M1 task scope
 if(task.projectId&&r.projectId&&task.projectId!==r.projectId)throw conflict('Task belongs to a different project.');
 if(teamId){const exists=await env.DB.prepare('SELECT 1 FROM event_teams WHERE id=? AND event_id=?').bind(teamId,eventId).first();if(!exists)throw bad('Team is not part of this event.');}
 const existing=await env.DB.prepare('SELECT event_id AS eventId FROM event_task_links WHERE task_id=?').bind(taskId).first<{eventId:string}>();
 if(existing)throw conflict('Task is already associated with an event.');
 const at=now();await env.DB.batch([
 env.DB.prepare(`INSERT INTO event_task_links(task_id,event_id,team_id,linked_by,linked_at) VALUES(?,?,?,?,?)`).bind(taskId,eventId,teamId,user.id,at),
 audit(env,user,'EVENT_TASK_LINKED',eventId,null,JSON.stringify({taskId,teamId}),at)
 ]);return {taskId,eventId,teamId};
}
export async function unlinkEventTask(env:Env,user:AuthenticatedUser,eventId:string,taskId:string){
 const r=await visible(env,user,eventId);if(!(await permissions(env,user,r)).canLinkTasks)throw forbidden();
 const task=await getTask(env,user,taskId);if(!task.permissions.canEdit)throw forbidden();
 const found=await env.DB.prepare(`SELECT 1 FROM event_task_links WHERE event_id=? AND task_id=?`).bind(eventId,taskId).first();if(!found)throw new ApiError(404,'EVENT_TASK_NOT_FOUND','Task link not found.');
 const at=now();await env.DB.batch([
 env.DB.prepare(`DELETE FROM event_task_links WHERE event_id=? AND task_id=?`).bind(eventId,taskId),
 audit(env,user,'EVENT_TASK_UNLINKED',eventId,taskId,null,at)
 ]);return {ok:true};
}
export async function listMyEventAppointments(env:Env,user:AuthenticatedUser){
 const result=await env.DB.prepare(`SELECT a.id,a.event_id AS eventId,e.name AS eventName,a.team_id AS teamId,a.role,a.responsibilities,a.status,a.proposed_at AS proposedAt
 FROM event_appointments a JOIN events e ON e.id=a.event_id WHERE a.user_id=? AND a.status='Proposed' AND e.status IN ('Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure') ORDER BY a.proposed_at DESC`).bind(user.id).all();
 return result.results;
}
