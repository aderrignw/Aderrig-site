// assets/app-core.js
// Core helpers (storage + auth + role + minimal server sync)
//
// Goals:
// - Never crash pages if ANW_KEYS is missing
// - Avoid repeated Netlify Function calls (credit saving) using TTL cache
// - Keep owner/admin recognition consistent

window.ANW_KEYS = window.ANW_KEYS || {
  SESSION: "anw_session",
  USERS: "anw_users",
  ACL: "acl",
  ELECTIONS: "anw_elections",
  NOTICES: "anw_notices",
};

// ---------------------------
// Temporary public mode + master owner
// ---------------------------
// Production mode: private areas must stay protected.
window.ANW_PUBLIC_MODE = false;

// Master email (always treated as owner)
window.ANW_MASTER_EMAIL = "claudiosantos1968@gmail.com";

// ---------------------------
// Storage helpers
// ---------------------------
function anwSave(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function anwLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Erro ao carregar do storage:", e);
    return fallback;
  }
}

function anwNormEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function anwIsMasterEmail(email) {
  try {
    return anwNormEmail(email) === anwNormEmail(window.ANW_MASTER_EMAIL);
  } catch {
    return false;
  }
}

// ---------------------------
// Auth session
// ---------------------------
function anwIsLoggedIn() {
  const session = anwLoad(ANW_KEYS.SESSION, null);
  return !!(session && session.email);
}

function anwGetSession() {
  return anwLoad(ANW_KEYS.SESSION, null);
}

const ANW_AUTH_EVENT_KEY = "anw_auth_event";
const ANW_AUTH_CHANNEL_NAME = "anw_auth_channel";

function anwClearSession() {
  try { localStorage.removeItem(ANW_KEYS.SESSION); } catch {}
}

function anwBroadcastAuthEvent(type, extra) {
  const payload = Object.assign({
    type: String(type || "sync"),
    at: Date.now(),
    href: String((window.location && window.location.href) || "")
  }, extra || {});

  try { localStorage.setItem(ANW_AUTH_EVENT_KEY, JSON.stringify(payload)); } catch {}
  try {
    if (window.BroadcastChannel) {
      if (!window.__anwAuthChannel) window.__anwAuthChannel = new BroadcastChannel(ANW_AUTH_CHANNEL_NAME);
      window.__anwAuthChannel.postMessage(payload);
    }
  } catch {}
  return payload;
}

function anwHandleRemoteLogout() {
  anwClearSession();
  try { window.dispatchEvent(new CustomEvent("anw:auth-logout", { detail: { at: Date.now() } })); } catch {}
  const here = String((window.location && window.location.pathname) || "");
  if (/login\.html$/i.test(here)) return;
  try { window.location.replace("login.html"); } catch { window.location.href = "login.html"; }
}

function anwGetLoggedEmail() {
  try {
    const hasIdentity = !!(window.netlifyIdentity && window.netlifyIdentity.currentUser);
    const u = hasIdentity ? window.netlifyIdentity.currentUser() : null;
    if (u && u.email) return String(u.email);
    if (hasIdentity && !u) return "";
  } catch {}

  const s = anwGetSession();
  if (s && s.email) return String(s.email);
  return "";
}

async function anwLogout() {
  anwClearSession();
  anwBroadcastAuthEvent("logout");
  try {
    if (window.netlifyIdentity && window.netlifyIdentity.logout) {
      await window.netlifyIdentity.logout();
    }
  } catch {}
  window.location.href = "login.html";
}

// ---------------------------
// Role resolution
// ---------------------------
function anwGetLoggedRole() {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return "resident";

    // Master email is always owner.
    if (anwIsMasterEmail(email)) return "owner";

    const users = anwLoad(ANW_KEYS.USERS, []);
    if (!Array.isArray(users)) return "resident";

    const me = users.find(u => anwNormEmail(u && u.email) === email);
    if (!me) return "resident";

    const role = String(me.role || "resident").toLowerCase();
    if (role === "owner") return "owner";
    return role;
  } catch (e) {
    console.warn("Erro ao obter role do usuário:", e);
    return "resident";
  }
}

// ---------------------------
// Server sync (Netlify Function) with TTL cache
// ---------------------------
async function anwGetIdentityToken() {
  try {
    const u = window.netlifyIdentity && window.netlifyIdentity.currentUser ? window.netlifyIdentity.currentUser() : null;
    if (!u || typeof u.jwt !== "function") return null;
    return await u.jwt();
  } catch {
    return null;
  }
}

async function anwFetchStoreKey(key) {
  const token = await anwGetIdentityToken();
  if (!token) throw new Error("Not authenticated (missing token)");

  const res = await fetch(`/.netlify/functions/store?key=${encodeURIComponent(key)}`, {
    method: "GET",
    headers: { Authorization: "Bearer " + token },
  });

  if (!res.ok) {
    let t = "";
    try { t = await res.text(); } catch {}
    throw new Error(`Store GET failed ${res.status} for ${key}${t ? ": " + t : ""}`);
  }
  return await res.json();
}

// TTL per key to save credits
function _syncKeyTsName(key){ return `anw_sync_ts__${key}`; }
function _shouldSync(key, ttlMs){
  const ts = Number(localStorage.getItem(_syncKeyTsName(key)) || "0");
  return (Date.now() - ts) > ttlMs;
}
function _markSynced(key){
  localStorage.setItem(_syncKeyTsName(key), String(Date.now()));
}

// Public: sync keys (default: acl + anw_users)
window.anwSyncFromServer = async function(keys, ttlMs){
  const list = Array.isArray(keys) && keys.length ? keys : [ANW_KEYS.ACL, ANW_KEYS.USERS];
  const ttl = Number.isFinite(ttlMs) ? ttlMs : 10 * 60 * 1000; // 10 minutes

  const email = anwNormEmail(anwGetLoggedEmail());
  if (!email) return;

  for (const k of list) {
    if (!_shouldSync(k, ttl)) continue;
    try {
      const data = await anwFetchStoreKey(k);

      if (k === ANW_KEYS.USERS) {
        // Store can return array (admin) or {me:...}
        if (Array.isArray(data)) {
          anwSave(k, data);
        } else if (data && data.me) {
          anwSave(k, [data.me]);
        } else {
          // keep as-is
        }
      } else {
        anwSave(k, data);
      }
      _markSynced(k);
    } catch (e) {
      console.warn(`[anwSyncFromServer] ${e && e.message ? e.message : e}`);
      // don't mark synced; it will retry after TTL
    }
  }
};

async function anwInitStore() {
  try {
    if (window.anwSyncFromServer) {
      await window.anwSyncFromServer([ANW_KEYS.ACL, ANW_KEYS.USERS]);
    }
  } catch (e) {
    console.warn("Erro ao inicializar store:", e);
  }
}


function anwBindIdentitySync() {
  if (window.__anwIdentitySyncBound) return;
  window.__anwIdentitySyncBound = true;

  const onAuthEvent = (payload) => {
    const type = String(payload && payload.type || "").toLowerCase();
    if (type === "logout") {
      anwHandleRemoteLogout();
      return;
    }
    if (type === "login") {
      try { window.dispatchEvent(new CustomEvent("anw:auth-login", { detail: payload || {} })); } catch {}
    }
  };

  try {
    window.addEventListener("storage", (event) => {
      if (event.key === ANW_AUTH_EVENT_KEY && event.newValue) {
        try { onAuthEvent(JSON.parse(event.newValue)); } catch {}
      }
      if (event.key === ANW_KEYS.SESSION && !event.newValue) {
        onAuthEvent({ type: "logout", at: Date.now(), source: "storage" });
      }
    });
  } catch {}

  try {
    if (window.BroadcastChannel) {
      if (!window.__anwAuthChannel) window.__anwAuthChannel = new BroadcastChannel(ANW_AUTH_CHANNEL_NAME);
      window.__anwAuthChannel.onmessage = (event) => onAuthEvent(event && event.data ? event.data : {});
    }
  } catch {}

  try {
    if (window.netlifyIdentity && typeof window.netlifyIdentity.on === "function") {
      window.netlifyIdentity.on("login", (user) => {
        const email = user && user.email ? String(user.email).toLowerCase() : "";
        if (email) {
          const current = anwGetSession() || {};
          anwSave(ANW_KEYS.SESSION, Object.assign({}, current, { email, loginAt: new Date().toISOString() }));
        }
        anwBroadcastAuthEvent("login", { email });
      });
      window.netlifyIdentity.on("logout", () => {
        anwClearSession();
        try { window.dispatchEvent(new CustomEvent("anw:auth-logout", { detail: { at: Date.now(), source: "identity" } })); } catch {}
        anwBroadcastAuthEvent("logout");
      });
      window.netlifyIdentity.on("init", (user) => {
        if (!user) {
          anwClearSession();
          return;
        }
        const email = user && user.email ? String(user.email).toLowerCase() : "";
        if (email) {
          const current = anwGetSession() || {};
          anwSave(ANW_KEYS.SESSION, Object.assign({}, current, { email }));
        }
      });
    }
  } catch {}
}

// ---------------------------
// UI helper
// ---------------------------
function anwDisplayLoggedUser() {
  const el = document.getElementById("anw-logged-user");
  if (!el) return;
  const email = anwGetLoggedEmail();
  el.textContent = email || "";
}

document.addEventListener("DOMContentLoaded", async () => {
  anwBindIdentitySync();
  // Do not force sync for anonymous visitors
  if (anwIsLoggedIn()) {
    await anwInitStore();
  }
  anwDisplayLoggedUser();
});


// Export globals (some pages expect these on window)
window.anwSave = anwSave;
window.anwLoad = anwLoad;
window.anwInitStore = anwInitStore;
window.anwIsLoggedIn = anwIsLoggedIn;
window.anwGetLoggedEmail = anwGetLoggedEmail;
window.anwGetLoggedRole = anwGetLoggedRole;
window.anwLogout = anwLogout;

// Lightweight client-side store facade for legacy calls
window.anwStore = window.anwStore || {
  init: anwInitStore,
  load: anwLoad,
  save: anwSave
};
// Backward-compat typo seen in some builds
window.anwlntStore = window.anwlntStore || window.anwStore;

async function anwFetchStorePost(key, payload){
  const token = await anwGetIdentityToken();
  if (!token) throw new Error("Not authenticated (missing token)");
  const res = await fetch(`/.netlify/functions/store?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(payload || {})
  });
  if (!res.ok){
    let t = "";
    try { t = await res.text(); } catch {}
    throw new Error(`Store POST failed ${res.status} for ${key}${t ? ": " + t : ""}`);
  }
  return await res.json();
}
window.anwStoreAppendMe = async function(profile){
  return await anwFetchStorePost(ANW_KEYS.USERS, { action: "append_me", profile: profile || {} });
};
window.anwStoreAdminSaveUsers = async function(usersArray){
  return await anwFetchStorePost(ANW_KEYS.USERS, { action: "admin_save_users", users: usersArray || [] });
};

window.anwGetIdentityToken = anwGetIdentityToken;
window.anwStoreGetKey = async function(key){
  return await anwFetchStoreKey(key);
};
window.anwStoreSetKey = async function(key, payload){
  const token = await anwGetIdentityToken();
  if (!token) throw new Error("Not authenticated (missing token)");
  const res = await fetch(`/.netlify/functions/store?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(payload)
  });
  if (!res.ok){
    let t = "";
    try { t = await res.text(); } catch {}
    throw new Error(`Store POST failed ${res.status} for ${key}${t ? ": " + t : ""}`);
  }
  return await res.json();
};
window.anwBroadcastAuthEvent = anwBroadcastAuthEvent;
window.anwClearSession = anwClearSession;
window.anwHandleRemoteLogout = anwHandleRemoteLogout;


