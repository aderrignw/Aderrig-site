(function () {
  "use strict";

  // =========================
  // GLOBAL ADMIN STATE
  // =========================
  window.__adminAccessState = {
    ready: false,
    status: "unknown", // unknown | allow | deny-login | deny-dashboard
    role: "resident"
  };

  function getUser() {
    try {
      if (
        window.netlifyIdentity &&
        typeof window.netlifyIdentity.currentUser === "function"
      ) {
        return window.netlifyIdentity.currentUser();
      }
    } catch (_) {}
    return null;
  }

  function isLoggedIn() {
    return !!getUser();
  }

  function getEmail() {
    const u = getUser();
    return u && u.email ? String(u.email).toLowerCase() : "";
  }

  function isOwner(email) {
    const master = String(window.ANW_MASTER_EMAIL || "")
      .trim()
      .toLowerCase();
    return email && (email === master || email === "claudiosantos1968@gmail.com");
  }

  function loadUsers() {
    try {
      const raw = localStorage.getItem("anw_users");
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function findUser(email) {
    const users = loadUsers();
    return users.find(
      (u) =>
        String(u.email || "").toLowerCase() === String(email || "").toLowerCase()
    );
  }

  function hasAdminAccess(userRow) {
    if (!userRow) return false;

    const roles = []
      .concat(userRow.role || [])
      .concat(userRow.roles || [])
      .concat(userRow.type || []);

    return roles.includes("admin") || roles.includes("owner");
  }

  // =========================
  // MAIN DECISION
  // =========================
  async function resolveAdminAccess() {
    const start = Date.now();

    while (Date.now() - start < 6000) {
      const user = getUser();

      if (user && user.email) {
        const email = getEmail();

        // OWNER
        if (isOwner(email)) {
          window.__adminAccessState = {
            ready: true,
            status: "allow",
            role: "owner"
          };
          return;
        }

        // CHECK USERS TABLE
        const row = findUser(email);

        if (hasAdminAccess(row)) {
          window.__adminAccessState = {
            ready: true,
            status: "allow",
            role: "admin"
          };
          return;
        }

        // LOGGED BUT NO ACCESS
        window.__adminAccessState = {
          ready: true,
          status: "deny-dashboard",
          role: "resident"
        };
        return;
      }

      await new Promise((r) => setTimeout(r, 120));
    }

    // NOT LOGGED
    window.__adminAccessState = {
      ready: true,
      status: "deny-login",
      role: "public"
    };
  }

  // =========================
  // START EARLY
  // =========================
  resolveAdminAccess();

  // =========================
  // PUBLIC FUNCTION
  // =========================
  window.anwAclAllows = function (key) {
    if (key === "page:admin") {
      return window.__adminAccessState.status === "allow";
    }
    return true;
  };
})();
