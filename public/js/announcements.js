/** Official announcements: browse -> read -> authorized action. */
import {api} from './api.js';
import {escapeHtml as h} from './safe-html.mjs';
import {showToast} from './ui.js';
import {formModal, decisionModal} from './modal-manager.js';
const base='/api/m3/announcements';
let savedSearch='';
const opt=(id,label,chosen=false)=>`<option value="${h(id)}" ${chosen?'selected':''}>${h(label)}</option>`;
const canManage=(a,user)=>a && (a.createdBy===user?.id || ['Lead','Co-Lead'].includes(user?.role));
const date=s=>s?new Date(s).toLocaleString(): 'Not published';
function editorFields(a,user,events,projects){
 const allowedEvents=(events||[]).filter(e=>!['Draft','For Approval','Rejected','Cancelled'].includes(e.status));
 return `<label>Title <input name="title" maxlength="180" required value="${h(a?.title||'')}"></label>
 <label>Message <textarea name="body" rows="7" maxlength="10000" required>${h(a?.body||'')}</textarea></label>
 ${a?'<p class="event-policy-note">Published audience and resource links cannot be changed through draft editing.</p>':`<label>Audience <select name="audience">${user.role!=='Executive'?opt('Organization','Organization'):''}${opt('Department','My department',user.role==='Executive')}</select></label>
 <label>Category <select name="category">${['General','Operational','Event Update','Project Update','Important Notice'].map(x=>opt(x,x)).join('')}</select></label>
 <label>Related Event (optional) <select name="eventId">${opt('','None')}${allowedEvents.map(e=>opt(e.id,e.name)).join('')}</select></label>
 <label>Related Project (optional) <select name="projectId">${opt('','None')}${projects.map(p=>opt(p.id,p.name)).join('')}</select></label>
 <label class="m35-check"><input type="checkbox" name="pinned"> Pin official notice</label>`}`;
}
export async function renderAnnouncements(root,view={}){
 root.innerHTML='<div class="card empty" role="status">Loading announcements…</div>';
 try{
  const {announcements=[]}=await api.get(base), user=window.omsCurrentUser;
  const mayPublish=['Lead','Co-Lead','Executive'].includes(user?.role);
  const selected=view.id?announcements.find(a=>a.id===view.id):null;
  if(view.id && !selected){root.innerHTML='<div class="card" role="alert"><h2>Announcement unavailable</h2><p>This notice may have been archived or is not available to your account.</p><button type="button" class="button button-light" data-notice-back>Back to Announcements</button></div>';root.querySelector('[data-notice-back]').onclick=()=>{window.omsUpdateView?.('announcements');renderAnnouncements(root);};return;}
  if(selected){
   root.innerHTML=`<article class="m35-reading"><nav class="m35-breadcrumb"><button type="button" class="button button-light" data-notice-back>← Back to Announcements</button><span>Announcements / ${h(selected.title)}</span></nav><section class="card m35-reading-card"><div class="m35-reading-meta"><span>${h(selected.category)}</span><span>${h(selected.audience==='Organization'?'Organization-wide':'Department notice')}</span>${selected.pinned?'<span>📌 Pinned</span>':''}</div><h1>${h(selected.title)}</h1><p class="m35-reading-byline">Official DSC notice · ${h(date(selected.publishedAt))}</p><div class="m35-reading-message">${h(selected.body)}</div><footer class="m35-reading-footer">${selected.eventId?'<p>Linked event</p>':''}${selected.projectId?'<p>Linked project</p>':''}<div class="event-action-row">${canManage(selected,user)&&selected.status==='Draft'?'<button type="button" class="button button-light" data-notice-edit>Edit draft</button><button type="button" class="button button-primary" data-notice-publish>Publish</button>':''}${canManage(selected,user)&&selected.status!=='Archived'?'<button type="button" class="button button-light" data-notice-archive>Archive</button>':''}</div></footer></section></article>`;
   if(selected.status==='Published'&&!selected.isRead){try{await api.post(`${base}/${encodeURIComponent(selected.id)}/read`,{});}catch(err){showToast('Could not record read receipt.','error');}}
  }else{
   root.innerHTML=`<section class="page-heading m35-notices-heading"><div><h1>Announcements</h1><p>Official organization and department notices</p></div>${mayPublish?'<button type="button" class="button button-primary" data-notice-new>+ New Announcement</button>':''}</section><div class="m35-notices-toolbar"><label for="m35-notice-search">Search announcements</label><input type="search" id="m35-notice-search" placeholder="Search official notices" autocomplete="off"></div><section class="m3-announcements" aria-label="Available announcements">${announcements.map(a=>`<button type="button" class="card m35-notice-card" data-notice-open="${h(a.id)}"><span class="m35-notice-top"><strong>${h(a.title)}</strong><span class="status">${h(a.status)}</span></span><span class="m35-notice-excerpt">${h(a.body.length>190?a.body.slice(0,190)+'…':a.body)}</span><span class="m35-notice-meta">${a.pinned?'📌 Pinned · ':''}${h(a.category)} · ${h(a.audience)} · ${h(date(a.publishedAt))} ${a.status==='Published'&&!a.isRead?'· Unread':''}</span></button>`).join('')||'<div class="card empty">No announcements are available to your account.</div>'}</section>`;
   const search=root.querySelector('#m35-notice-search');search.value=savedSearch;
   const filter=()=>{savedSearch=search.value;const q=savedSearch.toLowerCase().trim();root.querySelectorAll('[data-notice-open]').forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);});};
   search.addEventListener('input',filter);filter();
  }
  root.onclick=async event=>{
   const button=event.target.closest('[data-notice-back],[data-notice-open],[data-notice-new],[data-notice-edit],[data-notice-publish],[data-notice-archive]');if(!button || !root.contains(button))return;
   if(button.dataset.noticeBack!==undefined){window.omsUpdateView?.('announcements',null);return renderAnnouncements(root);}
   if(button.dataset.noticeOpen){window.omsUpdateView?.('announcements',button.dataset.noticeOpen);return renderAnnouncements(root,{id:button.dataset.noticeOpen});}
   if(button.dataset.noticeNew!==undefined || button.dataset.noticeEdit!==undefined){
    if(!mayPublish)return;
    const editing=button.dataset.noticeEdit!==undefined?selected:null;
    if(editing&&!canManage(editing,user))return;
    let events=[],projects=[];
    if(!editing){const [er,pr]=await Promise.all([api.get('/api/events').catch(()=>({events:[]})),api.get('/api/projects').catch(()=>({projects:[]}))]);events=er.events||[];projects=pr.projects||[];}
    const values=await formModal({title:editing?'Edit announcement draft':'Prepare an official announcement',fields:editorFields(editing,user,events,projects),submitLabel:'Save draft',size:'large'});if(!values)return;
    button.disabled=true;
    try{if(editing)await api.patch(`${base}/${encodeURIComponent(editing.id)}`,{title:values.title,body:values.body});
    else await api.post(base,{...values,pinned:values.pinned==='on',departmentId:values.audience==='Department'?user.department.id:null,eventId:values.eventId||null,projectId:values.projectId||null});
    showToast('Draft saved.','success');await renderAnnouncements(root,view);
    }catch(err){showToast(err.message||'Unable to save announcement.','error');}finally{button.disabled=false;}return;
   }
   if(!selected || !canManage(selected,user))return;
   if(button.dataset.noticePublish!==undefined || button.dataset.noticeArchive!==undefined){
    const publishing=button.dataset.noticePublish!==undefined;
    const confirmed=await decisionModal({title:publishing?'Publish official announcement':'Archive announcement',message:publishing?'Publish this notice to the authorized audience?':'Archive this notice while retaining its history?',confirmText:publishing?'Publish':'Archive',danger:!publishing});
    if(!confirmed)return;
    button.disabled=true;
    try{await api.post(`${base}/${encodeURIComponent(selected.id)}/${publishing?'publish':'archive'}`,{});showToast(publishing?'Announcement published.':'Announcement archived.','success');window.omsUpdateView?.('announcements');await renderAnnouncements(root);}
    catch(err){showToast(err.message||'Operation failed.','error');}finally{button.disabled=false;}
   }
  };
 }catch(err){root.innerHTML=`<div role="alert" class="card"><h2>Announcements unavailable</h2><p>${h(err.message)}</p><button class="button button-light" data-notice-retry>Retry</button></div>`;root.querySelector('[data-notice-retry]').onclick=()=>renderAnnouncements(root,view);}
}
