/** Incremental compatibility for pre-M3.5 feature form dialogs.
 * Preserves feature-specific event handlers; standardizes accessibility.
 */
import { trapModalFocus } from './modal-focus.js';
export function installLegacyModalBridge(){
 const watched = new Map();
 let sequence = 0;
 function scan(){
  for(const overlay of document.querySelectorAll('.modal-overlay:not(.oms-dialog-overlay)')){
   if(watched.has(overlay))continue;
   const dialog=overlay.querySelector('[role="dialog"], .project-form-modal, .confirm-modal');
   if(!dialog)continue;
   // Already-owned focus lifetime is left to that module.
   const ownsFocus=dialog.hasAttribute('role');
   if(!ownsFocus){
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;
    const title=dialog.querySelector('h2,h3');
    if(title){if(!title.id)title.id=`oms-legacy-dialog-title-${++sequence}`;dialog.setAttribute('aria-labelledby',title.id);}
   }
   let cleanup=()=>{};
   if(!ownsFocus){
    const close=()=>{const closeButton=overlay.querySelector('[data-close],[data-cancel]');if(closeButton)closeButton.click();};
    cleanup=trapModalFocus(overlay,close);
   }
   watched.set(overlay,cleanup);
  }
  for(const [overlay,cleanup] of watched){if(!overlay.isConnected){cleanup();watched.delete(overlay);}}
 }
 const observer=new MutationObserver(scan);
 observer.observe(document.body,{childList:true,subtree:true});scan();
 return ()=>{observer.disconnect();for(const cleanup of watched.values())cleanup();watched.clear();};
}
