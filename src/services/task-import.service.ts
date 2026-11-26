/** Controlled creation imports. Never overwrite tasks, roles, history or assignments. */
import { ApiError } from '../utils/api-error';
import { findDepartmentById } from '../repositories/departments.repository';
import { createTaskTransaction } from '../repositories/tasks.repository';
import { validateTaskCreationFields } from './task.service';
import type { Env } from '../types/env';
import type { AuthenticatedUser } from '../types/user';

const invalid=(message:string)=>new ApiError(400,'INVALID_IMPORT',message);
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw invalid('Expected an object.');return v as Record<string,unknown>;}
export async function importTasks(env:Env,actor:AuthenticatedUser,payload:unknown,apply=false){
 if(actor.status!=='Active'||!['Lead','Co-Lead','Executive'].includes(actor.role))throw new ApiError(403,'FORBIDDEN','Task import requires existing permanent task-creation authority.');
 const body=object(payload);
 if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId))throw invalid('A stable requestId is required.');
 if(!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>100)throw invalid('Import 1–100 rows per batch.');
 const seen=new Set<string>(),fingerprints=new Set<string>();
 const prepared=[];
 for(const input of body.rows){
  const row=object(input),task=object(row.task);
  if(typeof row.rowId!=='string'||!row.rowId||row.rowId.length>100||seen.has(row.rowId))throw invalid('Row IDs must be unique and 1–100 characters.');
  seen.add(row.rowId);
  const extra=Object.keys(task).find(k=>!['title','description','instructions','departmentId','priority','startDate','deadline'].includes(k));
  if(extra)throw invalid(`Row ${row.rowId}: unsupported field ${extra}. Import creates unassigned independent tasks only.`);
  if(typeof task.departmentId!=='string')throw invalid(`Row ${row.rowId}: map a permanent department ID.`);
  const departmentId=task.departmentId.trim(),department=await findDepartmentById(env,departmentId);
  if(!department||department.status!=='Active')throw invalid(`Row ${row.rowId}: department is missing or inactive.`);
  if(actor.role==='Executive'&&departmentId!==actor.department.id)throw new ApiError(403,'FORBIDDEN',`Row ${row.rowId}: department is outside your creation authority.`);
  const values=validateTaskCreationFields(task),canonical=JSON.stringify({departmentId,...values});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),n=>n.toString(16).padStart(2,'0')).join('');
  const receipt=await env.DB.prepare(`SELECT task_id AS taskId,payload_hash AS hash FROM task_import_receipts WHERE actor_id=? AND request_id=? AND row_id=?`).bind(actor.id,body.requestId,row.rowId).first<{taskId:string,hash:string}>();
  if(receipt&&receipt.hash!==hash)throw new ApiError(409,'IMPORT_CONFLICT',`Row ${row.rowId}: retry fields changed. Keep the original file/mapping or use a new batch ID.`);
  // Conservative duplicate policy: same title + accountable department + dates in
  // independent work is flagged even when optional fields differ. Never overwrite.
  const duplicate=await env.DB.prepare(`SELECT t.id FROM tasks t WHERE t.title=? AND t.department_id=? AND t.project_id IS NULL AND coalesce(t.start_date,'')=coalesce(?,'') AND coalesce(t.deadline,'')=coalesce(?,'') AND NOT EXISTS(SELECT 1 FROM event_task_links l WHERE l.task_id=t.id) LIMIT 1`).bind(values.title,departmentId,values.startDate,values.deadline).first<{id:string}>();
  const duplicateKey=JSON.stringify([values.title,departmentId,values.startDate,values.deadline]);
  const duplicateInFile=fingerprints.has(duplicateKey);fingerprints.add(duplicateKey);
  prepared.push({rowId:row.rowId,departmentId,values,hash,existing:receipt?.taskId||duplicate?.id||null,duplicateInFile});
 }
 const results=[];
 // Validate the whole batch before any write. Each row then commits atomically;
 // successful row receipts survive a later failure and support explicit retries.
 for(const row of prepared){
  if(row.existing||row.duplicateInFile){results.push({rowId:row.rowId,status:'duplicate',taskId:row.existing});continue;}
  if(!apply){results.push({rowId:row.rowId,status:'ready',title:row.values.title});continue;}
  const taskId=`task_${crypto.randomUUID()}`;
  try{
   await createTaskTransaction(env,{id:taskId,...row.values,departmentId:row.departmentId,projectId:null,assigneeUserId:null},actor,[
    env.DB.prepare(`INSERT INTO task_import_receipts(actor_id,request_id,row_id,payload_hash,task_id,created_at) VALUES(?,?,?,?,?,?)`).bind(actor.id,body.requestId,row.rowId,row.hash,taskId,new Date().toISOString())
   ]);
   results.push({rowId:row.rowId,status:'created',taskId});
  }catch(error){
   const receipt=await env.DB.prepare(`SELECT task_id AS taskId,payload_hash AS hash FROM task_import_receipts WHERE actor_id=? AND request_id=? AND row_id=?`).bind(actor.id,body.requestId,row.rowId).first<{taskId:string,hash:string}>();
   if(receipt?.hash===row.hash){results.push({rowId:row.rowId,status:'duplicate',taskId:receipt.taskId});continue;}
   results.push({rowId:row.rowId,status:'failed',message:'Row was rolled back. Refresh permissions and retry the same batch.'});break;
  }
 }
 return {mode:apply?'apply':'preview',complete:results.length===prepared.length&&!results.some(r=>r.status==='failed'),results};
}
