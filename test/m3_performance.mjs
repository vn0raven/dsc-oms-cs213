/** M2 integration tests use the real Hono routes, all D1 migrations and synthetic SQLite only. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import app from '../.audit-build/src/index.js';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
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


import {performance} from 'node:perf_hooks';
const db=new DB();
try{
 const insertEvent=db.sqlite.prepare(`INSERT INTO events(id,name,event_type,created_by,status,starts_at,created_at,updated_at) VALUES(?,?,'Workshop','lead','Planning','2027-03-01T09:00:00Z','now','now')`);
 for(let i=0;i<80;i++)insertEvent.run('perf-event-'+i,'Synthetic event '+i);
 const insertAnnouncement=db.sqlite.prepare(`INSERT INTO announcements(id,title,body,category,audience,created_by,status,published_at,created_at,updated_at) VALUES(?,?,'Synthetic message','General','Organization','lead','Published','2026-10-01','now','now')`);
 for(let i=0;i<160;i++)insertAnnouncement.run('perf-ann-'+i,'Synthetic notice '+i);
 let queryCount=0;const original=db.prepare.bind(db);db.prepare=(sql)=>{queryCount++;return original(sql)};
 for(const path of ['/m3/summary','/m3/announcements']){
  const times=[];const queries=[];
  for(let i=0;i<20;i++){
   queryCount=0;const started=performance.now();const response=await api(db,path);
   if(response.status!==200)throw new Error(JSON.stringify(response));
   times.push(performance.now()-started);queries.push(queryCount);
  }
  times.sort((a,b)=>a-b);
  console.log(JSON.stringify({route:path,rows:{events:80,announcements:160},iterations:20,medianMs:Number(times[10].toFixed(3)),queriesPerRequest:queries[0],queriesStable:queries.every(n=>n===queries[0])}));
 }
}finally{db.close();}
