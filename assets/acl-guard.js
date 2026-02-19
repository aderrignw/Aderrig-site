/* =========================================================
   Aderrig NW — ACL Guard (Access Control Heart)
   Purpose:
   - Provide anwGetAcl / anwSetAcl for Admin UI
   - Enforce page access (redirect if not allowed)
   - Hide/label nav items based on ACL
   - Gate feature-level UI via data-acl-feature
   ========================================================= */

(function () {
  'use strict';

  // Local file preview (file://) cannot use Netlify Identity/Functions.
  // In this mode we do NOT enforce ACL nor hide nav items.
  if (location && location.protocol === 'file:') {
    return;
  }


  const KEY_ACL = (window.ANW_KEYS && window.ANW_KEYS.ACL) ? window.ANW_KEYS.ACL : 'anw_acl';

  const PAGE_LABELS_STATIC = {
    'page:home': 'Public',
    'page:about': 'Public',
    'page:privacy': 'Public',
    'page:login': 'Public'
  };

  // Map href -> ACL page key (used for nav filtering)
  const HREF_TO_PAGE = {
    'index.html': 'page:home',
    'about.html': 'page:about',
    'privacy.html': 'page:privacy',
    'login.html': 'page:login',
    'dashboard.html': 'page:dashboard',
    'report.html': 'page:report',
    'report-map.html': 'page:report-map',
    'alerts.html': 'page:alerts',
    'projects.html': 'page:projects',
    'handbook.html': 'page:handbook',
    'household.html': 'page:household',
    'admin.html': 'page:admin'
  };

  function uniq(arr) {
    return Array.from(new Set((arr || []).map(String)));
  }

  function asRoleList(v) {
    if (Array.isArray(v)) return uniq(v);
    if (!v) return [];
    // allow csv in case someone pastes
    return uniq(String(v).split(',').map(s => s.trim()).filter(Boolean));
  }

  function getLoggedRoleSafe() {
    try {
      return (typeof window.anwGetLoggedRole === 'function') ? window.anwGetLoggedRole() : 'resident';
    } catch {
      return 'resident';
    }
  }

  function isLoggedIn() {
    try {
      return !!(window.netlifyIdentity && window.netlifyIdentity.currentUser());
    } catch {
      return false;
    }
  }

  function pageKeyFromMeta() {
    const m = document.querySelector('meta[name="anw-acl-key"]');
    return m ? String(m.getAttribute('content') || '').trim() : '';
  }

  function loadAclSync() {
    try {
      if (typeof window.anwLoad === 'function') {
        return window.anwLoad(KEY_ACL, {}) || {};
      }
    } catch {}
    return {};
  }

  async function loadAclFresh() {
    // Ensure store cache is present
    if (typeof window.anwInitStore === 'function') {
      try { await window.anwInitStore(); } catch { /* ignore */ }
    }

    // Prefer KV fetch when possible (keeps cache fresh)
    if (typeof window.anwFetchKey === 'function') {
      try {
        const v = await window.anwFetchKey(KEY_ACL);
        return v || loadAclSync();
      } catch {
        return loadAclSync();
      }
    }
    return loadAclSync();
  }

  async function setAcl(matrix) {
    const m = (matrix && typeof matrix === 'object') ? matrix : {};
    if (typeof window.anwSave !== 'function') {
      throw new Error('anwSave not available');
    }
    await window.anwSave(KEY_ACL, m);
    return true;
  }

  // Export functions used by admin.html
  window.anwGetAclSync = loadAclSync;
  window.anwGetAcl = loadAclFresh;
  window.anwSetAcl = setAcl;

  function classifyPage(pageKey, acl) {
    if (PAGE_LABELS_STATIC[pageKey]) return PAGE_LABELS_STATIC[pageKey];
    const allowed = asRoleList(acl[pageKey]);
    // If only admin-ish roles -> Exclusive
    if (allowed.length && !allowed.includes('resident') && (allowed.includes('admin') || allowed.includes('owner'))) {
      return 'Exclusive';
    }
    // Default for everything else that isn't explicitly public
    return 'Private';
  }

  function applyNavAcl(acl, role) {
    const links = Array.from(document.querySelectorAll('nav a[href]'));
    links.forEach(a => {
      const href = (a.getAttribute('href') || '').trim();
      const pageKey = HREF_TO_PAGE[href];
      if (!pageKey) return;

      const allowed = asRoleList(acl[pageKey]);
      const label = classifyPage(pageKey, acl);

      // (nav badges disabled)

      // IMPORTANT: Do NOT hide navigation items.
      // Keep all main tabs visible so the site structure is consistent.
      // Page-level enforcement (redirect to login) still protects access.
      // We only mark locked links for optional styling.
      const locked = (allowed.length && !allowed.includes(role));
      if (locked) {
        a.classList.add('anw-acl-locked');
        a.setAttribute('data-acl-locked', 'true');
      } else {
        a.classList.remove('anw-acl-locked');
        a.removeAttribute('data-acl-locked');
      }
    });
  }

  function applyFeatureAcl(acl, role) {
    const nodes = Array.from(document.querySelectorAll('[data-acl-feature]'));
    nodes.forEach(el => {
      const key = String(el.getAttribute('data-acl-feature') || '').trim();
      if (!key) return;
      const allowed = asRoleList(acl[key]);
      const ok = !allowed.length || allowed.includes(role);

      if (!ok) {
        // Prefer hide; fallback disable
        el.classList.add('anw-acl-hidden');
        el.setAttribute('aria-hidden', 'true');
        if (el.matches('button, a, input, select, textarea')) {
          el.setAttribute('disabled', 'disabled');
          el.setAttribute('aria-disabled', 'true');
          if (el.matches('a')) el.setAttribute('href', '#');
        }
      } else {
        el.classList.remove('anw-acl-hidden');
        el.removeAttribute('aria-hidden');
        el.removeAttribute('disabled');
        el.removeAttribute('aria-disabled');
      }
    });
  }

  function enforcePageAcl(acl, role) {
    const pageKey = pageKeyFromMeta();
    if (!pageKey) return;

    const allowed = asRoleList(acl[pageKey]);

    // If ACL doesn't define the page, do not block (safer for rollout)
    if (!allowed.length) return;

    if (!allowed.includes(role)) {
      // Decide where to send the user
      const target = (pageKey === 'page:login' || pageKey === 'page:home' || pageKey === 'page:about' || pageKey === 'page:privacy')
        ? 'index.html'
        : 'login.html';

      // Avoid redirect loops
      if (!location.pathname.endsWith(target)) {
        location.replace(target);
      }
    }
  }

  // Run once DOM is ready
  document.addEventListener('DOMContentLoaded', async () => {
    const role = getLoggedRoleSafe();

    // If user is not logged in, we still label/hide Exclusive pages
    // For Private pages, Functions will deny data access; ACL redirect helps UX.
    const acl = await loadAclFresh();

    applyNavAcl(acl || {}, role);
    applyFeatureAcl(acl || {}, role);

    // If page requires auth and user isn't logged in, redirect (except public pages)
    const pageKey = pageKeyFromMeta();
    const label = classifyPage(pageKey, acl || {});
    if (label !== 'Public' && !isLoggedIn()) {
      if (!location.pathname.endsWith('login.html')) {
        location.replace('login.html');
        return;
      }
    }

    enforcePageAcl(acl || {}, role);
  });

})();
