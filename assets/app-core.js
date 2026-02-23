/ assets/app-core.js
window.ANW_KEYS = window.ANW_KEYS || {
  SESSION: 'anw_session',
  ACL: 'acl',
  USERS: 'anw_users',
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

function anwSave(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
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

function anwNormEmail(email){ return String(email || '').trim().toLowerCase(); }

function anwIsLoggedIn() { const s = anwLoad(ANW_KEYS.SESSION, null); return !!(s && s.email); }
function anwGetSession() { return anwLoad(ANW_KEYS.SESSION, null); }
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

async function anwGetIdentityToken(){
  try{
    const u = window.netlifyIdentity && window.netlifyIdentity.currentUser ? window.netlifyIdentity.currentUser() : null;
    if (!u || typeof u.jwt !== 'function') return null;
    return await u.jwt();
  }catch{
    return null;
  }
}

async function anwFetchStoreKey(key){
  const token = await anwGetIdentityToken();
  if(!token) throw new Error('Not authenticated (missing token).');
  const url = `/.netlify/functions/store?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
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

window.anwSyncFromServer = async function(keys, ttlMs){
  const list = Array.isArray(keys) && keys.length ? keys : [ANW_KEYS.ACL, ANW_KEYS.USERS];
  const ttl = Number.isFinite(ttlMs) ? ttlMs : (10 * 60 * 1000);
  const email = anwNormEmail(anwGetLoggedEmail());
  if(!email) return;

  const now = Date.now();
  const cacheKey = 'anw_last_sync_v1';
  const last = Number(anwLoad(cacheKey, 0) || 0);
  if(ttl > 0 && (now - last) < ttl) return;

  for(const k of list){
    try{
      const data = await anwFetchStoreKey(k);
      if(k === ANW_KEYS.USERS && data && !Array.isArray(data) && data.me){
        anwSave(k, [data.me]);
      } else {
        anwSave(k, data);
      }
    }catch(err){
      console.warn(`[anwSyncFromServer] ${err && err.message ? err.message : err}`);
    }
  }
  anwSave(cacheKey, now);
};

async function anwInitStore() {
  try {
    if (typeof window.anwSyncFromServer === 'function') await window.anwSyncFromServer();
  } catch (e) {
    console.warn('Erro ao inicializar store:', e);
  }
}

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
