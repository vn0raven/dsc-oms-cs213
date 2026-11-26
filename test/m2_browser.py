"""Playwright M2 checks against local synthetic SQLite-backed Hono preview only.
Run `node test/offline-build.mjs`, `node test/m2_preview_server.mjs`, then `python test/m2_browser.py`.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
out=root/'dist'/'m2-evidence';out.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:8788/'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=__import__('os').environ.get('CHROMIUM_PATH'),args=['--no-sandbox'])
 for role in ['lead','colead','exec','member']:
  for width in [375,768,1024,1440]:
   for theme in ['dark','light']:
    context=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1)
    context.add_cookies([{'name':'m2_role','value':role,'url':URL}])
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL,wait_until='domcontentloaded',timeout=30000)
    page.get_by_role('button',name='Events',exact=True).click(timeout=20000)
    page.locator('.event-list-row').first.wait_for(timeout=15000)
    page.evaluate("theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('dsc-oms-theme',theme)}",theme)
    page.wait_for_timeout(80)
    heading=page.get_by_role('heading',name='Events',exact=True)
    assert heading.is_visible(),(role,width,theme)
    assert page.locator('.event-detail').count()==1
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+2'),('overflow',role,width,theme)
    assert not errors,('js errors',role,width,theme,errors)
    if role=='lead' and width in [375,1440]:
     page.screenshot(path=str(out/f'events_{role}_{theme}_{width}.png'),full_page=True)
    if role=='member' and width==1440 and theme=='dark':
     assert page.get_by_text('Appointment requests').count()>0
     page.get_by_role('button',name='Accept',exact=True).click()
     page.get_by_role('tab',name='Organization').click()
     assert page.get_by_text('Demo Member',exact=False).count()>0 or page.locator('.event-appointment').count()>0
    results.append((role,width,theme,'pass'))
    context.close()
 browser.close()
print('M2 Chromium full-app synthetic backend:',len(results),'combinations passed')
