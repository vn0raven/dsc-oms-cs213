"""Actual served UI: preferences, keyboard, scroll, synthetic edge states and real zoom."""
from pathlib import Path
from urllib.parse import urlparse,unquote
import json,math,os
from playwright.sync_api import sync_playwright,expect
from ui_polish_browser import PAGES
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/ui-polish';BASE='http://127.0.0.1:8787'
def navigate(page,name):
 page.evaluate('(n)=>window.omsNavigate(n)',name);page.locator(PAGES[name]).first.wait_for();page.wait_for_timeout(80)
def overflow(page):assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+2')
def contrast(page):
 return page.locator('#page-content .status, #page-content .sheet-priority, #page-content .button:not(:disabled), #page-content .task-view-button').evaluate_all("""els=>{
 function rgb(s){return (s.match(/[\\d.]+/g)||[]).map(Number)}
 function over(f,b){const a=f[3]??1;return f.slice(0,3).map((v,i)=>v*a+b[i]*(1-a)).concat(1)}
 function bg(el){if(!el)return [255,255,255,1];return over(rgb(getComputedStyle(el).backgroundColor),bg(el.parentElement));}
 function lum(c){return c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)}
 return els.filter(e=>e.getClientRects().length).map(e=>{const b=bg(e),f=over(rgb(getComputedStyle(e).color),b),l=[lum(f),lum(b)].sort((a,b)=>a-b);return {label:e.textContent.trim(),ratio:(l[1]+.05)/(l[0]+.05),fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}});
 }""")
def keyboard_and_tasks(browser,theme,width):
 c=browser.new_context(viewport={'width':width,'height':1000},accept_downloads=True);c.add_init_script("localStorage.setItem('dsc-oms-theme',"+json.dumps(theme)+");localStorage.setItem('dsc-oms-task-view','sheet');localStorage.setItem('dsc-oms-task-preferences',JSON.stringify({columns:['task','department','status','deadline'],widths:{task:310},sort:'title-asc'}));")
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.locator('.nav-item').first.wait_for();navigate(page,'tasks')
 assert page.locator('[data-task-column]:checked').evaluate_all('(els)=>els.map(e=>e.value)')==['task','department','status','deadline']
 assert page.locator('[data-column-width=task]').get_attribute('style')=='width:310px'
 assert page.locator('.task-filter-disclosure').get_attribute('open') is None
 page.locator('.task-filter-disclosure>summary').focus();page.keyboard.press('Enter');expect(page.get_by_label('Filter tasks by priority')).to_be_visible()
 page.get_by_label('Filter tasks by priority').select_option('High');sheet=page.locator('.task-sheet-row').count();page.get_by_role('button',name='Board',exact=True).click();assert page.locator('.task-row[data-task-id]').count()==sheet
 page.get_by_role('button',name='Clear all',exact=True).click();assert len(json.loads(page.evaluate("localStorage.getItem('dsc-oms-task-preferences')"))['columns'])==4
 page.get_by_role('button',name='Sheet',exact=True).click();row=page.locator('.task-sheet-row').first;row.focus();page.keyboard.press('Enter');dlg=page.get_by_role('dialog');dlg.wait_for();page.keyboard.press('Escape');expect(dlg).to_have_count(0);assert page.evaluate('document.activeElement.matches("[data-task-id]")')
 resizer=page.locator('[data-resize-col=task]');resizer.focus();page.keyboard.press('ArrowRight');saved=json.loads(page.evaluate("localStorage.getItem('dsc-oms-task-preferences')"));assert saved['widths']['task']>310
 wrap=page.locator('.task-sheet-wrap');before=wrap.evaluate('e=>({width:e.clientWidth,scroll:e.scrollWidth})')
 if before['scroll']>before['width']:wrap.evaluate('e=>e.scrollLeft=100');assert wrap.evaluate('e=>e.scrollLeft')>0
 assert page.locator('.task-sheet-table th').first.evaluate('e=>getComputedStyle(e).position')=='sticky'
 with page.expect_download() as downloaded:page.get_by_role('button',name='Export CSV',exact=True).click()
 downloaded.value.save_as(str(OUT/f'export-{theme}-{width}.csv'))
 page.get_by_role('button',name='Import CSV',exact=True).click();dlg=page.get_by_role('dialog');dlg.wait_for();assert dlg.locator('input[type=file]').count()==1;page.keyboard.press('Escape');expect(dlg).to_have_count(0)
 # Member management dialogs open/cancel without changing personal records.
 navigate(page,'members');expect(page.get_by_role('button',name='Edit Profile',exact=True)).to_be_visible()
 page.get_by_role('button',name='Edit Profile',exact=True).click();page.locator('.modal-overlay').first.wait_for();page.keyboard.press('Escape');page.wait_for_timeout(80)
 if page.locator('.modal-overlay').count():page.get_by_role('button',name='Cancel',exact=True).last.click()
 navigate(page,'departments');assert page.locator('[data-page=departments] .nav-icon').inner_text().strip()
 page.locator('.department-card').first.focus();page.keyboard.press('Enter');page.get_by_role('dialog').wait_for();page.keyboard.press('Escape');assert page.evaluate('document.activeElement.matches(".department-card")')
 navigate(page,'events');ratios=contrast(page);assert all(x['ratio']>=4.5 for x in ratios),ratios
 overflow(page);assert not errors,errors;c.close();return {'theme':theme,'width':width,'status':'passed','contrast':ratios,'preferences':'columns and widths preserved','keyboard':'filters, task, member dialog, department focus','csv':'export downloaded, import dialog opened'}
def edge_states(browser,theme):
 c=browser.new_context(viewport={'width':1440,'height':1000});c.add_init_script("localStorage.setItem('dsc-oms-theme',"+json.dumps(theme)+");")
 page=c.new_page()
 def mutate(route):
  response=route.fetch();data=response.json();path=urlparse(route.request.url).path
  if path=='/api/departments':
   for d in data.get('departments',[]):d['name']='Synthetic Department of Cross-Disciplinary Technology and Community Operations '+('LongName'*8)
  if path=='/api/users':
   for u in data.get('users',[]):u['name']='Synthetic Member with a deliberately long display name '+('LongName'*7)
  if path=='/api/dashboard':
   for task in data['dashboard']['recentTasks']:task['title']='SyntheticLongUnbrokenTaskTitle'*12
  if path.startswith('/api/reports/'):
   def zero(v):
    if isinstance(v,bool):return v
    if isinstance(v,(int,float)):return 0
    if isinstance(v,list):return [zero(x) for x in v]
    if isinstance(v,dict):return {k:zero(x) for k,x in v.items()}
    return v
   data=zero(data)
  route.fulfill(response=response,json=data)
 page.route('**/api/**',mutate);page.goto(BASE);page.locator('.nav-item').first.wait_for()
 for name in ['dashboard','departments','members','reports']:
  navigate(page,name);overflow(page)
  if name=='departments':assert page.locator('.department-card').evaluate_all('(els)=>els.every(e=>e.scrollWidth<=e.clientWidth+1)')
  if name=='reports':assert page.locator('.report-status-item strong').evaluate_all('(els)=>els.every(e=>e.textContent.trim()==="0")')
  page.screenshot(path=str(OUT/f'after/{name}-long-zero-{theme}.png'),full_page=True)
 # Empty filtered result is rendered without altering backend records.
 navigate(page,'tasks');page.locator('#task-search').fill('NoSuchSyntheticRecord999');page.locator('.empty').first.wait_for();overflow(page)
 page.screenshot(path=str(OUT/f'after/tasks-empty-{theme}.png'),full_page=True);c.close();return {'theme':theme,'status':'passed','type':'actual served frontend; browser-only synthetic response variations, no database writes'}

def paging(browser,theme):
 c=browser.new_context(viewport={'width':1440,'height':1000});c.add_init_script("localStorage.setItem('dsc-oms-theme',"+json.dumps(theme)+");localStorage.setItem('dsc-oms-task-view','sheet');")
 page=c.new_page()
 def rows(route):
  response=route.fetch();data=response.json();base=data['tasks'][0];data['tasks']=[{**base,'id':f'polish-synthetic-{i:03d}','title':f'Synthetic page item {i:03d}'} for i in range(205)];route.fulfill(response=response,json=data)
 page.route('**/api/tasks',rows);page.goto(BASE);page.locator('.nav-item').first.wait_for();navigate(page,'tasks')
 assert page.locator('.task-sheet-row').count()==100;assert page.locator('[data-task-page-label]').inner_text()=='1 / 3'
 page.get_by_role('button',name='Next task page').click();assert page.locator('[data-task-page-label]').inner_text()=='2 / 3'
 page.get_by_role('button',name='Next task page').click();assert page.locator('.task-sheet-row').count()==5
 assert page.get_by_role('button',name='Next task page').is_disabled()
 page.get_by_role('button',name='Previous task page').click();assert page.locator('.task-sheet-row').count()==100
 page.locator('.task-sheet-row').first.click();assert page.locator('.task-sheet-row[aria-selected=true]').count()==1
 overflow(page);page.screenshot(path=str(OUT/f'after/tasks-pagination-{theme}.png'),full_page=True);c.close();return {'theme':theme,'status':'passed','type':'205 browser-only synthetic task rows; pagination and selection'}
def zoom_cases(p,phase,theme):
 folder=OUT/f'zoom-profile-{phase}-{theme}';(folder/'Default').mkdir(parents=True,exist_ok=True)
 (folder/'Default/Preferences').write_text(json.dumps({'partition':{'default_zoom_level':{'x':math.log(2)/math.log(1.2)}}}),encoding='utf-8')
 exe=os.environ.get('CHROMIUM_PATH') or str(Path(os.environ['LOCALAPPDATA'])/'ms-playwright/chromium-1255/chrome-win64/chrome.exe')
 c=p.chromium.launch_persistent_context(str(folder.resolve()),executable_path=exe,headless=True,no_viewport=True,args=['--window-size=1440,1000'])
 c.add_init_script("localStorage.setItem('dsc-oms-theme',"+json.dumps(theme)+");")
 if phase=='before':
  def assets(route):
   path=unquote(urlparse(route.request.url).path);f=(OUT/'baseline-source/public'/path.lstrip('/')).resolve();base=(OUT/'baseline-source/public').resolve()
   if path=='/':f=base/'index.html'
   if f.is_relative_to(base) and f.is_file():route.fulfill(status=200,body=f.read_bytes(),headers={'content-type':'text/javascript' if f.suffix in ['.js','.mjs'] else 'text/css' if f.suffix=='.css' else 'text/html' if f.suffix=='.html' else 'image/svg+xml'})
   else:route.continue_()
  c.route('**/*',lambda r: r.continue_() if '/api/' in r.request.url else assets(r))
 page=c.pages[0];page.goto(BASE);page.locator('.nav-item').first.wait_for();info=page.evaluate('({width:innerWidth,outer:outerWidth,dpr:devicePixelRatio,scale:visualViewport.scale,cssZoom:getComputedStyle(document.documentElement).zoom})');assert info['dpr']==2 and info['scale']==1 and info['cssZoom']=='1',info
 for name in PAGES:
  navigate(page,name)
  if name=='tasks':page.get_by_role('button',name='Sheet',exact=True).click()
  if phase=='after':overflow(page)
  page.screenshot(path=str(OUT/phase/f'{name}_{theme}_1440_200.png'),full_page=True)
 c.close();return {'theme':theme,'phase':phase,'zoom':'native Chromium 200%','metrics':info,'status':'passed'}
if __name__=='__main__':
 OUT.mkdir(exist_ok=True);results=[]
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True)
  try:
   for theme in ['light','dark']:
    for width in [375,768,1024,1440,1920]:
     result=keyboard_and_tasks(b,theme,width);results.append(result);print('PASS interactions',theme,width,flush=True)
    results.append(edge_states(b,theme));print('PASS long names / zeros / empty',theme,flush=True)
    results.append(paging(b,theme));print('PASS pagination / selection',theme,flush=True)
  finally:b.close()
  for phase in ['before','after']:
   for theme in ['light','dark']:
    results.append(zoom_cases(p,phase,theme));print('PASS 200%',phase,theme,flush=True)
 (OUT/'interaction-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
