// assets/acl-guard.js
// Guard de acesso baseado em ACL + role do usuário

(function () {
  function getLoggedRoleSafe() {
    try {
      if (typeof anwGetLoggedRole === 'function') {
        return anwGetLoggedRole() || 'resident';
      }
      return 'resident';
    } catch (e) {
      console.warn('Erro ao obter role:', e);
      return 'resident';
    }
  }

  function isLoggedIn() {
    try {
      if (typeof anwIsLoggedIn === 'function') {
        return !!anwIsLoggedIn();
      }
      return false;
    } catch {
      return false;
    }
  }

  async function loadAclFresh() {
    try {
      if (typeof anwInitStore === 'function') {
        await anwInitStore(); // 🔥 GARANTE que anw_users foi carregado antes de qualquer checagem
      }

      if (typeof anwLoad === 'function') {
        return await anwLoad('acl', {});
      }

      return {};
    } catch (e) {
      console.warn('Erro ao carregar ACL:', e);
      return {};
    }
  }

  function pageKeyFromMeta() {
    const meta = document.querySelector('meta[name="anw-page"]');
    return meta ? meta.getAttribute('content') : null;
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
        if (role !== rule && role !== 'owner') {
          el.style.display = 'none';
        }
      }
    });
  }

  function applyFeatureAcl(acl, role) {
    document.querySelectorAll('[data-feature-acl]').forEach(el => {
      const rule = el.getAttribute('data-feature-acl');
      if (!rule) return;

      if (rule === 'Public') return;

      if (rule === 'Authenticated' && !isLoggedIn()) {
        el.style.display = 'none';
        return;
      }

      if (role !== rule && role !== 'owner') {
        el.style.display = 'none';
      }
    });
  }

  function enforcePageAcl(acl, role) {
    const pageKey = pageKeyFromMeta();
    const rule = classifyPage(pageKey, acl);

    if (rule === 'Public') return;

    if (rule === 'Authenticated') {
      if (!isLoggedIn()) {
        location.replace('login.html');
      }
      return;
    }

    // 🔥 OWNER agora tem acesso total
    if (role !== rule && role !== 'owner') {
      location.replace('dashboard.html');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {

    // 🔥 CORREÇÃO CRÍTICA:
    // Primeiro carrega store (anw_users), depois calcula role
    const acl = await loadAclFresh();
    const role = getLoggedRoleSafe();

    applyNavAcl(acl || {}, role);
    applyFeatureAcl(acl || {}, role);
    enforcePageAcl(acl || {}, role);

  });
})();
