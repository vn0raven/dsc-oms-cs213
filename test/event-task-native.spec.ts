import {beforeAll,it,expect} from 'vitest';
import {env} from 'cloudflare:workers';
import {applyD1Migrations} from 'cloudflare:test';
import app from '../src/index';
import type {Env} from '../src/types/env';
const testEnv=env as unknown as Env & {TEST_MIGRATIONS:Parameters<typeof applyD1Migrations>[1]};
beforeAll(async()=>{
 await applyD1Migrations(testEnv.DB,testEnv.TEST_MIGRATIONS);
 await testEnv.DB.batch([
  testEnv.DB.prepare("INSERT INTO departments(id,name) VALUES('native-dept','Synthetic Department')"),
  testEnv.DB.prepare("INSERT INTO users(id,name,email,role,department_id) VALUES('native-lead','Synthetic Lead','native-lead@example.invalid','Lead','native-dept'),('native-member','Synthetic Member','native-member@example.invalid','Member','native-dept')"),
  testEnv.DB.prepare("INSERT INTO events(id,name,event_type,created_by,status,created_at,updated_at) VALUES('native-event','Synthetic Event','Other','native-lead','Planning','now','now')"),
  testEnv.DB.prepare("INSERT INTO event_appointments(id,event_id,user_id,role,status,responsibilities,proposed_by,proposed_at) VALUES('native-appointment','native-event','native-member','Event Director','Accepted','Coordinate','native-lead','now')")
 ]);
});
async function create(title:string,requestId=crypto.randomUUID()){
 const response=await app.fetch(new Request('http://localhost/api/events/native-event/tasks/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId,title})}),{...testEnv,APP_ENV:'local',DEV_USER_EMAIL:'native-member@example.invalid'});
 return {status:response.status,body:await response.json() as {task:{id:string},replayed:boolean}};
}
it('creates and retries through real Worker routes and native D1',async()=>{
 const key=crypto.randomUUID(),first=await create('Native task',key),retry=await create('Native task',key);
 expect(first.status).toBe(201);expect(retry.status).toBe(200);expect(retry.body.task.id).toBe(first.body.task.id);
 expect(await testEnv.DB.prepare('SELECT COUNT(*) n FROM event_task_links').first('n')).toBe(1);
});
it('native D1 batch rolls back task and audit when a dependency fails',async()=>{
 await testEnv.DB.prepare("CREATE TRIGGER synthetic_native_failure BEFORE INSERT ON event_task_links WHEN NEW.event_id='native-event' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
 const before=await testEnv.DB.prepare('SELECT COUNT(*) n FROM tasks').first('n');
 const r=await create('Must roll back');expect(r.status).toBe(500);
 expect(await testEnv.DB.prepare('SELECT COUNT(*) n FROM tasks').first('n')).toBe(before);
 expect(await testEnv.DB.prepare("SELECT COUNT(*) n FROM activity_log WHERE action='TASK_CREATED' AND new_value LIKE '%Must roll back%'").first('n')).toBe(0);
 await testEnv.DB.prepare('DROP TRIGGER synthetic_native_failure').run();
});
