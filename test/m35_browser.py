"""Real frontend ES modules and CSS in Chromium with synthetic API responses.
No Worker/Access authentication: browser full-shell frontend verification only.
"""
from pathlib import Path
import json
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'dist/m35-evidence';OUT.mkdir(parents=True,exist_ok=True)
CSS='\n'.join((ROOT/'public/styles'/x).read_text(encoding='utf8') for x in ['tokens.css','app.css','projects.css','dsc-brand.css','theme-fix.css','header-runtime.css','events.css','m3.css'])
EVENT={'id':'fixture-event','name':'Synthetic Git Workshop','description':'Synthetic <img src=x onerror=alert(1)> Event Description','objectives':'Learn Git','eventType':'Workshop','startsAt':'2026-11-20T08:00:00Z','status':'Planning','venue':'Lab A','expectedAttendance':40,'createdBy':'lead','permissions':{'canEdit':True,'canSubmit':False,'canApprove':False,'canAdvance':True,'canManageTeams':True,'canProposeAppointment':True,'canLinkTasks':True,'canClose':False}}
PROJECT={'id':'fixture-project','name':'Synthetic Community Website','status':'Active','type':'Organization','managerName':'Demo Lead','departmentNames':['Demo Engineering'],'progress':0,'taskCount':0,'permissions':{'canEdit':True,'canComplete':True,'canArchive':True}}
TASK={'id':'fixture-task','title':'Synthetic preparation task','departmentId':'eng','departmentName':'Demo Engineering','status':'Created','priority':'High','progress':0,'projectName':None,'permissions':{'canEdit':True,'canAssign':True,'canReview':True}}
USER={'id':'lead','role':'Lead','name':'Demo Lead','email':'lead@example.invalid','status':'Active','position':'Organization Lead','department':{'id':'eng','name':'Demo Engineering'}}
DPT={'id':'eng','name':'Demo Engineering','status':'Active'}
ANN=[{'id':'fixture-ann','title':'Synthetic official DSC notice','body':'Please review this <img src=x onerror=alert(1)> text safely.','category':'General','audience':'Organization','status':'Published','pinned':1,'createdBy':'lead','publishedAt':'2026-10-23T10:00:00Z','isRead':1}, {'id':'draft-ann','title':'Draft announcement','body':'Pending publication','category':'General','audience':'Department','status':'Draft','createdBy':'lead','isRead':0}]
DATA={'/api/auth/me':{'user':USER},'/api/dashboard':{'dashboard':{'summary':{'projects':{'total':1,'active':1},'tasks':{'total':1,'ongoing':0},'requests':{'total':0,'pending':0},'unreadNotifications':0},'recentTasks':[TASK],'recentRequests':[]}},'/api/m3/summary':{'upcomingEventCount':1,'pendingEventApprovals':0,'unresolvedEventIssues':0,'unreadAnnouncements':0,'upcomingEvents':[EVENT]},'/api/events':{'events':[EVENT]},'/api/events/my-appointments':{'appointments':[]},'/api/events/fixture-event/workspace':{'event':EVENT,'teams':[],'appointments':[],'approvals':[],'stages':[],'tasks':[],'closure':None},'/api/m3/events/fixture-event/operations':{'requirements':[],'records':[],'issues':[],'schedule':[],'debrief':None,'notes':[]},'/api/projects':{'projects':[PROJECT]},'/api/projects/fixture-project':{'project':PROJECT},'/api/tasks':{'tasks':[TASK]},'/api/tasks/fixture-task':{'task':TASK},'/api/tasks/fixture-task/activity':{'activity':[]},'/api/departments':{'departments':[DPT]},'/api/users':{'users':[USER]},'/api/m3/announcements':{'announcements':ANN},'/api/notifications':{'notifications':[]},'/api/notifications/unread-count':{'count':0},'/api/notifications/preview':{'notifications':[]}}
SCRIPT='''(function(){
 const fixture=window.__DATA__;
 const memory=new Map();
 const store={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear()};
 Object.defineProperty(window,'localStorage',{configurable:true,value:store});
 Object.defineProperty(window,'sessionStorage',{configurable:true,value:store});
 window.fetch=async (url,options={})=>{
  const route=String(url).split('?')[0];
  window.__calls.push({url:route,method:options.method||'GET'});
  const value=fixture[route] ?? (route.startsWith('/api/m3/announcements/') ? {ok:true} : {items:[]});
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 };
 window.__calls=[];
})();'''
def route_assets(route):
 u=urlparse(route.request.url)
 file=(ROOT/'public'/unquote(u.path).lstrip('/')).resolve()
 if not file.is_relative_to((ROOT/'public').resolve()) or not file.exists():route.fulfill(status=404,body='not found');return
 route.fulfill(status=200,body=file.read_bytes(),headers={'access-control-allow-origin':'*','content-type':'text/javascript' if file.suffix in ('.js','.mjs') else 'text/plain'})

def make_page(browser,theme,w):
 page=browser.new_page(viewport={'width':w,'height':900},device_scale_factor=1)
 page.on('dialog',lambda d:d.accept())
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://fake.test/**',route_assets)
 page.goto('https://fake.test/test-shell')
 page.set_content('<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div></body></html>')
 page.add_style_tag(content=CSS)
 page.evaluate('(d)=>window.__DATA__=d',DATA)
 page.evaluate(SCRIPT)
 page.evaluate('(theme)=>{localStorage.setItem("dsc-oms-theme",theme);document.documentElement.dataset.theme=theme;}',theme)
 page.add_script_tag(path=str(ROOT/'public/js/theme.js'))
 page.add_script_tag(content="import 'https://fake.test/js/app.js?v=m35';",type='module')
 page.wait_for_function('document.querySelector(".nav-item")!==null',timeout=15000)
 return page, errors

def run_case(browser,theme,w):
 page,errors=make_page(browser,theme,w)
 try:
  assert page.locator('[data-page="requests"]').count()==0,'Requests navigation still visible'
  page.evaluate('document.querySelector(\'[data-page="events"]\').click()');page.wait_for_timeout(140)
  assert page.locator('[data-event-id]').count()==1,('no event list',page.locator('#page-content').inner_text()[:400])
  page.locator('[data-event-id]').first.click();page.wait_for_timeout(130)
  assert page.locator('.event-fullpage').count()==1,('no full event workspace',errors)
  assert page.locator('.event-list').count()==0
  page.evaluate('history.back()');page.wait_for_timeout(120);assert page.locator('.event-list').count()==1
  page.evaluate('history.forward()');page.wait_for_timeout(140);assert page.locator('.event-fullpage').count()==1
  page.get_by_role('tab',name='Readiness').click();page.wait_for_timeout(100)
  assert page.locator('.event-fullpage').count()==1
  page.locator('[data-event-back]').click();page.wait_for_timeout(120)
  assert page.locator('.event-list').count()==1
  page.evaluate('document.querySelector(\'[data-page="announcements"]\').click()');page.wait_for_timeout(140)
  assert page.locator('.m35-notice-card').count()==2
  assert page.locator('.m3-form').count()==0
  assert page.locator('.m35-notice-card img').count()==0
  page.locator('[data-notice-open="fixture-ann"]').click();page.wait_for_timeout(100)
  assert page.locator('.m35-reading').count()==1
  assert page.locator('.m35-reading img').count()==0,'injection executed via HTML'
  page.locator('[data-notice-back]').click();page.wait_for_timeout(100)
  page.locator('[data-notice-new]').click();dlg=page.get_by_role('dialog');dlg.wait_for()
  assert page.evaluate('getComputedStyle(document.body).overflow')=='hidden'
  assert dlg.get_by_label('Title').is_visible()
  dlg.get_by_label('Title').fill('Unsaved draft')
  page.keyboard.press('Escape');page.wait_for_timeout(100)
  # window.confirm on dirty prompt must be mocked before next check; browser auto-dismisses dialog by default.
  if dlg.count():dlg.get_by_role('button',name='Cancel').click()
  assert page.get_by_role('dialog').count()==0
  page.evaluate('document.querySelector(\'[data-page="tasks"]\').click()');page.wait_for_timeout(120)
  page.locator('[data-task-id]').first.click();page.wait_for_timeout(130)
  assert page.get_by_role('dialog').count()==1,('no task inspector',errors)
  page.keyboard.press('Escape');page.wait_for_timeout(100)
  assert page.get_by_role('dialog').count()==0
  page.evaluate('document.querySelector(\'[data-page="departments"]\').click()');page.wait_for_timeout(120)
  page.locator('[data-department-id]').first.click();page.wait_for_timeout(120)
  assert page.get_by_role('dialog').count()==1,('no department inspector',errors)
  page.keyboard.press('Escape');page.wait_for_timeout(80)
  page.evaluate('document.querySelector(\'[data-page="projects"]\').click()');page.wait_for_timeout(120)
  page.locator('[data-project-id]').first.click();page.wait_for_timeout(120)
  assert page.get_by_role('dialog').count()==1,('no project inspector',errors)
  assert not errors, errors
  overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth+2')
  assert not overflow,('document overflow',w)
  if w in (375,1440):
   page.evaluate('document.querySelector(\'[data-page="events"]\').click()');page.wait_for_timeout(110)
   page.locator('[data-event-id]').click();page.wait_for_timeout(120)
   page.screenshot(path=str(OUT/f'events_{theme}_{w}.png'))
   page.evaluate('document.querySelector(\'[data-page="announcements"]\').click()');page.wait_for_timeout(120)
   page.screenshot(path=str(OUT/f'announcements_{theme}_{w}.png'))
  return {'theme':theme,'width':w,'errors':len(errors),'overflow':overflow}
 finally:page.close()
if __name__=='__main__':
 results=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
  try:
   for theme in ['dark','light']:
    for w in [375,768,1024,1440,1920]:
     try:
      result=run_case(browser,theme,w);results.append(result);print('PASS',result,flush=True)
     except Exception as e:
      print('FAIL',theme,w,str(e)[:850],flush=True)
      raise
   (OUT/'browser-results.json').write_text(json.dumps(results,indent=2))
  finally:browser.close()
