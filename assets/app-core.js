// assets/app-core.js
// Core helpers (storage + auth + role + minimal server sync)
//
// Goals:
// - Never crash pages if ANW_KEYS is missing
// - Avoid repeated Netlify Function calls (credit saving) using TTL cache
// - Keep owner/admin recognition consistent
// - Make post-login production sync reliable (especially anw_users)

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

function anwBuildLoginUrl(reason) {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) return "login.html";
  return "login.html?reason=" + encodeURIComponent(cleanReason);
}

function anwHandleRemoteLogout(payload) {
  const reason = payload && payload.reason ? String(payload.reason) : "";
  anwClearSession();
  try { window.dispatchEvent(new CustomEvent("anw:auth-logout", { detail: { at: Date.now(), reason } })); } catch {}
  const here = String((window.location && window.location.pathname) || "");
  if (/login\.html$/i.test(here)) return;
  const target = anwBuildLoginUrl(reason);
  try { window.location.replace(target); } catch { window.location.href = target; }
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

async function anwLogout(reason) {
  const cleanReason = String(reason || "").trim();
  anwClearSession();
  anwBroadcastAuthEvent("logout", cleanReason ? { reason: cleanReason } : {});
  try {
    if (window.netlifyIdentity && window.netlifyIdentity.logout) {
      await window.netlifyIdentity.logout();
    }
  } catch {}
  const target = anwBuildLoginUrl(cleanReason);
  try { window.location.href = target; } catch {}
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

function _anwUserEmails(user) {
  return [
    user && user.email,
    user && user.userEmail,
    user && user.loginEmail,
    user && user.netlifyEmail
  ].map(anwNormEmail).filter(Boolean);
}



async function anwLoadUsersFresh(options) {
  const opts = (options && typeof options === "object") ? options : {};
  const key = ANW_KEYS.USERS;
  const email = anwNormEmail(anwGetLoggedEmail());
  try {
    if (typeof window.anwFetchStoreKey === "function") {
      const data = await window.anwFetchStoreKey(key);
      const users = Array.isArray(data) ? data : [];
      try { anwSave(key, users); } catch {}
      if (email && !anwUserRecordPresentForEmail(email, users) && !opts.allowMissing) {
        throw new Error(`Current user ${email} not found in fresh anw_users payload`);
      }
      return users;
    }
  } catch (e) {
    if (!opts.silent) {
      console.warn("[anwLoadUsersFresh]", e && e.message ? e.message : e);
    }
    if (opts.throwOnError) throw e;
  }
  const cached = anwLoad(key, []);
  return Array.isArray(cached) ? cached : [];
}

function anwGetLoggedProfile() {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return null;

    const users = anwLoad(ANW_KEYS.USERS, []);
    if (!Array.isArray(users)) return null;

    return users.find((u) => _anwUserEmails(u).includes(email)) || null;
  } catch {
    return null;
  }
}

function anwHasApprovedAccess() {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return false;
    if (anwIsMasterEmail(email)) return true;

    const me = anwGetLoggedProfile();
    return anwIsApproved(me);
  } catch {
    return false;
  }
}

function anwGetLoggedRole() {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return "resident";

    if (anwIsMasterEmail(email)) return "owner";

    const me = anwGetLoggedProfile();
    if (!me || !anwIsApproved(me)) return "resident";

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

async function anwWaitForIdentityToken(timeoutMs) {
  const started = Date.now();
  const limit = Number(timeoutMs || 8000);
  while ((Date.now() - started) < limit) {
    try {
      const token = await anwGetIdentityToken();
      if (token) return token;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  return null;
}

async function anwFetchStoreKey(key) {
  let token = await anwGetIdentityToken();
  if (!token) token = await anwWaitForIdentityToken(8000);
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

function anwUserRecordPresentForEmail(email, usersValue) {
  const norm = anwNormEmail(email);
  const users = Array.isArray(usersValue) ? usersValue : [];
  if (!norm || !users.length) return false;
  return users.some((u) => _anwUserEmails(u).includes(norm));
}

function anwNormalizeUsersPayload(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.users)) return data.users;
    if (data.me && typeof data.me === "object") return [data.me];
  }
  return null;
}

// Public: sync keys (default: acl + anw_users)
// options:
// - force: bypass TTL for all requested keys
// - forceKeys: array of keys to bypass TTL selectively
// - requireKeys: array of keys that must be fetched successfully or an error is thrown
window.anwSyncFromServer = async function(keys, ttlMs, options){
  const list = Array.isArray(keys) && keys.length ? keys : [ANW_KEYS.ACL, ANW_KEYS.USERS];
  const ttl = Number.isFinite(ttlMs) ? ttlMs : 10 * 60 * 1000;
  const opts = (options && typeof options === "object") ? options : {};
  const forceAll = !!opts.force;
  const forceKeys = new Set(Array.isArray(opts.forceKeys) ? opts.forceKeys : []);
  const requireKeys = new Set(Array.isArray(opts.requireKeys) ? opts.requireKeys : []);

  const email = anwNormEmail(anwGetLoggedEmail());
  if (!email) return { ok: false, reason: "no-email" };

  const failures = [];

  for (const k of list) {
    const shouldBypassTtl = forceAll || forceKeys.has(k);

    if (!shouldBypassTtl && !_shouldSync(k, ttl)) {
      if (k === ANW_KEYS.USERS) {
        const cachedUsers = anwLoad(k, []);
        if (anwUserRecordPresentForEmail(email, cachedUsers)) {
          continue;
        }
      } else {
        continue;
      }
    }

    try {
      const data = await anwFetchStoreKey(k);

      if (k === ANW_KEYS.USERS) {
        const normalizedUsers = anwNormalizeUsersPayload(data);
        if (!Array.isArray(normalizedUsers)) {
          throw new Error("Invalid anw_users payload");
        }
        anwSave(k, normalizedUsers);
        if (!anwUserRecordPresentForEmail(email, normalizedUsers)) {
          throw new Error(`Current user ${email} not found in anw_users payload`);
        }
      } else {
        anwSave(k, data);
      }
      _markSynced(k);
    } catch (e) {
      failures.push({ key: k, error: e });
      console.warn(`[anwSyncFromServer] ${e && e.message ? e.message : e}`);
    }
  }

  const blockingFailure = failures.find((f) => requireKeys.has(f.key));
  if (blockingFailure) {
    throw blockingFailure.error;
  }

  return { ok: failures.length === 0, failures };
};

async function anwInitStore(options) {
  try {
    const opts = (options && typeof options === "object") ? options : {};
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return { ok: false, reason: "no-email" };

    const cachedUsers = anwLoad(ANW_KEYS.USERS, []);
    const mustForceUsers = !!opts.force || !anwUserRecordPresentForEmail(email, cachedUsers);

    return await window.anwSyncFromServer(
      [ANW_KEYS.ACL, ANW_KEYS.USERS, ANW_KEYS.PARKING_REGISTRY, ANW_KEYS.PARKING_POLICY],
      mustForceUsers ? 0 : undefined,
      {
        forceKeys: mustForceUsers ? [ANW_KEYS.USERS, ANW_KEYS.ACL] : [],
        requireKeys: [ANW_KEYS.USERS]
      }
    );
  } catch (e) {
    console.warn("Erro ao inicializar store:", e);
    throw e;
  }
}

function anwBindIdentitySync() {
  if (window.__anwIdentitySyncBound) return;
  window.__anwIdentitySyncBound = true;

  const onAuthEvent = (payload) => {
    const type = String(payload && payload.type || "").toLowerCase();
    if (type === "logout") {
      anwHandleRemoteLogout(payload);
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
        try { await anwInitStore({ force: true }); } catch (e) { console.warn("Erro pós-login ao sincronizar store:", e); }
      });

      window.netlifyIdentity.on("logout", () => {
        anwClearSession();
        anwBroadcastAuthEvent("logout");
      });

      window.netlifyIdentity.on("init", async (user) => {
        const email = anwNormEmail(user && user.email);
        if (email) {
          anwSave(ANW_KEYS.SESSION, { email });
          try { await anwInitStore(); } catch (e) { console.warn("Erro ao sincronizar store no init:", e); }
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
    return users.find((u) => _anwUserEmails(u).includes(email)) || null;
  } catch {
    return null;
  }
};

window.anwGetCurrentUserProfileFresh = async function (options) {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return null;
    const users = await anwLoadUsersFresh(options || {});
    if (!Array.isArray(users)) return null;
    return users.find((u) => _anwUserEmails(u).includes(email)) || null;
  } catch {
    return null;
  }
};

window.anwUpsertMyProfile = async function (profile) {
  return await anwFetchStorePost(ANW_KEYS.USERS, profile || {});
};

window.anwAdminSaveUsers = async function (usersArray) {
  return await anwFetchStorePost(ANW_KEYS.USERS, usersArray || []);
};

async function anwFetchStorePost(key, payload) {
  let token = await anwGetIdentityToken();
  if (!token) token = await anwWaitForIdentityToken(8000);
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
// Global idle logout
// ---------------------------
const ANW_IDLE_LOGOUT_MS = 10 * 60 * 1000;

function anwHasAuthenticatedSession() {
  try {
    if (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === "function") {
      if (window.netlifyIdentity.currentUser()) return true;
    }
  } catch {}

  try {
    return !!anwGetLoggedEmail();
  } catch {
    return false;
  }
}

function anwStartIdleLogout() {
  if (window.__anwIdleLogoutStarted) return;
  window.__anwIdleLogoutStarted = true;

  let idleTimer = null;
  let lastActivityAt = Date.now();

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function doIdleLogout() {
    clearIdleTimer();
    if (!anwHasAuthenticatedSession()) return;
    try {
      window.dispatchEvent(new CustomEvent("anw:idle-timeout", {
        detail: { at: Date.now(), idleMs: Date.now() - lastActivityAt }
      }));
    } catch {}
    anwLogout("idle");
  }

  function scheduleIdleLogout() {
    clearIdleTimer();
    if (!anwHasAuthenticatedSession()) return;
    const elapsed = Date.now() - lastActivityAt;
    const remaining = Math.max(0, ANW_IDLE_LOGOUT_MS - elapsed);
    idleTimer = setTimeout(doIdleLogout, remaining);
  }

  function markActivity() {
    if (!anwHasAuthenticatedSession()) {
      clearIdleTimer();
      return;
    }
    lastActivityAt = Date.now();
    scheduleIdleLogout();
  }

  const activityEvents = [
    "click",
    "keydown",
    "mousemove",
    "mousedown",
    "scroll",
    "touchstart",
    "pointerdown"
  ];

  activityEvents.forEach((eventName) => {
    try {
      window.addEventListener(eventName, markActivity, { passive: true, capture: true });
    } catch {
      try { window.addEventListener(eventName, markActivity, true); } catch {}
    }
  });

  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastActivityAt;
        if (anwHasAuthenticatedSession() && elapsed >= ANW_IDLE_LOGOUT_MS) {
          doIdleLogout();
        } else {
          scheduleIdleLogout();
        }
      }
    });
  } catch {}

  try { window.addEventListener("anw:auth-logout", clearIdleTimer); } catch {}
  try { window.addEventListener("focus", scheduleIdleLogout); } catch {}

  scheduleIdleLogout();
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

  try {
    anwStartIdleLogout();
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
  return Object.assign(anwParkingBaseRegistry(), data || {}, {
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
window.anwGetLoggedEmail = anwGetLoggedEmail;
window.anwIsApproved = anwIsApproved;
window.anwParkingNormalizeText = anwParkingNormalizeText;
window.anwParkingLoadRegistry = anwParkingLoadRegistry;
window.anwParkingSaveRegistry = anwParkingSaveRegistry;
window.anwParkingLoadPolicy = anwParkingLoadPolicy;
window.anwFetchStorePost = anwFetchStorePost;
window.anwFetchStoreKey = anwFetchStoreKey;
window.anwGetUserEmails = _anwUserEmails;
window.anwLoadUsersFresh = anwLoadUsersFresh;
window.anwGetLoggedProfile = anwGetLoggedProfile;
window.anwHasApprovedAccess = anwHasApprovedAccess;
window.anwWaitForIdentityToken = anwWaitForIdentityToken;
window.anwInitStore = anwInitStore;
window.anwLogout = anwLogout;
window.anwStartIdleLogout = anwStartIdleLogout;
