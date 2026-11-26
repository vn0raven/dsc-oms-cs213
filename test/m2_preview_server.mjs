/** Local-only Playwright server. Uses real application routes and in-memory SQLite,
 * synthetic users and cookie-picked test identities. NEVER a deployment entrypoint. */
import { createServer } from 'node:http';
import { readFileSync,readdirSync } from 'node:fs';
import { extname,resolve,join,normalize } from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import app from '../.audit-build/src/index.js';
const root=resolve(import.meta.dirname,'..'),db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync(join(root,'migrations')).filter(f=>/^\d.*\.sql$/.test(f)).sort())db.exec(readFileSync(join(root,'migrations',f),'utf8'));
db.exec("INSERT INTO departments(id,name) VALUES ('a','Demo Engineering'),('b','Demo Creative')");
for(const [id,role,department] of [['lead','Lead','a'],['colead','Co-Lead','a'],['exec','Executive','b'],['member','Member','b']]){
 db.prepare("INSERT INTO users(id,name,email,role,department_id,status) VALUES (?,?,?,?,?,'Active')").run(id,'Demo '+role,id+'@example.invalid',role,department);
}
const fixture={prepare(sql){let values=[];return {bind(...args){values=args;return this;},first(){return db.prepare(sql).get(...values)||null;},all(){return {results:db.prepare(sql).all(...values)};},run(){return {meta:db.prepare(sql).run(...values)};}};},async batch(statements){db.exec('BEGIN');try{const results=statements.map(x=>x.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
async function route(path,identity='lead',method='GET',body){
 const resp=await app.fetch(new Request('http://localhost:8788/api'+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),{DB:fixture,APP_ENV:'local',DEV_USER_EMAIL:identity+'@example.invalid'});
 try{return [resp.status,await resp.json()]}catch{return [resp.status,null];}
}
const cr=await route('/events/','member','POST',{name:'DSC Tech Summit',objectives:'Promote practical technical learning',startsAt:'2027-02-05T08:00',venue:'University Auditorium',eventType:'Conference',description:'Fictional event for local UI tests',expectedAttendance:90});
if(cr[0]!==201)throw new Error('Event seed error: '+JSON.stringify(cr));
const eventId=cr[1].event.id;
await route('/events/'+eventId+'/submit','member','POST');
await route('/events/'+eventId+'/approve','lead','POST',{remarks:'Sample approval'});
const direct=await route('/events/'+eventId+'/appointments','lead','POST',{userId:'member',role:'Event Director',responsibilities:'Direct event preparation'});
if(direct[0]!==201)throw new Error('Director seed error: '+JSON.stringify(direct));
const server=createServer(async(req,res)=>{
 try{
 const url=new URL(req.url||'/', 'http://localhost:8788');
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(item=>item.trim().split('=')));
  const identity=['lead','colead','exec','member'].includes(cookies.m2_role)?cookies.m2_role:'lead';
  const request=new Request('http://localhost:8788'+url.pathname+url.search,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await app.fetch(request,{DB:fixture,APP_ENV:'local',DEV_USER_EMAIL:identity+'@example.invalid'});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const pathname=url.pathname==='/'?'/index.html':url.pathname;
 const absolute=resolve(join(root,'public'),'.'+normalize(pathname));
 if(!absolute.startsWith(join(root,'public')+'/')){res.writeHead(403);res.end();return;}
 const ct={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'};
 const data=readFileSync(absolute);res.writeHead(200,{'content-type':ct[extname(absolute)]||'application/octet-stream'});res.end(data);
 }catch(error){res.writeHead(404);res.end('Not found');}
});
server.listen(8788,'127.0.0.1',()=>console.log('M2 synthetic preview listening http://127.0.0.1:8788'));
