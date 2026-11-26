/** Single modal lifecycle for DSC OMS; never owns feature API permissions. */
import { escapeHtml } from './safe-html.mjs';
let active = null;
const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function focusables(root) {return [...root.querySelectorAll(focusableSelector)].filter(e=>e.getClientRects().length && !e.closest('[hidden]'));}
/** @returns {{close:Function, overlay:HTMLElement, body:HTMLElement}} */
export function openModal({title, content, size='form', dismissible=true, initialFocus, onClose, onBeforeClose}={}) {
  if (active) active.close(true);
  const prior = document.activeElement;
  const priorScroll = window.scrollY;
  const previousOverflow = document.body.style.overflow;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show oms-dialog-overlay';
  overlay.innerHTML = `<div class="oms-dialog oms-dialog-${escapeHtml(size)}" role="dialog" aria-modal="true" aria-labelledby="oms-dialog-title" tabindex="-1"><header class="oms-dialog-header"><h2 id="oms-dialog-title">${escapeHtml(title || 'Details')}</h2><button type="button" class="modal-close" data-oms-close aria-label="Close dialog">×</button></header><div class="oms-dialog-body"></div></div>`;
  const body = overlay.querySelector('.oms-dialog-body');
  let placeholder = null;
  let moved = null;
  if (typeof content === 'string') body.innerHTML = content;
  else if (content instanceof Node) {
    moved=content;
    if (content.parentNode) {placeholder=document.createComment('modal-content-anchor');content.parentNode.insertBefore(placeholder, content);}
    content.hidden=false;
    body.appendChild(content);
  }
  let closing = false;
  const close = (force=false) => {
    if (closing) return false;
    if (!force && onBeforeClose && onBeforeClose() === false) return false;
    closing=true;
    overlay.removeEventListener('keydown', keyHandler);
    overlay.remove();
    if (placeholder?.isConnected && moved) placeholder.replaceWith(moved);
    else placeholder?.remove();
    document.body.style.overflow=previousOverflow;
    if (active?.overlay===overlay) active=null;
    if (prior?.isConnected) prior.focus({preventScroll:true});
    window.scrollTo({top:priorScroll,behavior:'instant'});
    onClose?.();
    return true;
  };
  const keyHandler = ev => {
    if (ev.key==='Escape' && dismissible) {ev.preventDefault();ev.stopPropagation();close();}
    if (ev.key==='Tab') {
      const nodes=focusables(overlay);if (!nodes.length){ev.preventDefault();overlay.querySelector('[role=dialog]').focus();return;}
      if (ev.shiftKey && (document.activeElement===nodes[0] || !overlay.contains(document.activeElement))){ev.preventDefault();nodes.at(-1).focus();}
      else if (!ev.shiftKey && (document.activeElement===nodes.at(-1) || !overlay.contains(document.activeElement))){ev.preventDefault();nodes[0].focus();}
    }
  };
  document.body.append(overlay);
  document.body.style.overflow='hidden';
  overlay.addEventListener('keydown',keyHandler);
  overlay.querySelector('[data-oms-close]').addEventListener('click',()=>close());
  overlay.addEventListener('click',ev=>{if(ev.target===overlay && dismissible)close();});
  active={overlay,close};
  (initialFocus && overlay.querySelector(initialFocus) || focusables(overlay)[0] || overlay.querySelector('[role=dialog]')).focus();
  return {close,overlay,body};
}
export function closeActiveModal(){return active?.close(true) ?? false;}
export function hasActiveModal(){return Boolean(active);}
export function presentDetail(element, title){return openModal({title,content:element,size:'detail'});}
export function formModal({title,fields,submitLabel='Save',size='form',values={},onSubmit}){
  return new Promise(resolve=>{
    const markup=`<form class="oms-dialog-form"><div class="oms-dialog-fields">${fields}</div><footer class="oms-dialog-actions"><button type="button" class="button button-light" data-form-cancel>Cancel</button><button type="submit" class="button button-primary">${escapeHtml(submitLabel)}</button></footer></form>`;
    let completed=false;let dirty=false;let busy=false;
    const finish=value=>{if(completed)return;completed=true;handle.close(true);resolve(value);};
    const handle=openModal({title,content:markup,size,dismissible:true,onBeforeClose:()=>!busy&&(!dirty||window.confirm('Discard unsaved changes?')),onClose:()=>{if(!completed){completed=true;resolve(null);}}});
    const form=handle.body.querySelector('form');
    for(const [key,value] of Object.entries(values)){const el=form.elements.namedItem(key);if(el && 'value' in el)el.value=value??'';}
    form.addEventListener('input',()=>{dirty=true;});
    form.querySelector('[data-form-cancel]').onclick=()=>handle.close();
    const error=document.createElement('p');error.setAttribute('role','alert');error.hidden=true;form.prepend(error);
    form.onsubmit=async ev=>{
      ev.preventDefault();if(busy||!form.reportValidity())return;
      const data=Object.fromEntries(new FormData(form));const submit=form.querySelector('[type=submit]');
      busy=true;submit.disabled=true;form.setAttribute('aria-busy','true');error.hidden=true;
      try{if(onSubmit)await onSubmit(data);finish(data);}
      catch(err){error.textContent=err.message||'Unable to save. Please try again.';error.hidden=false;error.tabIndex=-1;error.focus();}
      finally{busy=false;submit.disabled=false;form.removeAttribute('aria-busy');}
    };
  });
}
export function decisionModal({title,message,confirmText='Confirm',danger=false}){
  return new Promise(resolve=>{
    let decided=false;
    const markup=`<p>${escapeHtml(message)}</p><footer class="oms-dialog-actions"><button type="button" class="button button-light" data-decision-cancel>Cancel</button><button type="button" class="button ${danger?'button-danger':'button-primary'}" data-decision-confirm>${escapeHtml(confirmText)}</button></footer>`;
    const handle=openModal({title,content:markup,size:'confirm',onClose:()=>{if(!decided)resolve(false);}});
    const finish=v=>{if(decided)return;decided=true;handle.close(true);resolve(v);};
    handle.body.querySelector('[data-decision-cancel]').onclick=()=>finish(false);
    handle.body.querySelector('[data-decision-confirm]').onclick=()=>finish(true);
  });
}
