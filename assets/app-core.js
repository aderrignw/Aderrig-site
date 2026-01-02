/* =========================
   Aderrig NW - App Core
   Fonte única de dados
   ========================= */

(function (window) {
  'use strict';

  // -------------------------
  // Keys (Netlify Blobs KV)
  // -------------------------
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
    PROJECTS: 'anw_projects'
  };

  
  // -------------------------
  // Storage helpers
  // -------------------------

  // Central store: Netlify Functions + Blobs (KV)
  // - No localStorage persistence for data
  // - Keep an in-memory cache so pages can read synchronously
  const __ANW_CACHE = Object.create(null);
  const __STORE_URL = '/.netlify/functions/store';

  async function anwFetchKey(key) {
    const res = await fetch(__STORE_URL + '?key=' + encodeURIComponent(key), {
      method: 'GET',
      headers: { 'accept': 'application/json' }
    });
    if (!res.ok) {
      throw new Error('KV GET failed: ' + res.status);
    }
    const data = await res.json();
    return data && Object.prototype.hasOwnProperty.call(data, 'value') ? data.value : null;
  }

  async function __anwPutKey(key, value) {
    const res = await fetch(__STORE_URL + '?key=' + encodeURIComponent(key), {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(value === undefined ? null : value)
    });
    if (!res.ok) {
      throw new Error('KV PUT failed: ' + res.status);
    }
    return await res.json().catch(() => ({}));
  }

  // Preload keys into memory cache so code can use anwLoad() synchronously.
  async function anwInitStore() {
    const keys = Object.values(ANW_KEYS);
    await Promise.all(keys.map(async (k) => {
      try {
        const v = await anwFetchKey(k);
        __ANW_CACHE[k] = v;
      } catch (e) {
        // Keep undefined if fetch fails; callers will receive fallbacks.
      }
    }));
  }

  function anwLoad(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(__ANW_CACHE, key)) {
      const v = __ANW_CACHE[key];
      return (v === null || v === undefined) ? fallback : v;
    }
    return fallback;
  }

  // Save to cache and persist to KV. Returns a Promise (safe if not awaited).
  async function anwSave(key, value) {
    __ANW_CACHE[key] = value;
    try {
      await __anwPutKey(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

// -------------------------
  // Session helpers
  // -------------------------
  function anwNormEmail(v) {
    return String(v || '').trim().toLowerCase();
  }

  function anwGetLoggedEmail() {
    return anwNormEmail(anwLoad(ANW_KEYS.LOGGED, ''));
  }

  function anwSetLoggedEmail(email) {
    anwSave(ANW_KEYS.LOGGED, anwNormEmail(email));
  }

  function anwLogout() {
    anwSave(ANW_KEYS.LOGGED, null);
  }

  // -------------------------
  // Approval helpers
  // -------------------------
  function anwIsApproved(user) {
    if (!user) return false;
    const st = String(user.status || '').toLowerCase();
    return st === 'approved' || st === 'active';
  }

  // -------------------------
  // Registration helper
  // -------------------------
  function anwNextRegId(users) {
    let max = 0;
    (users || []).forEach(u => {
      if (u.regId) {
        const n = parseInt(String(u.regId).replace(/\D/g, ''), 10);
        if (!isNaN(n)) max = Math.max(max, n);
      }
    });
    return 'ANW-' + String(max + 1).padStart(4, '0');
  }

  // -------------------------
  // BOOTSTRAP PROJECTS
  // (safe initial data)
  // -------------------------
  (function bootstrapProjects() {
    const existing = anwLoad(ANW_KEYS.PROJECTS, null);
    if (Array.isArray(existing) && existing.length) return;

    const initialProjects = [
      {
        id: 'PRJ-001',
        title: 'Community Clean-up',
        description:
          'Monthly community clean-up initiative to keep Aderrig neighbourhood safe, tidy and welcoming.',
        startDate: '2025-02-01',
        endDate: ''
      },
      {
        id: 'PRJ-002',
        title: 'Neighbourhood Lighting Review',
        description:
          'Review of street lighting issues in collaboration with residents and local council.',
        startDate: '2025-03-01',
        endDate: ''
      }
    ];

    anwSave(ANW_KEYS.PROJECTS, initialProjects);
  })();

  // -------------------------
  // Expose API
  // -------------------------
  window.ANW_KEYS = ANW_KEYS;
  window.anwLoad = anwLoad;
  window.anwSave = anwSave;
  window.anwInitStore = anwInitStore;
  window.anwFetchKey = anwFetchKey;
  window.anwNormEmail = anwNormEmail;
  window.anwGetLoggedEmail = anwGetLoggedEmail;
  window.anwSetLoggedEmail = anwSetLoggedEmail;
  window.anwLogout = anwLogout;
  window.anwIsApproved = anwIsApproved;
  window.anwNextRegId = anwNextRegId;

})(window);
