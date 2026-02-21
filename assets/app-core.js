/* =========================
   Aderrig NW - App Core (SECURED)
   ========================= */

(function () {
  'use strict';

  const __STORE_URL = '/.netlify/functions/store';

  const ANW_KEYS = {
    USERS: 'anw_users',
    LOGGED: 'anw_logged',
    TASKS: 'anw_tasks',
    ALERTS: 'anw_alerts',
    CONTACTS: 'anw_contacts',
    ELECTION_SETTINGS: 'anw_election_settings',
    ELECTIONS: 'anw_elections',
    TEAM_VOTES: 'anw_team_votes',
    VOTES: 'anw_votes',
    INCIDENTS: 'anw_incidents',
    PROJECTS: 'anw_projects',
    PROJECT_MONITORING: 'anw_project_monitoring',
    NOTICES: 'anw_notices',
    HANDBOOK: 'anw_handbook',
    ACL: 'anw_acl'
  };

  const __ANW_CACHE = {};

    const ANW_MEMBER_ROLES = [
    'resident',
    'volunteer',
    'street_admin',
    'area_coordinator',
    'aux_coordinator',
    'project_support',
    'platform_support',
    'owner',
    'admin'
  ];

  // Roles allowed on public pages (includes anonymous visitors)
  const ANW_PUBLIC_ROLES = ['public', ...ANW_MEMBER_ROLES];


  const ANW_ACL_DEFAULT = {
    // Pages
    'page:home': ANW_PUBLIC_ROLES,
    'page:about': ANW_PUBLIC_ROLES,
    'page:privacy': ANW_PUBLIC_ROLES,
    'page:login': ANW_PUBLIC_ROLES,

    // Private (requires active membership at the Functions layer)
    'page:dashboard': ANW_MEMBER_ROLES,
    'page:report': ANW_MEMBER_ROLES,
    'page:report-map': ANW_MEMBER_ROLES,
    'page:alerts': ANW_PUBLIC_ROLES,
    'page:projects': ANW_MEMBER_ROLES,
    'page:handbook': ANW_MEMBER_ROLES,
    'page:household': ANW_MEMBER_ROLES,

    // Exclusive / admin-only by default
    'page:admin': ['owner','admin','platform_support','project_support','street_admin','volunteer'],

    // Dashboard sub-tabs (optional fine-grained control)
    'dashboard:tab_profile': ANW_MEMBER_ROLES,
    'dashboard:tab_interest': ANW_MEMBER_ROLES,
    'dashboard:tab_elections': ANW_MEMBER_ROLES,
    'dashboard:tab_notices': ANW_MEMBER_ROLES,
    'dashboard:tab_garda': ANW_MEMBER_ROLES,

    // Feature flags (optional fine-grained control)
    'alerts:tab_send': ANW_MEMBER_ROLES,
    'alerts:tab_contacts': ['admin','owner','area_coordinator','aux_coordinator','street_admin'],
    // =========================
    // Admin tabs (controlled by Access Control table)
    // =========================
    'admin:tab_residents': ['street_admin','platform_support','owner'],
    'admin:tab_tasks': ['street_admin','platform_support','owner'],
    'admin:tab_elections': ['street_admin','platform_support','owner'],
    'admin:tab_reports': ['street_admin','platform_support','owner'],
    'admin:tab_notices': ['street_admin','platform_support','owner'],
    'admin:tab_projects_monitoring': ['project_support','volunteer','platform_support','owner'],
    'admin:tab_access_control': ['platform_support','owner'],
    'admin:tab_tools': ['platform_support','owner']

  };

  async function getIdentityToken() {
    if (!window.netlifyIdentity) return null;
    const user = window.netlifyIdentity.currentUser();
    if (!user) return null;
    try {
      return await user.jwt();
    } catch {
      return null;
    }
  }

  function anwNormEmail(v) {
    return String(v || '').trim().toLowerCase();
  }

  function anwNormalizeEircode(v) {
    return String(v || '').replace(/\s+/g, '').toUpperCase();
  }

  function anwNextRegId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  async function anwFetchKey(key, opts) {
    const token = await getIdentityToken();
    if (!token) throw new Error('Login required');

    const o = opts && typeof opts === 'object' ? opts : {};
    const qsExtra = o.qs && typeof o.qs === 'string' ? o.qs : '';
    const url = `${__STORE_URL}?key=${encodeURIComponent(key)}${qsExtra ? ('&' + qsExtra.replace(/^\&+/, '')) : ''}`;

    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'KV GET failed');
    return data.value ?? null;
  }

  async function __anwPutKey(key, value) {
    const token = await getIdentityToken();
    if (!token) throw new Error('Login required');

    const res = await fetch(`${__STORE_URL}?key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ value })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'KV PUT failed');
    return true;
  }

  async function __anwDeleteKey(key) {
    const token = await getIdentityToken();
    if (!token) throw new Error('Login required');

    const res = await fetch(`${__STORE_URL}?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('KV DELETE failed');
    return true;
  }

  async function anwInitStore(keys) {
    // Avoid spamming Functions with many requests on pages like login.
    // Default: only what is needed for auth/ACL gating.
    const wanted = Array.isArray(keys) && keys.length
      ? keys
      : [ANW_KEYS.USERS, ANW_KEYS.ACL];

    for (const k of wanted) {
      try {
        __ANW_CACHE[k] = await anwFetchKey(k);
      } catch (e) {
        // keep going; login page can render even if protected keys fail
      }
    }

    if (!Array.isArray(__ANW_CACHE[ANW_KEYS.USERS])) __ANW_CACHE[ANW_KEYS.USERS] = [];
    if (!__ANW_CACHE[ANW_KEYS.ACL]) __ANW_CACHE[ANW_KEYS.ACL] = ANW_ACL_DEFAULT;
  } catch {}
    }

    if (!Array.isArray(__ANW_CACHE[ANW_KEYS.USERS])) __ANW_CACHE[ANW_KEYS.USERS] = [];
    if (!Array.isArray(__ANW_CACHE[ANW_KEYS.INCIDENTS])) __ANW_CACHE[ANW_KEYS.INCIDENTS] = [];
    if (!Array.isArray(__ANW_CACHE[ANW_KEYS.ALERTS])) __ANW_CACHE[ANW_KEYS.ALERTS] = [];
    if (!Array.isArray(__ANW_CACHE[ANW_KEYS.NOTICES])) __ANW_CACHE[ANW_KEYS.NOTICES] = [];
    if (!Array.isArray(__ANW_CACHE[ANW_KEYS.PROJECTS])) __ANW_CACHE[ANW_KEYS.PROJECTS] = [];
    if (!__ANW_CACHE[ANW_KEYS.ACL]) __ANW_CACHE[ANW_KEYS.ACL] = ANW_ACL_DEFAULT;
  }

  
  // Refresh the minimal auth-related cache (anw_users + anw_acl).
  // Use this after login/registration or before checking approval.
  async function anwRefresh() {
    await anwInitStore([ANW_KEYS.USERS, ANW_KEYS.ACL]);
    return true;
  }

  // Ensure we have the latest anw_users from the server (triggers server-side bootstrap).
  async function anwEnsureUsersSynced() {
    try {
      __ANW_CACHE[ANW_KEYS.USERS] = await anwFetchKey(ANW_KEYS.USERS);
      if (!Array.isArray(__ANW_CACHE[ANW_KEYS.USERS])) __ANW_CACHE[ANW_KEYS.USERS] = [];
      return true;
    } catch (e) {
      if (!Array.isArray(__ANW_CACHE[ANW_KEYS.USERS])) __ANW_CACHE[ANW_KEYS.USERS] = [];
      return false;
    }
  }

  function anwLoad(key, fallback) {
    return key in __ANW_CACHE ? __ANW_CACHE[key] ?? fallback : fallback;
  }

  async function anwSave(key, value) {
    __ANW_CACHE[key] = value;
    await __anwPutKey(key, value);
    return true;
  }

  function anwGetLoggedEmail() {
    if (!window.netlifyIdentity) return '';
    const u = window.netlifyIdentity.currentUser();
    return u?.email ? anwNormEmail(u.email) : '';
  }

  function anwLogout() {
    if (window.netlifyIdentity) window.netlifyIdentity.logout();
  }

  function anwIsApproved(user) {
    return user && ['active', 'approved'].includes(String(user.status).toLowerCase());
  }

  function anwGetUserRoleByEmail(email) {
    const users = anwLoad(ANW_KEYS.USERS, []);
    const u = users.find(x => anwNormEmail(x.email) === anwNormEmail(email));
    return u?.role || 'resident';
  }

  function anwGetLoggedRole() {
    const email = anwGetLoggedEmail();
    return email ? anwGetUserRoleByEmail(email) : 'resident';
  }

  /* =========================
     UI — Custom Alerts / Toasts
     ========================= */

  const ANW_UI = (() => {
    let overlay, titleEl, bodyEl, okBtn;

    function ensure() {
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.className = 'anw-overlay';
      overlay.innerHTML = `
        <div class="anw-dialog">
          <div class="anw-dialog-head">
            <h3 class="anw-dialog-title"></h3>
          </div>
          <div class="anw-dialog-body"></div>
          <div class="anw-dialog-actions">
            <button class="btn">OK</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      titleEl = overlay.querySelector('.anw-dialog-title');
      bodyEl = overlay.querySelector('.anw-dialog-body');
      okBtn = overlay.querySelector('.btn');

      okBtn.onclick = () => overlay.classList.remove('open');
    }

    function alert(msg, title = 'Message') {
      ensure();
      titleEl.textContent = title;
      bodyEl.innerHTML = `<p>${msg}</p>`;
      overlay.classList.add('open');
    }

    function toast(msg, typeOrTimeout, maybeTimeout) {
      // Supports:
      // - toast("hi") -> default 3s
      // - toast("hi", 5000) -> 5s
      // - toast("hi", "success") -> type + default 3s
      // - toast("hi", "warn", 5000) -> type + 5s
      let type = '';
      let timeout = 3000;

      if (typeof typeOrTimeout === 'number') {
        timeout = typeOrTimeout;
      } else if (typeof typeOrTimeout === 'string') {
        type = typeOrTimeout;
        if (typeof maybeTimeout === 'number') timeout = maybeTimeout;
      }

      const t = document.createElement('div');
      t.className = 'anw-toast' + (type ? (' ' + String(type).toLowerCase()) : '');
      t.textContent = String(msg ?? '');
      document.body.appendChild(t);
      setTimeout(() => t.remove(), timeout);
    }

    return { alert, toast };
  })();

  window.ANW = window.ANW || {};
  window.ANW.ui = ANW_UI;

  window.alert = function (msg) {
    ANW_UI.alert(msg);
  };

  window.ANW_KEYS = ANW_KEYS;
  window.anwInitStore = anwInitStore;
  window.anwRefresh = anwRefresh;
  window.anwEnsureUsersSynced = anwEnsureUsersSynced;
  window.anwFetchKey = anwFetchKey;
  window.anwSave = anwSave;
  window.anwLoad = anwLoad;
  window.anwLogout = anwLogout;
  window.anwNormalizeEircode = anwNormalizeEircode;
  window.anwNextRegId = anwNextRegId;
  window.anwGetLoggedEmail = anwGetLoggedEmail;
  window.anwGetLoggedRole = anwGetLoggedRole;
  window.__anwDeleteKey = __anwDeleteKey;

})();
