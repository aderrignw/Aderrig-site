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
  PARKING_REGISTRY: "anw_parking_registry_v1",
  PARKING_POLICY: "anw_parking_policy_v1",
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


function anwEmailLocalPart(v) {
  const email = anwNormEmail(v);
  return email.includes("@") ? email.split("@")[0] : email;
}

function anwGetUserEmails(user) {
  try {
    return [
      anwNormEmail(user && user.email),
      anwNormEmail(user && user.userEmail),
      anwNormEmail(user && user.loginEmail),
      anwNormEmail(user && user.netlifyEmail),
    ].filter(Boolean);
  } catch {
    return [];
  }
}

function anwUserMatchesEmail(user, email) {
  try {
    const target = anwNormEmail(email);
    if (!target) return false;
    const emails = anwGetUserEmails(user);
    if (emails.includes(target)) return true;
    const targetLocal = anwEmailLocalPart(target);
    return !!targetLocal && emails.some((value) => anwEmailLocalPart(value) === targetLocal);
  } catch {
    return false;
  }
}


function anwIsMasterEmail(email) {
  try {
    return anwNormEmail(email) === anwNormEmail(window.ANW_MASTER_EMAIL);
  } catch {
    return false;
  }
}

function anwIsApproved(user) {
  try {
    if (!user || typeof user !== "object") return false;
    if (user.approved === true) return true;
    if (user.active === true) return true;

    const status = String(
      user.status ??
      user.accountStatus ??
      user.registrationStatus ??
      ""
    ).trim().toLowerCase();

    return status === "approved" || status === "active";
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
function anwCollectProfileRoles(user) {
  try {
    const out = [];
    const pushAny = (v) => {
      if (v == null || v === "") return;
      if (Array.isArray(v)) return v.forEach(pushAny);
      out.push(String(v));
    };
    if (!user || typeof user !== "object") return out;
    pushAny(user.type);
    pushAny(user.role);
    pushAny(user.roles);
    pushAny(user.residentType);
    pushAny(user.position);
    pushAny(user.title);
    pushAny(user.access);
    return out;
  } catch {
    return [];
  }
}

function anwNormalizeRoleName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "resident";
  const clean = raw.replace(/[\s\-]+/g, "_");

  const aliasMap = {
    owner: "owner",
    admin: "admin",
    resident: "resident",
    member: "resident",
    homeowner: "resident",
    householder: "resident",
    street_admin: "street_coordinator",
    street_admins: "street_coordinator",
    street_coordinator: "street_coordinator",
    street_coordinators: "street_coordinator",
    street_coordinator_role: "street_coordinator",
    coordinator: "street_coordinator",
    area_coordinator: "area_coordinator",
    area_coordinator_role: "area_coordinator",
    auxiliar_coordinator: "assistant_area_coordinator",
    auxiliary_coordinator: "assistant_area_coordinator",
    assistant_coordinator: "assistant_area_coordinator",
    assistant_area_coordinator: "assistant_area_coordinator",
    assistant_area_coordinator_role: "assistant_area_coordinator",
    projects: "projects",
    programmer_support: "admin",
    admin_support: "admin",
    support_administrator: "admin"
  };

  if (aliasMap[clean]) return aliasMap[clean];
  return clean;
}

function anwProfileHasRole(user, roleName) {
  try {
    const want = anwNormalizeRoleName(roleName);
    const mine = anwCollectProfileRoles(user).map(anwNormalizeRoleName);
    return mine.includes(want);
  } catch {
    return false;
  }
}

function anwGetLoggedRole() {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return "resident";

    if (anwIsMasterEmail(email)) return "owner";

    const users = anwLoad(ANW_KEYS.USERS, []);
    if (!Array.isArray(users)) return "resident";

    const me = users.find(u => anwUserMatchesEmail(u, email));
    if (!me) return "resident";

    const normalized = anwCollectProfileRoles(me).map(anwNormalizeRoleName);
    if (normalized.includes("owner")) return "owner";
    if (normalized.includes("admin")) return "admin";
    if (normalized.includes("area_coordinator")) return "area_coordinator";
    if (normalized.includes("assistant_area_coordinator")) return "assistant_area_coordinator";
    if (normalized.includes("street_coordinator")) return "street_coordinator";
    if (normalized.includes("projects")) return "projects";
    return "resident";
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
      await window.anwSyncFromServer([ANW_KEYS.ACL, ANW_KEYS.USERS, ANW_KEYS.PARKING_REGISTRY, ANW_KEYS.PARKING_POLICY]);
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
    if (type === "login" || type === "signup" || type === "refresh" || type === "sync") {
      try { window.location.reload(); } catch {}
    }
  };

  try {
    window.addEventListener("storage", (ev) => {
      if (ev.key === ANW_AUTH_EVENT_KEY && ev.newValue) {
        try { onAuthEvent(JSON.parse(ev.newValue)); } catch {}
      }
    });
  } catch {}

  try {
    if (window.BroadcastChannel) {
      if (!window.__anwAuthChannel) window.__anwAuthChannel = new BroadcastChannel(ANW_AUTH_CHANNEL_NAME);
      window.__anwAuthChannel.onmessage = (ev) => onAuthEvent(ev.data || {});
    }
  } catch {}

  try {
    if (window.netlifyIdentity) {
      window.netlifyIdentity.on("login", async (user) => {
        const email = anwNormEmail(user && user.email);
        if (email) anwSave(ANW_KEYS.SESSION, { email });
        anwBroadcastAuthEvent("login", { email });
        try { await anwInitStore(); } catch {}
      });

      window.netlifyIdentity.on("logout", () => {
        anwClearSession();
        anwBroadcastAuthEvent("logout");
      });

      window.netlifyIdentity.on("init", async (user) => {
        const email = anwNormEmail(user && user.email);
        if (email) {
          anwSave(ANW_KEYS.SESSION, { email });
          try { await anwInitStore(); } catch {}
        }
      });
    }
  } catch (e) {
    console.warn("Erro ao bindar Netlify Identity:", e);
  }
}

// ---------------------------
// Simple app shell
// ---------------------------
window.ANW = window.ANW || {};
window.ANW.ui = window.ANW.ui || {
  toast(message, type) {
    try { console.log(`[${type || "info"}] ${message}`); } catch {}
    alert(String(message || ""));
  },
  alert(title, message) {
    const text = [title, message].filter(Boolean).join("\n\n");
    alert(text);
  }
};

// ---------------------------
// User helpers for pages
// ---------------------------
window.anwGetCurrentUserProfile = function () {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return null;
    const users = anwLoad(ANW_KEYS.USERS, []);
    if (!Array.isArray(users)) return null;
    return users.find(u => anwUserMatchesEmail(u, email)) || null;
  } catch {
    return null;
  }
};

window.anwUpsertMyProfile = async function (profile) {
  return await anwFetchStorePost(ANW_KEYS.USERS, { action: "append_me", profile: profile || {} });
};

window.anwAdminSaveUsers = async function (usersArray) {
  return await anwFetchStorePost(ANW_KEYS.USERS, { action: "admin_save_users", users: usersArray || [] });
};

async function anwFetchStorePost(key, payload) {
  const token = await anwGetIdentityToken();
  if (!token) throw new Error("Not authenticated (missing token)");

  const res = await fetch(`/.netlify/functions/store?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let t = "";
    try { t = await res.text(); } catch {}
    throw new Error(`Store POST failed ${res.status} for ${key}${t ? ": " + t : ""}`);
  }
  return await res.json();
}

// ---------------------------
// Boot
// ---------------------------
(function bootAnwCore() {
  try {
    anwBindIdentitySync();
  } catch {}

  try {
    if (window.netlifyIdentity && typeof window.netlifyIdentity.init === "function") {
      window.netlifyIdentity.init();
    }
  } catch {}
})();

window.anwNormalizeRoleName = anwNormalizeRoleName;
window.anwCollectProfileRoles = anwCollectProfileRoles;
window.anwProfileHasRole = anwProfileHasRole;

// ---------------------------
// Parking registry helpers
// ---------------------------
function anwParkingNormalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function anwParkingBaseRegistry() {
  return { allocations: [], submissions: {}, policy: null, updatedAt: null };
}

function anwParkingLoadRegistry() {
  const data = anwLoad(window.ANW_KEYS.PARKING_REGISTRY, null);
  if (!data || typeof data !== 'object') return anwParkingBaseRegistry();
  return Object.assign(anwParkingBaseRegistry(), data, {
    allocations: Array.isArray(data.allocations) ? data.allocations : [],
    submissions: data.submissions && typeof data.submissions === 'object' ? data.submissions : {},
    policy: data.policy && typeof data.policy === 'object' ? data.policy : null,
  });
}

function anwParkingSaveRegistry(data) {
  const payload = Object.assign(anwParkingBaseRegistry(), data || {}, { updatedAt: new Date().toISOString() });
  anwSave(window.ANW_KEYS.PARKING_REGISTRY, payload);
  if (payload && payload.policy) {
    anwSave(window.ANW_KEYS.PARKING_POLICY, payload.policy);
  }

  (async () => {
    try {
      await anwFetchStorePost(window.ANW_KEYS.PARKING_REGISTRY, payload);
      _markSynced(window.ANW_KEYS.PARKING_REGISTRY);
      if (payload && payload.policy) {
        await anwFetchStorePost(window.ANW_KEYS.PARKING_POLICY, payload.policy);
        _markSynced(window.ANW_KEYS.PARKING_POLICY);
      }
    } catch (e) {
      console.warn(`[anwParkingSaveRegistry] ${e && e.message ? e.message : e}`);
    }
  })();

  return payload;
}

function anwParkingLoadPolicy() {
  const registry = anwParkingLoadRegistry();
  if (registry.policy) return registry.policy;
  const direct = anwLoad(window.ANW_KEYS.PARKING_POLICY, null);
  if (direct && typeof direct === "object") return direct;
  return null;
}

window.anwSave = anwSave;
window.anwLoad = anwLoad;
window.anwNormEmail = anwNormEmail;
window.anwIsApproved = anwIsApproved;
window.anwParkingNormalizeText = anwParkingNormalizeText;
window.anwParkingLoadRegistry = anwParkingLoadRegistry;
window.anwParkingSaveRegistry = anwParkingSaveRegistry;
window.anwParkingLoadPolicy = anwParkingLoadPolicy;
window.anwFetchStorePost = anwFetchStorePost;
window.anwFetchStoreKey = anwFetchStoreKey;
