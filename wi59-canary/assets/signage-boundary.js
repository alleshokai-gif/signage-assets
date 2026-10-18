/* Purpose-limited bearer key, stored only by explicit setup on this HTTPS
 * origin. No automatic save, enrollment, hardware identifier or login.
 * Same-origin script/XSS can read the key; it is not a device identity.
 */
(function(root) {
  'use strict';
  function failure(code,category) { return Object.assign(new Error(code),{code,category}); }
  function privateUnavailable() { return Promise.reject(failure('SIGNAGE_AUTH_NOT_CONFIGURED','configuration')); }
  const KEY='signage.scoped-key.v1',PENDING='signage.timer-pending.v1';
  function validKey(value) { return typeof value==='string' && /^sg1_[A-Za-z0-9_-]{43,128}$/.test(value); }
  function readCredential() {
    let value;
    try { value=root.localStorage.getItem(KEY); }
    catch (_) { throw failure('SIGNAGE_STORAGE_UNAVAILABLE','storage'); }
    if (!validKey(value)) throw failure('SIGNAGE_KEY_NOT_CONFIGURED','configuration');
    return value;
  }
  function saveCredential(value) {
    if (root.location.protocol!=='https:') throw failure('SIGNAGE_HTTPS_REQUIRED','configuration');
    if (!validKey(value)) throw failure('SIGNAGE_KEY_FORMAT_INVALID','configuration');
    try {
      root.localStorage.setItem(KEY,value);
      if (root.localStorage.getItem(KEY)!==value) throw Error('not persisted');
    } catch (_) { throw failure('SIGNAGE_STORAGE_UNAVAILABLE','storage'); }
  }
  function removeCredential() {
    try { root.localStorage.removeItem(KEY); }
    catch (_) { throw failure('SIGNAGE_STORAGE_UNAVAILABLE','storage'); }
  }
  function timerOperation(parameters) {
    const names=['category','mode','date','time','durationMin','notify5min','target'];
    const signature=JSON.stringify(names.map(name=>String(parameters[name] ?? '')));
    try {
      let pending=JSON.parse(root.localStorage.getItem(PENDING) || 'null');
      if (!pending || pending.signature!==signature) {
        let id;
        if(typeof root.crypto.randomUUID==='function') id=root.crypto.randomUUID();
        else {
          const bytes=root.crypto.getRandomValues(new Uint8Array(16));
          bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
          const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
          id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
        }
        pending={signature,id};
        root.localStorage.setItem(PENDING,JSON.stringify(pending));
        if(root.localStorage.getItem(PENDING)!==JSON.stringify(pending))throw Error('retry state not persisted');
      }
      if (!/^[a-f0-9-]{36}$/.test(pending.id)) throw Error('invalid retry state');
      return pending;
    } catch (_) { throw failure('SIGNAGE_RETRY_STORAGE_UNAVAILABLE','storage'); }
  }
  async function request(endpoint,parameters) {
    const credential=readCredential();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint || ''))
      throw failure('SIGNAGE_ENDPOINT_NOT_CONFIGURED','configuration');
    const pending=parameters.action==='setAlert'?timerOperation(parameters):null;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),parameters.action==='radioTts'?20000:10000);
    try {
      const response=await root.fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({...parameters,...(pending?{operationId:pending.id}:{}),credential}),
        credentials:'omit',cache:'no-store',signal:controller.signal});
      if (!response.ok) throw failure('SIGNAGE_TRANSPORT_FAILED','transport');
      let data;
      try { data=await response.json(); } catch (_) { throw failure('SIGNAGE_RESPONSE_INVALID','parse'); }
      if (!data || typeof data!=='object' || typeof data.ok!=='boolean') throw failure('SIGNAGE_RESPONSE_INVALID','parse');
      if (!data.ok) throw failure('SIGNAGE_REQUEST_REJECTED',data.category || 'application');
      // Retain the pending ID even after success: rapid clicks/reload must not
      // register twice. A deliberately new submission clears it explicitly.
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw failure('SIGNAGE_TRANSPORT_TIMEOUT','transport');
      if (error.category) throw error;
      throw failure('SIGNAGE_TRANSPORT_FAILED','transport');
    } finally { clearTimeout(timeout); }
  }
  function fixedRadioItems(reason,now) {
    let slot=String(reason || '');
    if (['home','manual','boot','radio_test'].includes(slot)) {
      const hour=(now || new Date()).getHours();
      slot=hour<12?'clock_0720':hour<20?'clock_1830':'clock_2100';
    }
    const keys={clock_0655:['MORNING_SUMMARY','CLOSE_MORNING_SHORT'],
      clock_0720:['MORNING_SUMMARY','CLOSE_MORNING'],clock_1830:['NIGHT_SUMMARY','CLOSE_NIGHT'],
      clock_2100:['NIGHT_SUMMARY','CLOSE_NIGHT_SHORT']}[slot] || [];
    const items=keys.map(key=>({type:'wav',key}));
    if (slot==='clock_2100') items.push({type:'wav',base:'clock',key:'NERO'});
    return items;
  }
  function newTimerSubmission() {
    try { root.localStorage.removeItem(PENDING); }
    catch (_) { throw failure('SIGNAGE_RETRY_STORAGE_UNAVAILABLE','storage'); }
  }
  const api=Object.freeze({request,privateUnavailable,fixedRadioItems,saveCredential,removeCredential,newTimerSubmission,
    credentialStatus:()=>{try {readCredential();return 'saved';}catch(e){return e.category==='storage'?'storage_unavailable':'not_configured';}}});
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.SignageBoundary=api;
})(typeof globalThis==='object'?globalThis:this);
