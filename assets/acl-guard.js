(function () {
  function getLoggedRoleSafe() {
    try {
      if (typeof anwGetLoggedRole === 'function') return anwGetLoggedRole() || 'resident';
      return 'resident';
    } catch (e) {
      console.warn('Erro ao obter role:', e);
      return 'resident';
    }
  }

  function isLoggedIn() {
    try {
      if (typeof anwIsLoggedIn === 'function') return !!anwIsLoggedIn();
      return !!(window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === 'function' && window.netlifyIdentity.currentUser());
    } catch {
      return false;
    }
  }

  async function loadAclFresh() {
    try {
      if (typeof anwInitStore === 'function') await anwInitStore();
      if (typeof anwLoad === 'function') return anwLoad((window.ANW_KEYS && ANW_KEYS.ACL) ? ANW_KEYS.ACL : 'acl', {});
      return {};
    } catch (e) {
      console.warn('Erro ao carregar ACL:', e);
      return {};
    }
  }

  function pageKeyFromMeta() {
    const meta1 = document.querySelector('meta[name="anw-acl-key"]');
    if (meta1 && meta1.getAttribute('content')) return meta1.getAttribute('content');

    const meta2 = document.querySelector('meta[name="anw-page"]');
    if (meta2 && meta2.getAttribute('content')) return meta2.getAttribute('content');

    return null;
  }

  function classifyPage(pageKey, acl) {
    if (!pageKey) return 'Public';
    if (!acl || !acl[pageKey]) return 'Public';
    return acl[pageKey];
  }

  function applyNavAcl(acl, role) {
    document.querySelectorAll('[data-acl]').forEach(el => {
      const rule = el.getAttribute('data-acl');
      if (!rule) return;

      if (rule === 'Public') return;

      if (rule === 'Authenticated' && !isLoggedIn()) {
        el.style.display = 'none';
        return;
      }

      if (rule !== 'Public' && rule !== 'Authenticated') {
        if (role !== rule && role !== 'owner') el.style.display = 'none';
      }
    });
  }

  function applyFeatureAcl(acl, role) {
    const nodes = [
      ...Array.from(document.querySelectorAll('[data-acl-feature]')),
      ...Array.from(document.querySelectorAll('[data-feature-acl]'))
    ];

    nodes.forEach(el => {
      const rule = el.getAttribute('data-acl-feature') || el.getAttribute('data-feature-acl');
      if (!rule) return;

      if (rule === 'Public') return;

      if (rule === 'Authenticated' && !isLoggedIn()) {
        el.style.display = 'none';
        return;
      }

      if (rule !== 'Public' && rule !== 'Authenticated') {
        if (role !== rule && role !== 'owner') el.style.display = 'none';
      }
    });
  }

  function enforcePageAcl(acl, role) {
    const pageKey = pageKeyFromMeta();
    const rule = classifyPage(pageKey, acl);

    if (rule === 'Public') return;

    if (rule === 'Authenticated') {
      if (!isLoggedIn()) location.replace('login.html');
      return;
    }

    if (role !== rule && role !== 'owner') location.replace('dashboard.html');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const acl = await loadAclFresh();
    const role = getLoggedRoleSafe();

    applyNavAcl(acl || {}, role);
    applyFeatureAcl(acl || {}, role);
    enforcePageAcl(acl || {}, role);
  });
})();
