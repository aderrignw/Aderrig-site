// assets/app-core.js
// Core helpers for Aderrig NW (storage + auth + role + minimal server sync)

/* ===========================
   GLOBAL KEYS (single source of truth)
   =========================== */
window.ANW_KEYS = window.ANW_KEYS || {
  // Core
  SESSION: 'anw_session',
  ACL: 'acl',
  USERS: 'anw_users',

  // Feature stores used by admin/dashboard (kept here so pages don't crash if missing)
  NOTICES: 'notices',
  ELECTIONS: 'elections',
  VOTES: 'votes',
  PROJECTS: 'projects',
  PROJECT_MONITORING: 'project_monitoring',
  TASKS: 'tasks',
  INCIDENTS: 'incidents',
  HANDBOOK: 'handbook',
  LOGGED: 'logged'
};

/* ===========================
   STORAGE HELPERS
   =========================== */
function anwSave(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function anwLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Erro ao carregar do storage:', e);
    return fallback;
  }
}

/* ===========================
   SMALL NORMALIZERS
   =========================== */
function anwNormEmail(email){
  return String(email || '').trim().toLowerCase();
}

/* ===========================
   AUTH SESSION
   =========================== */
function anwIsLoggedIn() {
  const session = anwLoad(ANW_KEYS.SESSION, null);
  return !!(session && session.email);
}
function anwGetSession() {
  return anwLoad(ANW_KEYS.SESSION, null);
}
function anwGetLoggedEmail(){
  const s = anwGetSession();
  if (s && s.email) return String(s.email);
  try{
    const u = window.netlifyIdentity && window.netlifyIdentity.currentUser ? window.netlifyIdentity.currentUser() : null;
    if (u && u.email) return String(u.email);
  }catch{}
  return '';
}
function anwLogout() {
  try { window.netlifyIdentity && window.netlifyIdentity.logout && window.netlifyIdentity.logout(); } catch {}
  localStorage.removeItem(ANW_KEYS.SESSION);
  window.location.href = 'login.html';
}

/* ===========================
   ROLE RESOLUTION
   - Owner ALWAYS wins
   =========================== */
function anwGetLoggedRole() {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return 'resident';

    const users = anwLoad(ANW_KEYS.USERS, []);
    if (!Array.isArray(users)) return 'resident';

    const found = users.find(u => anwNormEmail(u && u.email) === email);
    if (!found) return 'resident';

    if (String(found.role || '').toLowerCase() === 'owner') return 'owner';
    return String(found.role || 'resident').toLowerCase();
  } catch (e) {
    console.warn('Erro ao obter role do usuário:', e);
    return 'resident';
  }
}

/* ===========================
   NETLIFY TOKEN + SERVER SYNC
   - Keep it MINIMAL to avoid extra Function invocations (Netlify credits).
   =========================== */
async function anwGetIdentityToken(){
  try{
    const u = window.netlifyIdentity && window.netlifyIdentity.currentUser ? window.netlifyIdentity.currentUser() : null;
    if (!u || typeof u.jwt !== 'function') return null;
    return await u.jwt();
  }catch{
    return null;
  }
}

// Fetch ONE key from Netlify Function store
async function anwFetchStoreKey(key){
  const token = await anwGetIdentityToken();
  if(!token) throw new Error('Not authenticated (missing token).');

  const url = `/.netlify/functions/store?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if(!res.ok){
    let details = '';
    try{ details = await res.text(); }catch{}
    const msg = `Store GET failed (${res.status}) for "${key}"` + (details ? `: ${details}` : '');
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

/**
 * Sync from server (default: only ACL + USERS).
 * You can pass an array of keys if a page needs more.
 */
window.anwSyncFromServer = async function(keys){
  const list = Array.isArray(keys) && keys.length ? keys : [ANW_KEYS.ACL, ANW_KEYS.USERS];

  // Only try sync if user is logged in (session OR identity)
  const email = anwNormEmail(anwGetLoggedEmail());
  if(!email) return;

  for(const k of list){
    try{
      const data = await anwFetchStoreKey(k);
      if(data !== undefined){
        anwSave(k, data);
      }
    }catch(err){
      // Important: do NOT spam console with huge stacks; keep a short warning.
      console.warn(`[anwSyncFromServer] ${err && err.message ? err.message : err}`);
      // Keep going; a non-admin user may be forbidden from anw_users.
    }
  }
};

/* ===========================
   STORE INIT
   =========================== */
async function anwInitStore() {
  try {
    if (typeof window.anwSyncFromServer === 'function') {
      await window.anwSyncFromServer(); // default keys only
    }
  } catch (e) {
    console.warn('Erro ao inicializar store:', e);
  }
}

/* ===========================
   UI HELPERS
   =========================== */
function anwDisplayLoggedUser() {
  const el = document.getElementById('anw-logged-user');
  if (!el) return;

  const email = anwGetLoggedEmail();
  el.textContent = email ? email : '';
}

document.addEventListener('DOMContentLoaded', async () => {
  await anwInitStore();
  anwDisplayLoggedUser();
});
