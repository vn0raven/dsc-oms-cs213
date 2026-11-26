"""Local Worker + native D1 + actual browser, with synthetic loopback identity.
Requires isolated local QA setup. This does NOT verify Cloudflare Access policies.
"""
from pathlib import Path
from urllib.parse import urlparse
import argparse,json,os,uuid
from playwright.sync_api import sync_playwright

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8787');parser.add_argument('--import-mode',action='store_true');args=parser.parse_args()
 assert urlparse(args.base_url).hostname in ('127.0.0.1','localhost','::1'),'Synthetic tests are local-only'
 out=Path(__file__).resolve().parents[1]/'dist/local-e2e';out.mkdir(parents=True,exist_ok=True)
 results=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True)
  try:
   for width,theme in [(375,'light'),(1440,'dark')]:
    page=browser.new_page(viewport={'width':width,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.base_url);page.locator('[data-page=events]').wait_for();page.evaluate('(v)=>{localStorage.setItem("dsc-oms-theme",v);document.documentElement.dataset.theme=v}',theme)
    if args.import_mode:
     page.evaluate("document.querySelector('[data-page=tasks]').click()")
     page.get_by_role('button',name='Import CSV',exact=True).click()
     dlg=page.get_by_role('dialog');title='Synthetic CSV '+str(uuid.uuid4())
     dlg.locator('input[type=file]').set_input_files({'name':'synthetic.csv','mimeType':'text/csv','buffer':f'Task,Details\r\n{title},Synthetic import\r\n'.encode()})
     dlg.locator('[data-import-department]').select_option('demo_dept_eng')
     dlg.locator('[data-map-field=title]').select_option('0');dlg.locator('[data-map-field=description]').select_option('1')
     dlg.get_by_role('button',name='Validate & preview').click()
     page.wait_for_function("() => document.querySelector('[data-import-preview]').textContent.includes('ready')")
     dlg.get_by_role('button',name='Import ready rows').click()
     page.wait_for_function("() => document.querySelector('[data-import-preview]').textContent.includes('created')")
     assert page.request.get(args.base_url+'/api/tasks').ok
     page.screenshot(path=str(out/f'import_{width}.png'),full_page=True)
    else:
     page.evaluate("document.querySelector('[data-page=events]').click()")
     page.locator('[data-event-id=m3demo_event_workshop]').click()
     page.get_by_role('tab',name='Tasks',exact=True).click()
     page.get_by_role('button',name='+ New Task',exact=True).click();dlg=page.get_by_role('dialog')
     title='Synthetic E2E '+str(uuid.uuid4());dlg.get_by_label('Task title').fill(title)
     dlg.get_by_label('Event Team',exact=True).select_option('m3demo_team_program')
     with page.expect_response(lambda r:'/tasks/create' in r.url and r.request.method=='POST') as saved:
      dlg.get_by_role('button',name='Create Task',exact=True).click()
     assert saved.value.status==201,saved.value.text();data=saved.value.json();task=data['task'];assert task['assignee'] is None;assert task['projectId'] is None;assert task['departmentId']=='demo_dept_eng'
     dlg.wait_for(state='detached');page.get_by_role('button',name=title,exact=True).wait_for()
     page.get_by_role('button',name=title,exact=True).click();page.get_by_role('dialog').wait_for()
     assert page.get_by_role('dialog').get_by_role('button',name='Edit',exact=True).count()==0
     page.keyboard.press('Escape');page.screenshot(path=str(out/f'event_tasks_{width}.png'),full_page=True)
     page.evaluate("document.querySelector('[data-page=tasks]').click()")
     page.locator('#task-search').fill(title)
     page.wait_for_function("() => document.querySelector('[data-task-result-count]').textContent.startsWith('1 of')")
     assert page.locator('.task-row[data-task-id]').count()==1
     page.get_by_role('button',name='Sheet',exact=True).click();assert page.locator('.task-sheet-row').count()==1
    assert not errors,errors
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+2')
    results.append({'width':width,'theme':theme,'mode':'import' if args.import_mode else 'Event creation','status':'passed','authentication':'synthetic local loopback override','backend':'Wrangler Worker + native local D1'})
    print('PASS',results[-1],flush=True);page.close()
  finally:browser.close()
 (out/('import-results.json' if args.import_mode else 'event-results.json')).write_text(json.dumps(results,indent=2),encoding='utf-8')
