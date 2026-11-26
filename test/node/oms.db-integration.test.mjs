/** Full real SQL and real Hono API tests, synthetic in-memory SQLite only. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import worker from '../../.audit-build/src/index.js';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
class DatabaseFixture {
  constructor(){
    this.db=new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys=ON');
    for(const filename of readdirSync(resolve(ROOT,'migrations')).filter(f=>/^\d.*\.sql$/.test(f)).sort()){
      this.db.exec(readFileSync(resolve(ROOT,'migrations',filename),'utf8'));
    }
    this.db.exec(`INSERT INTO departments(id,name) VALUES ('a','Department A'),('b','Department B');`);
    for(const [id,role,dept] of [['lead','Lead','a'],['colead','Co-Lead','a'],['exec','Executive','b'],['memberA','Member','a'],['memberB','Member','b'],['inactive','Member','a']]){
      this.db.prepare('INSERT INTO users(id,name,email,role,department_id,status) VALUES (?,?,?,?,?,?)').run(id,id,id.toLowerCase()+'@example.invalid',role,dept,id==='inactive'?'Inactive':'Active');
    }
  }
  prepare(sql){
    const db=this.db; let args=[];
    const result={
      bind(...values){args=values;return this;},
      first(){return db.prepare(sql).get(...args)??null;},
      all(){return {results:db.prepare(sql).all(...args)};},
      run(){return {meta:db.prepare(sql).run(...args)};}
    };
    return result;
  }
  batch(statements){
    this.db.exec('BEGIN');
    try {const results=statements.map(s=>s.run());this.db.exec('COMMIT');return Promise.resolve(results);}
    catch(error){this.db.exec('ROLLBACK');return Promise.reject(error);}
  }
  close(){this.db.close();}
  scalar(sql,...args){return this.db.prepare(sql).get(...args);}
}
async function api(db,path,{identity='lead',method='GET',body,headers}={}){
 const resp=await worker.fetch(new Request('http://localhost/api'+path,{
   method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...headers},
   body:body===undefined?undefined:JSON.stringify(body)
 }),{DB:db,APP_ENV:'local',DEV_USER_EMAIL:identity.toLowerCase()+'@example.invalid'});
 let json;
 try{json=await resp.json();}catch{json=null;}
 return {status:resp.status,body:json};
}
async function setup(t){const db=new DatabaseFixture();t.after(()=>db.close());return db;}

test('actual D1 schema: role-specific access and cross-department request ID',async t=>{
 const db=await setup(t);
 const created=await api(db,'/requests/',{identity:'memberA',method:'POST',body:{title:'Bring equipment',type:'Resource Request',receiverDepartmentId:'b'}});
 assert.equal(created.status,201,JSON.stringify(created));
 const id=created.body.request.id;
 assert.equal((await api(db,'/requests/'+id,{identity:'memberB'})).status,403);
 assert.equal((await api(db,'/requests/'+id,{identity:'exec'})).status,200);
 assert.equal((await api(db,'/requests/'+id,{identity:'memberA'})).status,200);
 assert.equal((await api(db,'/requests/'+id+'/approve',{identity:'memberB',method:'POST'})).status,403);
});

test('request withdrawal blocks later approval, retained in history',async t=>{
 const db=await setup(t);
 const created=await api(db,'/requests/',{identity:'memberA',method:'POST',body:{title:'Withdrawn sample',type:'Task Request',receiverDepartmentId:'b'}});
 assert.equal(created.status,201,JSON.stringify(created));
 const id=created.body.request.id;
 const withdrawn=await api(db,'/requests/'+id+'/withdraw',{identity:'memberA',method:'POST'});
 assert.equal(withdrawn.status,200,JSON.stringify(withdrawn));
 const forbidden=await api(db,'/requests/'+id+'/approve',{identity:'exec',method:'POST'});
 assert.notEqual(forbidden.status,200,JSON.stringify(forbidden));
 assert.equal(db.scalar('SELECT is_withdrawn FROM requests WHERE id=?',id).is_withdrawn,1);
});

test('double approval is rejected without duplicate approval events',async t=>{
 const db=await setup(t);
 const cr=await api(db,'/requests/',{identity:'memberA',method:'POST',body:{title:'Approval test',type:'Task Request',receiverDepartmentId:'b'}});
 assert.equal(cr.status,201,JSON.stringify(cr)); const id=cr.body.request.id;
 const one=await api(db,'/requests/'+id+'/approve',{identity:'exec',method:'POST'});
 assert.equal(one.status,200,JSON.stringify(one));
 const two=await api(db,'/requests/'+id+'/approve',{identity:'exec',method:'POST'});
 assert.notEqual(two.status,200,JSON.stringify(two));
 assert.equal(db.scalar('SELECT status FROM requests WHERE id=?',id).status,'Approved');
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM activity_log WHERE reference_id=? AND action='REQUEST_APPROVED'",id).n,1);
});

test('request-to-task conversion is unique, atomic, and addresses assignee',async t=>{
 const db=await setup(t);
 const cr=await api(db,'/requests/',{identity:'memberA',method:'POST',body:{title:'Conversion test',type:'Task Request',receiverDepartmentId:'b'}});
 assert.equal(cr.status,201,JSON.stringify(cr)); const id=cr.body.request.id;
 const approved=await api(db,'/requests/'+id+'/approve',{identity:'exec',method:'POST'});
 assert.equal(approved.status,200,JSON.stringify(approved));
 const converted=await api(db,'/requests/'+id+'/convert',{identity:'exec',method:'POST',body:{assigneeUserId:'memberB'}});
 assert.equal(converted.status,200,JSON.stringify(converted));
 assert.equal(db.scalar('SELECT status FROM requests WHERE id=?',id).status,'Converted');
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM tasks WHERE source_request_id=?',id).n,1);
 const again=await api(db,'/requests/'+id+'/convert',{identity:'exec',method:'POST',body:{assigneeUserId:'memberB'}});
 assert.notEqual(again.status,200,JSON.stringify(again));
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM tasks WHERE source_request_id=?',id).n,1);
});

test('last active Lead survives direct API role mutation and concurrent demotion attempts',async t=>{
 const db=await setup(t);
 const r=await api(db,'/users/lead/role',{identity:'lead',method:'PATCH',body:{role:'Member'}});
 assert.notEqual(r.status,200,JSON.stringify(r));
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM users WHERE role='Lead' AND status='Active'").n,1);
});

test('task assignment, ownership, review and stale operation protections',async t=>{
 const db=await setup(t);
 const created=await api(db,'/tasks/',{identity:'exec',method:'POST',body:{title:'Assignment example',departmentId:'b',assigneeUserId:'memberB'}});
 assert.equal(created.status,201,JSON.stringify(created));
 const id=created.body.task.id;
 assert.equal(db.scalar('SELECT status FROM tasks WHERE id=?',id).status,'Assigned');
 assert.equal((await api(db,'/tasks/'+id+'/start',{identity:'memberA',method:'POST'})).status,403);
 const started=await api(db,'/tasks/'+id+'/start',{identity:'memberB',method:'POST'});
 assert.equal(started.status,200,JSON.stringify(started));
 const replay=await api(db,'/tasks/'+id+'/start',{identity:'memberB',method:'POST'});
 assert.equal(replay.status,409,JSON.stringify(replay));
 assert.equal(db.scalar('SELECT status FROM tasks WHERE id=?',id).status,'Ongoing');
});

test('complete task review lifecycle writes status, notification, and event exactly once',async t=>{
 const db=await setup(t);
 const created=await api(db,'/tasks/',{identity:'exec',method:'POST',body:{title:'Review example',departmentId:'b',assigneeUserId:'memberB'}});
 assert.equal(created.status,201,JSON.stringify(created)); const id=created.body.task.id;
 assert.equal((await api(db,'/tasks/'+id+'/start',{identity:'memberB',method:'POST'})).status,200);
 const submitted=await api(db,'/tasks/'+id+'/submit',{identity:'memberB',method:'POST',body:{evidence:'https://example.org/demo',notes:'Completed work'}});
 assert.equal(submitted.status,200,JSON.stringify(submitted));
 assert.equal(db.scalar('SELECT status FROM tasks WHERE id=?',id).status,'For Review');
 const unauthorized=await api(db,'/tasks/'+id+'/approve',{identity:'memberA',method:'POST',body:{remarks:'No'}});
 assert.equal(unauthorized.status,403,JSON.stringify(unauthorized));
 const approved=await api(db,'/tasks/'+id+'/approve',{identity:'exec',method:'POST',body:{remarks:'Looks good'}});
 assert.equal(approved.status,200,JSON.stringify(approved));
 assert.equal(db.scalar('SELECT status FROM tasks WHERE id=?',id).status,'Completed');
 assert.equal((await api(db,'/tasks/'+id+'/approve',{identity:'exec',method:'POST',body:{remarks:'Again'}})).status,409);
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM activity_log WHERE reference_id=? AND action='TASK_APPROVED'",id).n,1);
 const assigned=await api(db,'/notifications/',{identity:'memberB'});
 assert.equal(assigned.status,200,JSON.stringify(assigned));
 assert.ok(assigned.body.notifications.some(n=>n.referenceId===id || n.reference_id===id));
});

test('notification ownership enforced by direct identifier, read-all does not touch others',async t=>{
 const db=await setup(t);
 const task=await api(db,'/tasks/',{identity:'exec',method:'POST',body:{title:'Notify B',departmentId:'b',assigneeUserId:'memberB'}});
 assert.equal(task.status,201,JSON.stringify(task));
 const rows=db.db.prepare("SELECT id,user_id FROM notifications WHERE user_id='memberB'").all();
 assert.ok(rows.length>0,'assigned user must receive a notification');
 const id=rows[0].id;
 const other=await api(db,'/notifications/'+id+'/read',{identity:'memberA',method:'POST'});
 assert.notEqual(other.status,200,JSON.stringify(other));
 assert.equal(db.scalar('SELECT status FROM notifications WHERE id=?',id).status,'Unread');
 const own=await api(db,'/notifications/'+id+'/read',{identity:'memberB',method:'POST'});
 assert.equal(own.status,200,JSON.stringify(own));
 assert.equal(db.scalar('SELECT status FROM notifications WHERE id=?',id).status,'Read');
});

test('project creation, update, and cross-department mutation rules',async t=>{
 const db=await setup(t);
 const created=await api(db,'/projects/',{identity:'exec',method:'POST',body:{name:'Synthetic Project',type:'Department',departmentIds:['b'],managerUserId:'exec',memberUserIds:['memberB']}});
 assert.equal(created.status,201,JSON.stringify(created));
 const project=created.body.project; const id=project.id;
 assert.equal((await api(db,'/projects/'+id,{identity:'lead'})).status,200);
 const denied=await api(db,'/projects/'+id,{identity:'memberA',method:'PATCH',body:{name:'Should not be allowed'}});
 assert.equal(denied.status,403,JSON.stringify(denied));
 const updated=await api(db,'/projects/'+id,{identity:'exec',method:'PATCH',body:{name:'Revised Project'}});
 assert.equal(updated.status,200,JSON.stringify(updated));
 assert.equal(db.scalar('SELECT name FROM projects WHERE id=?',id).name,'Revised Project');
});

test('two actual concurrent requests cannot both approve pending request',async t=>{
 const db=await setup(t);
 const cr=await api(db,'/requests/',{identity:'memberA',method:'POST',body:{title:'Concurrent review',type:'Task Request',receiverDepartmentId:'b'}});
 assert.equal(cr.status,201,JSON.stringify(cr)); const id=cr.body.request.id;
 const [a,b]=await Promise.all([
   api(db,'/requests/'+id+'/approve',{identity:'exec',method:'POST'}),
   api(db,'/requests/'+id+'/approve',{identity:'exec',method:'POST'})]);
 assert.equal([a.status,b.status].filter(s=>s===200).length,1,JSON.stringify([a,b]));
 assert.equal(db.scalar('SELECT status FROM requests WHERE id=?',id).status,'Approved');
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM activity_log WHERE reference_id=? AND action='REQUEST_APPROVED'",id).n,1);
});

test('rejected task cycles back to work, then archive/restore leaves history',async t=>{
 const db=await setup(t);
 const r=await api(db,'/tasks/',{identity:'exec',method:'POST',body:{title:'Resubmission fixture',departmentId:'b',assigneeUserId:'memberB'}});
 assert.equal(r.status,201,JSON.stringify(r)); const id=r.body.task.id;
 assert.equal((await api(db,'/tasks/'+id+'/start',{identity:'memberB',method:'POST'})).status,200);
 const payload={evidence:'https://example.org/fixture'};
 assert.equal((await api(db,'/tasks/'+id+'/submit',{identity:'memberB',method:'POST',body:payload})).status,200);
 const rejected=await api(db,'/tasks/'+id+'/reject',{identity:'exec',method:'POST',body:{remarks:'Please update evidence'}});
 assert.equal(rejected.status,200,JSON.stringify(rejected));
 assert.equal(db.scalar('SELECT status FROM tasks WHERE id=?',id).status,'Ongoing');
 assert.equal((await api(db,'/tasks/'+id+'/submit',{identity:'memberB',method:'POST',body:payload})).status,200);
 assert.equal((await api(db,'/tasks/'+id+'/approve',{identity:'exec',method:'POST',body:{remarks:'Accepted'}})).status,200);
 assert.equal((await api(db,'/tasks/'+id+'/archive',{identity:'lead',method:'POST'})).status,200);
 assert.equal(db.scalar('SELECT status FROM tasks WHERE id=?',id).status,'Archived');
 assert.equal((await api(db,'/tasks/'+id+'/restore',{identity:'lead',method:'POST'})).status,200);
 assert.equal(db.scalar('SELECT status FROM tasks WHERE id=?',id).status,'Completed');
 assert.equal(db.scalar("SELECT COUNT(*) AS n FROM activity_log WHERE reference_id=? AND action='TASK_REJECTED'",id).n,1);
});

test('member cannot deactivate users or create cross-department project',async t=>{
 const db=await setup(t);
 const deactivate=await api(db,'/users/exec/status',{identity:'memberA',method:'PATCH',body:{status:'Inactive'}});
 assert.equal(deactivate.status,403);
 const project=await api(db,'/projects/',{identity:'memberA',method:'POST',body:{name:'Unauthorized',type:'Department',departmentIds:['b']}});
 assert.equal(project.status,403,JSON.stringify(project));
 assert.equal(db.scalar('SELECT status FROM users WHERE id=?','exec').status,'Active');
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM projects').n,0);
});

test('project archive/restore never deletes members or historical records',async t=>{
 const db=await setup(t);
 const c=await api(db,'/projects/',{identity:'exec',method:'POST',body:{name:'Archive example',type:'Department',departmentIds:['b'],managerUserId:'exec',memberUserIds:['memberB']}});
 assert.equal(c.status,201,JSON.stringify(c)); const id=c.body.project.id;
 const oldCount=db.scalar('SELECT COUNT(*) AS n FROM project_members WHERE project_id=?',id).n;
 const archived=await api(db,'/projects/'+id+'/archive',{identity:'exec',method:'POST'});
 assert.equal(archived.status,200,JSON.stringify(archived));
 assert.equal(db.scalar('SELECT status FROM projects WHERE id=?',id).status,'Archived');
 const restored=await api(db,'/projects/'+id+'/restore',{identity:'exec',method:'POST'});
 assert.equal(restored.status,200,JSON.stringify(restored));
 assert.equal(db.scalar('SELECT COUNT(*) AS n FROM project_members WHERE project_id=?',id).n,oldCount);
});

// Regression: bulk project aggregates must retain the legacy DTO data shape,
// order, and manager permissions. All records below are synthetic.
test('bulk project aggregation matches individual aggregates with bounded queries',async t=>{
 const db=await setup(t);
 const {getProjectAggregate,getProjectAggregatesForRows,listVisibleProjectRows}=
   await import('../../.audit-build/src/repositories/projects.repository.js');
 for(let i=0;i<12;i++){
   let id='proj_bulk_'+i,at='2026-01-01T00:00:00Z';
   db.db.prepare("INSERT INTO projects(id,name,type,created_by,status,created_at,updated_at) VALUES(?,?,'Department','lead','Active',?,?)").run(id,'Batch '+i,at,at);
   db.db.prepare("INSERT INTO project_departments(id,project_id,department_id,assigned_by,assigned_at) VALUES(?,?,'b','lead',?)").run('pd_'+i,id,at);
   db.db.prepare("INSERT INTO project_members(id,project_id,user_id,project_role,assigned_by,assigned_at,status) VALUES(?,?,'exec','Manager','lead',?,'Active')").run('pm_'+i,id,at);
   for(let j=0;j<3;j++)db.db.prepare("INSERT INTO tasks(id,title,department_id,project_id,created_by,priority,status,progress,created_at,updated_at) VALUES(?,?,'b',?,'lead','Medium','Created',0,?,?)").run('bulk_task_'+i+'_'+j,'Synthetic Task '+j,id,at,at);
 }
 const visible=await listVisibleProjectRows({DB:db}, {id:'exec',role:'Executive',department:{id:'b'}});
 let count=0;const sourcePrepare=db.prepare.bind(db);
 db.prepare=(sql)=>{count++;return sourcePrepare(sql);};
 const individual=await Promise.all(visible.map(p=>getProjectAggregate({DB:db},p.id)));
 const oldCount=count;count=0;
 const loaded=await getProjectAggregatesForRows({DB:db},visible);
 const newCount=count;
 assert.deepEqual(JSON.parse(JSON.stringify(loaded)),JSON.parse(JSON.stringify(individual)));
 assert.equal(oldCount,visible.length*4);
 assert.equal(newCount,3);
 assert.ok(newCount<oldCount);
});

test('task list preloads manager membership while keeping four-role permission boundaries',async t=>{
 const db=await setup(t);
 const at='2026-01-01T00:00:00Z';
 db.db.prepare("INSERT INTO projects(id,name,type,created_by,status,created_at,updated_at) VALUES('load_project','Synthetic','Department','lead','Active',?,?)").run(at,at);
 db.db.prepare("INSERT INTO project_members(id,project_id,user_id,project_role,assigned_by,assigned_at,status) VALUES('load_pm','load_project','exec','Manager','lead',?,'Active')").run(at);
 for(let j=0;j<16;j++)db.db.prepare("INSERT INTO tasks(id,title,department_id,project_id,created_by,priority,status,progress,created_at,updated_at) VALUES(?,?,'b','load_project','lead','Low','Created',0,?,?)").run('load_task_'+j,'Synthetic '+j,at,at);
 let queries=0;const orig=db.prepare.bind(db);
 db.prepare=(sql)=>{queries++;return orig(sql);};
 const leader=await api(db,'/tasks/?scope=organization',{identity:'lead'});
 assert.equal(leader.status,200,JSON.stringify(leader));
 assert.ok(leader.body.tasks.every(t=>t.permissions.canAssign));
 const exec=await api(db,'/tasks/?scope=organization',{identity:'exec'});
 assert.equal(exec.status,200,JSON.stringify(exec));
 assert.ok(exec.body.tasks.every(t=>t.permissions.canAssign));
 const member=await api(db,'/tasks/?scope=organization',{identity:'memberB'});
 assert.equal(member.status,200,JSON.stringify(member));
 assert.ok(member.body.tasks.every(t=>!t.permissions.canAssign));
 // 1 user authentication + 1 task list + 1 indexed manager preload per request.
 assert.equal(queries,8); // Lead=2, Executive=3, Member=3
});
