// assets/security/safe-html.js
// ADERRIG security helper layer
// Purpose: provide safe output helpers for dynamic content without changing existing page behaviour.
// This file is intentionally conservative: it does not rewrite page content automatically.

(function () {
  "use strict";

  if (window.ANW_SECURITY && window.ANW_SECURITY.version) {
    return;
  }

  const VERSION = "1.0.0";

  const TARGET_PAGES = new Set([
    "admin.html",
    "dashboard.html",
    "report-map.html",
    "projects.html",
    "handbook.html",
    "help-center.html",
    "index.html"
  ]);

  function currentFileName() {
    try {
      const path = String(window.location && window.location.pathname || "");
      const file = path.split("/").filter(Boolean).pop() || "index.html";
      return file.toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function isTargetPage() {
    try {
      return TARGET_PAGES.has(currentFileName());
    } catch (_) {
      return false;
    }
  }

  function toString(value) {
    if (value === null || typeof value === "undefined") return "";
    return String(value);
  }

  function escapeHtml(value) {
    return toString(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value)
      .replace(/`/g, "&#096;")
      .replace(/=/g, "&#061;");
  }

  function normaliseWhitespace(value) {
    return toString(value).replace(/\s+/g, " ").trim();
  }

  function safeText(value, fallback) {
    const text = normaliseWhitespace(value);
    if (text) return text;
    return typeof fallback === "undefined" ? "" : toString(fallback);
  }

  function safeMultilineText(value, fallback) {
    const text = toString(value)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();

    if (text) return text;
    return typeof fallback === "undefined" ? "" : toString(fallback);
  }

  function safeHtmlText(value, fallback) {
    return escapeHtml(safeText(value, fallback));
  }

  function safeHtmlMultiline(value, fallback) {
    return escapeHtml(safeMultilineText(value, fallback)).replace(/\n/g, "<br>");
  }

  function safeNumber(value, fallback) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    return typeof fallback === "number" ? fallback : 0;
  }

  function safeInteger(value, fallback) {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return n;
    return typeof fallback === "number" ? fallback : 0;
  }

  function safeBoolean(value) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  function safeDateText(value, fallback) {
    try {
      const raw = safeText(value);
      if (!raw) return typeof fallback === "undefined" ? "" : toString(fallback);
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return escapeHtml(raw);
      return escapeHtml(date.toLocaleDateString("en-IE"));
    } catch (_) {
      return typeof fallback === "undefined" ? "" : escapeHtml(fallback);
    }
  }

  function safeUrl(value, options) {
    const opts = options || {};
    const allowRelative = opts.allowRelative !== false;
    const allowedProtocols = Array.isArray(opts.allowedProtocols)
      ? opts.allowedProtocols
      : ["http:", "https:", "mailto:", "tel:"];

    try {
      const raw = toString(value).trim();
      if (!raw) return "";

      if (/^(javascript|data|vbscript):/i.test(raw)) return "";

      const url = new URL(raw, window.location.origin);

      if (!allowedProtocols.includes(url.protocol)) return "";

      if (!allowRelative && url.origin === window.location.origin && !/^https?:/i.test(raw)) {
        return "";
      }

      return url.href;
    } catch (_) {
      return "";
    }
  }

  function safeImageUrl(value) {
    return safeUrl(value, {
      allowedProtocols: ["http:", "https:"],
      allowRelative: true
    });
  }

  function setText(element, value, fallback) {
    if (!element) return;
    element.textContent = safeText(value, fallback);
  }

  function setMultilineText(element, value, fallback) {
    if (!element) return;
    element.textContent = safeMultilineText(value, fallback);
  }

  function setHtmlText(element, value, fallback) {
    if (!element) return;
    element.innerHTML = safeHtmlText(value, fallback);
  }

  function setHtmlMultiline(element, value, fallback) {
    if (!element) return;
    element.innerHTML = safeHtmlMultiline(value, fallback);
  }

  function setAttribute(element, name, value) {
    if (!element || !name) return;

    const attr = String(name).toLowerCase();

    if (attr.startsWith("on")) {
      return;
    }

    if (attr === "href" || attr === "src" || attr === "action") {
      const safe = attr === "src" ? safeImageUrl(value) : safeUrl(value);
      if (safe) element.setAttribute(name, safe);
      return;
    }

    element.setAttribute(name, escapeAttribute(value));
  }

  function createTextNode(value, fallback) {
    return document.createTextNode(safeText(value, fallback));
  }

  function createElement(tagName, options) {
    const tag = safeText(tagName).toLowerCase();

    if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
      return document.createElement("span");
    }

    const el = document.createElement(tag);
    const opts = options || {};

    if (opts.className) {
      el.className = safeText(opts.className);
    }

    if (opts.text !== undefined) {
      el.textContent = safeText(opts.text);
    }

    if (opts.attrs && typeof opts.attrs === "object") {
      Object.keys(opts.attrs).forEach(function (key) {
        setAttribute(el, key, opts.attrs[key]);
      });
    }

    return el;
  }

  function clearElement(element) {
    if (!element) return;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function appendText(element, value, fallback) {
    if (!element) return;
    element.appendChild(createTextNode(value, fallback));
  }

  function renderSafeList(container, items, renderItem) {
    if (!container || !Array.isArray(items) || typeof renderItem !== "function") return;

    clearElement(container);

    const fragment = document.createDocumentFragment();

    items.forEach(function (item, index) {
      const node = renderItem(item, index, window.ANW_SECURITY);
      if (node && node.nodeType) {
        fragment.appendChild(node);
      }
    });

    container.appendChild(fragment);
  }

  function safeJsonParse(value, fallback) {
    try {
      if (!value) return fallback;
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function safeJsonStringify(value, fallback) {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return typeof fallback === "undefined" ? "{}" : toString(fallback);
    }
  }

  function stripDangerousHtml(value) {
    // Conservative fallback sanitizer for cases where plain text is not acceptable.
    // Prefer escapeHtml/safeHtmlText for user-generated content.
    const template = document.createElement("template");
    template.innerHTML = toString(value);

    const blockedTags = new Set([
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "base",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "option"
    ]);

    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];

    while (walker.nextNode()) {
      const el = walker.currentNode;
      const tag = String(el.tagName || "").toLowerCase();

      if (blockedTags.has(tag)) {
        toRemove.push(el);
        continue;
      }

      Array.from(el.attributes || []).forEach(function (attr) {
        const name = String(attr.name || "").toLowerCase();
        const val = String(attr.value || "");

        if (name.startsWith("on")) {
          el.removeAttribute(attr.name);
          return;
        }

        if ((name === "href" || name === "src" || name === "action") && !safeUrl(val)) {
          el.removeAttribute(attr.name);
        }
      });
    }

    toRemove.forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    return template.innerHTML;
  }

  function setSanitizedHtml(element, html) {
    if (!element) return;
    element.innerHTML = stripDangerousHtml(html);
  }

  function installPassiveClickProtection() {
    try {
      if (window.__anwSecurityPassiveClickProtectionInstalled) return;
      window.__anwSecurityPassiveClickProtectionInstalled = true;

      document.addEventListener("click", function (event) {
        try {
          if (!isTargetPage()) return;

          const link = event.target && event.target.closest
            ? event.target.closest("a[href]")
            : null;

          if (!link) return;

          const href = link.getAttribute("href") || "";

          if (/^\s*(javascript|data|vbscript):/i.test(href)) {
            event.preventDefault();
            event.stopPropagation();
            link.removeAttribute("href");
            console.warn("[ANW_SECURITY] Blocked unsafe link protocol.");
          }
        } catch (_) {}
      }, true);
    } catch (_) {}
  }

  function installPassiveFormProtection() {
    try {
      if (window.__anwSecurityPassiveFormProtectionInstalled) return;
      window.__anwSecurityPassiveFormProtectionInstalled = true;

      document.addEventListener("submit", function (event) {
        try {
          if (!isTargetPage()) return;

          const form = event.target;
          if (!form || !form.getAttribute) return;

          const action = form.getAttribute("action") || "";
          if (action && !safeUrl(action, { allowedProtocols: ["http:", "https:"], allowRelative: true })) {
            event.preventDefault();
            event.stopPropagation();
            console.warn("[ANW_SECURITY] Blocked unsafe form action.");
          }
        } catch (_) {}
      }, true);
    } catch (_) {}
  }

  window.ANW_SECURITY = Object.freeze({
    version: VERSION,
    targetPages: Array.from(TARGET_PAGES),
    currentFileName: currentFileName,
    isTargetPage: isTargetPage,

    escapeHtml: escapeHtml,
    escapeAttribute: escapeAttribute,
    safeText: safeText,
    safeMultilineText: safeMultilineText,
    safeHtmlText: safeHtmlText,
    safeHtmlMultiline: safeHtmlMultiline,
    safeNumber: safeNumber,
    safeInteger: safeInteger,
    safeBoolean: safeBoolean,
    safeDateText: safeDateText,
    safeUrl: safeUrl,
    safeImageUrl: safeImageUrl,

    setText: setText,
    setMultilineText: setMultilineText,
    setHtmlText: setHtmlText,
    setHtmlMultiline: setHtmlMultiline,
    setAttribute: setAttribute,
    createTextNode: createTextNode,
    createElement: createElement,
    clearElement: clearElement,
    appendText: appendText,
    renderSafeList: renderSafeList,

    safeJsonParse: safeJsonParse,
    safeJsonStringify: safeJsonStringify,
    stripDangerousHtml: stripDangerousHtml,
    setSanitizedHtml: setSanitizedHtml
  });

  installPassiveClickProtection();
  installPassiveFormProtection();
})();
