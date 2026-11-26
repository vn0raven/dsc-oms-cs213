import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterAndSortTasks, taskContext, safeColumnWidths } from '../../public/js/task-workspace.mjs';
import { renderTaskSheet, TASK_SHEET_COLUMNS, DEFAULT_TASK_SHEET_COLUMNS } from '../../public/js/task-sheet.js';
import { buildCsv, safeSpreadsheetValue } from '../../public/js/task-export.js';

const fixture = [
  {id:'a',title:'Alpha',projectId:null,projectName:null,departmentName:'Design',priority:'Low',status:'Created',deadline:'2026-10-01',progress:25,updatedAt:'2026-10-10',assignee:null},
  {id:'b',title:'Beta',projectId:'p1',projectName:'Portal',departmentName:'Engineering',priority:'High',status:'Assigned',deadline:'2026-11-10',progress:0,updatedAt:'2026-10-12',assignee:{name:'Demo Member'}},
  {id:'c',title:'Gamma',projectId:'p1',projectName:'Portal',departmentName:'Design',priority:'Medium',status:'Ongoing',deadline:'2026-10-05',progress:75,updatedAt:'2026-10-11',assignee:{name:'Demo Lead'}},
];
test('M1 independent/project task context adds no new database relationships',()=>{
  assert.deepEqual(taskContext(fixture[0]),{type:'independent',id:null,name:'Independent'});
  assert.deepEqual(taskContext(fixture[1]),{type:'project',id:'p1',name:'Portal'});
});
test('M1 combined search, project context, priority, date range and overdue filters',()=>{
  const now=new Date(2026,9,23);
  assert.deepEqual(filterAndSortTasks(fixture,{context:'project',department:'Design',priority:'Medium',search:'gamma',deadlineFrom:'2026-10-01',deadlineTo:'2026-10-10',overdue:true},now).map(x=>x.id),['c']);
  assert.deepEqual(filterAndSortTasks(fixture,{context:'independent'},now).map(x=>x.id),['a']);
  assert.deepEqual(filterAndSortTasks(fixture,{context:'project',status:'Created'},now),[]);
});
test('M1 all column sorts have stable ordering, including reverse and missing deadlines',()=>{
  assert.deepEqual(filterAndSortTasks(fixture,{sort:'title-desc'}).map(x=>x.title),['Gamma','Beta','Alpha']);
  assert.deepEqual(filterAndSortTasks(fixture,{sort:'priority-desc'}).map(x=>x.id),['b','c','a']);
  assert.deepEqual(filterAndSortTasks(fixture,{sort:'deadline-asc'}).map(x=>x.id),['a','c','b']);
  assert.deepEqual(filterAndSortTasks(fixture,{sort:'progress-desc'}).map(x=>x.id),['c','a','b']);
  assert.deepEqual(filterAndSortTasks(fixture,{sort:'project-asc'}).map(x=>x.id),['a','b','c']);
});
test('M1 column widths sanitize untrusted persisted preferences',()=>{
  assert.deepEqual(safeColumnWidths({task:350,status:150000,project:-1,priority:'216'},['task','status','project','priority']),{task:350,priority:216});
});
test('M1 Sheet renders selected accessible rows, sortable column headers, fixed column widths',()=>{
  const html=renderTaskSheet(fixture,DEFAULT_TASK_SHEET_COLUMNS,{selectedId:'b',sort:'title-desc',widths:{task:350}});
  assert.match(html,/width:350px/);
  assert.match(html,/aria-sort="descending"/);
  assert.match(html,/aria-label="Task spreadsheet"/);
  assert.match(html,/data-task-id="b" tabindex="0" aria-selected="true"/);
  assert.match(html,/data-resize-col="task"/);
  assert.equal((html.match(/class="task-sheet-row/g)||[]).length,3);
});
test('M1 Sheet escapes script payloads in text and HTML attributes',()=>{
  const html=renderTaskSheet([{...fixture[0],id:'"><img src=x onerror=alert(1)>',title:'<svg onload=alert(1)>',projectName:'"><script>x</script>'}]);
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.match(html,/&lt;svg/);
});
test('M1 empty Sheet has accessible no-match message',()=>{
  const html=renderTaskSheet([],['task']);
  assert.match(html,/No tasks match your filters/);
  assert.match(html,/colspan="2"/);
});
test('M1 CSV uses actual selected columns, quoted cells, and formula neutralization',()=>{
  const csv=buildCsv([{...fixture[0],title:'=HYPERLINK("https://bad.test")',departmentName:'="hi"'}],['task','department']);
  assert.match(csv,/"'\=HYPERLINK\(""https:\/\/bad.test""\)"/);
  assert.match(csv,/"'=""hi"""/);
  assert.equal(safeSpreadsheetValue('\t+2'),"'\t+2");
  assert.ok(!csv.includes('Project,'));
});
test('M1 Sheet default exports remain compatible with current tasks',()=>{
  assert.deepEqual(DEFAULT_TASK_SHEET_COLUMNS,['task','project','assignee','status','deadline','priority','progress']);
 assert.ok(TASK_SHEET_COLUMNS.some(c=>c.id==='department'));
 assert.ok(TASK_SHEET_COLUMNS.some(c=>c.id==='startDate'));
});
