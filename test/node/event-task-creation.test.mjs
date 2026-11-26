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
function setup(db,{stage='Planning',role='Event Director',status='Accepted',who='memberA',team='teamA'}={}){
 db.sqlite.prepare(`INSERT INTO events(id,name,event_type,created_by,status,created_at,updated_at) VALUES('e','Synthetic Event','Other','lead',?,'now','now')`).run(stage);
 if(['Draft','For Approval','Rejected','Cancelled','Completed'].includes(stage))return;
 db.sqlite.exec(`INSERT INTO events(id,name,event_type,created_by,status,created_at,updated_at) VALUES('other','Other Event','Other','lead','Planning','now','now');
 INSERT INTO event_teams(id,event_id,name,created_by,created_at) VALUES('teamA','e','Technology','lead','now'),('teamB','e','Program','lead','now'),('foreign','other','Other Team','lead','now');`);
 if(role)db.sqlite.prepare(`INSERT INTO event_appointments(id,event_id,team_id,user_id,role,status,responsibilities,proposed_by,proposed_at,ended_at) VALUES('a','e',?,?,?,?, 'Synthetic work','lead','now',?)`).run(role.startsWith('Team')?team:null,who,role,status,status==='Ended'?'now':null);
}
const payload=(extra={})=>({requestId:crypto.randomUUID(),title:'Synthetic Event task',...extra});
const create=(db,body=payload(),who='memberA',event='e')=>api(db,`/events/${event}/tasks/create`,who,'POST',body);
test('Director creates one unassigned M1 record and link; permissions do not expand',async t=>{
 const db=await fixture(t);setup(db);const r=await create(db,payload({teamId:'teamB',priority:'High'}));
 assert.equal(r.status,201,JSON.stringify(r));const task=r.body.task;
 assert.equal(task.departmentId,'a');assert.equal(task.projectId,null);assert.equal(task.assignee,null);assert.equal(task.status,'Created');
 for(const key of ['canAssign','canEdit','canReview'])assert.equal(task.permissions[key],false,key);
 assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,1);assert.equal(db.scalar('SELECT COUNT(*) n FROM task_assignments').n,0);
 assert.equal(db.scalar("SELECT COUNT(*) n FROM activity_log WHERE action='EVENT_TASK_CREATED'").n,1);
 assert.equal(db.scalar("SELECT COUNT(*) n FROM activity_log WHERE action='TASK_CREATED'").n,1);
 const central=await api(db,'/tasks/','memberA');assert.equal(central.body.tasks.filter(x=>x.id===task.id).length,1);assert.equal(central.body.tasks[0].eventId,'e');
 const w=await api(db,'/events/e/workspace','memberA');assert.equal(w.body.tasks[0].taskId,task.id);assert.equal(w.body.tasks[0].priority,'High');
 assert.notEqual((await api(db,`/tasks/${task.id}`,'memberA','PATCH',{title:'Forged edit'})).status,200);
 assert.equal((await create(db,payload(),'memberA','other')).status,403);
});
test('Team Head is limited to exact accepted team; creation and linking remain separate',async t=>{
 const db=await fixture(t);setup(db,{role:'Team Head'});
 for(const teamId of [null,'teamB','foreign'])assert.equal((await create(db,payload({teamId}))).status,403);
 const r=await create(db,payload({teamId:'teamA'}));assert.equal(r.status,201,JSON.stringify(r));
 assert.equal((await api(db,'/events/e/tasks','memberA','POST',{taskId:r.body.task.id})).status,403);
 const p=(await api(db,'/events/e','memberA')).body.event.permissions;
 assert.equal(p.canCreateEventTask,false);assert.equal(p.canCreateTeamTask,true);assert.deepEqual(p.creatableTeamIds,['teamA']);
});
for(const role of ['Event Co-Director','Team Co-Head','Team Member'])test(`${role} has no delegated creation`,async t=>{const db=await fixture(t);setup(db,{role});assert.equal((await create(db,payload({teamId:'teamA'}))).status,403);});
for(const status of ['Proposed','Declined','Ended'])test(`${status} appointment cannot create`,async t=>{const db=await fixture(t);setup(db,{status});assert.equal((await create(db)).status,403);assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,0);});
for(const stage of ['Draft','For Approval','Approved','Rejected','Cancelled','For Closure','Completed'])test(`no creation at ${stage}`,async t=>{const db=await fixture(t);setup(db,{stage});assert.equal((await create(db,payload(),'lead')).status,403);});
for(const stage of ['Team Formation','Planning','Preparation','Ready for Event','Ongoing','Post-Event'])test(`creation allowed at ${stage}`,async t=>{const db=await fixture(t);setup(db,{stage});assert.equal((await create(db)).status,201);});
for(const who of ['lead','colead','exec','memberB','inactive'])test(`permanent role baseline ${who}`,async t=>{
 const db=await fixture(t);setup(db,{role:null});const r=await create(db,payload(),who);assert.equal(r.status,['lead','colead'].includes(who)?201:403);
 const normal=await api(db,'/tasks/',who,'POST',{title:'Ordinary task',departmentId:who==='exec'?'b':'a'});
 assert.equal(normal.status,['lead','colead','exec'].includes(who)?201:403);
});
test('inactive appointed account, inactive department and foreign teams rejected',async t=>{
 const db=await fixture(t);setup(db,{who:'inactive'});assert.equal((await create(db,payload(),'inactive')).status,403);
 assert.equal((await create(db,payload({teamId:'foreign'}),'lead')).status,403);
 db.sqlite.exec("UPDATE departments SET status='Inactive' WHERE id='a'");assert.equal((await create(db,payload(),'lead')).status,400);
});
test('M1 validation rejects invalid fields and undelegated assignment/project/ownership',async t=>{
 const db=await fixture(t);setup(db);
 for(const fields of [{title:''},{title:'x'.repeat(201)},{priority:'Made up'},{startDate:'bad'},{startDate:'2027-01-02',deadline:'2027-01-01'},{assigneeUserId:'memberB'},{projectId:'foreign'},{departmentId:'b'},{status:'Completed'},{progress:100},{requestId:'short'}])assert.equal((await create(db,payload(fields))).status,400,JSON.stringify(fields));
 assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,0);
});
test('same request replays; changed payload conflicts; concurrent retry writes once',async t=>{
 const db=await fixture(t);setup(db);const body=payload();
 const results=await Promise.all([create(db,body),create(db,body)]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,201]);assert.equal(results[0].body.task.id,results[1].body.task.id);
 assert.equal((await create(db,{...body,title:'Changed'})).status,409);
 assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,1);assert.equal(db.scalar('SELECT COUNT(*) n FROM event_task_creation_requests').n,1);
 assert.equal(db.scalar('SELECT COUNT(*) n FROM activity_log').n,2);
});
for(const change of ["UPDATE event_appointments SET status='Ended',ended_at='now' WHERE id='a'","UPDATE events SET status='Cancelled' WHERE id='e'","UPDATE users SET status='Inactive' WHERE id='memberA'","UPDATE users SET department_id='b' WHERE id='memberA'"])test(`transaction rejects stale authority: ${change}`,async t=>{
 const db=await fixture(t);setup(db);const batch=db.batch.bind(db);let once=false;
 db.batch=async statements=>{if(!once){once=true;db.sqlite.exec(change);}return batch(statements);};
 const r=await create(db);assert.equal(r.status,409,JSON.stringify(r));
 for(const table of ['tasks','event_task_links','activity_log','event_task_creation_requests','notifications'])assert.equal(db.scalar(`SELECT COUNT(*) n FROM ${table}`).n,0,table);
});
test('dependent link or audit failure leaves no task, request or audit',async t=>{
 const db=await fixture(t);setup(db);db.sqlite.exec("CREATE TRIGGER synthetic_fail BEFORE INSERT ON event_task_links BEGIN SELECT RAISE(ABORT,'synthetic dependency failure'); END;");
 assert.equal((await create(db)).status,500);
 for(const table of ['tasks','event_task_links','activity_log','event_task_creation_requests'])assert.equal(db.scalar(`SELECT COUNT(*) n FROM ${table}`).n,0,table);
});
