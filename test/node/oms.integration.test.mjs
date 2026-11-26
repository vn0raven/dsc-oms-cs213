import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {escapeHtml,safeExternalUrl} from '../../public/js/safe-html.mjs';
import {getAuthenticatedEmail} from '../../.audit-build/src/auth.js';
import worker from '../../.audit-build/src/index.js';
import {hasPermission} from '../../.audit-build/src/services/permission.service.js';

function user(id,role,status='Active',departmentId='deptA') {
  return {id,name:'Synthetic '+id,email:id+'@example.invalid',role,status,
    position:'Volunteer',department:{id:departmentId,name:departmentId},
    messengerUrl:null,facebookUrl:null,contactNumber:null};
}
const syntheticUsers=[user('lead','Lead'),user('colead','Co-Lead'),user('exec','Executive'),user('member','Member'),user('inactive','Member','Inactive'),user('tester','Member','Active','DEPT-TEST-001')];
function fakeDB(){
  const results=[];
  return {
    results,
    prepare(query) {
      let params=[];
      const sql=query.replace(/\s+/g,' ');
      return {
        bind(...values){params=values;return this;},
        async first(){
          if (/SELECT 1 AS ok/i.test(sql)) return {ok:1};
          if (/FROM users u/i.test(sql)) {
            const selected=/WHERE LOWER\(u\.email\)/i.test(sql)
              ? syntheticUsers.find(u=>u.email.toLowerCase()===String(params[0]).toLowerCase())
              : syntheticUsers.find(u=>u.id===params[0]);
            if (!selected) return null;
            return {
              id:selected.id,name:selected.name,email:selected.email,role:selected.role,
              status:selected.status, position:selected.position,
              department_id:selected.department.id,department_name:selected.department.name,
              messenger_url:null,facebook_url:null,contact_number:null
            };
          }
          throw new Error('Unexpected test SQL first: '+sql.slice(0,130));
        },
        async all(){
          if (/FROM users u/i.test(sql))return {results:syntheticUsers.map(u=>({
            id:u.id,name:u.name,email:u.email,role:u.role,status:u.status,
            position:u.position,department_id:u.department.id,department_name:u.department.name,
            messenger_url:null,facebook_url:null,contact_number:null
          }))};
          throw new Error('Unexpected test SQL all: '+sql.slice(0,130));
        },
        async run(){throw new Error('Writes forbidden in read-only fake DB');}
      };
    }
  };
}
async function api(path,{identity='lead',host='localhost',headers={},method='GET',body}={}){
  const request=new Request('http://'+host+path,{
    method,headers:{...headers,...(body?{'content-type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined
  });
  return worker.fetch(request,{DB:fakeDB(),APP_ENV:'local',DEV_USER_EMAIL:identity+'@example.invalid'});
}

test('HTML-escaping blocks markup, quotes, ampersands, and blank values',()=>{
  assert.equal(escapeHtml('<img src=x onerror="pwn()">'), '&lt;img src=x onerror=&quot;pwn()&quot;&gt;');
  assert.equal(escapeHtml('&\'<>'), '&amp;&#39;&lt;&gt;');
  assert.equal(escapeHtml(null),'');
});
test('link validation rejects javascript/data schemes and relative targets',()=>{
  assert.equal(safeExternalUrl('javascript:alert(1)'),null);
  assert.equal(safeExternalUrl('data:text/html,test'),null);
  assert.equal(safeExternalUrl('/relative'),null);
  assert.equal(safeExternalUrl('https://example.org/path'),'https://example.org/path');
});
test('actual shell renders every user-controlled slot through the escaping function',()=>{
  const source=fs.readFileSync(new URL('../../public/js/app.js',import.meta.url),'utf8');
  for(const term of ['${user.name}','${user.position || user.role}','${user.department?.name || ""}','${message || "An unexpected error occurred."}']){
    assert.equal(source.includes(term),false,'unescaped interpolation: '+term);
  }
});
test('missing JWT returns null',async()=>{
  assert.equal(await getAuthenticatedEmail(new Request('https://example.org/'),{TEAM_DOMAIN:'https://a.cloudflareaccess.com',POLICY_AUD:'some-aud'}),null);
});
test('malformed Access token fails closed',async()=>{
  assert.equal(await getAuthenticatedEmail(new Request('https://example.org/',{headers:{'cf-access-jwt-assertion':'invalid'}}),{TEAM_DOMAIN:'https://a.cloudflareaccess.com',POLICY_AUD:'some-aud'}),null);
});
test('dev identity override cannot authenticate a deployed hostname',async()=>{
  assert.equal(await getAuthenticatedEmail(new Request('https://example.workers.dev/api/auth/me'),{APP_ENV:'local',DEV_USER_EMAIL:'lead@example.invalid'}),null);
});
test('local override is limited to localhost and normalizes email',async()=>{
  assert.equal(await getAuthenticatedEmail(new Request('http://127.0.0.1/api/auth/me'),{APP_ENV:'local',DEV_USER_EMAIL:'  LEAD@example.invalid  '}),'lead@example.invalid');
});
test('production APP_ENV blocks override even on localhost',async()=>{
  assert.equal(await getAuthenticatedEmail(new Request('http://localhost/api/auth/me'),{APP_ENV:'production',DEV_USER_EMAIL:'lead@example.invalid'}),null);
});
test('authenticated unknown user is rejected',async()=>{
  const r=await api('/api/auth/me',{identity:'unknown'});
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,'USER_NOT_REGISTERED');
});
test('inactive user is rejected at middleware',async()=>{
  const r=await api('/api/auth/me',{identity:'inactive'});
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,'USER_INACTIVE');
});
test('known active user can view own profile',async()=>{
  const r=await api('/api/auth/me',{identity:'member'});
  assert.equal(r.status,200);
  assert.equal((await r.json()).user.role,'Member');
});
test('all four roles have distinct management permissions',()=>{
  for(const role of ['Lead','Co-Lead','Executive','Member']){
    assert.equal(hasPermission(user('id',role),'users.view'),true);
    assert.equal(hasPermission(user('id',role),'users.change_role'),role==='Lead');
    assert.equal(hasPermission(user('id',role),'reports.view'),['Lead','Co-Lead'].includes(role));
  }
});
test('Member, Executive may not invoke privileged role mutation via direct API',async()=>{
  for(const identity of ['member','exec']){
    const r=await api('/api/users/lead/role',{identity,method:'PATCH',body:{role:'Member'}});
    assert.equal(r.status,403);
  }
});
test('all unauthorized reporting direct URLs are forbidden',async()=>{
  for(const identity of ['member','exec']){
    const r=await api('/api/reports/overview',{identity});
    assert.equal(r.status,403);
  }
});
test('tester account is hidden by direct record ID for Member and Executive',async()=>{
  for(const identity of ['member','exec']){
    const r=await api('/api/users/tester',{identity});
    assert.equal(r.status,404);
  }
  assert.equal((await api('/api/users/tester',{identity:'lead'})).status,200);
});
test('tester accounts are filtered from Member directory list',async()=>{
  const r=await api('/api/users/',{identity:'member'});
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.users.some(u=>u.id==='tester'),false);
  const lead=await (await api('/api/users/',{identity:'lead'})).json();
  assert.equal(lead.users.some(u=>u.id==='tester'),true);
});
test('missing authentication fails before reading users',async()=>{
  const r=await api('/api/users/',{host:'example.workers.dev'});
  assert.equal(r.status,401);
});
test('health endpoint has no user count or sensitive metadata',async()=>{
  const r=await api('/api/health',{host:'example.workers.dev'});
  assert.equal(r.status,200);
  const response=await r.json();
  assert.equal(response.ok,true);
  assert.equal(Object.hasOwn(response,'users'),false);
});

test('cross-origin browser mutations are rejected before any database write',async()=>{
  const r=await api('/api/requests/',{method:'POST',identity:'lead',
    headers:{origin:'https://attacker.example', 'sec-fetch-site':'cross-site'},
    body:{title:'Malicious request'}});
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,'CROSS_ORIGIN_FORBIDDEN');
});
test('API responses carry no-store and anti-sniffing headers',async()=>{
  const r=await api('/api/auth/me',{identity:'lead'});
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
});
test('one notification menu exists in shell markup',()=>{
  const source=fs.readFileSync(new URL('../../public/js/app.js',import.meta.url),'utf8');
  assert.equal(source.match(/data-notification-menu/g)?.length,1);
});
test('CSV exporter neutralizes formulas even after leading whitespace',async()=>{
  const source=fs.readFileSync(new URL('../../public/js/task-export.js',import.meta.url),'utf8');
  const m=await import('data:text/javascript,'+encodeURIComponent(source));
  for(const value of ['=1+1','  =cmd','\t+malicious','\uFEFF@SUM(1)','\u200B-HYPERLINK(1)']){
    assert.equal(m.safeSpreadsheetValue(value).startsWith("'"),true);
  }
  assert.equal(m.safeSpreadsheetValue('Ordinary text'),'Ordinary text');
});

test('navigation icons and request placeholders contain no corrupted mojibake',()=>{
  const app=fs.readFileSync(new URL('../../public/js/app.js',import.meta.url),'utf8');
  const requests=fs.readFileSync(new URL('../../public/js/requests.js',import.meta.url),'utf8');
  assert.equal(app.includes('Ã¢'),false);
  assert.equal(requests.includes('â€”'),false);
});

test('create-project dialog encodes all synthetic record fields in HTML and attributes',()=>{
 const source=fs.readFileSync(new URL('../../public/js/project-create.js',import.meta.url),'utf8');
 assert.match(source,/import\s*\{\s*escapeHtml\s*\}\s*from\s*["']\.\/safe-html\.mjs/);
 for(const slot of [
  '${department.id}', '${department.name}', '${user.id}', '${user.name}',
  '${user.department?.id || user.departmentId || ""}',
  '${user.department?.name || user.departmentName || ""}'
 ]){
   assert.equal(source.includes(slot),false,'raw user slot: '+slot);
 }
});

test('one canonical appearance switcher and one notification bell remain in loaded page',()=>{
 const html=fs.readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../../public/js/app.js',import.meta.url),'utf8');
 assert.equal(html.includes('<script src="/js/header-runtime.js'),false);
 assert.equal(app.includes('data-theme-toggle'),false);
 assert.equal(app.match(/data-notification-menu/g)?.length,1);
 assert.equal(app.match(/data-theme-choice="/g)?.length,3);
});

test('deployment gate rejects implicit and unconfigured staged deploy without remote calls',async()=>{
 const {spawnSync}=await import('node:child_process');
 const path=(await import('node:url')).fileURLToPath(new URL('../..',import.meta.url));
 const manifest=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
 assert.equal(manifest.scripts.deploy,'node scripts/deploy_checked.mjs');
 const implicit=spawnSync(process.execPath,['scripts/deploy_checked.mjs'],{cwd:path,encoding:'utf8'});
 assert.equal(implicit.status,1);
 assert.match(implicit.stderr,/Refusing ambiguous deploy/);
 const explicit=spawnSync(process.execPath,['scripts/deploy_checked.mjs','staging'],{cwd:path,encoding:'utf8'});
 assert.equal(explicit.status,1);
 assert.match(explicit.stderr,/environment isolation gate failed/);
});
