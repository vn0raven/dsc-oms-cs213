"""Reproducible source-rendered component regression, NOT authenticated browser E2E.
Uses real Events/Announcements JS modules and actual CSS, with synthetic API responses.
No Worker navigation, no real account data, no production calls.
"""
from pathlib import Path
import json,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'dist'/'m3-evidence';OUT.mkdir(parents=True,exist_ok=True)
CSS='\n'.join((ROOT/'public'/'styles'/f).read_text(encoding='utf-8') for f in ['tokens.css','app.css','projects.css','dsc-brand.css','theme-fix.css','header-runtime.css','events.css','m3.css'])
EVENT={'id':'e-demo','name':'Synthetic DSC Workshop','description':'Local component test fixture','objectives':'Hands-on learning','eventType':'Workshop','startsAt':'2027-02-02T09:00:00Z','venue':'Campus Lab','projectName':None,'expectedAttendance':40,'createdBy':'lead','status':'Preparation','permissions':{'canEdit':False,'canSubmit':False,'canApprove':False,'canAdvance':True,'canManageTeams':True,'canProposeAppointment':True,'canLinkTasks':True,'canClose':False}}
WS={'event':EVENT,'teams':[{'id':'t1','name':'Technology','purpose':'Presentation support'}],'appointments':[{'id':'ap1','role':'Event Director','userName':'Synthetic Director','teamId':None,'status':'Accepted'}],'approvals':[],'stages':[],'tasks':[],'closure':None}
OPS={'requirements':[{'id':'r1','phase':'Readiness','title':'Venue and technical systems','status':'Submitted'},{'id':'r2','phase':'Readiness','title':'Program flow','status':'Pending'},{'id':'r3','phase':'Closure','title':'Final documentation turnover','status':'Pending'}],'issues':[{'id':'i1','title':'Projector replacement','description':'Replacement requested','severity':'High','status':'Open'}],'records':[{'id':'rec1','title':'Program flow','category':'Program','reference':'protected-record-001'}],'schedule':[{'id':'sch1','title':'Technical rehearsal','starts_at':'2027-02-01T10:00:00Z'}],'debrief':None}
ANN=[{'id':'a1','title':'Official General Assembly Notice','body':'Synthetic organization-wide message for testing <img src=x onerror=alert(1)>','category':'General','audience':'Organization','status':'Published','pinned':1,'createdBy':'lead','publishedAt':'2026-10-23T10:00:00Z','isRead':0},{'id':'a2','title':'Department Workshop Preparation','body':'Synthetic notice for department staff','category':'General','audience':'Department','status':'Draft','createdBy':'lead','isRead':0}]
STUB='''const h=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const showToast=()=>{};const confirmAction=async()=>false;
const api={get:async(path)=>{const db=window.__fixture;if(path==='/api/events')return{events:[db.event]};if(path==='/api/events/my-appointments')return{appointments:[]};if(path.endsWith('/workspace'))return db.workspace;if(path.endsWith('/operations'))return db.operations;if(path==='/api/m3/announcements')return{announcements:db.announcements};throw new Error('Unmocked '+path)},post:async()=>({ok:true}),patch:async()=>({ok:true}),del:async()=>({ok:true})};
'''
def compiled(name):
 source=(ROOT/'public'/'js'/name).read_text(encoding='utf-8')
 source=re.sub(r'^import .*?;\s*$', '',source,flags=re.MULTILINE)
 source=source.replace('export async function ','async function ')
 source+='\nwindow.__render=typeof renderEvents!=="undefined"?renderEvents:renderAnnouncements;'
 return "(function(){\n"+STUB+source+"\n})();"

def check_page(p,kind,theme,width):
 errs=[];p.on('pageerror',lambda e:errs.append(str(e)))
 p.set_viewport_size({'width':width,'height':900})
 p.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main style="max-width:1400px;margin:0 auto;padding:20px"><div id="m3-root"></div></main></body></html>')
 p.add_style_tag(content=CSS)
 p.evaluate('(theme)=>{document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme;}',theme)
 p.evaluate('window.omsCurrentUser={id:"lead",role:"Lead",department:{id:"a"},name:"Synthetic Lead"};')
 p.evaluate('(f)=>{window.__fixture=f}',{'event':EVENT,'workspace':WS,'operations':OPS,'announcements':ANN})
 p.add_script_tag(content=compiled('events.js' if kind=='events' else 'announcements.js'))
 p.evaluate('async()=>await window.__render(document.getElementById("m3-root"))')
 if kind=='events':
  p.get_by_role('tab',name='Readiness').click()
  p.wait_for_timeout(50)
  assert p.get_by_text('Venue and technical systems').count()==1
  p.get_by_role('tab',name='Operations').click()
  p.wait_for_timeout(50)
  assert p.get_by_text('Projector replacement').count()==1
  p.get_by_role('tab',name='Records').click()
  p.wait_for_timeout(50)
  assert p.get_by_text('Program flow',exact=True).count()>=1
 else:
  assert p.get_by_text('Official General Assembly Notice').count()==1
  assert p.get_by_role('button',name='Publish').count()>=1
  assert p.locator('.m3-notice img').count()==0,'unsafe announcement HTML rendered'
 overflow=p.evaluate('document.documentElement.scrollWidth>innerWidth+2')
 assert not overflow,f'{kind} {theme} width={width}: overflow'
 assert not errs,errs
 if width in (375,1440): p.screenshot(path=str(OUT/f'{kind}_{theme}_{width}.png'),full_page=True)
 return {'screen':kind,'theme':theme,'width':width,'errors':len(errs),'pageOverflow':overflow}

def main():
 results=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
  try:
   page=browser.new_page(device_scale_factor=1)
   for kind in ['events','announcements']:
    for theme in ['dark','light']:
     for width in [375,768,1024,1440,1920]:
      results.append(check_page(page,kind,theme,width))
   (OUT/'component-results.json').write_text(json.dumps(results,indent=2))
   print('PASS',len(results),'component scenarios')
  finally:browser.close()
if __name__=='__main__':main()
