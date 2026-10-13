export function editingInProgress(doc){
 const a=doc.activeElement;
 return Boolean(doc.querySelector('.title-editor')||a&&(a.matches('input,textarea,select')||a.isContentEditable));
}
export function createRenderGate(doc,apply,onPending){
 let pending=false;
 return {request(){if(editingInProgress(doc)){pending=true;onPending(true);return false}pending=false;onPending(false);apply();return true},
  apply(){pending=false;onPending(false);apply()},get pending(){return pending}};
}
