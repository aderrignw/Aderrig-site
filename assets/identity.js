// Session timeout control - 10 minutes without activity

(function () {
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const STORAGE_KEY = "lastActivity";
  const PRESENCE_KEY = "anw_online_presence";
  let lastPresenceWrite = 0;

  function getCurrentUser() {
    try {
      if (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === "function") {
        return window.netlifyIdentity.currentUser();
      }
    } catch (e) {}
    return null;
  }

  async function getAuthHeaders() {
    const user = getCurrentUser();
    if (!user || typeof user.jwt !== "function") return null;
    try {
      const token = await user.jwt();
      if (!token) return null;
      return { "Content-Type": "application/json", Authorization: "Bearer " + token };
    } catch (e) {
      return null;
    }
  }

  function getUserEmail() {
    const user = getCurrentUser();
    return String((user && user.email) || "").trim().toLowerCase();
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
    if (!headers) return;
    try {
      await fetch("/.netlify/functions/store?key=" + encodeURIComponent(PRESENCE_KEY), {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data || {})
      });
    } catch (e) {}
  }

  async function markOnline(force) {
    const now = Date.now();
    if (!force && now - lastPresenceWrite < 30000) return;
    lastPresenceWrite = now;

    const email = getUserEmail();
    if (!email) return;

    const presence = await loadPresence();
    presence[email] = {
      email: email,
      status: "on",
      lastSeen: new Date().toISOString(),
      path: location.pathname || ""
    };
    await savePresence(presence);
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

    alert("Sessão encerrada por inatividade.");

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

  setInterval(checkTimeout, 10000);
  setInterval(() => { if (!checkTimeout()) markOnline(false); }, 30000);

  updateActivity();
})();
