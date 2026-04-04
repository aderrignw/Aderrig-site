(function () {
  "use strict";

  // Deployed site URL used ONLY for localhost development.
  // In production we automatically use window.location.origin so the same build
  // works on your Netlify subdomain and on the custom domain.
  const DEPLOYED_SITE_URL = "https://aderrignw.ie";

  const INACTIVITY_LIMIT_MS = 10 * 60 * 1000;
  const ACTIVITY_PING_MS = 15000;
  const AUTH_EVENT_KEY = "anw_auth_event";
  const AUTH_CHANNEL_NAME = "anw_auth_channel";
  const INACTIVITY_KEY = "anw_last_activity";
  const FORCE_LOGOUT_FLAG = "anw_force_logout_running";

  function isLocalhost(hostname) {
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".localhost")
    );
  }

  function initIdentity() {
    if (!window.netlifyIdentity) return;

    const hostname = (window.location && window.location.hostname) ? window.location.hostname : "";
    const isLocal = isLocalhost(hostname);

    const siteUrl = isLocal ? DEPLOYED_SITE_URL : (window.location && window.location.origin ? window.location.origin : DEPLOYED_SITE_URL);

    try {
      if (isLocal) {
        // ✅ Force Identity API to the deployed Identity endpoint to avoid local proxy timeouts/CORS issues.
        const apiUrl = siteUrl.replace(/\/+$/, "") + "/.netlify/identity";

        try { localStorage.setItem("netlifySiteURL", siteUrl); } catch (e) {}

        window.netlifyIdentity.init({ APIUrl: apiUrl });
      } else {
        window.netlifyIdentity.init();
      }
    } catch (e) {
      console.error("Netlify Identity init failed:", e);
    }
  }

  function getCurrentUser() {
    try {
      if (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === "function") {
        return window.netlifyIdentity.currentUser() || null;
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem("anw_session");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.email) return parsed;
    } catch (_) {}

    return null;
  }

  function isLoginPage() {
    const path = String((window.location && window.location.pathname) || "");
    return /login\.html$/i.test(path);
  }

  function broadcastAuthEvent(type, extra) {
    const payload = Object.assign({
      type: String(type || "sync"),
      at: Date.now(),
      href: String((window.location && window.location.href) || "")
    }, extra || {});

    try { localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify(payload)); } catch (_) {}
    try {
      if (window.BroadcastChannel) {
        if (!window.__anwAuthChannelIdentity) {
          window.__anwAuthChannelIdentity = new BroadcastChannel(AUTH_CHANNEL_NAME);
        }
        window.__anwAuthChannelIdentity.postMessage(payload);
      }
    } catch (_) {}

    return payload;
  }

  function redirectToLogin() {
    if (isLoginPage()) return;
    try { window.location.replace("login.html"); }
    catch (_) { window.location.href = "login.html"; }
  }

  async function forceGlobalLogout(reason) {
    if (window[FORCE_LOGOUT_FLAG]) return;
    window[FORCE_LOGOUT_FLAG] = true;

    try { localStorage.removeItem("anw_session"); } catch (_) {}
    broadcastAuthEvent("logout", { reason: String(reason || "inactivity") });

    try {
      if (window.netlifyIdentity && typeof window.netlifyIdentity.logout === "function") {
        await window.netlifyIdentity.logout();
      }
    } catch (_) {}

    redirectToLogin();
  }

  function startGlobalInactivityTimeout() {
    let lastPing = 0;
    let started = false;
    let checkTimer = null;

    function markActivity(source) {
      if (!getCurrentUser()) return;

      const now = Date.now();
      if (source !== "init" && now - lastPing < ACTIVITY_PING_MS) return;
      lastPing = now;

      try { localStorage.setItem(INACTIVITY_KEY, String(now)); } catch (_) {}
      try {
        if (window.BroadcastChannel) {
          if (!window.__anwActivityChannel) {
            window.__anwActivityChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
          }
          window.__anwActivityChannel.postMessage({ type: "activity", at: now });
        }
      } catch (_) {}
    }

    async function checkTimeout() {
      const user = getCurrentUser();
      if (!user) return;

      let lastActivity = 0;
      try {
        lastActivity = Number(localStorage.getItem(INACTIVITY_KEY) || 0);
      } catch (_) {}

      if (!lastActivity) {
        markActivity("init");
        return;
      }

      if (Date.now() - lastActivity >= INACTIVITY_LIMIT_MS) {
        await forceGlobalLogout("inactivity");
      }
    }

    function bindActivityListeners() {
      ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click", "focus"].forEach((evt) => {
        window.addEventListener(evt, () => markActivity(evt), { passive: true });
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") markActivity("visible");
      });
    }

    function bindCrossTabSync() {
      window.addEventListener("storage", async (event) => {
        if (event.key !== AUTH_EVENT_KEY && event.key !== INACTIVITY_KEY) return;

        if (event.key === AUTH_EVENT_KEY) {
          try {
            const payload = event.newValue ? JSON.parse(event.newValue) : null;
            if (payload && payload.type === "logout") {
              try { localStorage.removeItem("anw_session"); } catch (_) {}
              redirectToLogin();
              return;
            }
          } catch (_) {}
        }

        if (event.key === INACTIVITY_KEY) {
          lastPing = Number(event.newValue || Date.now());
        }
      });

      try {
        if (!window.__anwAuthSyncChannel) {
          window.__anwAuthSyncChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
          window.__anwAuthSyncChannel.onmessage = async (event) => {
            const payload = event && event.data ? event.data : null;
            if (!payload || !payload.type) return;
            if (payload.type === "logout") {
              try { localStorage.removeItem("anw_session"); } catch (_) {}
              redirectToLogin();
              return;
            }
            if (payload.type === "activity" && payload.at) {
              try { localStorage.setItem(INACTIVITY_KEY, String(payload.at)); } catch (_) {}
              lastPing = Number(payload.at || Date.now());
              return;
            }
          };
        }
      } catch (_) {}
    }

    function boot() {
      if (started) return;
      started = true;
      bindActivityListeners();
      bindCrossTabSync();
      markActivity("init");
      checkTimer = window.setInterval(checkTimeout, 15000);
      window.addEventListener("beforeunload", () => {
        if (checkTimer) window.clearInterval(checkTimer);
      }, { once: true });
    }

    function tryBoot() {
      if (!getCurrentUser()) return false;
      boot();
      return true;
    }

    if (tryBoot()) return;

    let bootChecks = 0;
    const waitForAuth = window.setInterval(() => {
      bootChecks += 1;
      if (tryBoot() || bootChecks >= 40) {
        window.clearInterval(waitForAuth);
      }
    }, 500);

    try {
      if (window.netlifyIdentity && typeof window.netlifyIdentity.on === "function") {
        window.netlifyIdentity.on("login", () => {
          try { localStorage.setItem(INACTIVITY_KEY, String(Date.now())); } catch (_) {}
          boot();
        });
        window.netlifyIdentity.on("logout", () => {
          try { localStorage.removeItem(INACTIVITY_KEY); } catch (_) {}
          try { localStorage.removeItem("anw_session"); } catch (_) {}
          broadcastAuthEvent("logout", { reason: "manual" });
        });
      }
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initIdentity();
      startGlobalInactivityTimeout();
    });
  } else {
    initIdentity();
    startGlobalInactivityTimeout();
  }
})();
