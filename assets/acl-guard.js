// assets/acl-guard.js
(function () {
  function getPathName() {
    try {
      return String(location.pathname || "").toLowerCase();
    } catch {
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

  function isPublicMode(){
    try {
      // Admin must never be bypassed by public mode
      if (isAdminPath()) return false;
      return !!window.ANW_PUBLIC_MODE;
    } catch {
      return false;
    }
  }

  function isLoggedIn() {
    try {
      if (typeof anwIsLoggedIn === "function") return !!anwIsLoggedIn();
      return !!(window.netlifyIdentity && window.netlifyIdentity.currentUser && window.netlifyIdentity.currentUser());
    } catch {
      return false;
    }
  }

  function getRole() {
    try {
      const raw = (typeof anwGetLoggedRole === "function" ? anwGetLoggedRole() : "resident") || "resident";
      if (typeof window.anwNormalizeRoleName === "function") return window.anwNormalizeRoleName(raw);
      return String(raw).trim().toLowerCase();
    } catch {
      return "resident";
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
    "Public","Authenticated","public","authenticated",
    "resident","street_coordinator","assistant_area_coordinator",
    "area_coordinator","projects","owner","admin"
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
    const m1 = document.querySelector('meta[name="anw-acl-key"]');
    if (m1 && m1.getAttribute("content")) return m1.getAttribute("content");

    const m2 = document.querySelector('meta[name="anw-page"]');
    if (m2 && m2.getAttribute("content")) return m2.getAttribute("content");

    // Strong fallback by route/path
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
    } catch {}

    return null;
  }

  function isShellPublicPage() {
    try {
      // Admin must never be bypassed by shell-public mode
      if (isAdminPath()) return false;
      return document.body && document.body.getAttribute("data-acl-shell-public") === "true";
    } catch {
      return false;
    }
  }

  function loadAcl() {
    try {
      return (typeof anwLoad === "function")
        ? anwLoad((window.ANW_KEYS && ANW_KEYS.ACL) ? ANW_KEYS.ACL : "acl", {})
        : {};
    } catch {
      return {};
    }
  }

  async function ensureFresh() {
    try {
      if (typeof anwInitStore === "function" && isLoggedIn()) {
        await anwInitStore();
      }
    } catch {}
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
    } catch {}
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
    const normalize = (v) => {
      try {
        return typeof window.anwNormalizeRoleName === "function"
          ? window.anwNormalizeRoleName(v)
          : String(v || "").trim().toLowerCase();
      } catch {
        return String(v || "").trim().toLowerCase();
      }
    };

    const req = normalize(required);
    const cur = normalize(current);

    if (req === "public") return true;
    if (req === "authenticated") return isLoggedIn();

    // Owner always has full access
    if (cur === "owner") return true;

    // Admin must not inherit owner-only access
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
      if (!ruleAllows(rule, role)) el.style.display = "none";
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
      if (!ruleAllows(rule, role)) el.style.display = "none";
    });
  }

  function enforceAdminPage(role, acl) {
    if (!isLoggedIn()) {
      location.replace("login.html");
      return true;
    }

    const adminRule = resolveAclRule(acl, "page:admin");

    // Owner always allowed. Others only if ACL explicitly allows.
    if (role === "owner") return false;

    if (!ruleAllows(adminRule, role)) {
      location.replace("dashboard.html");
      return true;
    }

    return false;
  }

  function enforcePage(role, acl) {
    // Hard enforcement for admin first, before any public/shell checks
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
  window.anwAclAllows = function(keyOrRule){
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

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureFresh();
      const acl = loadAcl() || {};
      const role = getRole();

      applyNav(role, acl);
      applyFeatures(role, acl);
      enforcePage(role, acl);
    } catch (e) {
      console.warn("[acl-guard] fallback after error:", e);
    } finally {
      try { document.body.removeAttribute("data-acl-loading"); } catch (e) {}
    }
  });

  window.addEventListener("load", () => {
    try { document.body.removeAttribute("data-acl-loading"); } catch (e) {}
  });
})();
