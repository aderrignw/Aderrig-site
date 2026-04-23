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

  function getNetlifyUser() {
    try {
      return !!(
        window.netlifyIdentity &&
        typeof window.netlifyIdentity.currentUser === "function"
      )
        ? window.netlifyIdentity.currentUser()
        : null;
    } catch (_) {
      return null;
    }
  }

  function isLoggedIn() {
    try {
      const user = getNetlifyUser();
      if (user) return true;
    } catch (_) {}

    try {
      if (!isAdminPath() && typeof window.anwIsLoggedIn === "function") {
        return !!window.anwIsLoggedIn();
      }
    } catch (_) {}

    return false;
  }

  function getLoggedEmail() {
    try {
      const u = getNetlifyUser();
      if (u && u.email) return String(u.email || "").trim().toLowerCase();
    } catch (_) {}

    try {
      if (!isAdminPath() && typeof window.anwGetLoggedEmail === "function") {
        return String(window.anwGetLoggedEmail() || "").trim().toLowerCase();
      }
    } catch (_) {}

    try {
      if (!isAdminPath()) {
        const key =
          window.ANW_KEYS && window.ANW_KEYS.SESSION
            ? window.ANW_KEYS.SESSION
            : "anw_session";
        const raw = localStorage.getItem(key);
        const session = raw ? JSON.parse(raw) : null;
        if (session && session.email) return String(session.email || "").trim().toLowerCase();
      }
    } catch (_) {}

    try {
      if (!isAdminPath()) {
        const rawLogged = localStorage.getItem("anw_logged");
        const logged = rawLogged ? JSON.parse(rawLogged) : null;
        if (logged && logged.email) return String(logged.email || "").trim().toLowerCase();
      }
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

  const ADMIN_ALLOWED_ROLES = [
    "admin",
    "owner",
    "platform_support",
    "area_coordinator",
    "aux_coordinator",
    "assistant_area_coordinator"
  ];

  function getUsersKey() {
    try {
      const keys = window.ANW_KEYS || {};
      return keys.USERS || "anw_users";
    } catch (_) {
      return "anw_users";
    }
  }

  function canonicalAdminRole(value) {
    try {
      if (typeof window.anwGetCanonicalRole === "function") {
        const canonical = window.anwGetCanonicalRole({ role: value }, "");
        if (canonical) return String(canonical || "").trim().toLowerCase();
      }
    } catch (_) {}
    return normalizeRoleName(value);
  }

  function normRoleList(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value == null || value === "") return [];
    return String(value).split(/[;,|]/).map((part) => part.trim()).filter(Boolean);
  }



  function getUserEmails(user) {
    try {
      if (typeof window.anwGetUserEmails === "function") {
        return (window.anwGetUserEmails(user) || []).map((v) => String(v || "").trim().toLowerCase()).filter(Boolean);
      }
    } catch (_) {}

    return [
      user && user.email,
      user && user.userEmail,
      user && user.loginEmail,
      user && user.netlifyEmail
    ].map((v) => String(v || "").trim().toLowerCase()).filter(Boolean);
  }

  function getAdminRolesForEmail(email) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) return [];

    let users = [];
    try {
      if (typeof window.anwGetVerifiedUsers === "function") {
        users = window.anwGetVerifiedUsers() || [];
      }
    } catch (_) {
      users = [];
    }

    const row = Array.isArray(users)
      ? users.find((u) => getUserEmails(u).includes(cleanEmail))
      : null;

    if (!row || typeof row !== "object") return [];

    const roles = []
      .concat(normRoleList(row.type))
      .concat(normRoleList(row.role))
      .concat(normRoleList(row.roles))
      .concat(normRoleList(row.userRole))
      .concat(normRoleList(row.userRoles))
      .concat(normRoleList(row.residentType));

    return Array.from(new Set(roles.map(canonicalAdminRole).filter(Boolean)));
  }

  function hasAllowedAdminRole(roles) {
    const list = Array.isArray(roles) ? roles : [roles];
    const normalized = list.map(canonicalAdminRole).filter(Boolean);
    return normalized.some((role) => ADMIN_ALLOWED_ROLES.includes(role));
  }

  function getApprovedProfile() {
    try {
      if (typeof window.anwGetLoggedProfile === "function") {
        return window.anwGetLoggedProfile() || null;
      }
    } catch (_) {}
    return null;
  }

  function hasApprovedAccess() {
    try {
      const email = getLoggedEmail();
      if (!email) return false;
      if (isMasterOwnerEmail(email)) return true;
      if (typeof window.anwHasApprovedAccess === "function") {
        return !!window.anwHasApprovedAccess();
      }
      const profile = getApprovedProfile();
      if (typeof window.anwIsApproved === "function") {
        return !!window.anwIsApproved(profile);
      }
      const status = String(profile && (profile.status || profile.accountStatus || profile.registrationStatus) || "").trim().toLowerCase();
      return !!profile && (profile.approved === true || profile.active === true || status === "approved" || status === "active");
    } catch (_) {
      return false;
    }
  }

  function getRole() {
    try {
      const email = getLoggedEmail();
      if (email && isMasterOwnerEmail(email)) return "owner";

      if (isAdminPath() && email) {
        const roles = getAdminRolesForEmail(email);
        if (hasAllowedAdminRole(roles)) {
          return roles[0] || "admin";
        }
      }
    } catch (_) {}

    try {
      if (!isAdminPath() && typeof window.anwGetLoggedRole === "function") {
        const role = normalizeRoleName(window.anwGetLoggedRole());
        if (role) return role;
      }
    } catch (_) {}

    return "resident";
  }

  async function waitForAdminAuthReady(timeoutMs) {
    const limit = Number(timeoutMs || 4500);
    const started = Date.now();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    while (Date.now() - started < limit) {
      const loggedIn = isLoggedIn();
      const email = getLoggedEmail();

      if (loggedIn && email) {
        try {
          if (typeof window.anwInitStore === "function") {
            await window.anwInitStore();
          }
        } catch (_) {}
        return;
      }

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
    "page:help_center": "Public",
    "page:login": "Public",
    "page:privacy": "Public",
    "page:dashboard": "Authenticated",
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
      if (file === "help-center" || file === "help-center.html") return "page:help_center";
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
        await window.anwInitStore({ force: isAdminPath() });
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
    if (clean.toLowerCase() === "authenticated") return isLoggedIn() && hasApprovedAccess();
    if (!hasApprovedAccess() && !isMasterOwnerEmail(getLoggedEmail())) return false;
    return roleAllows(clean, role);
  }

  function renderGlobalHeader(role, acl) {
    try {
      if (isAdminPath()) return;

      const nav = document.querySelector("header.site-header nav.nav");
      if (!nav) return;

      const loggedIn = isLoggedIn();
      const email = getLoggedEmail();
      const pageKey = getPageKey();

      function navLink(href, label, key, extraClass) {
        const classes = [];
        if (extraClass) classes.push(extraClass);
        if (pageKey === key) classes.push("active");
        const classAttr = classes.length ? ' class="' + classes.join(" ") + '"' : "";
        return '<a' + classAttr + ' href="' + href + '">' + label + '</a>';
      }

      function fullMenuHtml() {
        return [
          navLink("index.html", "Home", "page:home"),
          navLink("about.html", "About", "page:about"),
          navLink("handbook.html", "Handbook", "page:handbook"),
          navLink("report.html", "Report", "page:report"),
          navLink("alerts.html", "Community Alerts", "page:alerts"),
          navLink("projects.html", "Community Projects", "page:projects"),
          navLink("login.html", "Login / Register", "page:login", "nav-login"),
          navLink("dashboard.html", "Dashboard", "page:dashboard"),
          navLink("household.html", "Household", "page:household"),
          navLink("admin.html", "Admin", "page:admin"),
          navLink("help-center.html", "Help", "page:help_center")
        ].join("");
      }

      function residentMenuHtml() {
        const items = [
          { key: "page:home", href: "index.html", label: "Home" },
          { key: "page:about", href: "about.html", label: "About" },
          { key: "page:handbook", href: "handbook.html", label: "Handbook" },
          { key: "page:report", href: "report.html", label: "Report" },
          { key: "page:dashboard", href: "dashboard.html", label: "Dashboard" },
          { key: "page:household", href: "household.html", label: "Household" }
        ];

        const html = items
          .filter(function (item) {
            const rule = resolveAclRule(acl, item.key);
            return ruleAllows(rule, role);
          })
          .map(function (item) {
            const classes = [];
            if (pageKey === item.key) classes.push("active");
            const classAttr = classes.length ? ' class="' + classes.join(" ") + '"' : "";
            return '<a' + classAttr + ' href="' + item.href + '">' + item.label + '</a>';
          })
          .join("");

        return html + '<a href="#" id="navLogout">Logout</a>' + '<a' + (pageKey === 'page:help_center' ? ' class="active"' : '') + ' href="help-center.html">Help</a>';
      }

      const adminLike = !!(email && (isMasterOwnerEmail(email) || hasAllowedAdminRole(getAdminRolesForEmail(email))));
      const shouldShowFullMenu = !loggedIn || adminLike || role !== "resident";
      const shouldShowResidentShort = loggedIn && hasApprovedAccess() && !adminLike && role === "resident";

      nav.innerHTML = shouldShowFullMenu ? fullMenuHtml() : residentMenuHtml();

      const logoutLink = nav.querySelector("#navLogout");
      if (!logoutLink) return;

      logoutLink.addEventListener("click", function (e) {
        e.preventDefault();

        try {
          if (
            window.netlifyIdentity &&
            typeof window.netlifyIdentity.logout === "function"
          ) {
            window.netlifyIdentity.logout();
          }
        } catch (_) {}

        try {
          const key =
            window.ANW_KEYS && window.ANW_KEYS.SESSION
              ? window.ANW_KEYS.SESSION
              : "anw_session";
          localStorage.removeItem(key);
        } catch (_) {}

        location.href = "index.html";
      });
    } catch (e) {
      console.warn("[acl-guard] renderGlobalHeader failed:", e);
    }
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
    const loggedIn = isLoggedIn();

    if (!loggedIn) {
      location.replace("login.html");
      return true;
    }

    if (role === "owner" || isMasterOwnerEmail(email)) {
      return false;
    }

    const adminRoles = getAdminRolesForEmail(email);
    if (hasAllowedAdminRole(adminRoles)) {
      return false;
    }

    const adminRule = resolveAclRule(acl, "page:admin");
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
        return;
      }
      if (!hasApprovedAccess()) {
        location.replace("login.html");
      }
      return;
    }

    if (!isLoggedIn()) {
      location.replace("login.html");
      return;
    }

    if (!hasApprovedAccess() && !isMasterOwnerEmail(getLoggedEmail())) {
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
    const key = String(keyOrRule || "").trim();

    if ((key === "page:admin" || isAdminPath()) && !isLoggedIn()) {
      return false;
    }

    if (key === "page:admin" || isAdminPath()) {
      const email = getLoggedEmail();
      if (email && isMasterOwnerEmail(email)) return true;
      if (hasAllowedAdminRole(getAdminRolesForEmail(email))) return true;
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

      renderGlobalHeader(role, acl);
      applyNav(role, acl);
      applyFeatures(role, acl);
      enforcePage(role, acl);
    } catch (e) {
      console.warn("[acl-guard] fallback after error:", e);
    } finally {
      try {
        document.body.removeAttribute("data-acl-loading");
      } catch (_) {}
      try {
        document.documentElement.removeAttribute("data-acl-loading");
      } catch (_) {}
    }
  });

  window.addEventListener("load", function () {
    try {
      document.body.removeAttribute("data-acl-loading");
    } catch (_) {}
    try {
      document.documentElement.removeAttribute("data-acl-loading");
    } catch (_) {}
  });
})();
