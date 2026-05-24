// Session timeout control - 10 minutes without activity

(function () {
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const STORAGE_KEY = "lastActivity";
  const PRESENCE_KEY = "anw_online_presence";
  let lastPresenceWrite = 0;
  let pendingPresenceWrite = false;

  function getCurrentUser() {
    try {
      if (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === "function") {
        return window.netlifyIdentity.currentUser();
      }
    } catch (e) {}
    return null;
  }

  function getUserEmail() {
    const user = getCurrentUser();
    return String((user && user.email) || "").trim().toLowerCase();
  }

  function getUserName() {
    const user = getCurrentUser();
    const meta = (user && (user.user_metadata || user.userMetadata || {})) || {};
    return String(meta.full_name || meta.name || meta.displayName || (user && user.email) || "").trim();
  }

  async function waitForCurrentUser(timeoutMs) {
    const started = Date.now();
    const limit = Number(timeoutMs || 8000);
    while ((Date.now() - started) < limit) {
      const user = getCurrentUser();
      if (user && user.email && typeof user.jwt === "function") return user;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return getCurrentUser();
  }

  async function getAuthHeaders() {
    const user = getCurrentUser() || await waitForCurrentUser(8000);
    if (!user || typeof user.jwt !== "function") return null;
    try {
      const token = await user.jwt();
      if (!token) return null;
      return { "Content-Type": "application/json", Authorization: "Bearer " + token };
    } catch (e) {
      return null;
    }
  }

  async function loadPresence() {
    const headers = await getAuthHeaders();
    if (!headers) return {};
    try {
      const res = await fetch("/.netlify/functions/store?key=" + encodeURIComponent(PRESENCE_KEY), {
        cache: "no-store",
        headers: headers
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data && typeof data === "object" ? data : {};
    } catch (e) {
      return {};
    }
  }

  async function savePresence(data) {
    const headers = await getAuthHeaders();
    if (!headers) return false;
    try {
      const res = await fetch("/.netlify/functions/store?key=" + encodeURIComponent(PRESENCE_KEY), {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data || {})
      });
      return !!(res && res.ok);
    } catch (e) {
      return false;
    }
  }

  async function markOnline(force) {
    const now = Date.now();
    if (!force && now - lastPresenceWrite < 30000) return;
    if (pendingPresenceWrite) return;
    pendingPresenceWrite = true;

    try {
      const user = getCurrentUser() || await waitForCurrentUser(8000);
      const email = String((user && user.email) || "").trim().toLowerCase();
      if (!email) return;

      const presence = await loadPresence();
      presence[email] = {
        email: email,
        name: getUserName(),
        status: "on",
        lastSeen: new Date().toISOString(),
        path: location.pathname || ""
      };

      const saved = await savePresence(presence);
      if (saved) lastPresenceWrite = Date.now();
    } finally {
      pendingPresenceWrite = false;
    }
  }

  async function markOffline() {
    const email = getUserEmail();
    if (!email) return;

    const presence = await loadPresence();
    if (presence[email]) {
      delete presence[email];
      await savePresence(presence);
    }
  }

  async function logoutUser() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.clear();

    try { await markOffline(); } catch (e) {}

    try {
      if (window.netlifyIdentity) {
        window.netlifyIdentity.logout();
      }
    } catch (e) {}

    alert("Your session has ended due to inactivity.");

    try {
      window.close();
    } catch (e) {}

    window.location.href = "/login.html";
  }

  function checkTimeout() {
    const lastActivity = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    const now = Date.now();

    if (lastActivity && now - lastActivity >= TIMEOUT_MS) {
      logoutUser();
      return true;
    }

    return false;
  }

  function updateActivity() {
    if (!checkTimeout()) {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
      markOnline(false);
    }
  }

  function startPresence() {
    if (!checkTimeout()) markOnline(true);
  }

  ["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((event) => {
    document.addEventListener(event, updateActivity, true);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (!checkTimeout()) markOnline(true);
    }
  });

  window.addEventListener("focus", () => {
    if (!checkTimeout()) markOnline(true);
  });

  window.addEventListener("beforeunload", () => {
    try { markOffline(); } catch (e) {}
  });

  try {
    if (window.netlifyIdentity && typeof window.netlifyIdentity.on === "function") {
      window.netlifyIdentity.on("init", startPresence);
      window.netlifyIdentity.on("login", startPresence);
      window.netlifyIdentity.on("logout", () => { markOffline(); });
    }
  } catch (e) {}

  setTimeout(startPresence, 500);
  setTimeout(startPresence, 2000);
  setTimeout(startPresence, 5000);
  setInterval(checkTimeout, 10000);
  setInterval(() => { if (!checkTimeout()) markOnline(false); }, 30000);

  updateActivity();
})();
