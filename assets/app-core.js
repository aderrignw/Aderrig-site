// assets/app-core.js

/* ===========================
   STORAGE HELPERS
=========================== */

function anwSave(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

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

/* ===========================
   AUTH SESSION
=========================== */

function anwIsLoggedIn() {
  const session = anwLoad('anw_session', null);
  return !!(session && session.email);
}

function anwGetSession() {
  return anwLoad('anw_session', null);
}

function anwLogout() {
  localStorage.removeItem('anw_session');
  window.location.href = 'login.html';
}

/* ===========================
   ROLE RESOLUTION (CORRIGIDO)
=========================== */

function anwGetLoggedRole() {
  try {
    const session = anwLoad('anw_session', null);
    if (!session || !session.email) return 'resident';

    const users = anwLoad('anw_users', []);
    if (!Array.isArray(users)) return 'resident';

    const email = session.email.toLowerCase().trim();

    const found = users.find(u =>
      u.email &&
      u.email.toLowerCase().trim() === email
    );

    if (!found) return 'resident';

    // 🔥 PRIORIDADE TOTAL PARA OWNER
    if (found.role === 'owner') return 'owner';

    return found.role || 'resident';

  } catch (e) {
    console.warn('Erro ao obter role do usuário:', e);
    return 'resident';
  }
}

/* ===========================
   STORE INIT (IMPORTANTE)
=========================== */

async function anwInitStore() {
  try {
    // Se você estiver usando Netlify Functions para sincronizar:
    if (window.anwSyncFromServer) {
      await window.anwSyncFromServer();
    }
  } catch (e) {
    console.warn('Erro ao inicializar store:', e);
  }
}

/* ===========================
   UI HELPERS
=========================== */

function anwDisplayLoggedUser() {
  const el = document.getElementById('anw-logged-user');
  if (!el) return;

  const session = anwGetSession();
  if (session && session.email) {
    el.textContent = session.email;
  } else {
    el.textContent = '';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await anwInitStore();   // 🔥 Garante que dados foram carregados
  anwDisplayLoggedUser();
});
