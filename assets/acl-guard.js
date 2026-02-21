// assets/acl-guard.js
(async function () {
  "use strict";

  // Páginas públicas (não bloquear)
  const PUBLIC = new Set([
    "/",
    "/index.html",
    "/login.html",
    "/login",
    "/privacy.html",
    "/about.html",
  ]);

  function normalizePath() {
    let p = (location.pathname || "/").toLowerCase();
    if (p.length > 1 && p.endsWith("/")) {
      p = p.slice(0, -1);
    }
    return p;
  }

  function isPublic() {
    const p = normalizePath();
    return PUBLIC.has(p) || p.endsWith("/login") || p.endsWith("/login.html");
  }

  function redirectToLogin() {
    if (isPublic()) return;
    window.location.href = "/login.html";
  }

  // Se for página pública, não faz nada
  if (isPublic()) return;

  // Se o Identity não carregou, redireciona
  if (!window.netlifyIdentity) {
    redirectToLogin();
    return;
  }

  try {
    window.netlifyIdentity.init();
  } catch (e) {}

  // Espera até 1.5s para o Identity restaurar sessão
  const user = await new Promise((resolve) => {
    let finished = false;

    function done(u) {
      if (!finished) {
        finished = true;
        resolve(u || null);
      }
    }

    // Verifica imediatamente
    try {
      const current = window.netlifyIdentity.currentUser();
      if (current) return done(current);
    } catch (e) {}

    // Espera evento init
    try {
      window.netlifyIdentity.on("init", (u) => done(u));
    } catch (e) {}

    // Fallback após timeout
    setTimeout(() => {
      try {
        const current = window.netlifyIdentity.currentUser();
        done(current);
      } catch (e) {
        done(null);
      }
    }, 1500);
  });

  // Regra mínima: só exige login
  if (!user || !user.token) {
    redirectToLogin();
  }

})();
