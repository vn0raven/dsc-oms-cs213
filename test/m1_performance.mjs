import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderTaskSheet as after } from '../public/js/task-sheet.js';
import { filterAndSortTasks } from '../public/js/task-workspace.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const originalPath=resolve(root,'../baseline/dsc-oms-cloudflare/public/js/task-sheet.js');
let before=null;
try { before=(await import(pathToFileURL(originalPath).href)).renderTaskSheet; } catch { /* optional prior ZIP when executing elsewhere */ }
const rows=Array.from({length:1000},(_,i)=>({id:`synthetic-${i}`,title:`Task ${i}`,projectName:i%5===0?null:'Project Alpha',departmentName:i%2?'Creative':'Engineering',assignee:i%3?{name:'Demo Member'}:null,priority:'Medium',status:'Assigned',progress:i%100,startDate:'2026-10-10',deadline:'2026-11-20',updatedAt:'2026-10-23T01:00:00Z'}));
const bench = (f,rounds=15)=>{
  const times=[]; let length=0;
  for(let i=0;i<rounds+3;i++){
    const a=performance.now();length=f().length;const ms=performance.now()-a;if(i>=3)times.push(ms);
  }
  times.sort((a,b)=>a-b);
  return {medianMs:+times[Math.floor(times.length/2)].toFixed(3),minMs:+times[0].toFixed(3),maxMs:+times.at(-1).toFixed(3),htmlBytes:length};
};
const results={fixture:'1000 synthetic task records, Node 22, 15 timed runs after three warmups',beforeSheet:before?bench(()=>before(rows)):null,afterSheet:bench(()=>after(rows)),
  afterFirstPage100:bench(()=>after(rows.slice(0,100))),filterAndSort1000:bench(()=>JSON.stringify(filterAndSortTasks(rows,{search:'task',sort:'title-asc',priority:'Medium'}))),apiQueries:{before:1,after:1},note:'HTML generation only; does not measure browser layout, Worker/D1 latency, or production workloads.'};
writeFileSync(resolve(root,'dist/m1-evidence/performance.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
