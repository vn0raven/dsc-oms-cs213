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
import {parseCsv,mapCsv} from '../../public/js/task-import.mjs';
import {filterAndSortTasks,normalizeTaskFilters,taskContext} from '../../public/js/task-workspace.mjs';
const batch=(tasks=[{title:'Synthetic import',departmentId:'a'}])=>({requestId:crypto.randomUUID(),rows:tasks.map((task,i)=>({rowId:String(i+2),task}))});
const imported=(db,body,who='lead',mode='apply')=>api(db,`/tasks/import/${mode}`,who,'POST',body);
test('CSV parses BOM, quoted commas, escaped quotes and multiline text; rejects malformed rows',()=>{
 const parsed=parseCsv('\uFEFFTask,Details\r\n"A, B","Line 1\nLine ""2"""\r\n');
 assert.deepEqual(parsed.rows,[['A, B','Line 1\nLine "2"']]);
 assert.deepEqual(mapCsv(parsed,{title:0,description:1},'a')[0],{rowId:'2',task:{departmentId:'a',title:'A, B',description:'Line 1\nLine "2"'}});
 for(const input of ['Title,Title\na,b','Title\n"bad','Title,Other\na','Title\n"a"x','Title\n'])assert.throws(()=>parseCsv(input));
 assert.throws(()=>mapCsv(parsed,{},'a'));
});
test('Event context and contradiction clearing share one Board/Sheet transformation',()=>{
 const tasks=[{id:'i'},{id:'p',projectId:'p',projectName:'P'},{id:'e',eventId:'e',eventName:'E'}];
 assert.deepEqual(filterAndSortTasks(tasks,{context:'independent'}).map(t=>t.id),['i']);
 assert.deepEqual(filterAndSortTasks(tasks,{context:'event',event:'e'}).map(t=>t.id),['e']);
 assert.equal(taskContext(tasks[2]).type,'event');
 assert.deepEqual(normalizeTaskFilters({context:'independent',project:'P',event:'e'}),{context:'independent',project:'',event:''});
 assert.equal(normalizeTaskFilters({context:'independent',project:'P',event:'e'},'project').context,'project');
});
test('preview is read-only; apply is unassigned, audited and safely replayable',async t=>{
 const db=await fixture(t),body=batch();
 const preview=await imported(db,body,'lead','preview');assert.equal(preview.status,200);assert.equal(preview.body.results[0].status,'ready');assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,0);
 const applied=await imported(db,body);assert.equal(applied.status,200);assert.equal(applied.body.results[0].status,'created');
 const replay=await imported(db,body);assert.equal(replay.body.results[0].status,'duplicate');assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,1);assert.equal(db.scalar('SELECT COUNT(*) n FROM task_assignments').n,0);assert.equal(db.scalar('SELECT COUNT(*) n FROM activity_log').n,1);
 assert.equal(db.scalar('SELECT status FROM tasks').status,'Created');
 assert.equal((await imported(db,{...body,rows:[{rowId:'2',task:{title:'Changed',departmentId:'a'}}]})).status,409);
});
test('full batch preflight prevents partial writes from invalid rows; no delegated imports',async t=>{
 const db=await fixture(t);
 assert.equal((await imported(db,batch([{title:'Valid',departmentId:'a'},{title:'',departmentId:'a'}]))).status,400);
 for(const fields of [{projectId:'x'},{assigneeUserId:'memberA'},{status:'Completed'},{eventId:'e'},{deadline:'2027-02-31'}])assert.equal((await imported(db,batch([{title:'Task',departmentId:'a',...fields}]))).status,400);
 for(const who of ['memberA','inactive','exec'])assert.equal((await imported(db,batch(),who)).status,403);
 assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,0);
 assert.equal((await imported(db,batch([{title:'Creative',departmentId:'b'}]),'exec')).status,200);
});
test('duplicates within file and existing records are skipped without overwrite',async t=>{
 const db=await fixture(t);const first=batch([{title:'Same',departmentId:'a'},{title:'Same',departmentId:'a',description:'Do not overwrite'}]);
 const result=await imported(db,first);assert.deepEqual(result.body.results.map(r=>r.status),['created','duplicate']);
 const again=await imported(db,batch([{title:'Same',departmentId:'a',description:'Changed'}]));assert.equal(again.body.results[0].status,'duplicate');assert.equal(db.scalar('SELECT description FROM tasks').description,null);
});
test('row failure rolls back receipt and audit; earlier rows can resume safely',async t=>{
 const db=await fixture(t);db.sqlite.exec("CREATE TRIGGER synthetic_import_fail BEFORE INSERT ON tasks WHEN NEW.title='Fail' BEGIN SELECT RAISE(ABORT,'synthetic failure');END;");
 const body=batch([{title:'Good',departmentId:'a'},{title:'Fail',departmentId:'a'},{title:'Later',departmentId:'a'}]);
 const first=await imported(db,body);assert.equal(first.body.complete,false);assert.deepEqual(first.body.results.map(r=>r.status),['created','failed']);assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,1);assert.equal(db.scalar('SELECT COUNT(*) n FROM task_import_receipts').n,1);
 db.sqlite.exec('DROP TRIGGER synthetic_import_fail');const retry=await imported(db,body);assert.equal(retry.body.complete,true);assert.deepEqual(retry.body.results.map(r=>r.status),['duplicate','created','created']);assert.equal(db.scalar('SELECT COUNT(*) n FROM tasks').n,3);
});
