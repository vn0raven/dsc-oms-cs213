"""Browser component smoke (not a Cloudflare-app E2E): genuine OMS templates and CSS,
with synthetic user data, loaded through set_content due navigation restriction.
"""
import json,re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
(root.parent/'dist').mkdir(exist_ok=True)
attack='<img src=x onerror="window.__pwned=true">'
user={'id':'lead','name':'Synthetic Lead','role':'Lead','position':'Executive','email':'lead@example.invalid','department':{'id':'a','name':'Alpha'}}
mal={'id':'bad\" onclick=\"window.__pwned=true','name':attack,'status':'Active','department':{'id':'a','name':attack}}
depts=[{'id':'a','name':attack,'status':'Active'}]
users=[user,mal]
# Reuse the actual source functions, without sending requests or executing app boot.
def strip_imports(s):return re.sub(r"(?ms)^import\s+.*?\s+from\s+[\"'][^\"']+[\"'];\s*",'',s)
source=strip_imports((root/'js/app.js').read_text().split('async function start()')[0]);
# If actual source changed and boot is not present, fail rather than testing a fabricated shell.
assert 'function renderShell' in source
source=source+'\nwindow.__renderShell = renderShell;'
modal=(root/'js/modal-focus.js').read_text().replace('export function trapModalFocus','function trapModalFocus') + '\nwindow.trapModalFocus=trapModalFocus;'
form=strip_imports((root/'js/project-create.js').read_text()).replace('export async function openCreateProject','async function openCreateProject')
form=form+'\nwindow.__openProjectForm = openCreateProject;'
css='\n'.join((root/'styles'/f).read_text() for f in ['tokens.css','app.css','projects.css','dsc-brand.css','theme-fix.css','header-runtime.css'])
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome') or None,headless=True,args=['--no-sandbox'])
 for width in (375,768,1440):
  page=browser.new_page(viewport={'width':width,'height':900})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content('<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="app"></div></body></html>')
  page.evaluate('''() => {window.escapeHtml = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); window.canViewReports=()=>true;}''')
  # Inject baseline real shell and real project-create source, exposing only their entry points.
  page.evaluate('(src) => { (new Function(src))(); }',source)
  page.evaluate('(src) => { (new Function(src))(); }',modal)
  page.evaluate('(src) => { (new Function(src))(); }',form)
  page.evaluate('(u) => window.__renderShell(u)',user)
  page.evaluate('''({departments,users}) => {
    window.api={get:async(path)=>path.includes('departments')?{departments}:{users}};
    window.showToast=()=>{};
  }''',{'departments':depts,'users':users})
  page.evaluate('() => window.__openProjectForm(()=>{})')
  page.locator('#create-project-form').wait_for(timeout=5000)
  raw=page.locator('#create-project-form').inner_text()
  modal_role=page.locator('.project-form-modal').get_attribute('role')
  focus_before=page.evaluate('document.activeElement?.getAttribute("name")')
  observed={'dialog_role':modal_role,'initial_focus':focus_before,'width':width,'notification_menu_count':page.locator('[data-notification-menu]').count(),
    'theme_buttons_count':page.locator('[data-theme-choice]').count(),
    'modal_open':bool(page.locator('#create-project-form').count()),
    'untrusted_markup_created':page.locator('#create-project-form img').count(),
    'injection_text_visible':attack in raw,
    'javascript_triggered':bool(page.evaluate('window.__pwned === true')),
    'horizontal_overflow':bool(page.evaluate('document.documentElement.scrollWidth > innerWidth + 2')),
    'page_errors':errors}
  results.append(observed)
  page.screenshot(path=str(Path(__file__).resolve().parents[1]/'dist'/f'Component_{width}px.png'),full_page=True)
  page.keyboard.press('Escape')
  observed['escape_closes_modal']=page.locator('#create-project-form').count()==0
  page.close()
 browser.close()
out={'scope':'DOM and CSS component smoke with genuine source templates; full Worker-app navigation blocked by browser policy','viewport_results':results}
(Path(__file__).resolve().parents[1]/'dist'/'component_dom_results.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
if any(r['untrusted_markup_created'] or r['javascript_triggered'] or r['page_errors'] or r['notification_menu_count']!=1 or r['theme_buttons_count']!=3 or not r['escape_closes_modal'] or r['initial_focus']!='name' for r in results):raise SystemExit(1)
