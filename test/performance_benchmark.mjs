// Offline synthetic-only benchmark: run in both the archived baseline and the remediated source.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import worker from '../.audit-build/src/index.js';
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const migration of readdirSync('migrations').filter((f) => /^\d.*\.sql$/.test(f)).sort()) {
  db.exec(readFileSync(resolve('migrations', migration), 'utf8'));
}
db.exec("INSERT INTO departments(id,name) VALUES ('a','Alpha'),('b','Beta');");
for (const [id, role, dept] of [['lead','Lead','a'],['exec','Executive','b'],['member','Member','b']]) {
 db.prepare('INSERT INTO users(id,name,email,role,department_id,status) VALUES(?,?,?,?,?,?)').run(id,'Test '+id,id+'@example.invalid',role,dept,'Active');
}
const projectStmt = db.prepare(`INSERT INTO projects(id,name,type,created_by,status,start_date,end_date,description,created_at,updated_at) VALUES (?,?,'Department','lead','Active',null,null,null,?,?)`);
const deptStmt = db.prepare('INSERT INTO project_departments(id,project_id,department_id,assigned_by,assigned_at) VALUES (?,?,?,?,?)');
const teamStmt = db.prepare("INSERT INTO project_members(id,project_id,user_id,project_role,assigned_by,assigned_at,status) VALUES (?,?,'exec','Manager','lead',?,'Active')");
const taskStmt = db.prepare("INSERT INTO tasks(id,title,department_id,project_id,created_by,priority,status,progress,created_at,updated_at) VALUES (?,?,'b',?,'lead','High','Created',0,?,?)");
for(let i=0;i<40;i++) {
 let id='proj_'+i, at='2026-01-01T00:00:00Z';
 projectStmt.run(id,'Project '+String(i).padStart(3,'0'),at,at);
 deptStmt.run('dep_'+i,id,'b','lead',at);
 teamStmt.run('member_'+i,id,at);
 for(let j=0;j<3;j++)taskStmt.run('task_'+i+'_'+j,'Task '+i+' '+j,id,at,at);
}
let queries=0;
const adapter={
 prepare(sql) {queries++; let values=[]; return {
 bind(...p){values=p;return this;},
 first(){return db.prepare(sql).get(...values)??null;},
 all(){return {results:db.prepare(sql).all(...values)};},
 run(){return {meta:db.prepare(sql).run(...values)};}
 };},
 batch(statements) {db.exec('BEGIN');try {const result=statements.map(s=>s.run());db.exec('COMMIT');return Promise.resolve(result);}catch(e){db.exec('ROLLBACK');return Promise.reject(e);}}
};
async function measure(path,identity){
 queries=0;
 const start=performance.now();
 const response=await worker.fetch(new Request('http://localhost/api'+path),{
   DB:adapter,APP_ENV:'local',DEV_USER_EMAIL:identity+'@example.invalid'
 });
 const payload=await response.json();
 const latencyMs=performance.now()-start;
 if (response.status!==200) throw Error('HTTP '+response.status+' '+JSON.stringify(payload));
 return {queries,latencyMs:Number(latencyMs.toFixed(3)),size:path.startsWith('/projects')?payload.projects.length:payload.tasks.length,
    signature:path.startsWith('/projects')?payload.projects.map(x=>[x.id,x.taskCount,x.manager?.userId,x.progress]):payload.tasks.map(x=>[x.id,x.permissions.canEdit,x.permissions.canReview,x.permissions.canAssign])};
}
const projectResults=await measure('/projects/','exec');
const taskResults=await measure('/tasks/?scope=organization','exec');
console.log(JSON.stringify({projects:projectResults,tasks:taskResults}));
db.close();
