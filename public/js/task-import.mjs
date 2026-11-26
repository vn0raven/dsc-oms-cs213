import { api } from './api.js';
import { openModal } from './modal-manager.js';
import { escapeHtml as h } from './safe-html.mjs';

/** RFC-style CSV parser with quoted commas/newlines and explicit malformed-input errors. */
export function parseCsv(text){
 if(text.length>2_000_000)throw new Error('CSV must be under 2 MB.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false,closed=false;
 const cell=()=>{row.push(value);value='';closed=false;};
 const end=()=>{cell();if(row.some(v=>v!==''))rows.push(row);row=[];};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c==='"'){if(value||closed)throw new Error('Unexpected quote in CSV.');quoted=true;}
  else if(c===',')cell();
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;end();}
  else{if(closed)throw new Error('Unexpected text after closing quote.');value+=c;}
 }
 if(quoted)throw new Error('Unclosed CSV quote.');if(value||row.length||closed)end();
 if(rows.length<2)throw new Error('CSV needs a header and at least one data row.');
 const headers=rows.shift();if(headers.some(v=>!v.trim())||new Set(headers).size!==headers.length)throw new Error('Column headers must be nonempty and unique.');
 if(rows.length>100)throw new Error('Import at most 100 rows per batch.');
 if(rows.some(r=>r.length!==headers.length))throw new Error('Every row must have the same number of columns as the header.');
 return {headers,rows};
}
export function mapCsv(parsed,mapping,departmentId){
 if(!Number.isInteger(mapping.title))throw new Error('Map the task title column.');
 return parsed.rows.map((row,i)=>{
  const task={departmentId};
  for(const [field,index] of Object.entries(mapping))if(Number.isInteger(index)&&index>=0){if(index>=parsed.headers.length)throw new Error('Invalid column mapping.');task[field]=row[index]||null;}
  return {rowId:String(i+2),task};
 });
}
export async function openTaskImport(onChanged){
 const response=await api.get('/api/departments');const departments=(response.departments||[]).filter(d=>d.status==='Active');
 let parsed=null,batch=null,busy=false;
 const modal=openModal({title:'Import tasks from CSV',size:'large',onBeforeClose:()=>!busy,content:`
 <p>Export a Google Sheet as CSV, then map its columns. This creates unassigned independent tasks. Existing tasks are never overwritten; matching title, department and dates are flagged as duplicates.</p>
 <p>Project/Event links, assignments and historical status require their existing authorized workflows.</p>
 <p role="alert" data-import-error hidden></p>
 <label class="form-field">CSV file (up to 100 rows, 2 MB)<input type="file" accept=".csv,text/csv" data-import-file></label>
 <div data-import-mapping></div><div data-import-preview aria-live="polite"></div>
 <footer class="oms-dialog-actions"><button type="button" class="button button-light" data-import-check disabled>Validate &amp; preview</button><button type="button" class="button button-primary" data-import-apply disabled>Import ready rows</button></footer>`});
 const root=modal.body,error=root.querySelector('[data-import-error]'),check=root.querySelector('[data-import-check]'),apply=root.querySelector('[data-import-apply]'),file=root.querySelector('[data-import-file]'),mapping=root.querySelector('[data-import-mapping]'),preview=root.querySelector('[data-import-preview]');
 const fail=e=>{error.textContent=e.message||'Import failed.';error.hidden=false;};
 file.onchange=async()=>{try{error.hidden=true;batch=null;apply.disabled=true;check.disabled=true;if(!file.files[0])return;if(file.files[0].size>2_000_000)throw new Error('CSV must be under 2 MB.');parsed=parseCsv(await file.files[0].text());
  mapping.innerHTML=`<label class="form-field">Accountable department<select data-import-department required><option value="">Choose department</option>${departments.map(d=>`<option value="${h(d.id)}">${h(d.name)}</option>`).join('')}</select></label>`+['title','description','instructions','priority','startDate','deadline'].map(field=>`<label class="form-field">${h(field)} ${field==='title'?'(required)':'(optional)'}<select data-map-field="${field}"><option value="">Do not import</option>${parsed.headers.map((name,index)=>`<option value="${index}">${h(name)}</option>`).join('')}</select></label>`).join('');check.disabled=false;preview.textContent=`${parsed.rows.length} rows loaded. Dates must use YYYY-MM-DD; priorities: Low, Medium, High, Critical.`;
 }catch(e){fail(e);}};
 mapping.onchange=()=>{batch=null;apply.disabled=true;preview.textContent='Mapping changed. Validate again before importing.';};
 check.onclick=async()=>{if(busy)return;busy=true;check.disabled=true;error.hidden=true;try{
  const departmentId=mapping.querySelector('[data-import-department]').value;if(!departmentId)throw new Error('Choose a department.');
  const fields=Object.fromEntries([...mapping.querySelectorAll('[data-map-field]')].filter(x=>x.value!=='').map(x=>[x.dataset.mapField,Number(x.value)]));
  batch={requestId:crypto.randomUUID(),rows:mapCsv(parsed,fields,departmentId)};
  const result=await api.post('/api/tasks/import/preview',batch);
  preview.textContent=result.results.map(r=>`Row ${r.rowId}: ${r.status}${r.title?' — '+r.title:''}`).join('\n');apply.disabled=!result.results.some(r=>r.status==='ready');
 }catch(e){batch=null;apply.disabled=true;fail(e);}finally{busy=false;check.disabled=false;}};
 apply.onclick=async()=>{if(!batch||busy)return;busy=true;apply.disabled=true;check.disabled=true;file.disabled=true;mapping.querySelectorAll('select').forEach(x=>x.disabled=true);error.hidden=true;
  try{const result=await api.post('/api/tasks/import/apply',batch);preview.textContent=result.results.map(r=>`Row ${r.rowId}: ${r.status}${r.taskId?' — '+r.taskId:''}${r.message?' — '+r.message:''}`).join('\n');if(!result.complete)throw new Error('Import stopped. Successful rows are saved; retry this same batch for remaining rows.');apply.textContent='Import complete';await onChanged?.();}
  catch(e){fail(e);apply.disabled=false;apply.textContent='Retry same batch';}
  finally{busy=false;}
 };
}
