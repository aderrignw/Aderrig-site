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
};

// ---------------------------
// Temporary public mode + master owner
// ---------------------------
// You asked to keep the site 100% public while you restructure.
// To re-enable gating later, set this to false.
window.ANW_PUBLIC_MODE = true;

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

function anwGetLoggedEmail() {
  const s = anwGetSession();
  if (s && s.email) return String(s.email);
  try {
    const u = window.netlifyIdentity && window.netlifyIdentity.currentUser ? window.netlifyIdentity.currentUser() : null;
    if (u && u.email) return String(u.email);
  } catch {}
  return "";
}

function anwLogout() {
  try { window.netlifyIdentity && window.netlifyIdentity.logout && window.netlifyIdentity.logout(); } catch {}
  localStorage.removeItem(ANW_KEYS.SESSION);
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
    if (!u) return null;

    // Prefer access token when available
    const access = u.token && u.token.access_token ? u.token.access_token : null;
    if (access) return access;

    // Fallback to JWT (force refresh)
    if (typeof u.jwt === "function") return await u.jwt(true);

    return null;
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
  // Do not force sync for anonymous visitors
  if (anwIsLoggedIn()) {
    await anwInitStore();
  }
  anwDisplayLoggedUser();
});
