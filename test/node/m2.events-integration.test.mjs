/** M2 integration tests use the real Hono routes, all D1 migrations and synthetic SQLite only. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import app from '../../.audit-build/src/index.js';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
class DB {
 constructor(){
  this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON');
  for(const f of readdirSync(resolve(ROOT,'migrations')).filter(n=>/^\d.*\.sql$/.test(n)).sort()){
   this.sqlite.exec(readFileSync(resolve(ROOT,'migrations',f),'utf8'));
  }
  this.sqlite.exec(`INSERT INTO departments(id,name) VALUES ('a','Engineering'),('b','Creative');`);
  for(const [id,role,dept] of [['lead','Lead','a'],['colead','Co-Lead','a'],['exec','Executive','b'],['memberA','Member','a'],['memberB','Member','b'],['inactive','Member','a']]){
   this.sqlite.prepare('INSERT INTO users(id,name,email,role,department_id,status) VALUES (?,?,?,?,?,?)').run(id,id,id+'@example.invalid',role,dept,id==='inactive'?'Inactive':'Active');
  }
 }
 prepare(sql){const db=this.sqlite;let args=[];return {bind(...params){args=params;return this;},first(){return db.prepare(sql).get(...args)||null;},all(){return {results:db.prepare(sql).all(...args)};},run(){return {meta:db.prepare(sql).run(...args)};}};}
 async batch(statements){this.sqlite.exec('BEGIN');try{const results=statements.map(s=>s.run());this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 scalar(sql,...args){return this.sqlite.prepare(sql).get(...args);} close(){this.sqlite.close();}
}
async function api(db,path,identity='lead',method='GET',body){
 const response=await app.fetch(new Request('http://localhost/api'+path,{method,headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{DB:db,APP_ENV:'local',DEV_USER_EMAIL:identity+'@example.invalid'});
 return {status:response.status,body:await response.json()};
}
async function fixture(t){const db=new DB();t.after(()=>db.close());return db;}
const brief={name:'Synthetic Hackathon',objectives:'Learning and skill development',startsAt:'2027-02-01T09:00',venue:'Campus'};
async function make(db,identity='memberA'){const r=await api(db,'/events/',identity,'POST',brief);assert.equal(r.status,201,JSON.stringify(r));return r.body.event.id;}
async function submit(db,eventId,identity='memberA'){const r=await api(db,`/events/${eventId}/submit`,identity,'POST');assert.equal(r.status,200,JSON.stringify(r));}
async function approve(db,eventId,identity='lead'){const r=await api(db,`/events/${eventId}/approve`,identity,'POST',{remarks:'Reviewed and authorized'});assert.equal(r.status,200,JSON.stringify(r));}

test('M2 additive migration preserves M1 tasks and departments',async t=>{
 const db=await fixture(t);
 const cr=await api(db,'/tasks/','exec','POST',{title:'Existing independent task',departmentId:'b'});
 assert.equal(cr.status,201,JSON.stringify(cr));
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM tasks').n,1);
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM events').n,0);
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM event_task_links').n,0);
});
test('ordinary member proposes draft, leaders approve, blocked before approval',async t=>{
 const db=await fixture(t);const id=await make(db);
 assert.equal((await api(db,`/events/${id}`,'memberB')).status,403);
 assert.equal((await api(db,`/events/${id}/approve`,'memberA','POST',{})).status,403);
 assert.equal((await api(db,`/events/${id}/teams`,'lead','POST',{name:'Program'})).status,403);
 await submit(db,id);
 assert.equal((await api(db,`/events/${id}/approve`,'exec','POST',{})).status,403);
 assert.equal((await api(db,`/events/${id}/approve`,'memberB','POST',{})).status,403);
 await approve(db,id,'colead');
 assert.equal(db.scalar('SELECT status FROM events WHERE id=?',id).status,'Approved');
 assert.equal((await api(db,`/events/${id}`,'memberB')).status,200);
 assert.equal((await api(db,`/events/${id}/submit`,'memberA','POST')).status,403);
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM event_approvals WHERE event_id=?",id).n,1);
});
test('concurrent duplicate approval cannot emit extra audit or decision records',async t=>{
 const db=await fixture(t);const id=await make(db);await submit(db,id);
 const [a,b]=await Promise.all([api(db,`/events/${id}/approve`,'lead','POST',{}),api(db,`/events/${id}/approve`,'colead','POST',{})]);
 assert.equal([a.status,b.status].filter(v=>v===200).length,1);
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM event_approvals WHERE event_id=? AND decision='Approved'",id).n,1);
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM activity_log WHERE reference_id=? AND action='EVENT_APPROVED'",id).n,1);
});
test('returned proposals can be edited and resubmitted, rejections documented',async t=>{
 const db=await fixture(t);const id=await make(db);await submit(db,id);
 const returned=await api(db,`/events/${id}/return`,'lead','POST',{remarks:'Update event venue'});
 assert.equal(returned.status,200,JSON.stringify(returned));
 assert.equal(db.scalar('SELECT status FROM events WHERE id=?',id).status,'Draft');
 assert.equal((await api(db,`/events/${id}`,'memberB')).status,403);
 assert.equal((await api(db,`/events/${id}`,'memberA')).status,200);
 assert.equal((await api(db,`/events/${id}`,'lead')).status,200);
 assert.equal((await api(db,`/events/${id}`,'inactive')).status,403);
 await submit(db,id);
 assert.equal((await api(db,`/events/${id}/reject`,'lead','POST',{remarks:'Not feasible'})).status,200);
 assert.equal(db.scalar('SELECT status FROM events WHERE id=?',id).status,'Rejected');
 assert.equal((await api(db,`/events/${id}/revise`,'memberA','POST')).status,200);
});
test('temporary Event Director requires consent and cannot manage permanent users',async t=>{
 const db=await fixture(t);const id=await make(db);await submit(db,id);await approve(db,id);
 const director=await api(db,`/events/${id}/appointments`,'lead','POST',{userId:'memberB',role:'Event Director',responsibilities:'Coordinate event'});
 assert.equal(director.status,201,JSON.stringify(director));const appointmentId=director.body.appointment.id;
 assert.equal((await api(db,`/events/${id}/advance`,'memberB','POST')).status,403);
 assert.equal((await api(db,`/events/appointments/${appointmentId}/accept`,'memberA','POST')).status,403);
 const pending=await api(db,'/events/my-appointments','memberB');assert.equal(pending.body.appointments.length,1);
 assert.equal((await api(db,`/events/appointments/${appointmentId}/accept`,'memberB','POST')).status,200);
 assert.equal((await api(db,`/events/appointments/${appointmentId}/accept`,'memberB','POST')).status,409);
 assert.equal((await api(db,`/events/${id}/advance`,'memberB','POST')).status,200);
 assert.equal((await api(db,`/events/${id}/advance`,'memberB','POST')).status,200);
 assert.equal(db.scalar('SELECT status FROM events WHERE id=?',id).status,'Planning');
 assert.notEqual((await api(db,'/users/memberA/role','memberB','PATCH',{role:'Lead'})).status,200);
});
test('cross-event teams prohibited, non-director cannot create teams, consent revocation',async t=>{
 const db=await fixture(t);const first=await make(db);const second=await make(db);
 for(const eventId of [first,second]){await submit(db,eventId);await approve(db,eventId);}
 const team=await api(db,`/events/${first}/teams`,'lead','POST',{name:'Program'});
 assert.equal(team.status,201,JSON.stringify(team));
 const cross=await api(db,`/events/${second}/appointments`,'lead','POST',{teamId:team.body.team.id,userId:'memberB',role:'Team Head',responsibilities:'Manage program'});
 assert.equal(cross.status,400,JSON.stringify(cross));
 const app=await api(db,`/events/${first}/appointments`,'lead','POST',{teamId:team.body.team.id,userId:'memberB',role:'Team Head',responsibilities:'Manage program'});
 assert.equal(app.status,201,JSON.stringify(app));
 assert.equal((await api(db,`/events/${first}/teams`,'memberB','POST',{name:'Finance'})).status,403);
 assert.equal((await api(db,`/events/appointments/${app.body.appointment.id}/decline`,'memberB','POST')).status,200);
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM event_appointments WHERE event_id=? AND status='Accepted'",first).n,0);
});
test('event task link preserves existing task access boundaries, no duplicate links',async t=>{
 const db=await fixture(t);const eventId=await make(db);await submit(db,eventId);await approve(db,eventId);
 const task=await api(db,'/tasks/','exec','POST',{title:'Creative independent task',departmentId:'b'});
 assert.equal(task.status,201,JSON.stringify(task));
 const taskId=task.body.task.id;
 assert.equal((await api(db,`/events/${eventId}/tasks`,'memberA','POST',{taskId})).status,403);
 assert.equal((await api(db,`/events/${eventId}/tasks`,'lead','POST',{taskId})).status,201);
 assert.notEqual((await api(db,`/events/${eventId}/tasks`,'lead','POST',{taskId})).status,201);
 const workspace=await api(db,`/events/${eventId}/workspace`,'memberA');
 assert.equal(workspace.status,200,JSON.stringify(workspace));
 assert.ok(workspace.body.tasks.some(t=>t.taskId===taskId),'the M1 baseline intentionally permits organization-wide non-archived task visibility');
 assert.equal((await api(db,`/events/${eventId}/tasks`,'memberA','POST',{taskId})).status,403,'organization-wide task visibility must not grant edit/link rights');
 assert.equal((await api(db,`/events/${eventId}/tasks/${taskId}`,'lead','DELETE')).status,200);
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM tasks WHERE id=?',taskId).n,1);
});
test('for-closure requires recorded attestations; scope and history survive closure',async t=>{
 const db=await fixture(t);const id=await make(db);await submit(db,id);await approve(db,id);
 const app=await api(db,`/events/${id}/appointments`,'lead','POST',{userId:'memberB',role:'Event Director',responsibilities:'Operate event'});
 assert.equal(app.status,201,JSON.stringify(app));
 await api(db,`/events/appointments/${app.body.appointment.id}/accept`,'memberB','POST');
 const steps=['Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure'];
 for(const stage of steps){const r=await api(db,`/events/${id}/advance`,'lead','POST',stage==='Ready for Event'?{remarks:'Verified venue and systems',readinessVerified:true,readinessEvidence:'Local readiness checklist ref'}:undefined);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.event.status,stage);}
 assert.equal((await api(db,`/events/${id}/close`,'memberB','POST',{})).status,403);
 assert.equal((await api(db,`/events/${id}/close`,'lead','POST',{remarks:'Done'})).status,400);
 const close=await api(db,`/events/${id}/close`,'colead','POST',{remarks:'Records checked',finalAttendance:20,finalExpense:150,closureEvidence:'Signed manual closure file',financialValidated:true,recordsValidated:true});
 assert.equal(close.status,200,JSON.stringify(close));
 assert.equal(db.scalar("SELECT status FROM events WHERE id=?",id).status,'Completed');
 assert.equal(db.scalar('SELECT final_attendance AS attendance,final_expense AS expense FROM event_closure_records WHERE event_id=?',id).attendance,20);
 assert.equal(db.scalar('SELECT final_expense AS expense FROM event_closure_records WHERE event_id=?',id).expense,150);
 assert.equal(db.scalar("SELECT status FROM event_appointments WHERE id=?",app.body.appointment.id).status,'Ended');
 assert.equal((await api(db,`/events/${id}/advance`,'memberB','POST')).status,403);
 assert.equal((await api(db,`/events/${id}/close`,'colead','POST',{})).status,403);
 assert.ok(db.scalar('SELECT COUNT(*) AS n FROM event_stage_history WHERE event_id=?',id).n>=10);
});
test('approved event does not disclose linked confidential department project',async t=>{
 const db=await fixture(t);
 db.sqlite.prepare(`INSERT INTO projects(id,name,type,created_by,status,created_at,updated_at) VALUES('private','Confidential Creative Project','Department','exec','Active','2026-01-01','2026-01-01')`).run();
 db.sqlite.prepare(`INSERT INTO project_departments(id,project_id,department_id,assigned_by,assigned_at) VALUES('pd','private','b','exec','2026-01-01')`).run();
 const cr=await api(db,'/events/','exec','POST',{...brief,name:'Linked event',projectId:'private'});
 assert.equal(cr.status,201,JSON.stringify(cr));const eventId=cr.body.event.id;
 await submit(db,eventId,'exec');await approve(db,eventId);
 const visible=await api(db,`/events/${eventId}`,'memberA');
 assert.equal(visible.status,200);
 assert.equal(visible.body.event.projectId,null);
 assert.equal(visible.body.event.projectName,null);
 const creator=await api(db,`/events/${eventId}`,'exec');
 assert.equal(creator.body.event.projectName,'Confidential Creative Project');
});
test('direct SQL bypasses of event status or appointment consent abort',async t=>{
 const db=await fixture(t);const id=await make(db);
 assert.throws(()=>db.sqlite.prepare("UPDATE events SET status='Ongoing' WHERE id=?").run(id),/OMS_STATE_CONFLICT/);
 await submit(db,id);await approve(db,id);
 const nominated=await api(db,`/events/${id}/appointments`,'lead','POST',{userId:'memberB',role:'Event Director',responsibilities:'Lead'});
 assert.equal(nominated.status,201,JSON.stringify(nominated));
 const apptId=nominated.body.appointment.id;
 assert.throws(()=>db.sqlite.prepare("UPDATE event_appointments SET status='Ended' WHERE id=?").run(apptId),/CHECK constraint failed/);
 assert.equal(db.scalar('SELECT status FROM event_appointments WHERE id=?',apptId).status,'Proposed');
});
test('event creation rejects malformed input and invalid foreign references',async t=>{
 const db=await fixture(t);
 assert.equal((await api(db,'/events/','memberA','POST',{name:'',objectives:'X'})).status,400);
 assert.equal((await api(db,'/events/','memberA','POST',{...brief,projectId:'not-real'})).status,404);
 assert.equal((await api(db,'/events/','memberA','POST',{...brief,startsAt:'2027-04-02T11:00',endsAt:'2027-04-01T11:00'})).status,400);
 assert.equal((await api(db,'/events/','inactive','POST',brief)).status,403);
});
test('accepted Team Head can propose own-team members but cannot grant directorship or another team',async t=>{
 const db=await fixture(t);const eventId=await make(db);await submit(db,eventId);await approve(db,eventId);
 const dir=await api(db,`/events/${eventId}/appointments`,'lead','POST',{userId:'memberA',role:'Event Director',responsibilities:'Coordinate'});
 assert.equal(dir.status,201,JSON.stringify(dir));
 assert.equal((await api(db,`/events/appointments/${dir.body.appointment.id}/accept`,'memberA','POST')).status,200);
 assert.equal((await api(db,`/events/${eventId}/advance`,'memberA','POST')).status,200);
 const team=await api(db,`/events/${eventId}/teams`,'memberA','POST',{name:'Program Team',purpose:'Program schedule'});
 assert.equal(team.status,201,JSON.stringify(team));
 const team2=await api(db,`/events/${eventId}/teams`,'lead','POST',{name:'Technology'});assert.equal(team2.status,201);
 const head=await api(db,`/events/${eventId}/appointments`,'memberA','POST',{role:'Team Head',teamId:team.body.team.id,userId:'exec',responsibilities:'Coordinate program'});
 assert.equal(head.status,201,JSON.stringify(head));
 assert.equal((await api(db,`/events/appointments/${head.body.appointment.id}/accept`,'exec','POST')).status,200);
 const member=await api(db,`/events/${eventId}/appointments`,'exec','POST',{role:'Team Member',teamId:team.body.team.id,userId:'memberB',responsibilities:'Prepare scripts'});
 assert.equal(member.status,201,JSON.stringify(member));
 assert.equal((await api(db,`/events/${eventId}/appointments`,'exec','POST',{role:'Team Head',teamId:team2.body.team.id,userId:'memberB',responsibilities:'Cross-team escalation'})).status,403);
 assert.equal((await api(db,`/events/${eventId}/appointments`,'exec','POST',{role:'Event Director',userId:'memberB',responsibilities:'Overtake'})).status,403);
 assert.equal(db.scalar("SELECT role FROM users WHERE id='exec'").role,'Executive');
});
test('event cancellation ends accepted temporary appointments while preserving activity',async t=>{
 const db=await fixture(t);const eventId=await make(db);await submit(db,eventId);await approve(db,eventId);
 const dir=await api(db,`/events/${eventId}/appointments`,'lead','POST',{userId:'memberA',role:'Event Director',responsibilities:'Coordinate'});
 assert.equal((await api(db,`/events/appointments/${dir.body.appointment.id}/accept`,'memberA','POST')).status,200);
 assert.equal((await api(db,`/events/${eventId}/cancel`,'exec','POST',{remarks:'Cancel request'})).status,403);
 const cancel=await api(db,`/events/${eventId}/cancel`,'lead','POST',{remarks:'Unsafe conditions'});
 assert.equal(cancel.status,200,JSON.stringify(cancel));
 assert.equal(db.scalar('SELECT status FROM event_appointments WHERE id=?',dir.body.appointment.id).status,'Ended');
 assert.equal(db.scalar('SELECT status FROM events WHERE id=?',eventId).status,'Cancelled');
 assert.equal((await api(db,`/events/${eventId}/teams`,'memberA','POST',{name:'New Team'})).status,403);
 assert.ok(db.scalar('SELECT COUNT(*) AS n FROM event_stage_history WHERE event_id=?',eventId).n>=4);
});
test('simultaneous director nominations cannot create two pending leaders',async t=>{
 const db=await fixture(t);const eventId=await make(db);await submit(db,eventId);await approve(db,eventId);
 const body1={role:'Event Director',userId:'memberA',responsibilities:'Coordinate venue'};
 const body2={role:'Event Director',userId:'memberB',responsibilities:'Lead program'};
 const results=await Promise.all([api(db,`/events/${eventId}/appointments`,'lead','POST',body1),api(db,`/events/${eventId}/appointments`,'colead','POST',body2)]);
 assert.equal(results.filter(r=>r.status===201).length,1,JSON.stringify(results));
 assert.equal(results.filter(r=>r.status===409).length,1,JSON.stringify(results));
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM event_appointments WHERE event_id=? AND role='Event Director' AND status='Proposed'",eventId).n,1);
});
