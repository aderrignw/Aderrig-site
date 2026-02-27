/* app-core.js (fixed)
   - Provides storage helpers backed by Netlify Function /.netlify/functions/store
   - Uses Netlify Identity JWT when available
   - Falls back to localStorage if offline / unauthenticated
*/
(function(){
  'use strict';

  // Keys used across the site
  window.ANW_KEYS = window.ANW_KEYS || {
    USERS: 'anw_users',
    ACL: 'acl',
    SESSION: 'anw_session'
  };

  function lsGet(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(raw == null) return fallback;
      return JSON.parse(raw);
    }catch{
      return fallback;
    }
  }
  function lsSet(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch{}
  }

  async function getJwt(){
    try{
      if(!window.netlifyIdentity || !window.netlifyIdentity.currentUser) return null;
      const u = window.netlifyIdentity.currentUser();
      if(!u) return null;

      // netlify-identity-widget supports both jwt() and token.access_token
      if(typeof u.jwt === 'function'){
        return await u.jwt();
      }
      if(u.token && u.token.access_token) return u.token.access_token;
      return null;
    }catch{
      return null;
    }
  }

  async function storeFetch(method, key, body){
    const jwt = await getJwt();
    const url = '/.netlify/functions/store?key=' + encodeURIComponent(key);
    const headers = { 'Content-Type': 'application/json' };
    if(jwt) headers['Authorization'] = 'Bearer ' + jwt;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(()=> ({}));
    if(!res.ok){
      const msg = data && (data.error || data.message) ? (data.error || data.message) : ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // Initializes by pulling ACL (optional). Does not throw if unauthenticated.
  async function anwInitStore(){
    try{
      const acl = await storeFetch('GET', window.ANW_KEYS.ACL);
      lsSet(window.ANW_KEYS.ACL, acl);
    }catch(_){}
    return true;
  }

  function anwLoad(key, fallback){
    return lsGet(key, fallback);
  }

  async function anwSyncFromServer(key){
    const data = await storeFetch('GET', key);
    lsSet(key, data);
    return data;
  }

  async function anwSave(key, value){
    const data = await storeFetch('POST', key, { key, value });
    // store returns ok:true; we still mirror locally
    lsSet(key, value);
    return data;
  }

  // Special: allow authenticated non-admin to append their own registration record
  async function anwSelfRegister(userObj){
    return await storeFetch('POST', window.ANW_KEYS.USERS, { key: window.ANW_KEYS.USERS, mode: 'self_register', value: userObj });
  }

  // Expose
  window.anwInitStore = anwInitStore;
  window.anwLoad = anwLoad;
  window.anwSave = anwSave;
  window.anwSyncFromServer = anwSyncFromServer;
  window.anwSelfRegister = anwSelfRegister;

  // Small UI helpers (optional)
  window.ANW = window.ANW || {};
  window.ANW.ui = window.ANW.ui || {
    toast: function(msg){ try{ console.log('[toast]', msg); }catch{} },
    alert: function(msg){ try{ window.alert(msg); }catch{} }
  };
})();
