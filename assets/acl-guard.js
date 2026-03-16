// assets/acl-guard.js
// ACL guard (pages + features), with shell-public support and hierarchical custom roles.

(function () {
  function isPublicMode(){
    try { return !!window.ANW_PUBLIC_MODE; } catch { return false; }
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
    owner: 5
  };

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
      return (typeof anwLoad === "function") ? anwLoad((window.ANW_KEYS && ANW_KEYS.ACL) ? ANW_KEYS.ACL : "acl", {}) : {};
    } catch { return {}; }
  }

  async function ensureFresh() {
    try {
      if (typeof anwInitStore === "function" && isLoggedIn()) {
        await anwInitStore();
      }
    } catch {}
  }

  function classify(rule) {
    if (!rule) return "Public";
    return String(rule).trim();
  }

  function resolveAclRule(acl, keyOrRule) {
    const raw = String(keyOrRule || "").trim();
    if (!raw) return "Public";

    if (["Public","Authenticated","public","resident","street_coordinator","assistant_area_coordinator","area_coordinator","projects","owner"].includes(raw)) {
      return raw;
    }

    try {
      if (acl && typeof acl === "object" && Object.prototype.hasOwnProperty.call(acl, raw)) {
        return acl[raw];
      }
      if (acl && acl.features && Object.prototype.hasOwnProperty.call(acl.features, raw)) {
        return acl.features[raw];
      }
      if (acl && acl.pages) {
        for (const pageKey of Object.keys(acl.pages)) {
          const page = acl.pages[pageKey];
          if (page && typeof page === "object" && Object.prototype.hasOwnProperty.call(page, raw)) {
            return page[raw];
          }
          if (page && page.features && Object.prototype.hasOwnProperty.call(page.features, raw)) {
            return page.features[raw];
          }
        }
      }
    } catch {}

    return raw;
  }

  function roleAllows(required, current) {
    const req = String(required || "").trim().toLowerCase();
    const cur = String(current || "").trim().toLowerCase();
    if (req === "public") return true;
    if (req === "authenticated") return isLoggedIn();
    if (cur === "owner") return true;

    const reqRank = ROLE_RANK[req];
    const curRank = ROLE_RANK[cur];

    if (typeof reqRank === "number" && typeof curRank === "number") {
      if (req === "projects") return cur === "projects" || cur === "owner";
      return curRank >= reqRank;
    }

    return cur === req;
  }

  function ruleAllows(rule, role) {
    if (isPublicMode()) return true;
    const clean = classify(rule);
    if (clean === "Public") return true;
    if (clean === "Authenticated") return isLoggedIn();
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
      ...document.querySelectorAll("[data-feature-acl]"),
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
    const rule = key ? resolveAclRule(acl, key) : "Public";
    const r = classify(rule);

    if (r === "Public") return;

    if (r === "Authenticated" && !isLoggedIn()) {
      location.replace("login.html");
      return;
    }

    if (r !== "Public" && r !== "Authenticated") {
      if (!ruleAllows(r, role)) {
        location.replace("dashboard.html");
      }
    }
  }

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
