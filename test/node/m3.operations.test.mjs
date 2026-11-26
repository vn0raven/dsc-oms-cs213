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


test('M3 announcement publishing permissions and audience isolation',async t=>{
 const db=await fixture(t);
 const create=(who,payload)=>api(db,'/m3/announcements',who,'POST',payload);
 assert.equal((await create('memberA',{title:'No',body:'Text',audience:'Organization'})).status,403);
 assert.equal((await create('exec',{title:'No',body:'Text',audience:'Organization'})).status,403);
 assert.equal((await create('exec',{title:'Wrong department',body:'Text',audience:'Department',departmentId:'a'})).status,403);
 const created=await create('exec',{title:'Creative notice',body:'Internal memo',audience:'Department',departmentId:'b'});
 assert.equal(created.status,201,JSON.stringify(created));const aid=created.body.id;
 assert.equal((await api(db,'/m3/announcements','memberA')).body.announcements.length,0);
 assert.equal((await api(db,`/m3/announcements/${aid}/publish`,'memberA','POST',{})).status,403);
 assert.equal((await api(db,`/m3/announcements/${aid}/publish`,'exec','POST',{})).status,200);
 assert.equal((await api(db,`/m3/announcements/${aid}/publish`,'exec','POST',{})).status,409);
 assert.equal((await api(db,'/m3/announcements','memberA')).body.announcements.length,0);
 assert.equal((await api(db,'/m3/announcements','memberB')).body.announcements.length,1);
 assert.equal((await api(db,`/m3/announcements/${aid}/read`,'memberA','POST',{})).status,403);
 assert.equal((await api(db,`/m3/announcements/${aid}/read`,'memberB','POST',{})).status,200);
 assert.equal((await api(db,`/m3/announcements/${aid}/read`,'memberB','POST',{})).status,200);
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM announcement_reads WHERE announcement_id=?',aid).n,1);
});
test('M3 readiness and cross-event requirement isolation',async t=>{
 const db=await fixture(t);
 const eid=await make(db,'memberA');await submit(db,eid);await approve(db,eid);
 const r=await api(db,`/m3/events/${eid}/requirements`,'lead','POST',{phase:'Readiness',title:'Venue confirmed'});
 assert.equal(r.status,201,JSON.stringify(r));const rid=r.body.id;
 assert.equal((await api(db,`/m3/events/${eid}/requirements`,'memberB','POST',{phase:'Readiness',title:'Other'})).status,403);
 assert.equal((await api(db,`/m3/events/${eid}/requirements/${rid}/verify`,'memberB','POST',{evidenceReference:'verified'})).status,403);
 const other=await make(db,'memberB');await submit(db,other,'memberB');await approve(db,other);
 assert.equal((await api(db,`/m3/events/${other}/requirements/${rid}/verify`,'lead','POST',{})).status,404);
 assert.equal((await api(db,`/m3/events/${eid}/requirements/${rid}/verify`,'lead','POST',{})).status,409);
 assert.equal((await api(db,`/m3/events/${eid}/requirements/${rid}/submit`,'lead','POST',{evidenceReference:'record-11'})).status,200);
 assert.equal((await api(db,`/m3/events/${eid}/requirements/${rid}/submit`,'lead','POST',{evidenceReference:'record-12'})).status,409);
 assert.equal((await api(db,`/m3/events/${eid}/requirements/${rid}/verify`,'lead','POST',{})).status,200);
 assert.equal((await api(db,`/m3/events/${eid}/requirements/${rid}/verify`,'lead','POST',{})).status,409);
 const op=await api(db,`/m3/events/${eid}/operations`,'lead');assert.equal(op.status,200);assert.equal(op.body.requirements[0].status,'Verified');
});
test('M3 issues and sensitive document references require event authority',async t=>{
 const db=await fixture(t);const eid=await make(db);await submit(db,eid);await approve(db,eid);
 assert.equal((await api(db,`/m3/events/${eid}/operations`,'memberA')).status,403);
 const team=await api(db,`/events/${eid}/teams`,'lead','POST',{name:'Program'});
 assert.equal(team.status,201);
 const appt=await api(db,`/events/${eid}/appointments`,'lead','POST',{teamId:team.body.team.id,userId:'memberA',role:'Team Member',responsibilities:'Support coordination'});
 assert.equal(appt.status,201);
 assert.equal((await api(db,`/events/appointments/${appt.body.appointment.id}/accept`,'memberA','POST',{})).status,200);
 const issue=await api(db,`/m3/events/${eid}/issues`,'memberA','POST',{title:'Speaker unavailable',severity:'Urgent'});
 assert.equal(issue.status,201,JSON.stringify(issue));
 assert.equal((await api(db,`/m3/events/${eid}/issues/${issue.body.id}/resolve`,'memberA','POST',{resolution:'New speaker'})).status,403);
 assert.equal((await api(db,`/m3/events/${eid}/issues/${issue.body.id}/resolve`,'lead','POST',{resolution:'New speaker'})).status,200);
 assert.equal((await api(db,`/m3/events/${eid}/issues/${issue.body.id}/resolve`,'lead','POST',{resolution:'Again'})).status,409);
 assert.equal((await api(db,`/m3/events/${eid}/records`,'memberA','POST',{category:'Finance',title:'Expense',reference:'secure-internal-id'})).status,403);
 assert.equal((await api(db,`/m3/events/${eid}/records`,'lead','POST',{category:'Finance',title:'Expense',reference:'secure-internal-id'})).status,201);
 const outsider=await api(db,`/m3/events/${eid}/operations`,'memberB');
 assert.equal(outsider.status,403);
 const own=await api(db,`/m3/events/${eid}/operations`,'memberA');assert.equal(own.status,200);assert.equal(own.body.records.length,0);
});
test('M3 publication inserts correct recipients and deduplicates concurrent action',async t=>{
 const db=await fixture(t);
 const cr=await api(db,'/m3/announcements','lead','POST',{title:'Org-wide update',body:'Synthetic message',audience:'Organization'});
 assert.equal(cr.status,201);const id=cr.body.id;
 const [a,b]=await Promise.all([api(db,`/m3/announcements/${id}/publish`,'lead','POST',{}),api(db,`/m3/announcements/${id}/publish`,'colead','POST',{})]);
 assert.equal([a.status,b.status].filter(x=>x===200).length,1);
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM notifications WHERE reference_type='ANNOUNCEMENT' AND reference_id=?",id).n,5);
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM activity_log WHERE action='ANNOUNCEMENT_PUBLISHED' AND reference_id=?",id).n,1);
 assert.equal((await api(db,'/m3/summary','memberA')).body.unreadAnnouncements,1);
});
test('M3 high-severity operational blocker stops readiness and resolution is auditable',async t=>{
 const db=await fixture(t);const id=await make(db);await submit(db,id);await approve(db,id);
 const issue=await api(db,`/m3/events/${id}/issues`,'lead','POST',{title:'Security concern',severity:'Urgent'});
 assert.equal(issue.status,201,JSON.stringify(issue));
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM notifications WHERE type='Event Operational Alert' AND reference_id=?",id).n,1);
 for(const stage of ['Team Formation','Planning','Preparation'])db.sqlite.prepare('UPDATE events SET status=? WHERE id=?').run(stage,id);
 assert.throws(()=>db.sqlite.prepare("UPDATE events SET status='Ready for Event' WHERE id=?").run(id),/readiness blocker/);
 assert.equal((await api(db,`/m3/events/${id}/issues/${issue.body.id}/resolve`,'lead','POST',{resolution:'Secured venue'})).status,200);
 db.sqlite.prepare("UPDATE events SET status='Ready for Event' WHERE id=?").run(id);
 assert.equal(db.scalar('SELECT status FROM events WHERE id=?',id).status,'Ready for Event');
});
test('M3 closure checklist stops completion, then approved after verification',async t=>{
 const db=await fixture(t);const id=await make(db);await submit(db,id);await approve(db,id);
 for(const stage of ['Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event','For Closure'])db.sqlite.prepare('UPDATE events SET status=? WHERE id=?').run(stage,id);
 const cr=await api(db,`/m3/events/${id}/requirements`,'lead','POST',{phase:'Closure',title:'Equipment returned'});
 assert.equal(cr.status,201,JSON.stringify(cr));
 const payload={remarks:'Reviewed',closureEvidence:'archive-1',financialValidated:true,recordsValidated:true,finalAttendance:10,finalExpense:0};
 const rejected=await api(db,`/events/${id}/close`,'lead','POST',payload);
 assert.equal(rejected.status,409,JSON.stringify(rejected));
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM event_closure_records WHERE event_id=?',id).n,0);
 assert.equal((await api(db,`/m3/events/${id}/requirements/${cr.body.id}/submit`,'lead','POST',{evidenceReference:'signed-turnover'})).status,200);
 assert.equal((await api(db,`/m3/events/${id}/requirements/${cr.body.id}/verify`,'lead','POST',{})).status,200);
 assert.equal((await api(db,`/events/${id}/close`,'lead','POST',payload)).status,200);
 assert.equal(db.scalar('SELECT status FROM events WHERE id=?',id).status,'Completed');
});
test('M3 schedule, debrief, and announcement archival retain records',async t=>{
 const db=await fixture(t);const id=await make(db);await submit(db,id);await approve(db,id);
 const schedule=await api(db,`/m3/events/${id}/schedule`,'lead','POST',{title:'Dry run',startsAt:'2027-01-01T09:00',endsAt:'2027-01-01T10:00'});
 assert.equal(schedule.status,201,JSON.stringify(schedule));
 assert.equal((await api(db,`/m3/events/${id}/schedule`,'lead','POST',{title:'Bad',startsAt:'bad date'})).status,400);
 for(const stage of ['Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event'])db.sqlite.prepare('UPDATE events SET status=? WHERE id=?').run(stage,id);
 assert.equal((await api(db,`/m3/events/${id}/debrief`,'lead','POST',{summary:'Successful',lessons:'Improve registration'})).status,201);
 assert.equal((await api(db,`/m3/events/${id}/debrief`,'lead','POST',{summary:'Again',lessons:'Again'})).status,409);
 const notice=await api(db,'/m3/announcements','lead','POST',{title:'Temporary',body:'Draft body',audience:'Organization'});
 assert.equal((await api(db,`/m3/announcements/${notice.body.id}`,'lead','PATCH',{body:'Revised draft'})).status,200);
 assert.equal((await api(db,`/m3/announcements/${notice.body.id}/archive`,'lead','POST',{})).status,200);
 assert.equal(db.scalar('SELECT status FROM announcements WHERE id=?',notice.body.id).status,'Archived');
});
test('M3 coordination notes and document verification preserve event-scoped authority',async t=>{
 const db=await fixture(t),eid=await make(db);await submit(db,eid);await approve(db,eid);
 const note=await api(db,`/m3/events/${eid}/notes`,'lead','POST',{category:'Meeting',title:'Planning meeting',details:'Reviewed operational roles'});
 assert.equal(note.status,201,JSON.stringify(note));
 const restricted=await api(db,`/m3/events/${eid}/notes`,'memberB','POST',{category:'Meeting',title:'Other',details:'No'});
 assert.equal(restricted.status,403);
 const record=await api(db,`/m3/events/${eid}/records`,'lead','POST',{category:'Documentation',title:'Attendance reference',reference:'private-record-25'});
 assert.equal(record.status,201,JSON.stringify(record));
 assert.equal((await api(db,`/m3/events/${eid}/records/${record.body.id}/review`,'memberA','POST',{})).status,403);
 assert.equal((await api(db,`/m3/events/${eid}/records/${record.body.id}/review`,'lead','POST',{})).status,200);
 assert.equal((await api(db,`/m3/events/${eid}/records/${record.body.id}/review`,'lead','POST',{})).status,409);
 assert.equal(db.scalar('SELECT status FROM event_records WHERE id=?',record.body.id).status,'Verified');
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM event_coordination_notes WHERE event_id=?',eid).n,1);
});
test('M3 summary obeys pending approval and announcement audience scope',async t=>{
 const db=await fixture(t);const eid=await make(db,'memberA');await submit(db,eid);
 const lead=await api(db,'/m3/summary','lead');const member=await api(db,'/m3/summary','memberB');
 assert.equal(lead.status,200);assert.equal(member.status,200);
 assert.equal(lead.body.pendingEventApprovals,1);assert.equal(member.body.pendingEventApprovals,0);
 const notice=await api(db,'/m3/announcements','exec','POST',{title:'Creative memo',body:'Internal',audience:'Department',departmentId:'b'});
 assert.equal(notice.status,201);
 assert.equal((await api(db,`/m3/announcements/${notice.body.id}/publish`,'exec','POST',{})).status,200);
 assert.equal((await api(db,'/m3/summary','memberB')).body.unreadAnnouncements,1);
 assert.equal((await api(db,'/m3/summary','memberA')).body.unreadAnnouncements,0);
});
