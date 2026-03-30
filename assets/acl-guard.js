// assets/acl-guard.js
(function () {
  "use strict";

  function getPathName() {
    try {
      return String(location.pathname || "").toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function isAdminPath() {
    const path = getPathName();
    return (
      path === "/admin" ||
      path === "/admin/" ||
      path.endsWith("/admin") ||
      path.endsWith("/admin/") ||
      path.endsWith("/admin.html")
    );
  }

  function isPublicMode() {
    try {
      if (isAdminPath()) return false;
      return !!window.ANW_PUBLIC_MODE;
    } catch (_) {
      return false;
    }
  }

  function isShellPublicPage() {
    try {
      if (isAdminPath()) return false;
      return document.body && document.body.getAttribute("data-acl-shell-public") === "true";
    } catch (_) {
      return false;
    }
  }

  function isLoggedIn() {
    try {
      if (typeof window.anwIsLoggedIn === "function") {
        return !!window.anwIsLoggedIn();
      }
    } catch (_) {}

    try {
      return !!(
        window.netlifyIdentity &&
        typeof window.netlifyIdentity.currentUser === "function" &&
        window.netlifyIdentity.currentUser()
      );
    } catch (_) {
      return false;
    }
  }

  function getLoggedEmail() {
    try {
      if (typeof window.anwGetLoggedEmail === "function") {
        return String(window.anwGetLoggedEmail() || "").trim().toLowerCase();
      }
    } catch (_) {}

    try {
      const u =
        window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === "function"
          ? window.netlifyIdentity.currentUser()
          : null;
      if (u && u.email) return String(u.email || "").trim().toLowerCase();
    } catch (_) {}

    try {
      const key =
        window.ANW_KEYS && window.ANW_KEYS.SESSION
          ? window.ANW_KEYS.SESSION
          : "anw_session";
      const raw = localStorage.getItem(key);
      const session = raw ? JSON.parse(raw) : null;
      if (session && session.email) return String(session.email || "").trim().toLowerCase();
    } catch (_) {}

    try {
      const rawLogged = localStorage.getItem("anw_logged");
      const logged = rawLogged ? JSON.parse(rawLogged) : null;
      if (logged && logged.email) return String(logged.email || "").trim().toLowerCase();
    } catch (_) {}

    return "";
  }

  function isMasterOwnerEmail(email) {
    try {
      const configured = String(window.ANW_MASTER_EMAIL || "").trim().toLowerCase();
      if (configured) {
        return String(email || "").trim().toLowerCase() === configured;
      }
    } catch (_) {}

    try {
      return String(email || "").trim().toLowerCase() === "claudiosantos1968@gmail.com";
    } catch (_) {
      return false;
    }
  }

  function normalizeRoleName(value) {
    try {
      if (typeof window.anwNormalizeRoleName === "function") {
        return String(window.anwNormalizeRoleName(value) || "").trim().toLowerCase();
      }
    } catch (_) {}
    return String(value || "").trim().toLowerCase();
  }

  function getRole() {
    try {
      const email = getLoggedEmail();
      if (isMasterOwnerEmail(email)) return "owner";
    } catch (_) {}

    try {
      if (typeof window.anwGetLoggedRole === "function") {
        const role = normalizeRoleName(window.anwGetLoggedRole());
        if (role) return role;
      }
    } catch (_) {}

    try {
      const rawLogged = localStorage.getItem("anw_logged");
      const logged = rawLogged ? JSON.parse(rawLogged) : null;
      const role = normalizeRoleName(
        logged && (logged.role || logged.primaryRole || (Array.isArray(logged.roles) ? logged.roles[0] : ""))
      );
      if (role) return role;
    } catch (_) {}

    return "resident";
  }

  async function waitForAdminAuthReady(timeoutMs) {
    const limit = Number(timeoutMs || 4500);
    const started = Date.now();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    while (Date.now() - started < limit) {
      const email = getLoggedEmail();
      const loggedIn = isLoggedIn();
      const role = getRole();

      if (email && (loggedIn || role === "owner" || role === "admin" || isMasterOwnerEmail(email))) {
        return;
      }

      try {
        if (typeof window.anwInitStore === "function" && (loggedIn || email)) {
          await window.anwInitStore();
        }
      } catch (_) {}

      await sleep(150);
    }
  }

  const ROLE_RANK = {
    public: 0,
    resident: 1,
    street_coordinator: 2,
    assistant_area_coordinator: 3,
    area_coordinator: 4,
    projects: 4,
    owner: 5,
    admin: 5
  };

  const KNOWN_RULES = new Set([
    "Public",
    "Authenticated",
    "public",
    "authenticated",
    "resident",
    "street_coordinator",
    "assistant_area_coordinator",
    "area_coordinator",
    "projects",
    "owner",
    "admin"
  ]);

  const BUILTIN_PAGE_RULES = {
    "page:home": "Public",
    "page:about": "Public",
    "page:handbook": "Public",
    "page:login": "Public",
    "page:privacy": "Public",
    "page:dashboard": "Public",
    "page:report": "Authenticated",
    "page:household": "Authenticated",
    "page:alerts": "Authenticated",
    "page:projects": "Authenticated",
    "page:admin": "owner"
  };

  function getPageKey() {
    try {
      const m1 = document.querySelector('meta[name="anw-acl-key"]');
      if (m1 && m1.getAttribute("content")) return m1.getAttribute("content");
    } catch (_) {}

    try {
      const m2 = document.querySelector('meta[name="anw-page"]');
      if (m2 && m2.getAttribute("content")) return m2.getAttribute("content");
    } catch (_) {}

    try {
      const path = getPathName();
      const file = path.split("/").filter(Boolean).pop() || "";

      if (!file || path === "/" || file === "index.html" || file === "home" || file === "home.html") return "page:home";
      if (file === "about" || file === "about.html") return "page:about";
      if (file === "handbook" || file === "handbook.html") return "page:handbook";
      if (file === "login" || file === "login.html") return "page:login";
      if (file === "privacy" || file === "privacy.html") return "page:privacy";
      if (file === "dashboard" || file === "dashboard.html") return "page:dashboard";
      if (file === "report" || file === "report.html") return "page:report";
      if (file === "household" || file === "household.html") return "page:household";
      if (file === "alerts" || file === "alerts.html") return "page:alerts";
      if (file === "projects" || file === "projects.html") return "page:projects";
      if (file === "admin" || file === "admin.html") return "page:admin";
    } catch (_) {}

    return null;
  }

  function loadAcl() {
    try {
      const key =
        window.ANW_KEYS && (window.ANW_KEYS.ACL || window.ANW_KEYS.ACCESS)
          ? (window.ANW_KEYS.ACL || window.ANW_KEYS.ACCESS)
          : "acl";

      if (typeof window.anwLoad === "function") {
        return window.anwLoad(key, {}) || {};
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem("acl");
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  async function ensureFresh() {
    try {
      if (typeof window.anwInitStore === "function" && isLoggedIn()) {
        await window.anwInitStore();
      }
    } catch (_) {}
  }

  function normalizeRule(rule) {
    if (rule == null) return "Public";

    if (typeof rule === "string") {
      const clean = rule.trim();
      return clean || "Public";
    }

    if (typeof rule === "object") {
      if (typeof rule.shell === "string") return rule.shell.trim() || "Public";
      if (typeof rule.rule === "string") return rule.rule.trim() || "Public";
      if (typeof rule.access === "string") return rule.access.trim() || "Public";
      if (typeof rule.visibility === "string") return rule.visibility.trim() || "Public";
      if (rule.public === true) return "Public";
      if (rule.authenticated === true) return "Authenticated";
    }

    return "Public";
  }

  function lookupAclValue(acl, key) {
    try {
      if (!acl || typeof acl !== "object") return undefined;

      if (Object.prototype.hasOwnProperty.call(acl, key)) return acl[key];
      if (acl.features && Object.prototype.hasOwnProperty.call(acl.features, key)) return acl.features[key];
      if (acl.pages && Object.prototype.hasOwnProperty.call(acl.pages, key)) return acl.pages[key];

      if (acl.pages && typeof acl.pages === "object") {
        for (const pageKey of Object.keys(acl.pages)) {
          const page = acl.pages[pageKey];
          if (!page || typeof page !== "object") continue;

          if (Object.prototype.hasOwnProperty.call(page, key)) return page[key];
          if (page.features && Object.prototype.hasOwnProperty.call(page.features, key)) return page.features[key];
        }
      }
    } catch (_) {}

    return undefined;
  }

  function resolveAclRule(acl, keyOrRule) {
    const raw = String(keyOrRule || "").trim();
    if (!raw) return "Public";

    if (KNOWN_RULES.has(raw)) return raw;

    const found = lookupAclValue(acl, raw);
    if (typeof found !== "undefined") return normalizeRule(found);

    if (Object.prototype.hasOwnProperty.call(BUILTIN_PAGE_RULES, raw)) {
      return BUILTIN_PAGE_RULES[raw];
    }

    return "Authenticated";
  }

  function roleAllows(required, current) {
    const req = normalizeRoleName(required);
    const cur = normalizeRoleName(current);

    if (req === "public") return true;
    if (req === "authenticated") return isLoggedIn();

    if (cur === "owner") return true;

    if (cur === "admin" && req === "owner") return false;

    const reqRank = ROLE_RANK[req];
    const curRank = ROLE_RANK[cur];

    if (typeof reqRank === "number" && typeof curRank === "number") {
      if (req === "projects") return cur === "projects" || cur === "owner";
      return curRank >= reqRank;
    }

    return cur === req;
  }

  function ruleAllows(rule, role) {
    const clean = normalizeRule(rule);
    if (clean.toLowerCase() === "public") return true;
    if (clean.toLowerCase() === "authenticated") return isLoggedIn();
    return roleAllows(clean, role);
  }

  function applyNav(role, acl) {
    document.querySelectorAll("[data-acl]").forEach((el) => {
      const keyOrRule = el.getAttribute("data-acl");
      const rule = resolveAclRule(acl, keyOrRule);
      if (!ruleAllows(rule, role)) {
        el.style.display = "none";
      }
    });
  }

  function applyFeatures(role, acl) {
    const nodes = [
      ...document.querySelectorAll("[data-acl-feature]"),
      ...document.querySelectorAll("[data-feature-acl]")
    ];

    nodes.forEach((el) => {
      if (isShellPublicPage() && (el.classList.contains("dash-tab") || el.classList.contains("dash-tab-content"))) {
        return;
      }

      const keyOrRule = el.getAttribute("data-acl-feature") || el.getAttribute("data-feature-acl");
      const rule = resolveAclRule(acl, keyOrRule);

      if (!ruleAllows(rule, role)) {
        el.style.display = "none";
      }
    });
  }

  function enforceAdminPage(role, acl) {
    const email = getLoggedEmail();
    const loggedIn = isLoggedIn() || !!email;

    if (!loggedIn) {
      location.replace("login.html");
      return true;
    }

    const adminRule = resolveAclRule(acl, "page:admin");

    if (role === "owner" || isMasterOwnerEmail(email)) {
      return false;
    }

    if (!ruleAllows(adminRule, role)) {
      location.replace("dashboard.html");
      return true;
    }

    return false;
  }

  function enforcePage(role, acl) {
    if (isAdminPath() || getPageKey() === "page:admin") {
      if (enforceAdminPage(role, acl)) return;
      return;
    }

    if (isPublicMode()) return;
    if (isShellPublicPage()) return;

    const key = getPageKey();
    const rule = key ? resolveAclRule(acl, key) : "Authenticated";
    const clean = normalizeRule(rule);

    if (clean.toLowerCase() === "public") return;

    if (clean.toLowerCase() === "authenticated") {
      if (!isLoggedIn()) {
        location.replace("login.html");
      }
      return;
    }

    if (!isLoggedIn()) {
      location.replace("login.html");
      return;
    }

    if (!ruleAllows(clean, role)) {
      location.replace("dashboard.html");
    }
  }

  window.anwAclAllows = function (keyOrRule) {
    const acl = loadAcl() || {};
    const role = getRole();

    if ((String(keyOrRule || "").trim() === "page:admin" || isAdminPath()) && !isLoggedIn()) {
      return false;
    }

    const rule = resolveAclRule(acl, keyOrRule);

    if (normalizeRule(rule).toLowerCase() !== "public" && !isLoggedIn()) {
      return false;
    }

    return ruleAllows(rule, role);
  };

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      if (isAdminPath() || getPageKey() === "page:admin") {
        await waitForAdminAuthReady();
      }

      await ensureFresh();

      const acl = loadAcl() || {};
      const role = getRole();

      applyNav(role, acl);
      applyFeatures(role, acl);
      enforcePage(role, acl);
    } catch (e) {
      console.warn("[acl-guard] fallback after error:", e);
    } finally {
      try {
        document.body.removeAttribute("data-acl-loading");
      } catch (_) {}
    }
  });

  window.addEventListener("load", function () {
    try {
      document.body.removeAttribute("data-acl-loading");
    } catch (_) {}
  });
})();
