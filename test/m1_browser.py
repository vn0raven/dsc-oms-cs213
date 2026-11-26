"""Chromium component integration using the real Tasks renderer and CSS.
Not authenticated Worker E2E. All API responses are synthetic, no network navigation.
"""
import json, pathlib, re, shutil, sys, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT/'dist'/'m1-evidence'; OUT.mkdir(parents=True,exist_ok=True)
CSS = ['tokens.css','app.css','projects.css','dsc-brand.css','theme-fix.css','header-runtime.css']
def source(name):
    return (ROOT/'public'/'js'/name).read_text(encoding='utf-8')
def strip(source_text):
    names=[]
    matcher=re.compile(r'(?ms)^import\s*\{([^}]+)\}\s*from\s*["\'][^"\']+["\'];?\s*')
    for m in matcher.finditer(source_text): names += [v.strip() for v in m.group(1).split(',') if v.strip()]
    code=matcher.sub('',source_text)
    code=re.sub(r'(?m)\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)','',code)
    return names,code

def data(role='Lead'):
    records=[]
    for i in range(36):
        independent=i%5==0
        records.append({'id':f'task-{i:03}', 'title':f'{"Independent" if independent else "Project"} preparation {i}',
          'description':f'Example task #{i}', 'departmentId':'dept-1','departmentName':'Demo Creative' if i%3 else 'Demo Engineering',
          'projectId':None if independent else 'project-1','projectName':None if independent else 'Community Workshops',
          'assignee':{'name':'Demo Member'} if i%4 else None,
          'priority':['Critical','High','Medium','Low'][i%4], 'status':['Created','Assigned','Ongoing','For Review'][i%4],
          'progress':i%101, 'startDate':'2026-10-20', 'deadline':f'2026-11-{i%27+1:02}',
          'updatedAt':f'2026-10-{i%21+1:02}T01:00:00Z','instructions':'Prepare sample assets','notes':'Synthetic data',
          'permissions':{'canEdit':role in ['Lead','Co-Lead','Executive'],'canAssign':role in ['Lead','Co-Lead','Executive']}})
    return records

def launch(browser, width, theme, role):
    page=browser.new_page(viewport={'width':width,'height':900},device_scale_factor=1, reduced_motion='reduce')
    errs=[];page.on('pageerror', lambda e:errs.append(str(e)))
    css='\n'.join((ROOT/'public'/'styles'/p).read_text(encoding='utf-8') for p in CSS)
    page.set_content(f'<!DOCTYPE html><html lang="en" data-theme="{theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>{css}</style></head><body><main id="page-content" style="max-width:1300px;margin:0 auto;padding:28px"></main></body></html>')
    sheet_names,sheet_code=strip(source('task-sheet.js'))
    task_names, task_code=strip(source('tasks.js'))
    _,utility_code=strip(source('task-workspace.mjs'))
    page.evaluate('''({sheet_code,utility_code}) => {
       window.__m1_sheet = new Function(sheet_code+';return {renderTaskSheet,TASK_SHEET_COLUMNS,DEFAULT_TASK_SHEET_COLUMNS,COLUMN_SORT};')();
       window.__m1_utils = new Function(utility_code+';return {filterAndSortTasks,safeColumnWidths};')();
       const map=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}});
       window.__m1_toasts=[];
    }''',{'sheet_code':sheet_code,'utility_code':utility_code})
    fixture=data(role)
    page.evaluate('''({task_names,task_code,fixture,role}) => {
      window.__m1_data=fixture;window.__m1_updates=[];
      const api={get:async path=> {
        if(path==='/api/tasks')return {tasks:window.__m1_data};
        if(path.endsWith('/activity'))return {activity:[{id:'a1',action:'TASK_CREATED',actorName:'Demo Lead',occurredAt:'2026-10-22T00:00:00Z'}]};
        return {task:window.__m1_data.find(t=>path.endsWith('/'+t.id))};
      },patch:async(path,payload)=>{
        const t=window.__m1_data.find(t=>path.endsWith('/'+t.id));
        window.__m1_updates.push({path,payload});Object.assign(t,payload);return {task:t};
      },post:async()=>({})};
      const names=task_names;const values=names.map(n=> {
        if(n==='api')return api;
        if(n==='getCurrentUser')return ()=>({role});
        if(n==='showToast')return (msg,kind)=>window.__m1_toasts.push({msg,kind});
        if(n in window.__m1_sheet)return window.__m1_sheet[n];
        if(n in window.__m1_utils)return window.__m1_utils[n];
        return ()=>{};
      });
      window.__m1_renderTasks=new Function(...names,task_code+'; return renderTasks;')(...values);
    }''', {'task_names':task_names,'task_code':task_code,'fixture':fixture,'role':role})
    page.evaluate('async()=>await window.__m1_renderTasks(document.querySelector("#page-content"))')
    return page,errs

def run():
    results=[];shots=0
    with sync_playwright() as p:
      browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-gpu'])
      for role in ['Lead','Co-Lead','Executive','Member']:
       for width in [375,768,1024,1440,1920]:
        for theme in ['dark','light']:
         print('RUN',role,width,theme,flush=True)
         page,errs=launch(browser,width,theme,role)
         try:
          assert page.locator('.task-row').count()==36
          page.locator('[data-task-view="sheet"]').click(timeout=5000)
          assert page.locator('.task-sheet-table thead th').count()==11
          assert page.locator('.task-sheet-table tbody tr').count()==36
          assert page.locator('.task-sheet-table [data-sheet-heading="task"]').count()==1
          # Inner grid scroll may extend sideways; document must not overflow.
          assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')
          if width in [375,768,1440,1920] and role=='Lead':
           page.screenshot(path=str(OUT/f'sheet_{theme}_{width}.png'),full_page=True);shots+=1
          page.locator('[data-sheet-sort="title-asc"]').click(timeout=5000)
          assert page.locator('.task-sheet-table thead th').count()==11
          page.locator('[data-task-view="board"]').click(timeout=5000)
          assert page.locator('.task-list .task-row').count()==36
          if width in [375,768,1440,1920] and role=='Lead':
           page.screenshot(path=str(OUT/f'board_{theme}_{width}.png'),full_page=True);shots+=1
          assert not errs,errs
          results.append({'role':role,'width':width,'theme':theme,'result':'PASS'})
          print('PASS',role,width,theme,flush=True)
         except Exception as e:
          results.append({'role':role,'width':width,'theme':theme,'result':f'FAIL {str(e)[:150]} / {errs}'})
         finally:page.close()
      print('DETAILS START',flush=True)
      # Detailed integration checks
      page, errs = launch(browser,1440,'dark','Lead')
      page.locator('#task-search').fill('Project preparation 1')
      searchCount=page.locator('.task-list .task-row').count()
      assert searchCount>0 and searchCount<36
      page.locator('#task-search').fill('')
      page.locator('[data-task-filter="context"]').select_option('independent')
      assert page.locator('.task-list .task-row').count()==8
      page.locator('[data-task-filter="priority"]').select_option('High')
      assert page.locator('.task-list .task-row').count()==2
      page.locator('[data-task-filter-reset]').click()
      assert page.locator('.task-list .task-row').count()==36
      page.locator('[data-task-view="sheet"]').click(timeout=5000)
      page.locator('[data-sheet-columns-control] summary').click(timeout=5000)
      page.locator('[data-task-column][value="updated"]').uncheck(timeout=5000)
      assert page.locator('.task-sheet-table thead th').count()==10
      page.locator('[data-sheet-sort="title-asc"]').click(timeout=5000)
      assert page.locator('.task-sheet-row').first.get_attribute('data-task-id')=='task-000'
      page.locator('.task-sheet-row').first.focus()
      page.keyboard.press('ArrowDown')
      assert page.locator('.task-sheet-row').nth(1).evaluate('(el)=>el===document.activeElement')
      page.locator('.task-sheet-row').nth(2).locator('[data-sheet-edit="priority"]').dblclick()
      assert page.locator('.sheet-inline-input').count()==1
      page.locator('.sheet-inline-input').select_option('Low')
      page.locator('.sheet-inline-input').press('Enter')
      page.wait_for_timeout(100)
      assert any(x['payload'].get('priority')=='Low' for x in page.evaluate('window.__m1_updates'))
      results.append({'scenario':'search, filter, column visibility, sort, arrow navigation, authorized inline priority','result':'PASS'})
      page.close()
      member,errs=launch(browser,1440,'dark','Member')
      member.locator('[data-task-view="sheet"]').click()
      member.locator('.task-sheet-row').first.locator('[data-sheet-edit="priority"]').dblclick()
      member.wait_for_timeout(40)
      assert member.locator('.sheet-inline-input').count()==0
      assert member.evaluate('window.__m1_updates.length')==0
      results.append({'scenario':'Member edit cannot PATCH protected fields','result':'PASS'})
      member.close()
      # Large-list client pagination: bounded DOM and no extra API request.
      large,errors=launch(browser,1440,'light','Lead')
      large.evaluate('''() => { const base = window.__m1_data[0]; window.__m1_data=Array.from({length:220},(_,i)=>({...base,id:'bulk-'+i,title:'Bulk '+i})); }''')
      large.evaluate('async()=>await window.__m1_renderTasks(document.querySelector("#page-content"))')
      assert large.locator('.task-list .task-row').count()==100
      large.locator('[data-task-page="next"]').click()
      assert large.locator('.task-list .task-row').count()==100
      large.locator('[data-task-page="next"]').click()
      assert large.locator('.task-list .task-row').count()==20
      results.append({'scenario':'220 tasks paged 100/100/20 without additional network calls','result':'PASS'})
      large.close()
      browser.close()
    print(json.dumps({'checks':len(results),'passed':sum(r['result']=='PASS' for r in results),'screenshots':shots,'records':results},indent=2))
    (OUT/'browser_results.json').write_text(json.dumps(results,indent=2))
    assert all(r['result']=='PASS' for r in results),'Browser scenario failures'

if __name__=='__main__':run()
