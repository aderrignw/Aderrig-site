/* =========================
   Netlify Identity Bootstrap (Aderrig NW)
   =========================
   - Initializes Netlify Identity widget
   - Provides helpers: anwOpenLogin, anwOpenSignup, anwLogout
   - Redirects after login/logout
   - Enforces auth on pages where: window.ANW_REQUIRE_AUTH = true
*/

(function () {
  "use strict";

  function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("return");
  }

  function go(url) {
    window.location.href = url;
  }

  // ---------------------------------------------
  // Optional "Friendly Gate" (NO hard lock)
  // - Keeps pages open for testing
  // - When enabled: intercept clicks on links marked data-requires-auth="1"
  //   and shows a modal prompting Login/Register.
  // Enable by setting: window.ANW_FRIENDLY_GATE = true
  // ---------------------------------------------
  function isLoggedIn(){
    try{ return !!(window.netlifyIdentity && window.netlifyIdentity.currentUser()); }
    catch(e){ return false; }
  }

  function ensureGateStyles(){
    if (document.getElementById("anwGateStyles")) return;
    const st = document.createElement("style");
    st.id = "anwGateStyles";
    st.textContent = `
      .anw-modal-backdrop{position:fixed;inset:0;background:rgba(17,24,39,.55);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9999;}
      .anw-modal{width:min(560px,100%);}
      .anw-modal .actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;}
      .anw-modal p{margin:0 0 10px;}
    `;
    document.head.appendChild(st);
  }

  function closeGate(){
    const el = document.getElementById("anwAuthGateBackdrop");
    if (el) el.remove();
  }

  function showGate(nextUrl){
    ensureGateStyles();
    closeGate();

    const backdrop = document.createElement("div");
    backdrop.className = "anw-modal-backdrop";
    backdrop.id = "anwAuthGateBackdrop";
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeGate(); });

    const card = document.createElement("div");
    card.className = "card anw-modal";
    card.innerHTML = `
      <h3 style="margin-top:0;">Access restricted</h3>
      <p class="muted">This area is available to registered members of the Aderrig Neighbourhood Watch. Please log in or register to continue.</p>
      <div class="actions">
        <button type="button" class="btn btn-line" id="anwGateCancel">Cancel</button>
        <button type="button" class="btn btn-line" id="anwGateSignup">Register</button>
        <button type="button" class="btn" id="anwGateLogin">Login</button>
      </div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    document.getElementById("anwGateCancel").addEventListener("click", closeGate);
    document.getElementById("anwGateLogin").addEventListener("click", () => {
      try{ sessionStorage.setItem("anw_post_login_redirect", nextUrl); }catch(e){}
      if (window.netlifyIdentity) window.netlifyIdentity.open("login");
      closeGate();
    });
    document.getElementById("anwGateSignup").addEventListener("click", () => {
      try{ sessionStorage.setItem("anw_post_login_redirect", nextUrl); }catch(e){}
      if (window.netlifyIdentity) window.netlifyIdentity.open("signup");
      closeGate();
    });
  }

  function enableFriendlyGate(){
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[data-requires-auth="1"]');
      if (!a) return;
      if (isLoggedIn()) return;
      e.preventDefault();
      const href = a.getAttribute("href") || "";
      showGate(href);
    });

    try{
      window.netlifyIdentity.on("login", () => {
        const next = sessionStorage.getItem("anw_post_login_redirect");
        if (next){
          sessionStorage.removeItem("anw_post_login_redirect");
          go(next);
        }
      });
    }catch(e){}
  }


  // Public helpers (use these on buttons/links if you want)
  window.anwOpenLogin = function () {
    if (window.netlifyIdentity) window.netlifyIdentity.open("login");
  };

  window.anwOpenSignup = function () {
    if (window.netlifyIdentity) window.netlifyIdentity.open("signup");
  };

  window.anwLogout = function () {
    if (window.netlifyIdentity) window.netlifyIdentity.logout();
  };


  // Optional friendly gate (keeps pages open; only intercepts nav clicks)
  if (window.ANW_FRIENDLY_GATE) {
    enableFriendlyGate();
  }

  // Widget must exist
  if (!window.netlifyIdentity) {
    console.warn("Netlify Identity widget not loaded.");
    return;
  }

  window.netlifyIdentity.on("init", (user) => {
    const requireAuth = !!window.ANW_REQUIRE_AUTH;
    const path = (window.location.pathname || "").toLowerCase();

    // If page requires auth and no user -> send to login with return
    if (requireAuth && !user) {
      const ret = encodeURIComponent(window.location.pathname + window.location.search);
      go("/login.html?return=" + ret);
      return;
    }

    // If already logged in and on login page -> go to dashboard (or return)
    if (user && (path.endsWith("/login.html") || path === "/login.html")) {
      const ret = getReturnUrl();
      go(ret ? ret : "/dashboard.html");
      return;
    }
  });

  window.netlifyIdentity.on("login", () => {
    const ret = getReturnUrl();
    go(ret ? ret : "/dashboard.html");
  });

  window.netlifyIdentity.on("logout", () => {
    go("/index.html");
  });

  // Start
  window.netlifyIdentity.init();
})();
