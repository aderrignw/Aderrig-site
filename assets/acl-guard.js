// assets/acl-guard.js
// Stable ACL guard for public shells + dashboard feature gating.
// Fixes false redirects to dashboard on public pages and keeps Garda public.

(function () {
  function isPublicMode() {
    try { return !!window.ANW_PUBLIC_MODE; } catch { return false; }
  }

  function isLoggedIn() {
    try {
      if (typeof window.anwIsLoggedIn === "function") return !!window.anwIsLoggedIn();
      return !!(window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === "function" && window.netlifyIdentity.currentUser());
    } catch {
      return false;
    }
  }

  function getRole() {
    try {
      const raw = (typeof window.anwGetLoggedRole === "function" ? window.anwGetLoggedRole() : "resident") || "resident";
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
    admin: 5,
    owner: 6
  };

  const FORCE_PUBLIC_PAGES = new Set([
    "page:home",
    "page:index",
    "page:about",
    "page:report",
    "page:alerts",
    "page:projects",
    "page:handbook",
    "page:privacy",
    "page:login",
    "page:dashboard",
    "page:admin"
  ]);

  const FORCE_AUTH_PAGES = new Set([
    "page:household"
  ]);

  const FORCE_PUBLIC_FEATURES = new Set([
    "dashboard:tab_garda"
  ]);

  function normalizeKey(value) {
    return String(value || "").trim();
  }

  function normalizeRule(rule) {
    if (rule == null) return null;
    if (typeof rule === "string") {
      const clean = rule.trim();
      return clean || null;
    }
    if (typeof rule === "object") {
      if (typeof rule.shell === "string" && rule.shell.trim()) return rule.shell.trim();
      if (typeof rule.rule === "string" && rule.rule.trim()) return rule.rule.trim();
      if (typeof rule.access === "string" && rule.access.trim()) return rule.access.trim();
      if (typeof rule.visibility === "string" && rule.visibility.trim()) return rule.visibility.trim();
    }
    return null;
  }

  function getPageKey() {
    const m1 = document.querySelector('meta[name="anw-acl-key"]');
    if (m1 && m1.getAttribute("content")) return m1.getAttribute("content");
    const m2 = document.querySelector('meta[name="anw-page"]');
    if (m2 && m2.getAttribute("content")) return m2.getAttribute("content");
    return null;
  }

  function isShellPublicPage() {
    try {
      return document.body && document.body.getAttribute("data-acl-shell-public") === "true";
    } catch {
      return false;
    }
  }

  function loadAcl() {
    try {
      return (typeof window.anwLoad === "function")
        ? window.anwLoad((window.ANW_KEYS && window.ANW_KEYS.ACL) ? window.ANW_KEYS.ACL : "acl", {})
        : {};
    } catch {
      return {};
    }
  }

  async function ensureFresh() {
    try {
      if (typeof window.anwInitStore === "function" && isLoggedIn()) {
        await window.anwInitStore();
      }
    } catch {}
  }

  function isKnownRuleName(raw) {
    return [
      "Public", "Authenticated", "public", "authenticated",
      "resident", "street_coordinator", "assistant_area_coordinator",
      "area_coordinator", "projects", "admin", "owner"
    ].includes(String(raw || "").trim());
  }

  function lookupAclObject(acl, key) {
    if (!acl || typeof acl !== "object") return undefined;

    if (Object.prototype.hasOwnProperty.call(acl, key)) return acl[key];
    if (acl.features && Object.prototype.hasOwnProperty.call(acl.features, key)) return acl.features[key];

    if (acl.pages && typeof acl.pages === "object") {
      if (Object.prototype.hasOwnProperty.call(acl.pages, key)) return acl.pages[key];

      for (const pageKey of Object.keys(acl.pages)) {
        const page = acl.pages[pageKey];
        if (!page || typeof page !== "object") continue;
        if (Object.prototype.hasOwnProperty.call(page, key)) return page[key];
        if (page.features && Object.prototype.hasOwnProperty.call(page.features, key)) return page.features[key];
      }
    }

    return undefined;
  }

  function resolveAclRule(acl, keyOrRule) {
    const raw = normalizeKey(keyOrRule);
    if (!raw) return "Public";
    if (isKnownRuleName(raw)) return raw;

    if (FORCE_PUBLIC_PAGES.has(raw) || FORCE_PUBLIC_FEATURES.has(raw)) return "Public";
    if (FORCE_AUTH_PAGES.has(raw)) return "Authenticated";

    const found = lookupAclObject(acl, raw);
    const rule = normalizeRule(found);
    if (rule) return rule;

    return null;
  }

  function roleAllows(required, current) {
    const req = String(required || "").trim().toLowerCase();
    const cur = String(current || "").trim().toLowerCase();

    if (!req || req === "public") return true;
    if (req === "authenticated") return isLoggedIn();
    if (cur === "owner") return true;
    if (cur === "admin" && req !== "owner") return true;

    const reqRank = ROLE_RANK[req];
    const curRank = ROLE_RANK[cur];

    if (typeof reqRank === "number" && typeof curRank === "number") {
      if (req === "projects") return cur === "projects" || cur === "admin" || cur === "owner";
      return curRank >= reqRank;
    }

    return cur === req;
  }

  function ruleAllows(rule, role) {
    if (isPublicMode()) return true;
    if (rule == null) return true;

    const clean = String(rule).trim();
    if (!clean || clean.toLowerCase() === "public") return true;
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

  function enforcePage(role, acl) {
    if (isPublicMode()) return;
    if (isShellPublicPage()) return;

    const key = getPageKey();
    const rule = key ? resolveAclRule(acl, key) : null;
    if (rule == null) return;

    const clean = String(rule).trim().toLowerCase();
    if (!clean || clean === "public") return;

    if (clean === "authenticated") {
      if (!isLoggedIn()) location.replace("login.html");
      return;
    }

    if (!ruleAllows(rule, role)) {
      location.replace("dashboard.html");
    }
  }

  window.anwAclAllows = function (keyOrRule) {
    try {
      const acl = loadAcl() || {};
      const role = getRole();
      const rule = resolveAclRule(acl, keyOrRule);
      return ruleAllows(rule, role);
    } catch {
      return true;
    }
  };

  document.addEventListener("DOMContentLoaded", async () => {
    if (isPublicMode()) return;
    await ensureFresh();
    const acl = loadAcl() || {};
    const role = getRole();
    applyNav(role, acl);
    applyFeatures(role, acl);
    enforcePage(role, acl);
  });
})();
