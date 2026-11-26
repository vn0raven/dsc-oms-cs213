"""Actual frontend modules/CSS with synthetic APIs; not Access or Worker E2E."""
from pathlib import Path
import copy,json,os,argparse
from playwright.sync_api import sync_playwright
import m35_browser as ui

def fixtures(role='Event Director'):
 data=copy.deepcopy(ui.DATA)
 user=data['/api/auth/me']['user'];user.update(id='memberA',role='Member')
 e=data['/api/events'][0] if isinstance(data['/api/events'],list) else data['/api/events']['events'][0]
 e['permissions'].update(canCreateEventTask=role=='Event Director',canCreateTeamTask=role in ('Event Director','Team Head'),creatableTeamIds=['teamA','teamB'] if role=='Event Director' else ['teamA'] if role=='Team Head' else [],canLinkTasks=False,canManageTeams=False,canProposeAppointment=False,canAdvance=False)
 w=data['/api/events/fixture-event/workspace'];w['event']=e
 w['teams']=[{'id':'teamA','name':'Technology','purpose':'Systems and technical readiness'},{'id':'teamB','name':'Program','purpose':'Program flow'}]
 w['appointments']=[{'id':'head','teamId':'teamA','userId':'memberA','userName':'Synthetic Head','role':'Team Head','status':'Accepted','responsibilities':'Coordinate systems'}, {'id':'pending','teamId':'teamA','userId':'invite','userName':'Pending Person','role':'Team Member','status':'Proposed','responsibilities':'Pending invitation'}]
 op=data['/api/m3/events/fixture-event/operations'];op['schedule']=[{'id':'schedule','title':'Opening','starts_at':'2026-11-20T09:00:00+08:00'}];op['notes']=[{'id':'note','title':'Briefing','category':'Meeting','created_at':'2026-11-19T09:00:00Z','details':'Synthetic coordination note <img src=x onerror=alert(1)>'}]
 task=data['/api/tasks']['tasks'][0];task['eventId']='fixture-event';task['eventName']=e['name'];task['eventTeamName']='Technology'
 return data

MUTATIONS="""(()=>{const original=window.fetch;window.__submitted=[];window.__failNext=true;
window.fetch=async(url,opts={})=>{
 if(String(url).endsWith('/tasks/create')){
  const body=JSON.parse(opts.body);window.__submitted.push(body);
  if(window.__failNext){window.__failNext=false;return new Response(JSON.stringify({error:'EVENT_CONFLICT',message:'Synthetic stage conflict; refresh and retry.'}),{status:409,headers:{'content-type':'application/json'}});}
  const w=window.__DATA__['/api/events/fixture-event/workspace'];w.tasks.push({taskId:'created',id:'created',title:body.title,status:'Created',priority:body.priority,teamId:body.teamId,assignee:null,deadline:body.deadline});
  return new Response(JSON.stringify({task:{id:'created'}}),{status:201,headers:{'content-type':'application/json'}});
 }return original(url,opts);
};})();"""

def run(browser,theme,width,out,capture=False):
 ui.DATA=fixtures();page,errors=ui.make_page(browser,theme,width)
 try:
  page.evaluate(MUTATIONS)
  page.evaluate("document.querySelector('[data-page=events]').click()")
  page.locator('[data-event-id]').first.click()
  for tab in ['Organization','Operations','Tasks']:
   page.get_by_role('tab',name=tab,exact=True).click()
   page.locator('.event-fullpage').wait_for()
   if not capture and tab=='Organization':
    assert '1 accepted' in page.locator('.event-team-card').first.inner_text()
    assert '1 pending' in page.locator('.event-team-card').first.inner_text()
    page.locator('.event-team-card').first.click();page.get_by_role('dialog').wait_for()
    assert page.get_by_role('dialog').get_by_text('Pending Person').is_visible()
    page.keyboard.press('Escape')
   if width in (375,1440):page.screenshot(path=str(out/f'{tab.lower()}_{theme}_{width}.png'),full_page=True)
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+2'),(tab,width)
  if not capture:
   page.get_by_role('button',name='+ New Task',exact=True).click();dlg=page.get_by_role('dialog');dlg.wait_for()
   assert dlg.get_by_label('Event',exact=True).get_attribute('readonly') is not None
   assert dlg.locator('[name=assigneeUserId]').count()==0
   dlg.get_by_label('Task title').fill('Synthetic <img src=x onerror=alert(1)>')
   dlg.get_by_label('Event Team',exact=True).select_option('teamA')
   dlg.get_by_role('button',name='Create Task',exact=True).click()
   dlg.get_by_role('alert').wait_for(state='visible')
   assert dlg.get_by_label('Task title').input_value().startswith('Synthetic <img')
   dlg.get_by_role('button',name='Create Task',exact=True).click()
   dlg.wait_for(state='detached')
   assert page.locator('.event-task-row').count()==1
   assert page.locator('.event-task-row img').count()==0
   submitted=page.evaluate('window.__submitted');assert submitted[0]['requestId']==submitted[1]['requestId']
  page.evaluate("document.querySelector('[data-page=tasks]').click()")
  page.locator('.tasks-toolbar').wait_for()
  if not capture:
   assert page.locator('.task-filter-disclosure').get_attribute('open') is None
   context=page.get_by_label('Filter by task context');context.select_option('independent')
   page.locator('.task-filter-disclosure>summary').click()
   assert page.get_by_label('Filter tasks by project').is_disabled()
   assert page.get_by_label('Filter tasks by Event',exact=True).is_disabled()
   page.get_by_role('button',name='Clear all',exact=True).click()
   page.get_by_label('Filter tasks by Event',exact=True).select_option('fixture-event')
   assert context.input_value()=='event'
   page.get_by_role('button',name='Sheet',exact=True).click()
   assert page.locator('.task-sheet-row').count()==1
   assert page.locator('.task-sheet-table th').count()==8
   page.get_by_role('button',name='Board',exact=True).click()
   assert page.locator('.task-row[data-task-id]').count()==1
  if width in (375,1440):page.screenshot(path=str(out/f'tasks_{theme}_{width}.png'),full_page=True)
  assert not errors,errors
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+2')
  return {'theme':theme,'width':width,'status':'passed','type':'frontend mocked API'}
 finally:page.close()

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--baseline-dir');args=parser.parse_args()
 if args.baseline_dir:ui.ROOT=Path(args.baseline_dir)
 styles=['tokens.css','app.css','projects.css','dsc-brand.css','theme-fix.css','header-runtime.css','events.css','m3.css']
 if not args.baseline_dir:styles.append('finalization.css')
 ui.CSS='\n'.join((ui.ROOT/'public/styles'/n).read_text(encoding='utf-8') for n in styles)
 out=Path(__file__).resolve().parents[1]/'dist'/('before' if args.baseline_dir else 'finalization-evidence');out.mkdir(parents=True,exist_ok=True)
 results=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True)
  try:
   for theme in ['light','dark']:
    for width in ([375,1440] if args.baseline_dir else [375,768,1024,1440,1920]):
     result=run(browser,theme,width,out,bool(args.baseline_dir));results.append(result);print('PASS',result,flush=True)
   for role in ([] if args.baseline_dir else ['Team Head','Team Member']):
    ui.DATA=fixtures(role);page,errors=ui.make_page(browser,'dark',375)
    page.emulate_media(reduced_motion='reduce')
    page.evaluate("document.querySelector('[data-page=events]').click()")
    page.locator('[data-event-id]').first.click();page.get_by_role('tab',name='Tasks',exact=True).click()
    button=page.get_by_role('button',name='+ New Task',exact=True)
    if role=='Team Head':
     button.click();dlg=page.get_by_role('dialog');dlg.wait_for()
     assert dlg.get_by_label('Event Team',exact=True).input_value()=='Technology'
     assert dlg.get_by_label('Event Team',exact=True).get_attribute('readonly') is not None
     assert dlg.locator('select[name=teamId]').count()==0
     for _ in range(15):page.keyboard.press('Tab');assert page.evaluate('document.activeElement.closest("[role=dialog]")!==null')
     page.keyboard.press('Escape');assert page.get_by_role('dialog').count()==0
     assert page.evaluate('document.activeElement.dataset.eventAction')=='new-task'
    else:assert button.count()==0
    assert not errors,errors
    page.close();results.append({'role':role,'status':'passed','type':'creation visibility, fixed team, keyboard/reduced motion'});print('PASS',results[-1],flush=True)
  finally:browser.close()
 (out/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
