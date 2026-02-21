/* app-core.js (OPEN MODE)
 * ========================
 * Minimal, robust client core for calling /.netlify/functions/store
 * - Defines ANW_KEYS so pages don't crash
 * - Keeps a local cache in memory
 * - Works whether Identity is present or not
 *
 * IMPORTANT: This is an "open" dev build. Lock down later.
 */
(function(){
  "use strict";

  // Keys used by the site
  window.ANW_KEYS = window.ANW_KEYS || {
    USERS: "anw_users",
    ACL: "anw_acl",
    ALERTS: "anw_alerts",
    CONTACTS: "anw_contacts",
    INCIDENTS: "anw_incidents",
    NOTICES: "anw_notices",
    HANDBOOK: "anw_handbook",
    AUDIT: "anw_audit_log",
  };

  const STORE_ENDPOINT = "/.netlify/functions/store";

  const cache = new Map();
  let inited = false;

  function qs(key){
    return STORE_ENDPOINT + "?key=" + encodeURIComponent(key);
  }

  async function getToken(){
    try{
      if(window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === "function"){
        const u = window.netlifyIdentity.currentUser();
        if(u && typeof u.jwt === "function"){
          return await u.jwt();
        }
      }
    }catch(_){}
    return null;
  }

  async function fetchJson(url, opts){
    const res = await fetch(url, opts);
    const data = await res.json().catch(()=>null);
    if(!res.ok){
      const msg = (data && (data.error || data.message)) ? (data.error || data.message) : ("HTTP " + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // Public API expected by pages
  window.anwInitStore = async function(){
    if(inited) return true;
    inited = true;
    return true;
  };

  window.anwLoad = function(key, fallback){
    if(cache.has(key)) return cache.get(key);
    return fallback;
  };

  window.anwFetch = async function(key){
    const token = await getToken(); // optional
    const headers = {};
    if(token) headers["Authorization"] = "Bearer " + token;
    const data = await fetchJson(qs(key), { method:"GET", headers });
    cache.set(key, data.value);
    return data.value;
  };

  window.anwSave = async function(key, value){
    const token = await getToken(); // optional
    const headers = { "Content-Type":"application/json" };
    if(token) headers["Authorization"] = "Bearer " + token;

    const data = await fetchJson(qs(key), {
      method:"POST",
      headers,
      body: JSON.stringify({ value }),
    });
    cache.set(key, value);
    return data;
  };

  window.anwDelete = async function(key){
    const token = await getToken(); // optional
    const headers = {};
    if(token) headers["Authorization"] = "Bearer " + token;
    const data = await fetchJson(qs(key), { method:"DELETE", headers });
    cache.delete(key);
    return data;
  };

  // Convenience: ensure the master owner exists client-side too (not required, function does it)
  window.anwEnsureOwner = async function(){
    const masterEmail = "claudiosantos1968@gmail.com";
    const masterEir = "K78T2W8";
    const list = (await window.anwFetch(window.ANW_KEYS.USERS).catch(()=>[])) || [];
    const arr = Array.isArray(list) ? list : [];
    const exists = arr.some(u => (u.email||"").toLowerCase() === masterEmail.toLowerCase());
    if(!exists){
      arr.push({
        name:"Claudio Santos",
        email: masterEmail.toLowerCase(),
        eircode: masterEir,
        role:"owner",
        status:"active",
        residentType:"Owner",
        createdAt: new Date().toISOString()
      });
      await window.anwSave(window.ANW_KEYS.USERS, arr);
    }
    return true;
  };
})();
