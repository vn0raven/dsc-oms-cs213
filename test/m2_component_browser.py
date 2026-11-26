"""Browser-only source component smoke. No network navigation and no Cloudflare Access.
Run synthetic API preview server first to supply fixture JSON, then this script.
"""
import re,json,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
out=root/'dist'/'m2-evidence';out.mkdir(parents=True,exist_ok=True)
def get(path):return json.load(urllib.request.urlopen('http://127.0.0.1:8788/api'+path))
events=get('/events')
workspace=get('/events/'+events['events'][0]['id']+'/workspace')
inbox=get('/events/my-appointments')
fixtures={'/api/events':events,'/api/events/my-appointments':inbox,'/api/events/'+events['events'][0]['id']+'/workspace':workspace}
css='\n'.join((root/'public/styles'/f).read_text() for f in ['tokens.css','app.css','projects.css','dsc-brand.css','theme-fix.css','header-runtime.css','events.css'])
js=(root/'public/js/events.js').read_text()
js=re.sub(r'^import .*?;\s*$', '', js,flags=re.MULTILINE)
js=js.replace('export async function renderEvents(root)', 'window.renderEvents = async function renderEvents(root)')
shim=f'''const fixtures={json.dumps(fixtures)};
const api={{get:async path=>{{if(!fixtures[path])throw new Error('No synthetic API: '+path);return JSON.parse(JSON.stringify(fixtures[path]));}},post:async()=>{{throw Error('Mutation omitted from source-component harness')}},patch:async()=>{{throw Error('Mutation omitted from source-component harness')}}}};
const showToast=()=>{{}};const confirmAction=()=>Promise.resolve(false);
const h=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
window.omsCurrentUser={{id:'lead',name:'Demo Lead',role:'Lead'}};'''
source=shim+'\n'+js
pagehtml='<html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-copy"><strong>Developer Student Community</strong><span>Operations Management System</span></div></div><nav class="nav"><button class="nav-item active">Events</button></nav></aside><div class="main"><header class="topbar"><strong>Events</strong></header><main class="content" id="page-content"><div id="events-root"></div></main></div></div></body></html>'
count=0
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=__import__('os').environ.get('CHROMIUM_PATH'),args=['--no-sandbox'])
 for width in [375,768,1024,1440,1920]:
  for theme in ['dark','light']:
   context=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.set_content(pagehtml,wait_until='domcontentloaded')
   page.evaluate("value=>document.documentElement.dataset.theme=value",theme)
   page.evaluate("s=>{(0,eval)(s);return true}",source)
   page.evaluate('()=>window.renderEvents(document.getElementById("events-root"))')
   assert page.get_by_role('heading',name='Events',exact=True).is_visible()
   assert page.get_by_role('heading',name='DSC Tech Summit').is_visible()
   assert page.locator('.event-detail').count()==1
   page.get_by_role('tab',name='Organization').evaluate('(el)=>el.click()')
   assert page.locator('.event-tab-content').count()==1
   page.get_by_role('tab',name='Overview').evaluate('(el)=>el.click()')
   assert not errors,(width,theme,errors)
   overflow=page.evaluate('document.documentElement.scrollWidth>window.innerWidth+2')
   assert not overflow,(width,theme,'overflow')
   if width in [375,1440]:page.screenshot(path=str(out/f'events_source_{theme}_{width}.png'),full_page=True)
   count+=1;context.close()
 browser.close()
print(f'M2 source-component browser: {count} / {count} theme/viewport checks passed; no page exceptions or document overflow')
