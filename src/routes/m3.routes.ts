import { Hono } from 'hono';
import { requireAuth } from '../middleware/authentication';
import { ApiError } from '../utils/api-error';
import type { AppEnv } from '../types/app';
import type { AuthenticatedUser } from '../types/user';
import { getEventWorkspace,getEvent } from '../services/event.service';
import { getProject } from '../services/project.service';

const m3=new Hono<AppEnv>({strict:false});
m3.use('*',requireAuth);
const uid=()=>crypto.randomUUID(), timestamp=()=>new Date().toISOString();
const deny=()=>{throw new ApiError(403,'FORBIDDEN','Not authorized for this operation.');};
const invalid=(message:string)=>{throw new ApiError(400,'VALIDATION_ERROR',message);};
const leader=(u:AuthenticatedUser)=>['Lead','Co-Lead'].includes(u.role);
const val=(v:unknown,name:string,max=1000,mandatory=true)=>{
 if(typeof v!=='string'||(mandatory&&!v.trim())||v.length>max)invalid(`${name} is invalid.`);
 return (v as string).trim();
};
async function body(c:any):Promise<Record<string,unknown>>{let b:unknown;try{b=await c.req.json();}catch{invalid('JSON body required.');}if(!b||typeof b!=='object'||Array.isArray(b))invalid('Object required.');return b as Record<string,unknown>;}
async function access(c:any,id:string,write=false){
 const user=c.get('user') as AuthenticatedUser;
 const ws=await getEventWorkspace(c.env,user,id);
 const actor=leader(user)||ws.event.permissions.canManageTeams;
 const appointment=actor?true:!!(await c.env.DB.prepare(`SELECT 1 FROM event_appointments WHERE event_id=? AND user_id=? AND status='Accepted'`).bind(id,user.id).first());
 if(!actor&&!appointment)deny();
 if(write&&!actor)deny();
 if(write&&['Completed','Cancelled'].includes(ws.event.status))deny();
 return {user,ws,actor,appointment};
}
async function log(c:any,user:AuthenticatedUser,eventId:string,action:string,reference:string){
 // Activity logs are written in the same D1 batch as the mutation.
 return c.env.DB.prepare(`INSERT INTO activity_log(id,occurred_at,actor_user_id,actor_name,actor_role,action,reference_type,reference_id,old_value,new_value) VALUES(?,?,?,?,?,?,?,?,?,?)`)
 .bind(uid(),timestamp(),user.id,user.name,user.role,action,'EVENT',eventId,null,reference);
}

m3.get('/summary',async c=>{
 const user=c.get('user') as AuthenticatedUser,at=timestamp(),isLead=leader(user);
 // No unpublished event details or unrelated operational records are disclosed.
 const [upcoming,upcomingCount,approvals,blockers,appointments,unread,closure]=await Promise.all([
  c.env.DB.prepare(`SELECT id,name,starts_at AS startsAt,status FROM events WHERE status IN ('Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing') AND (starts_at IS NULL OR starts_at>=?) ORDER BY starts_at LIMIT 5`).bind(at).all(),
  c.env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE status IN ('Approved','Team Formation','Planning','Preparation','Ready for Event','Ongoing') AND (starts_at IS NULL OR starts_at>=?)`).bind(at).first(),
  isLead?c.env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE status='For Approval'").first():Promise.resolve({n:0}),
  c.env.DB.prepare(`SELECT COUNT(*) AS n FROM event_issues i JOIN events e ON e.id=i.event_id WHERE i.status<>'Resolved' AND ( ?=1 OR EXISTS(SELECT 1 FROM event_appointments a WHERE a.event_id=e.id AND a.user_id=? AND a.status='Accepted'))`).bind(isLead?1:0,user.id).first(),
  c.env.DB.prepare("SELECT COUNT(*) AS n FROM event_appointments WHERE user_id=? AND status='Proposed'").bind(user.id).first(),
  c.env.DB.prepare(`SELECT COUNT(*) AS n FROM announcements a WHERE a.status='Published' AND (a.audience='Organization' OR a.department_id=?) AND NOT EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id=a.id AND r.user_id=?)`).bind(user.department.id,user.id).first(),
  c.env.DB.prepare(`SELECT COUNT(*) AS n FROM events e WHERE e.status='For Closure' AND (?=1 OR EXISTS(SELECT 1 FROM event_appointments a WHERE a.event_id=e.id AND a.user_id=? AND a.status='Accepted'))`).bind(isLead?1:0,user.id).first()
 ]);
 return c.json({upcomingEvents:upcoming.results,upcomingEventCount:upcomingCount?.n||0,pendingEventApprovals:approvals?.n||0,unresolvedEventIssues:blockers?.n||0,pendingAppointments:appointments?.n||0,unreadAnnouncements:unread?.n||0,awaitingEventClosure:closure?.n||0});
});
m3.get('/events/:id/operations',async c=>{
 const eventId=c.req.param('id'); const {user,actor}=await access(c,eventId);
 const [requirements,issues,records,schedule,debrief,notes]=await Promise.all([
 c.env.DB.prepare('SELECT * FROM event_requirements WHERE event_id=? ORDER BY phase,created_at').bind(eventId).all(),
 c.env.DB.prepare('SELECT * FROM event_issues WHERE event_id=? ORDER BY created_at DESC').bind(eventId).all(),
 actor?c.env.DB.prepare('SELECT * FROM event_records WHERE event_id=? ORDER BY created_at DESC').bind(eventId).all():c.env.DB.prepare("SELECT * FROM event_records WHERE event_id=? AND classification='Event Team' ORDER BY created_at DESC").bind(eventId).all(),
 c.env.DB.prepare('SELECT * FROM event_schedule_items WHERE event_id=? ORDER BY starts_at').bind(eventId).all(),
 c.env.DB.prepare('SELECT * FROM event_debriefs WHERE event_id=?').bind(eventId).first(),
 c.env.DB.prepare('SELECT * FROM event_coordination_notes WHERE event_id=? ORDER BY created_at DESC LIMIT 200').bind(eventId).all()
 ]);
 return c.json({requirements:requirements.results,issues:issues.results,records:records.results,schedule:schedule.results,debrief:debrief||null,notes:notes.results});
});
m3.post('/events/:id/requirements',async c=>{
 const eventId=c.req.param('id'),{user,ws}=await access(c,eventId,true),b=await body(c);
 if(['Completed','Cancelled'].includes(ws.event.status))deny();
 const phase=val(b.phase,'Phase',30);if(!['Readiness','Closure'].includes(phase))invalid('Invalid phase.');
 const title=val(b.title,'Title',180),at=timestamp(),recordId=uid();
 const owner=typeof b.ownerId==='string'&&b.ownerId.trim()?val(b.ownerId,'Owner',128):null;
 if(owner){
  const record=await c.env.DB.prepare(`SELECT 1 FROM users u WHERE u.id=? AND u.status='Active' AND (u.role IN ('Lead','Co-Lead') OR EXISTS(SELECT 1 FROM event_appointments a WHERE a.user_id=u.id AND a.event_id=? AND a.status='Accepted'))`).bind(owner,eventId).first();
  if(!record)invalid('Requirement owner must be an active accepted event member or permanent Lead/Co-Lead.');
 }
 const due=typeof b.dueAt==='string'&&b.dueAt.trim()?val(b.dueAt,'Deadline',40):null;
 if(due&&!Number.isFinite(Date.parse(due)))invalid('Invalid deadline.');
 await c.env.DB.batch([
 c.env.DB.prepare(`INSERT INTO event_requirements(id,event_id,phase,title,owner_id,due_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(recordId,eventId,phase,title,owner,due,user.id,at,at),
 await log(c,user,eventId,'EVENT_REQUIREMENT_CREATED',recordId)]);
 return c.json({id:recordId},201);
});
m3.post('/events/:id/requirements/:rid/submit',async c=>{
 const eventId=c.req.param('id'),rid=c.req.param('rid'),{user,ws,actor}=await access(c,eventId),b=await body(c);
 if(['Completed','Cancelled'].includes(ws.event.status))deny();
 const ref=val(b.evidenceReference,'Evidence reference',1000),at=timestamp();
 const record=await c.env.DB.prepare(`SELECT status,owner_id AS ownerId FROM event_requirements WHERE id=? AND event_id=?`).bind(rid,eventId).first();
 if(!record)throw new ApiError(404,'NOT_FOUND','Requirement not found.');
 if(!actor&&record.ownerId!==user.id)deny();
 if(record.status!=='Pending')throw new ApiError(409,'CONFLICT','Only pending requirements can be submitted.');
 await c.env.DB.batch([
 c.env.DB.prepare(`UPDATE event_requirements SET status='Submitted',evidence_reference=?,updated_at=? WHERE id=? AND event_id=?`).bind(ref,at,rid,eventId),
 c.env.DB.prepare(`INSERT INTO event_requirement_history(id,requirement_id,event_id,from_status,to_status,actor_id,evidence_reference,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(uid(),rid,eventId,'Pending','Submitted',user.id,ref,at),
 await log(c,user,eventId,'EVENT_REQUIREMENT_SUBMITTED',rid)]);
 return c.json({ok:true});
});
m3.post('/events/:id/requirements/:rid/verify',async c=>{
 const eventId=c.req.param('id'),rid=c.req.param('rid'),{user,ws}=await access(c,eventId,true);
 if(['Completed','Cancelled'].includes(ws.event.status))deny();
 const at=timestamp();
 const record=await c.env.DB.prepare(`SELECT status,evidence_reference AS evidenceReference FROM event_requirements WHERE id=? AND event_id=?`).bind(rid,eventId).first();
 if(!record)throw new ApiError(404,'NOT_FOUND','Requirement not found.');
 if(record.status!=='Submitted')throw new ApiError(409,'CONFLICT','Requirement must be submitted with evidence before verification.');
 if(!record.evidenceReference)throw new ApiError(409,'CONFLICT','Requirement is missing evidence.');
 await c.env.DB.batch([
 c.env.DB.prepare(`UPDATE event_requirements SET status='Verified',verified_by=?,verified_at=?,updated_at=? WHERE id=? AND event_id=?`).bind(user.id,at,at,rid,eventId),
 c.env.DB.prepare(`INSERT INTO event_requirement_history(id,requirement_id,event_id,from_status,to_status,actor_id,evidence_reference,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(uid(),rid,eventId,'Submitted','Verified',user.id,record.evidenceReference,at),
 await log(c,user,eventId,'EVENT_REQUIREMENT_VERIFIED',rid)]);
 return c.json({ok:true});
});
m3.post('/events/:id/issues',async c=>{
 const eventId=c.req.param('id'),{user,ws}=await access(c,eventId),b=await body(c);
 if(['Completed','Cancelled'].includes(ws.event.status))deny();
 const title=val(b.title,'Title',180),description=typeof b.description==='string'?val(b.description,'Description',2000,false):null;
 const severity=val(b.severity,'Severity',30);if(!['Low','Medium','High','Urgent'].includes(severity))invalid('Invalid severity.');
 const owner=typeof b.ownerId==='string'&&b.ownerId.trim()?val(b.ownerId,'Owner',128):null;
 if(owner){const allowed=await c.env.DB.prepare(`SELECT 1 FROM users u WHERE u.id=? AND u.status='Active' AND (u.role IN ('Lead','Co-Lead') OR EXISTS(SELECT 1 FROM event_appointments a WHERE a.event_id=? AND a.user_id=u.id AND a.status='Accepted'))`).bind(owner,eventId).first();if(!allowed)invalid('Issue owner must be an active event appointee or Lead/Co-Lead.');}
 const due=typeof b.dueAt==='string'&&b.dueAt.trim()?val(b.dueAt,'Deadline',40):null;
 if(due&&!Number.isFinite(Date.parse(due)))invalid('Invalid deadline.');
 const issueId=uid(),at=timestamp();
 const statements=[
 c.env.DB.prepare(`INSERT INTO event_issues(id,event_id,title,description,severity,owner_id,due_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(issueId,eventId,title,description,severity,owner,due,user.id,at,at),
 await log(c,user,eventId,'EVENT_ISSUE_CREATED',issueId)];
 if(severity==='Urgent'){
  const recipients=await c.env.DB.prepare(`SELECT DISTINCT u.id FROM users u WHERE u.status='Active' AND (u.role IN ('Lead','Co-Lead') OR EXISTS(SELECT 1 FROM event_appointments a WHERE a.user_id=u.id AND a.event_id=? AND a.role IN ('Event Director','Event Co-Director') AND a.status='Accepted'))`).bind(eventId).all();
  for(const recipient of recipients.results){
   if(recipient.id===user.id)continue;
   statements.push(c.env.DB.prepare(`INSERT INTO notifications(id,user_id,type,title,message,reference_type,reference_id,status,created_at) VALUES(?,?,?,?,?,'EVENT',?,'Unread',?)`).bind(uid(),recipient.id,'Event Operational Alert','Urgent event issue',title,eventId,at));
  }
 }
 await c.env.DB.batch(statements);
 return c.json({id:issueId},201);
});
m3.post('/events/:id/issues/:issueId/escalate',async c=>{
 const eventId=c.req.param('id'),issueId=c.req.param('issueId'),{user,ws}=await access(c,eventId);
 if(['Completed','Cancelled'].includes(ws.event.status))deny();
 const existing=await c.env.DB.prepare(`SELECT status,title FROM event_issues WHERE id=? AND event_id=?`).bind(issueId,eventId).first();
 if(!existing)throw new ApiError(404,'NOT_FOUND','Issue not found.');
 if(existing.status!=='Open')throw new ApiError(409,'CONFLICT','Issue is not open.');
 const at=timestamp();
 const recipients=await c.env.DB.prepare(`SELECT DISTINCT u.id FROM users u WHERE u.status='Active' AND (u.role IN ('Lead','Co-Lead') OR EXISTS(SELECT 1 FROM event_appointments a WHERE a.user_id=u.id AND a.event_id=? AND a.role IN ('Event Director','Event Co-Director') AND a.status='Accepted'))`).bind(eventId).all();
 const statements=[c.env.DB.prepare(`UPDATE event_issues SET status='Escalated',updated_at=? WHERE id=? AND event_id=?`).bind(at,issueId,eventId),await log(c,user,eventId,'EVENT_ISSUE_ESCALATED',issueId)];
 for(const recipient of recipients.results){if(recipient.id!==user.id)statements.push(c.env.DB.prepare(`INSERT INTO notifications(id,user_id,type,title,message,reference_type,reference_id,status,created_at) VALUES(?,?,?,?,?,'EVENT',?,'Unread',?)`).bind(uid(),recipient.id,'Event Operational Alert','Event issue escalated',existing.title,eventId,at));}
 await c.env.DB.batch(statements);return c.json({ok:true});
});
m3.post('/events/:id/issues/:issueId/resolve',async c=>{
 const eventId=c.req.param('id'),{user}=await access(c,eventId,true),issueId=c.req.param('issueId'),b=await body(c);
 const resolution=val(b.resolution,'Resolution',2000),at=timestamp();
 const existing=await c.env.DB.prepare(`SELECT status FROM event_issues WHERE id=? AND event_id=?`).bind(issueId,eventId).first();
 if(!existing)throw new ApiError(404,'NOT_FOUND','Issue not found.');
 if(existing.status==='Resolved')throw new ApiError(409,'CONFLICT','Already resolved.');
 await c.env.DB.batch([
 c.env.DB.prepare(`UPDATE event_issues SET status='Resolved',resolution=?,updated_at=? WHERE id=? AND event_id=?`).bind(resolution,at,issueId,eventId),
 await log(c,user,eventId,'EVENT_ISSUE_RESOLVED',issueId)]);
 return c.json({ok:true});
});
m3.post('/events/:id/records',async c=>{
 const eventId=c.req.param('id'),{user}=await access(c,eventId,true),b=await body(c);
 const category=val(b.category,'Category',80),title=val(b.title,'Title',180),reference=val(b.reference,'Reference',1000);
 // References are identifiers, not publicly accessible download URLs.
 const recordId=uid(),at=timestamp();
 await c.env.DB.batch([
 c.env.DB.prepare(`INSERT INTO event_records(id,event_id,category,title,reference,owner_id,created_at) VALUES(?,?,?,?,?,?,?)`).bind(recordId,eventId,category,title,reference,user.id,at),
 await log(c,user,eventId,'EVENT_RECORD_CREATED',recordId)]);
 return c.json({id:recordId},201);
});

m3.post('/events/:id/notes',async c=>{
 const eventId=c.req.param('id'),{user,ws}=await access(c,eventId),b=await body(c);
 if(['Completed','Cancelled'].includes(ws.event.status))deny();
 const category=val(b.category,'Category',30);if(!['Meeting','Decision','Update'].includes(category))invalid('Invalid note category.');
 const title=val(b.title,'Title',180),details=val(b.details,'Details',4000),at=timestamp(),noteId=uid();
 await c.env.DB.batch([
 c.env.DB.prepare(`INSERT INTO event_coordination_notes(id,event_id,category,title,details,created_by,created_at) VALUES(?,?,?,?,?,?,?)`).bind(noteId,eventId,category,title,details,user.id,at),
 await log(c,user,eventId,'EVENT_COORDINATION_NOTE_CREATED',noteId)
 ]);
 return c.json({id:noteId},201);
});
m3.post('/events/:id/records/:recordId/review',async c=>{
 const eventId=c.req.param('id'),{user}=await access(c,eventId,true),recordId=c.req.param('recordId'),at=timestamp();
 const record=await c.env.DB.prepare('SELECT status FROM event_records WHERE id=? AND event_id=?').bind(recordId,eventId).first();
 if(!record)throw new ApiError(404,'NOT_FOUND','Record not found.');
 if(record.status!=='Submitted')throw new ApiError(409,'CONFLICT','Record is not awaiting verification.');
 await c.env.DB.batch([
 c.env.DB.prepare("UPDATE event_records SET status='Verified',reviewed_by=?,reviewed_at=? WHERE id=? AND event_id=?").bind(user.id,at,recordId,eventId),
 await log(c,user,eventId,'EVENT_RECORD_VERIFIED',recordId)
 ]);
 return c.json({ok:true});
});
m3.post('/events/:id/schedule',async c=>{
 const eventId=c.req.param('id'),{user,ws}=await access(c,eventId,true),b=await body(c);
 if(['Completed','Cancelled'].includes(ws.event.status))deny();
 const title=val(b.title,'Title',180),startsAt=val(b.startsAt,'Start',40);
 if(!Number.isFinite(Date.parse(startsAt)))invalid('Valid schedule time required.');
 const endsAt=typeof b.endsAt==='string'&&b.endsAt.trim()?val(b.endsAt,'End',40):null;
 if(endsAt&&(!Number.isFinite(Date.parse(endsAt))||Date.parse(endsAt)<Date.parse(startsAt)))invalid('Invalid end time.');
 const id=uid(),at=timestamp();
 await c.env.DB.batch([
 c.env.DB.prepare(`INSERT INTO event_schedule_items(id,event_id,title,starts_at,ends_at,created_by,created_at) VALUES(?,?,?,?,?,?,?)`).bind(id,eventId,title,startsAt,endsAt,user.id,at),
 await log(c,user,eventId,'EVENT_SCHEDULE_CREATED',id)]);
 return c.json({id},201);
});
m3.post('/events/:id/debrief',async c=>{
 const eventId=c.req.param('id'),{user,ws}=await access(c,eventId,true),b=await body(c);
 if(!['Post-Event','For Closure'].includes(ws.event.status))invalid('Debrief is available after event execution.');
 const summary=val(b.summary,'Summary',4000),lessons=val(b.lessons,'Lessons learned',4000);
 const at=timestamp();
 if(await c.env.DB.prepare('SELECT 1 FROM event_debriefs WHERE event_id=?').bind(eventId).first())throw new ApiError(409,'CONFLICT','Debrief already submitted.');
 await c.env.DB.batch([
 c.env.DB.prepare(`INSERT INTO event_debriefs(event_id,summary,lessons,submitted_by,submitted_at) VALUES(?,?,?,?,?)`).bind(eventId,summary,lessons,user.id,at),
 await log(c,user,eventId,'EVENT_DEBRIEF_SUBMITTED',eventId)]);
 return c.json({ok:true},201);
});
async function getAnnouncement(c:any,aid:string){
 const a=await c.env.DB.prepare('SELECT * FROM announcements WHERE id=?').bind(aid).first();
 if(!a)throw new ApiError(404,'NOT_FOUND','Announcement not found.');
 const user=c.get('user') as AuthenticatedUser;
 const owner=leader(user)||(user.role==='Executive'&&a.audience==='Department'&&a.department_id===user.department.id&&a.created_by===user.id);
 const reader=a.status==='Published'&&(a.audience==='Organization'||a.department_id===user.department.id);
 if(!owner&&!reader)deny();return {a,user,owner};
}
function canPublish(user:AuthenticatedUser,audience:string,departmentId:string|null){
 return leader(user)||(user.role==='Executive'&&audience==='Department'&&departmentId===user.department.id);
}
m3.get('/announcements',async c=>{
 const user=c.get('user'),isLead=leader(user);
 const result=await c.env.DB.prepare(`SELECT a.id,a.title,a.body,a.category,a.audience,a.department_id AS departmentId,a.event_id AS eventId,a.project_id AS projectId,a.status,a.pinned,a.created_by AS createdBy,a.published_at AS publishedAt,
 CASE WHEN ar.user_id IS NULL THEN 0 ELSE 1 END AS isRead FROM announcements a LEFT JOIN announcement_reads ar ON ar.announcement_id=a.id AND ar.user_id=?
 WHERE (a.status='Published' AND (a.audience='Organization' OR a.department_id=?)) OR (?=1) OR (a.created_by=? AND a.audience='Department' AND a.department_id=?) ORDER BY a.pinned DESC,a.published_at DESC,a.created_at DESC LIMIT 200`)
 .bind(user.id,user.department.id,isLead?1:0,user.id,user.department.id).all();
 return c.json({announcements:result.results.map((a:any)=>({...a,projectId:leader(user)||a.createdBy===user.id?a.projectId:null}))});
});
m3.post('/announcements',async c=>{
 const user=c.get('user'),b=await body(c);
 const audience=val(b.audience,'Audience',30);if(!['Organization','Department'].includes(audience))invalid('Invalid audience.');
 const dept=audience==='Department'?val(b.departmentId,'Department ID',128):null;
 if(!canPublish(user,audience,dept))deny();
 if(dept&&!await c.env.DB.prepare("SELECT 1 FROM departments WHERE id=? AND status='Active'").bind(dept).first())invalid('Unknown department.');
 const title=val(b.title,'Title',180),message=val(b.body,'Body',10000),at=timestamp(),aid=uid();
 const category=b.category===undefined?'General':val(b.category,'Category',80);
 const eventId=typeof b.eventId==='string'&&b.eventId.trim()?val(b.eventId,'Event ID',128):null;
 const projectId=typeof b.projectId==='string'&&b.projectId.trim()?val(b.projectId,'Project ID',128):null;
 const pinned=b.pinned===true||b.pinned==='on'?1:0;
 if(eventId){const target=await getEvent(c.env,user,eventId);if(['Draft','For Approval','Rejected','Cancelled'].includes(target.status))invalid('Only approved event information may be linked to announcements.');}
 if(projectId)await getProject(c.env,user,projectId);
 await c.env.DB.batch([
 c.env.DB.prepare(`INSERT INTO announcements(id,title,body,category,audience,department_id,event_id,project_id,pinned,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(aid,title,message,category,audience,dept,eventId,projectId,pinned,user.id,at,at),
 c.env.DB.prepare(`INSERT INTO activity_log(id,occurred_at,actor_user_id,actor_name,actor_role,action,reference_type,reference_id,new_value) VALUES(?,?,?,?,?,?,?,?,?)`).bind(uid(),at,user.id,user.name,user.role,'ANNOUNCEMENT_DRAFT_CREATED','ANNOUNCEMENT',aid,audience)
 ]);
 return c.json({id:aid,status:'Draft'},201);
});
m3.patch('/announcements/:id',async c=>{
 const {a,user,owner}=await getAnnouncement(c,c.req.param('id'));
 if(!owner||a.status!=='Draft')deny();
 const b=await body(c),title=b.title===undefined?a.title:val(b.title,'Title',180),message=b.body===undefined?a.body:val(b.body,'Body',10000);
 const at=timestamp();
 await c.env.DB.batch([
 c.env.DB.prepare(`UPDATE announcements SET title=?,body=?,updated_at=? WHERE id=? AND status='Draft'`).bind(title,message,at,a.id),
 c.env.DB.prepare(`INSERT INTO announcement_history(id,announcement_id,actor_id,action,previous_title,previous_body,occurred_at) VALUES(?,?,?,?,?,?,?)`).bind(uid(),a.id,user.id,'Draft Edited',a.title,a.body,at)
 ]);
 return c.json({ok:true});
});
m3.post('/announcements/:id/archive',async c=>{
 const {a,user,owner}=await getAnnouncement(c,c.req.param('id'));
 if(!owner||a.status==='Archived')deny();
 const at=timestamp();
 await c.env.DB.batch([
 c.env.DB.prepare(`UPDATE announcements SET status='Archived',updated_at=? WHERE id=?`).bind(at,a.id),
 c.env.DB.prepare(`INSERT INTO announcement_history(id,announcement_id,actor_id,action,occurred_at) VALUES(?,?,?,?,?)`).bind(uid(),a.id,user.id,'Archived',at)
 ]);
 return c.json({ok:true});
});
m3.post('/announcements/:id/publish',async c=>{
 const {a,user,owner}=await getAnnouncement(c,c.req.param('id'));
 if(!owner||!canPublish(user,a.audience,a.department_id))deny();
 if(a.status!=='Draft')throw new ApiError(409,'CONFLICT','Announcement is not a draft.');
 const at=timestamp();
 const results=await c.env.DB.batch([
 c.env.DB.prepare(`UPDATE announcements SET status='Published',published_at=?,updated_at=? WHERE id=?`).bind(at,at,a.id),
 c.env.DB.prepare(`INSERT INTO activity_log(id,occurred_at,actor_user_id,actor_name,actor_role,action,reference_type,reference_id,old_value,new_value) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uid(),at,user.id,user.name,user.role,'ANNOUNCEMENT_PUBLISHED','ANNOUNCEMENT',a.id,'Draft','Published'),
 c.env.DB.prepare(`INSERT INTO notifications(id,user_id,type,title,message,reference_type,reference_id,status,created_at)
 SELECT lower(hex(randomblob(16))),id,'Official Announcement','New official announcement',?,'ANNOUNCEMENT',?,'Unread',?
 FROM users WHERE status='Active' AND (?='Organization' OR department_id=?)`).bind(a.title,a.id,at,a.audience,a.department_id)
 ]);
 return c.json({ok:true,recipientCount:results[2].meta.changes});
});
m3.post('/announcements/:id/read',async c=>{
 const {a,user}=await getAnnouncement(c,c.req.param('id'));
 if(a.status!=='Published'||(a.audience==='Department'&&a.department_id!==user.department.id))deny();
 await c.env.DB.prepare(`INSERT INTO announcement_reads(announcement_id,user_id,read_at) VALUES(?,?,?) ON CONFLICT(announcement_id,user_id) DO NOTHING`).bind(a.id,user.id,timestamp()).run();
 return c.json({ok:true});
});
export default m3;
