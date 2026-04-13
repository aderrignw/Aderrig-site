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

  function getAdminRolesForEmail(email) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) return [];

    let users = [];
    try {
      if (typeof window.anwLoad === "function") {
        users = window.anwLoad(getUsersKey(), []) || [];
      } else {
        const raw = localStorage.getItem(getUsersKey());
        users = raw ? JSON.parse(raw) : [];
      }
    } catch (_) {
      users = [];
    }

    const row = Array.isArray(users)
      ? users.find((u) => String((u && (u.email || u.userEmail || "")) || "").trim().toLowerCase() === cleanEmail)
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

    try {
      if (!isAdminPath()) {
        const rawLogged = localStorage.getItem("anw_logged");
        const logged = rawLogged ? JSON.parse(rawLogged) : null;
        const role = normalizeRoleName(
          logged && (logged.role || logged.primaryRole || (Array.isArray(logged.roles) ? logged.roles[0] : ""))
        );
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
    "page:login": "Public",
    "page:privacy": "Public",
    "page:dashboard": "Public",
    "page:report": "resident",
    "page:report-map": "resident",
    "page:household": "resident",
    "page:alerts": "assistant_area_coordinator",
    "page:projects": "projects",
    "page:admin": "owner"
  };

  const BUILTIN_FEATURE_RULES = {
    "report:tab_incident": "resident",
    "report:tab_status": "resident",
    "report:tab_map": "resident",
    "household:tab_volunteers": "resident",
    "household:tab_tasks": "resident",
    "alerts:tab_send_alert": "assistant_area_coordinator",
    "alerts:tab_send_action": "assistant_area_coordinator",
    "alerts:tab_authorised_contacts": "assistant_area_coordinator"
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
      if (file === "report-map" || file === "report-map.html") return "page:report-map";
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

    if (Object.prototype.hasOwnProperty.call(BUILTIN_FEATURE_RULES, raw)) {
      return BUILTIN_FEATURE_RULES[raw];
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


  function renderGlobalHeader(role, acl) {
    try {
      if (isAdminPath()) return;

      const nav = document.querySelector("header.site-header nav.nav");
      if (!nav) return;

      const pageKey = getPageKey();
      const loggedIn = isLoggedIn();
      const items = [
        { key: "page:home", href: "index.html", label: "Home", publicOnly: false },
        { key: "page:about", href: "about.html", label: "About", publicOnly: false },
        { key: "page:handbook", href: "handbook.html", label: "Handbook", publicOnly: false },
        { key: "page:report", href: "report.html", label: "Report", authOnly: true },
        { key: "page:alerts", href: "alerts.html", label: "Community Alerts", authOnly: true },
        { key: "page:projects", href: "projects.html", label: "Community Projects", authOnly: true },
        { key: "page:dashboard", href: "dashboard.html", label: "Dashboard", authOnly: true },
        { key: "page:household", href: "household.html", label: "Household", authOnly: true },
        { key: "page:admin", href: "admin.html", label: "Admin", authOnly: true },
        { key: "page:login", href: "login.html", label: "Login / Register", guestOnly: true, className: "nav-login" }
      ];

      const html = items.filter(function (item) {
        if (item.guestOnly) return !loggedIn;
        if (item.authOnly && !loggedIn) return false;
        const rule = resolveAclRule(acl, item.key);
        return ruleAllows(rule, role);
      }).map(function (item) {
        const classes = [];
        if (item.className) classes.push(item.className);
        if (pageKey === item.key) classes.push("active");
        const classAttr = classes.length ? ' class="' + classes.join(" ") + '"' : "";
        return '<a' + classAttr + ' href="' + item.href + '">' + item.label + '</a>';
      }).join("");

      if (html) nav.innerHTML = html;
    } catch (e) {
      console.warn("[acl-guard] renderGlobalHeader failed:", e);
    }
  }

  function isVisibleNode(el) {
    if (!el) return false;
    try {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    } catch (_) {
      return el.style.display !== "none";
    }
  }

  function syncResidentSubtabs() {
    const pageKey = getPageKey();

    if (pageKey === "page:report") {
      const btnReport = document.getElementById("btnTabReport");
      const btnStatus = document.getElementById("btnTabStatus");
      const panelNew = document.getElementById("tabNew");
      const panelStatus = document.getElementById("tabStatus");
      const visible = [];
      if (isVisibleNode(btnReport) && isVisibleNode(panelNew)) visible.push({ btn: btnReport, panel: panelNew });
      if (isVisibleNode(btnStatus) && isVisibleNode(panelStatus)) visible.push({ btn: btnStatus, panel: panelStatus });
      if (!visible.length) return;

      let active = visible.find(function (entry) { return entry.btn.classList.contains("active"); });
      if (!active || !isVisibleNode(active.panel)) active = visible[0];

      [panelNew, panelStatus].forEach(function (panel) {
        if (panel) panel.style.display = panel === active.panel ? "block" : "none";
      });
      [btnReport, btnStatus].forEach(function (btn) {
        if (btn) btn.classList.toggle("active", btn === active.btn);
      });
    }

    if (pageKey === "page:household") {
      const buttons = Array.from(document.querySelectorAll(".hh-tab"));
      const visibleButtons = buttons.filter(isVisibleNode);
      if (!visibleButtons.length) return;

      let active = visibleButtons.find(function (btn) { return btn.classList.contains("active"); });
      if (!active) active = visibleButtons[0];

      visibleButtons.forEach(function (btn) {
        const paneId = btn.getAttribute("data-pane");
        const pane = paneId ? document.getElementById(paneId) : null;
        const on = btn === active;
        btn.classList.toggle("active", on);
        if (pane) pane.style.display = on ? "block" : "none";
      });

      buttons.filter(function (btn) { return !visibleButtons.includes(btn); }).forEach(function (btn) {
        const paneId = btn.getAttribute("data-pane");
        const pane = paneId ? document.getElementById(paneId) : null;
        btn.classList.remove("active");
        if (pane) pane.style.display = "none";
      });
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
      syncResidentSubtabs();
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
