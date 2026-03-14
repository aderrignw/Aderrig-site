// assets/acl-guard.js
// ACL guard (pages + features). Compatible with your HTML:
// - page key via meta[name="anw-acl-key"] (fallback legacy anw-page)
// - feature key via data-acl-feature (fallback legacy data-feature-acl)

(function () {
  // If you're restructuring and want everything visible/public,
  // keep ANW_PUBLIC_MODE=true (set in assets/app-core.js).
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
    try { return (typeof anwGetLoggedRole === "function" ? anwGetLoggedRole() : "resident") || "resident"; }
    catch { return "resident"; }
  }

  function getPageKey() {
    const m1 = document.querySelector('meta[name="anw-acl-key"]');
    if (m1 && m1.getAttribute("content")) return m1.getAttribute("content");
    const m2 = document.querySelector('meta[name="anw-page"]');
    if (m2 && m2.getAttribute("content")) return m2.getAttribute("content");
    return null;
  }

  function loadAcl() {
    try {
      return (typeof anwLoad === "function") ? anwLoad((window.ANW_KEYS && ANW_KEYS.ACL) ? ANW_KEYS.ACL : "acl", {}) : {};
    } catch { return {}; }
  }

  function isShellPublicPage() {
    try {
      return document.body && document.body.getAttribute("data-acl-shell-public") === "true";
    } catch {
      return false;
    }
  }

  function resolveAclRule(acl, keyOrRule) {
    const raw = String(keyOrRule || "").trim();
    if (!raw) return "Public";

    if (raw === "Public" || raw === "Authenticated" || raw === "owner" || raw === "admin" || raw === "resident") {
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

  async function ensureFresh() {
    try {
      if (typeof anwInitStore === "function" && isLoggedIn()) {
        await anwInitStore();
      }
    } catch {}
  }

  function classify(rule) {
    if (!rule) return "Public";
    return rule;
  }

  function ruleAllows(rule, role) {
    if (isPublicMode()) return true;
    rule = classify(rule);
    if (rule === "Public") return true;
    if (rule === "Authenticated") return isLoggedIn();
    // role-based
    if (role === "owner") return true;
    return role === rule;
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
    if(isPublicMode()) return;
    if(isShellPublicPage()) return;
    const key = getPageKey();
    const rule = key ? resolveAclRule(acl, key) : "Public";
    const r = classify(rule);

    if (r === "Public") return;

    if (r === "Authenticated" && !isLoggedIn()) {
      location.replace("login.html");
      return;
    }

    if (r !== "Public" && r !== "Authenticated") {
      if (role !== "owner" && role !== r) {
        location.replace("dashboard.html");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (isPublicMode()) {
      // Do not hide nav/features and do not redirect pages.
      return;
    }
    await ensureFresh();
    const acl = loadAcl() || {};
    const role = getRole();
    applyNav(role, acl);
    applyFeatures(role, acl);
    enforcePage(role, acl);
  });
})();
