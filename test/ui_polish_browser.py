"""Served-application UI polish evidence and layout checks; synthetic local account only."""
from pathlib import Path
from urllib.parse import urlparse
import argparse,json,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
PAGES={'dashboard':'.quick-actions','announcements':'.m35-notices-toolbar','events':'.event-list-page','departments':'.department-grid','members':'.user-detail-content','reports':'.report-status-grid','tasks':'.tasks-toolbar','audit-log':'.audit-summary'}
INSPECT=['#page-content','.page-heading','.summary-grid','.dashboard-grid','.quick-actions','.m3-dashboard-summary','.m35-notices-heading','.m35-notices-toolbar','.m3-announcements','.event-overview-stats','.event-list-page','.department-grid','.department-card','.department-card-stats','.users-panel','.user-detail','.report-stat-grid','.reports-grid','.report-status-grid','.tasks-toolbar','.task-view-switch','.task-filter-disclosure','.task-tools','.status','.button-light']
METRICS="""selectors=>Object.fromEntries(selectors.map(s=>{const el=document.querySelector(s);if(!el)return[s,null];const r=el.getBoundingClientRect(),c=getComputedStyle(el);return[s,{x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,styles:Object.fromEntries(['display','position','top','width','maxWidth','marginTop','marginLeft','marginRight','padding','gap','gridTemplateColumns','color','backgroundColor','fontSize','zoom'].map(k=>[k,c[k]]))}]}))"""
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['before','after'],required=True);parser.add_argument('--base-url',default='http://127.0.0.1:8787');args=parser.parse_args()
 assert urlparse(args.base_url).hostname in ['localhost','127.0.0.1','::1']
 out=ROOT/'dist/ui-polish'/args.phase;out.mkdir(parents=True,exist_ok=True);results=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True)
  try:
   for theme in ['light','dark']:
    for width in [375,768,1024,1440,1920]:
     context=browser.new_context(viewport={'width':width,'height':1000},device_scale_factor=1)
     context.add_init_script("localStorage.setItem('dsc-oms-theme',"+json.dumps(theme)+");")
     page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.goto(args.base_url);page.locator('.nav-item').first.wait_for()
     account=page.request.get(args.base_url+'/api/auth/me').json()['user'];assert account['email'].endswith('@example.test'),'Use synthetic account only'
     for name,selector in PAGES.items():
      page.evaluate('(name)=>window.omsNavigate(name)',name);page.locator(selector).first.wait_for();page.wait_for_timeout(80)
      if name=='tasks':page.get_by_role('button',name='Sheet',exact=True).click()
      page.evaluate('window.scrollTo(0,0)')
      metrics=page.evaluate(METRICS,INSPECT)
      zoom=page.evaluate('({dpr:devicePixelRatio,scale:visualViewport.scale,cssZoom:getComputedStyle(document.documentElement).zoom,innerWidth,outerWidth,font:getComputedStyle(document.body).fontSize})')
      overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth+2')
      result={'page':name,'theme':theme,'width':width,'zoom':zoom,'overflow':overflow,'metrics':metrics}
      if args.phase=='after':
       assert not overflow,(name,theme,width,'document overflow')
       if name=='dashboard':assert page.locator('[data-ux-action="new-request"]').count()==0
       if name=='departments':
        assert page.locator('.department-card').evaluate_all('(els)=>els.every(e=>e.scrollWidth<=e.clientWidth+1)'),('department card overflow',width)
       if name=='members' and width>=1200:
        assert abs(metrics['.users-panel']['y']-metrics['.user-detail']['y'])<2,('member top alignment',metrics)
       if name=='announcements':
        assert abs(metrics['.m35-notices-heading']['x']-metrics['.m3-announcements']['x'])<2
        assert abs(metrics['.m35-notices-toolbar']['width']-metrics['.m3-announcements']['width'])<2
       if name=='events':
        assert abs(metrics['.event-overview-stats']['x']-metrics['.event-list-page']['x'])<2
        assert abs(metrics['.event-overview-stats']['width']-metrics['.event-list-page']['width'])<2
       if name=='audit-log':assert page.locator('#topbar-title').inner_text()=='Audit Log'
      page.screenshot(path=str(out/f'{name}_{theme}_{width}_100.png'),full_page=True)
      results.append(result)
     assert not errors,errors
     if width==1440:
      page.evaluate("window.omsNavigate('departments')");page.locator('.department-card').first.wait_for()
      rules=page.evaluate("""()=>{const result=[];function walk(rules,sheet){for(const r of rules){if(r.media&&!matchMedia(r.conditionText).matches)continue;if(r.cssRules)walk(r.cssRules,sheet);if(r.selectorText&&['#page-content','.department-grid','.department-card','.user-detail','.report-status-grid','.status','.tasks-toolbar'].some(s=>{const e=document.querySelector(s);try{return e&&e.matches(r.selectorText)}catch{return false}}))result.push({sheet,selector:r.selectorText,css:r.style.cssText});}}for(const s of document.styleSheets)walk(s.cssRules,s.href);return result}""")
      (out/f'cascade-{theme}.json').write_text(json.dumps(rules,indent=2),encoding='utf-8')
     context.close();print('PASS' if args.phase=='after' else 'CAPTURED',theme,width,flush=True)
  finally:browser.close()
 (out/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
 print('Captured',len(results),'served page states',flush=True)
if __name__=='__main__':main()
