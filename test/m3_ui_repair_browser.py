"""Actual CSS + Events JS component checks, with synthetic API fixtures.
Not an authenticated Worker E2E run.
"""
from pathlib import Path
import re,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'dist'/'m3-ui-repair';OUT.mkdir(parents=True,exist_ok=True)
CSS='\n'.join((ROOT/'public/styles'/f).read_text(encoding='utf-8') for f in ['tokens.css','app.css','projects.css','dsc-brand.css','theme-fix.css','header-runtime.css','events.css','m3.css'])
EVENT={'id':'demo-ui-event','name':'Demo Git Workshop','description':'Synthetic event.','objectives':'Learning Git','eventType':'Workshop','startsAt':'2026-11-20T09:00:00Z','venue':'Demo Lab','expectedAttendance':40,'createdBy':'demo_user_lead','status':'Draft','permissions':{'canEdit':True,'canSubmit':True,'canApprove':False,'canAdvance':False,'canManageTeams':False,'canProposeAppointment':False,'canLinkTasks':False,'canClose':False}}
WORKSPACE={'event':EVENT,'teams':[],'appointments':[],'approvals':[],'stages':[],'tasks':[],'closure':None}
SOURCE=(ROOT/'public/js/events.js').read_text(encoding='utf-8')
SOURCE=re.sub(r'^import .*?;\s*$', '',SOURCE,flags=re.MULTILINE)
SOURCE=SOURCE.replace('export async function renderEvents(root)', 'window.renderEvents = async function renderEvents(root)')
STUB='''const h=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const showToast=()=>{};const confirmAction=async()=>false;
const api={get:async path=>{window.__fetches=(window.__fetches||0)+1;
 if(path==='/api/events')return{events:[window.__fixture.event]};
 if(path==='/api/events/my-appointments')return{appointments:[]};
 if(path.endsWith('/workspace'))return window.__fixture.workspace;
 if(path==='/api/projects')return{projects:[]};
 if(path==='/api/users')return{users:[{id:'demo_user_lead',name:'Demo Lead',role:'Lead',status:'Active'}]};
 throw Error('Unmocked: '+path)},post:async()=>({event:window.__fixture.event}),patch:async()=>({event:window.__fixture.event}),del:async()=>({})};
'''
JS='(function(){'+STUB+SOURCE+'})();'
HTML='''<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><main id="outer"><div id="events-root"></div><span id="outside">Shell remains</span></main></body></html>'''
ONBOARDING='''<section class="card dashboard-onboarding"><div class="dashboard-onboarding-copy"><span class="dashboard-onboarding-eyebrow">Getting Started</span><h2>Welcome to DSC OMS</h2><p>Start organizing your team's work.</p></div><div class="dashboard-onboarding-steps"><button class="dashboard-onboarding-step"><span class="dashboard-onboarding-number">1</span><div><strong>Create a project</strong><span>Organize work.</span></div><span class="dashboard-onboarding-arrow">→</span></button></div></section>'''

def run_check(page,theme,width):
 page.set_viewport_size({'width':width,'height':900})
 page.set_content(HTML)
 page.add_style_tag(content=CSS)
 page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
 page.evaluate('(f)=>window.__fixture=f',{'event':EVENT,'workspace':WORKSPACE})
 page.evaluate('window.omsCurrentUser={id:"demo_user_lead",role:"Lead",name:"Demo Lead"}')
 page.add_script_tag(content=JS)
 page.evaluate('async()=>await window.renderEvents(document.getElementById("events-root"))')
 page.locator('#event-search').fill('workshop')
 old=page.evaluate('window.__fetches')
 page.get_by_role('button',name='Refresh Events',exact=False).click()
 page.wait_for_function('(prior)=>window.__fetches>prior',arg=old)
 assert page.locator('#event-search').input_value()=='workshop'
 assert page.get_by_text('Demo Git Workshop').count()>=1
 assert page.locator('#outside').text_content()=='Shell remains'
 page.get_by_role('button',name='New Event').click()
 modal=page.get_by_role('dialog',name='Create event brief')
 modal.wait_for()
 assert modal.get_by_label('Event name').is_visible()
 assert modal.get_by_role('button',name='Save').is_visible()
 measurements=page.evaluate('''()=>{
 const dlg=document.querySelector('.event-dialog'),a=dlg.querySelector('[name=name]'),b=dlg.querySelector('[name=eventType]'),act=dlg.querySelector('.project-form-actions');
 const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),r=dlg.getBoundingClientRect(),f=act.getBoundingClientRect();
 return {width:r.width,left:r.left,right:r.right,bottom:r.bottom,colsSameRow:Math.abs(ar.top-br.top)<5,footerVisible:f.bottom<=innerHeight+1,scroll:dlg.querySelector('.event-dialog-fields').scrollHeight>dlg.querySelector('.event-dialog-fields').clientHeight,
       overflow:document.documentElement.scrollWidth>innerWidth+2};
 }''')
 if width>=768:
  assert measurements['width']>=630,measurements
  assert measurements['colsSameRow'],measurements
 else:
  assert not measurements['colsSameRow'],measurements
 assert measurements['left']>=0 and measurements['right']<=width+2,measurements
 assert measurements['footerVisible'] and not measurements['overflow'],measurements
 if width in (375,1440):page.screenshot(path=str(OUT/f'event_modal_{theme}_{width}.png'),full_page=True)
 modal.get_by_role('button',name='Cancel').click()
 assert not page.locator('.modal-overlay').count()
 # Use the actual dashboard markup classes to validate contrast in both themes.
 page.locator('#outer').evaluate('(element,html)=>element.innerHTML=html',ONBOARDING)
 colors=page.evaluate('''()=>{const el=document.querySelector('.dashboard-onboarding-step'),label=el.querySelector('strong'),title=document.querySelector('.dashboard-onboarding h2');const c=el=>getComputedStyle(el);return {background:c(el).backgroundColor,text:c(label).color,title:c(title).color};}''')
 if theme=='dark': assert colors['background']!='rgb(250, 251, 252)' and colors['text']!='rgb(17, 19, 24)',colors
 if width in (375,1440):page.screenshot(path=str(OUT/f'dashboard_onboarding_{theme}_{width}.png'),full_page=True)
 return {**measurements,**colors,'theme':theme,'viewport':width}

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
 try:
  page=browser.new_page(device_scale_factor=1)
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  results=[]
  for t in ('dark','light'):
   for w in (375,768,1024,1440,1920):
    results.append(run_check(page,t,w))
  assert not errors,errors
  (OUT/'ui-results.json').write_text(json.dumps(results,indent=2))
  print('PASS',len(results),'theme/viewport UI checks, event-only refresh, modal size, form layout and dashboard onboarding')
 finally:browser.close()
