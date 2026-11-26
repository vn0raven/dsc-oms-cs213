"""Chromium source-component UI checks. Chromium network navigation is disallowed here.
Actual checked-in JavaScript render functions and CSS are evaluated with synthetic API
fixtures inside a document installed through set_content. This is not full app E2E.
"""
import json,re,shutil,pathlib,argparse
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]; PUBLIC=ROOT/'public'; OUT=ROOT/'dist'/'ui-validation';OUT.mkdir(parents=True,exist_ok=True)
CSS_ORDER=['tokens.css','app.css','projects.css','dsc-brand.css','theme-fix.css','header-runtime.css']
IMPORT_RE=re.compile(r'(?ms)^import\s*\{([^}]+)\}\s*from\s*["\'][^"\']+["\'];?\s*')
SIMPLE_IMPORT_RE=re.compile(r'(?m)^import\s+[^;]+;\s*')

def stripped(name):
 src=(PUBLIC/'js'/f'{name}.js').read_text(encoding='utf-8');names=[]
 for match in IMPORT_RE.finditer(src): names.extend(v.strip() for v in match.group(1).split(',') if v.strip())
 src=IMPORT_RE.sub('',src);src=SIMPLE_IMPORT_RE.sub('',src)
 src=re.sub(r'\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)','',src)
 if name=='app':src=re.sub(r'\bstart\(\);\s*$','',src)
 return names,src

def fixture(role):
 u=[{'id':f'u-{r.lower().replace("-","")}','name':'Demo '+r,'email':f'demo.{r.lower().replace("-","")}@example.test','role':r,'position':r,'status':'Active','department':{'id':('d1' if r in ['Lead','Member'] else 'd2'),'name':('Demo Engineering' if r in ['Lead','Member'] else 'Demo Creative')}} for r in ('Lead','Co-Lead','Executive','Member')]
 d=[{'id':'d1','name':'Demo Engineering','status':'Active','slug':'demo-engineering'},{'id':'d2','name':'Demo Creative','status':'Active','slug':'demo-creative'}]
 p=[{'id':'p1','name':'Demo Community Website','status':'Active','type':'Organization','managerName':'Demo Lead','progress':15,'taskCount':1,'completedTaskCount':0,'description':'Synthetic community website project.','departmentNames':['Demo Engineering','Demo Creative'],'team':[{'id':'u-lead','name':'Demo Lead','role':'Manager'}],'permissions':{'canEdit':True,'canComplete':True,'canArchive':True},'createdAt':'2026-10-01','updatedAt':'2026-10-22'},{'id':'p2','name':'Demo Event Promotion','status':'Active','type':'Department','managerName':'Demo Executive','progress':55,'taskCount':1,'completedTaskCount':0,'description':'Synthetic promotional campaign.','departmentNames':['Demo Creative'],'team':[],'permissions':{'canEdit':True,'canArchive':True},'createdAt':'2026-10-01','updatedAt':'2026-10-22'}]
 t=[{'id':'t1','title':'Build sample landing page','description':'Prepare a sample website landing page.','departmentName':'Demo Engineering','assignee':{'id':'u-member','name':'Demo Member'},'projectId':'p1','projectName':'Demo Community Website','priority':'High','status':'Assigned','progress':25,'startDate':'2026-10-20','deadline':'2026-11-05','permissions':{'canEdit':True,'canAssign':True}},{'id':'t2','title':'Draft sample announcement','description':'Prepare a sample event announcement.','departmentName':'Demo Creative','assignee':None,'projectId':'p2','projectName':'Demo Event Promotion','priority':'Medium','status':'Created','progress':0,'startDate':'2026-10-20','deadline':'2026-11-09','permissions':{'canEdit':True,'canAssign':True,'canReview':True}}]
 r=[{'id':'r1','title':'Request sample design support','description':'Synthetic request awaiting review.','status':'Pending','type':'Assistance Request','requestedByName':'Demo Member','requesterDepartmentName':'Demo Engineering','receiverDepartmentName':'Demo Creative','createdAt':'2026-10-22','permissions':{'canApprove':True,'canReject':True}}]
 return {'me':next(x for x in u if x['role']==role),'users':u,'departments':d,'projects':p,'tasks':t,'requests':r,'dashboard':{'summary':{'projects':{'total':2,'active':2},'tasks':{'total':2,'ongoing':0},'requests':{'total':1,'pending':1},'unreadNotifications':0},'recentTasks':t,'recentRequests':r}}

def run(before=False,quick=False):
 css='\n'.join((PUBLIC/'styles'/n).read_text(encoding='utf-8') for n in CSS_ORDER)
 scripts={n:stripped(n) for n in ['app','dashboard','projects','tasks','requests','users','departments']}
 screens=['dashboard','projects','tasks','requests','members','departments']
 widths=[375,768,1024,1440,1920] if not quick else [375,1440]
 checks=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-gpu'])
  for role in (['Lead','Co-Lead','Executive','Member'] if not quick else ['Lead']):
   for width in (widths if role=='Lead' else [375,1440]):
    for theme in (['dark','light'] if role=='Lead' and not quick else ['dark']):
     page=browser.new_page(viewport={'width':width,'height':960},device_scale_factor=1,reduced_motion='reduce')
     errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
     page.set_content('<!DOCTYPE html><html lang="en" data-theme="'+theme+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="app"></div></body></html>')
     page.evaluate('''(theme) => { const m = new Map([['dsc-oms-theme',theme]]); Object.defineProperty(window, 'localStorage', { configurable:true, value:{getItem:k=>m.get(k)??null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k)}}); }''',theme)
     data=fixture(role)
     page.evaluate('''(data)=>{window.__fixture=data;window.__noop=()=>{};window.__moduleApi={get:async path=>{
       if(path==='/api/auth/me')return {user:data.me};if(path==='/api/dashboard')return {dashboard:data.dashboard};
       if(path==='/api/projects')return {projects:data.projects};if(path.startsWith('/api/projects/'))return {project:data.projects.find(p=>p.id===path.split('/').pop())};
       if(path==='/api/tasks')return {tasks:data.tasks};if(path.startsWith('/api/tasks/'))return {task:data.tasks.find(t=>t.id===path.split('/').pop())};
       if(path==='/api/requests')return {requests:data.requests};if(path.startsWith('/api/requests/'))return {request:data.requests[0]};
       if(path==='/api/users')return {users:data.users};if(path==='/api/departments')return {departments:data.departments};
       if(path.startsWith('/api/notifications'))return {notifications:[],unreadCount:0};return {}
     },post:async()=>({}),patch:async()=>({})};window.__stub=new Proxy({}, {get:()=>()=>{}})}''',data)
     # Evaluate the *actual source functions* in their own module-simulating closures.
     for module,(names,src) in scripts.items():
      exp={'app':'renderShell','dashboard':'renderDashboard','projects':'renderProjects','tasks':'renderTasks','requests':'renderRequests','users':'renderUsers','departments':'renderDepartments'}[module]
      page.evaluate('''({names,src,exp})=>{const bindings=names.map(n=>n==='api'?window.__moduleApi:n==='escapeHtml'?v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'):n==='canViewReports'?()=>true:n==='getCurrentUser'?()=>window.__fixture.me:n==='safeExternalUrl'?()=>null:n==='DEFAULT_TASK_SHEET_COLUMNS'?[]:n==='TASK_SHEET_COLUMNS'?[]:window.__noop);window['__actual_'+exp]=new Function(...names,src+';return '+exp+';')(...bindings)}''',{'names':names,'src':src,'exp':exp})
     page.evaluate('''()=>window.__actual_renderShell(window.__fixture.me)''')
     # Exercise the real shell initialization chain, not only page renderers.
     # A previous UX helper replaced .topbar-right and silently destroyed
     # theme, bell and profile buttons after app.js attached their handlers.
     page.evaluate('(source) => new Function(source)()', (PUBLIC/'js'/'theme.js').read_text(encoding='utf-8'))
     for module, exp in [('header-controls','initializeHeaderControls'),('ux','initializeUX')]:
      names,src=stripped(module)
      page.evaluate('''({src,names,exp}) => { const values=names.map(n=>n==='safeExternalUrl'?()=>null:()=>null);window['__actual_'+exp]=new Function(...names,src+';return '+exp+';')(...values) }''',{'src':src,'names':names,'exp':exp})
     page.evaluate('''()=>{window.__actual_initializeHeaderControls(window.__fixture.me);window.__actual_initializeUX(window.__fixture.me,()=>{})}''')
     page.wait_for_timeout(30)
     header=page.evaluate('''()=>({themeButtons:document.querySelectorAll('.topbar-right [data-theme-choice]').length,bells:document.querySelectorAll('.topbar-right [data-topbar-notifications]').length,profiles:document.querySelectorAll('.topbar-right [data-profile-toggle]').length,visible:!!document.querySelector('.dsc-theme-switcher') && getComputedStyle(document.querySelector('.dsc-theme-switcher')).display!=='none'})''')
     if header != {'themeButtons':3,'bells':1,'profiles':1,'visible':True}:
      errors.append('Broken header after initialization: '+str(header))
     for screen in screens:
      errors_before=len(errors)
      name={'dashboard':'renderDashboard','projects':'renderProjects','tasks':'renderTasks','requests':'renderRequests','members':'renderUsers','departments':'renderDepartments'}[screen]
      try:
       page.evaluate('''async ({name,screen})=>{
        document.getElementById('topbar-title').textContent=screen.charAt(0).toUpperCase()+screen.slice(1);
        document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===screen));
        await window['__actual_'+name](document.getElementById('page-content'));
       }''',{'name':name,'screen':screen})
      except Exception as ex:errors.append(screen+':'+str(ex)[:260])
      try:
       s={'projects':'.project-row','tasks':'.task-row','requests':'[data-request-id]','members':'[data-user-id]'}.get(screen)
       if s and page.locator(s).count():page.locator(s).first.click(timeout=750);page.wait_for_timeout(60)
      except Exception:pass
      metrics=page.evaluate('''()=>({documentWidth:document.documentElement.scrollWidth, width:innerWidth,
      headingFont:parseFloat(getComputedStyle(document.querySelector('.page-heading h1')||document.body).fontSize),
      bodyFont:parseFloat(getComputedStyle(document.querySelector('.page-heading p')||document.body).fontSize),
      navFont:parseFloat(getComputedStyle(document.querySelector('.nav-item')||document.body).fontSize),
      toolbarBg:document.querySelector('.projects-toolbar')?getComputedStyle(document.querySelector('.projects-toolbar')).backgroundColor:null,
      scrollOverflow:document.documentElement.scrollWidth>innerWidth+2,
      projectsPanelHeight:document.querySelector('.projects-panel')?.getBoundingClientRect().height,
      projectListBottom:document.querySelector('.project-list')?.getBoundingClientRect().bottom,
      projectDetailTop:document.querySelector('.project-detail')?.getBoundingClientRect().top,
      projectDetailMarginTop:document.querySelector('.project-detail')?getComputedStyle(document.querySelector('.project-detail')).marginTop:null,
      projectDetailPosition:document.querySelector('.project-detail')?getComputedStyle(document.querySelector('.project-detail')).position:null,
      projectsGap:document.querySelector('.projects-layout')?getComputedStyle(document.querySelector('.projects-layout')).rowGap:null,
      projectsPanelBottom:document.querySelector('.projects-panel')?.getBoundingClientRect().bottom,
      heading:document.querySelector('.page-heading h1')?.textContent?.trim(),
      selectors:{panels:document.querySelectorAll('#page-content .card').length,rows:document.querySelectorAll('.task-row,.project-row,[data-request-id],[data-user-id]').length}})''')
      if role=='Lead' and width in (375,768,1440,1920):
       page.screenshot(path=str(OUT/f'{"before" if before else "after"}_{screen}_{theme}_{width}.png'),full_page=True)
      # Exercise synthetic search and status filters against their real handlers.
      interactions={}
      if role=='Lead' and width==1440 and theme=='dark' and not before:
       settings={'projects':('#project-search','.project-row','Community'),
                 'tasks':('#task-search','.task-row','landing'),
                 'requests':('#request-search','[data-request-id]','design'),
                 'members':('#user-search','[data-user-id]','Executive')}
       if screen in settings:
        search,row,term=settings[screen]
        if page.locator(search).count():
         initial=page.locator(row).count()
         page.locator(search).fill('ZZZ-No-Such-Synthetic-Record')
         blank=page.locator(row).count()
         page.locator(search).fill(term)
         result=page.locator(row).count()
         interactions['search']={'initial':initial,'noMatches':blank,'matching':result,'passed':initial>0 and blank==0 and result>0}
       controls=page.locator('#page-content input[type="search"],#page-content select')
       missing=controls.evaluate_all("els => els.filter(el => !el.getAttribute('aria-label') && !(el.id && document.querySelector('label[for=\"'+el.id+'\"]')) && !el.closest('label')).map(el => el.outerHTML.slice(0,80))")
       interactions['missingFilterAccessibleNames']=missing
       status_cases={'projects':('#project-status-filter','Archived','Active',0,2),
                     'tasks':('#task-status-filter','Completed','Assigned',0,1),
                     'requests':('#request-status-filter','Rejected','Pending',0,1),
                     'members':('#user-status-filter','Inactive','Active',0,4)}
       if screen in status_cases:
        sid,emptyStatus,matchStatus,expectedEmpty,expectedMatch=status_cases[screen]
        if page.locator(sid).count():
         page.locator(sid).select_option(emptyStatus)
         row=settings[screen][1]
         # Reset the search field after its own test so status filtering is isolated.
         page.locator(settings[screen][0]).fill('')
         emptyRows=page.locator(row).count()
         page.locator(sid).select_option(matchStatus)
         matchingRows=page.locator(row).count()
         interactions['statusFilter']={'zeroRows':emptyRows,'matchingRows':matchingRows,
           'passed':emptyRows==expectedEmpty and matchingRows==expectedMatch}
       if screen=='projects':
        # Execute the existing actual theme controller, not a simulated token edit.
        themeSource=(PUBLIC/'js'/'theme.js').read_text(encoding='utf-8')
        page.evaluate('(src)=>new Function(src)()',themeSource)
        page.evaluate("window.DSCTheme.setPreference('light')")
        page.wait_for_timeout(250)
        lightBg=page.locator('.projects-toolbar').evaluate('(e)=>getComputedStyle(e).backgroundColor')
        page.evaluate("window.DSCTheme.setPreference('dark')")
        page.wait_for_timeout(250)
        darkBg=page.locator('.projects-toolbar').evaluate('(e)=>getComputedStyle(e).backgroundColor')
        interactions['themeSwitch']={'lightToolbarBg':lightBg,'darkToolbarBg':darkBg,
          'passed':lightBg!=darkBg}
       if screen=='tasks':
        page.locator('#task-search').focus()
        focus=page.locator('#task-search').evaluate('(e)=>({name:e.getAttribute("aria-label"),width:getComputedStyle(e).outlineWidth,style:getComputedStyle(e).outlineStyle})')
        interactions['keyboardFocus']={'visible':focus['style']!='none' and focus['width']!='0px','accessibleName':focus['name']}
      checks.append(dict(screen=screen,role=role,viewport=width,theme=theme,**metrics,interactions=interactions,errors=errors[errors_before:]))
     page.close()
  browser.close()
 (OUT/('before_metrics.json' if before else 'after_metrics.json')).write_text(json.dumps(checks,indent=2))
 failures=[]
 for c in checks:
  if c['errors'] or c['scrollOverflow'] or c['headingFont']<24 or not c['heading']:
   failures.append((c['role'],c['viewport'],c['theme'],c['screen'],'render-or-layout'))
  for name,item in c.get('interactions',{}).items():
   if isinstance(item,dict) and item.get('passed') is False:
    failures.append((c['screen'],name,'interaction'))
   if name=='missingFilterAccessibleNames' and item:
    failures.append((c['screen'],name,item))
   if name=='keyboardFocus' and not item.get('visible'):
    failures.append((c['screen'],name,'invisible-focus'))
 print(json.dumps({'screens':len(checks),'overflow':sum(c['scrollOverflow'] for c in checks),'renderErrors':sum(bool(c['errors']) for c in checks),'headingsBelow24':sum(c['headingFont']<24 for c in checks),'failures':failures},indent=2))
 if failures:raise SystemExit(1)
 return checks
if __name__=='__main__':
 args=argparse.ArgumentParser();args.add_argument('--before',action='store_true');args.add_argument('--quick',action='store_true');opt=args.parse_args();run(opt.before,opt.quick)
