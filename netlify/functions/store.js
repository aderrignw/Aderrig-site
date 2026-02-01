import { getStore } from "@netlify/blobs";

/**
 * Secure KV store (Netlify Blobs) with Netlify Identity enforcement.
 *
 * RULES:
 * - Logged-in required for everything (except PUBLIC_READ_KEYS if you enable).
 * - anw_users:
 *   - admin: read/write all
 *   - resident: read/write only own record (GET returns 1-item array for compatibility)
 *   - enforce unique eircode server-side
 * - pending/suspended: no access to other keys
 * - active resident (non-admin):
 *   - can READ only allowlisted keys
 *   - can WRITE only allowlisted keys (with extra validation where needed)
 * - admin: full access
 *
 * ADDITION:
 * - Audit log key: anw_audit_log
 *   - resident (active): can POST a single event (append-only)
 *   - resident: cannot GET
 *   - admin: can GET (optionally filtered by eircode), can DELETE
 *   - retention: keep last 180 days automatically
 */

const PUBLIC_READ_KEYS = new Set([
  // safest default: none
]);

// Resident permissions (non-admin, active)
const RESIDENT_READ_KEYS = new Set([
  "anw_alerts",
  "anw_contacts",
  "anw_incidents",
  "anw_notices",
  "anw_acl",
  // "anw_projects",
]);

const RESIDENT_WRITE_KEYS = new Set([
  "anw_incidents",
]);

// === Audit log settings ===
const AUDIT_KEY = "anw_audit_log";
const AUDIT_RETENTION_DAYS = 180; // 6 months
const AUDIT_MAX_ITEMS = 5000;     // safety cap
const AUDIT_ALLOWED_EVENTS = new Set([
  "LOGIN_OK",
  "LOGIN_LOCKED",
  "PASSWORD_RESET_SENT",
]);

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

function safeLower(s) {
  return String(s || "").trim().toLowerCase();
}

function normalizeEircode(e) {
  return String(e || "").replace(/\s+/g, "").toUpperCase();
}

function normalizeEmail(e) {
  return safeLower(e);
}

function isAdmin(user) {
  const roles =
    user?.app_metadata?.roles ||
    user?.app_metadata?.role ||
    user?.user_metadata?.roles ||
    [];
  const list = Array.isArray(roles) ? roles : [roles];
  return list.map(String).map(r => r.toLowerCase()).includes("admin");
}

function isActiveStatus(status) {
  const st = safeLower(status);
  return st === "active" || st === "approved";
}

async function readBodyJson(req) {
  const text = await req.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function enforceUniqueEircode(usersList) {
  const seen = new Map(); // eircode -> email
  for (const u of usersList) {
    const e = normalizeEircode(u?.eircode || "");
    const mail = normalizeEmail(u?.email || "");
    if (!e) continue;
    if (seen.has(e) && seen.get(e) !== mail) {
      const msg = `Eircode already in use by another account (${e})`;
      const err = new Error(msg);
      err.code = "EIRCODE_CONFLICT";
      throw err;
    }
    seen.set(e, mail);
  }
}

/**
 * Protect "anw_incidents" from resident overwriting history:
 * - resident write must be an array
 * - all existing incident IDs must still exist in the new array
 * - existing incidents must not be modified (compare JSON)
 * - only NEW incidents are allowed and must have reporterEmail == logged-in email
 */
function enforceIncidentsAppendOnly(existingList, incomingList, loggedEmail) {
  const oldArr = Array.isArray(existingList) ? existingList : [];
  const newArr = Array.isArray(incomingList) ? incomingList : [];

  const oldById = new Map();
  for (const it of oldArr) {
    if (!it || !it.id) continue;
    oldById.set(String(it.id), JSON.stringify(it));
  }

  // 1) ensure all old IDs still present and unchanged
  for (const [id, oldJson] of oldById.entries()) {
    const found = newArr.find(x => x && String(x.id) === id);
    if (!found) {
      const err = new Error("Forbidden: cannot delete existing incidents");
      err.code = "INCIDENTS_DELETE_FORBIDDEN";
      throw err;
    }
    const newJson = JSON.stringify(found);
    if (newJson !== oldJson) {
      const err = new Error("Forbidden: cannot modify existing incidents");
      err.code = "INCIDENTS_EDIT_FORBIDDEN";
      throw err;
    }
  }

  // 2) new items must belong to the logged user
  const oldIds = new Set(oldArr.map(x => String(x?.id || "")));
  for (const it of newArr) {
    const id = String(it?.id || "");
    if (!id || oldIds.has(id)) continue;
    const rep = normalizeEmail(it?.reporterEmail || it?.email || "");
    if (rep !== loggedEmail) {
      const err = new Error("Forbidden: new incident reporterEmail must match your account email");
      err.code = "INCIDENTS_REPORTER_MISMATCH";
      throw err;
    }
  }
}

/* =========================
   AUDIT LOG HELPERS
   ========================= */

function isoNow() {
  return new Date().toISOString();
}

function cutoffIso(days) {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

function safeString(s, max = 200) {
  const v = String(s ?? "");
  return v.length > max ? v.slice(0, max) : v;
}

function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at <= 1) return "***";
  const name = e.slice(0, at);
  const dom = e.slice(at + 1);
  const domDot = dom.indexOf(".");
  const domName = domDot > 0 ? dom.slice(0, domDot) : dom;
  const domTld = domDot > 0 ? dom.slice(domDot) : "";
  const n = name.slice(0, 2) + "***";
  const d = (domName ? domName.slice(0, 2) : "") + "***" + domTld;
  return `${n}@${d}`;
}

function normalizeAuditEvent(raw, { email, userId }) {
  // raw can be {event, eircode, at?, meta?}
  const event = safeString(raw?.event || raw?.event_type || "").toUpperCase().trim();
  if (!AUDIT_ALLOWED_EVENTS.has(event)) {
    const err = new Error("Invalid audit event type");
    err.code = "AUDIT_BAD_EVENT";
    throw err;
  }

  const eircode = normalizeEircode(raw?.eircode || raw?.eir || "");
  if (!eircode) {
    const err = new Error("Missing eircode for audit event");
    err.code = "AUDIT_MISSING_EIRCODE";
    throw err;
  }

  const at = safeString(raw?.at || raw?.timestamp || isoNow(), 40);
  // We accept ISO strings; keep it simple and store as provided.
  // (Retention compares string lexicographically in ISO format, which is safe.)
  const meta = raw?.meta && typeof raw.meta === "object" ? raw.meta : null;

  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    at,
    event,
    eircode,
    userId: safeString(userId || "", 80),
    emailMasked: maskEmail(email),
    // meta kept minimal (optional)
    meta: meta ? meta : undefined,
  };
}

function applyAuditRetention(list) {
  const arr = Array.isArray(list) ? list : [];
  const cutoff = cutoffIso(AUDIT_RETENTION_DAYS);

  // Keep items with valid ISO >= cutoff; if missing "at", keep (conservative)
  const kept = arr.filter(it => {
    const at = String(it?.at || "");
    if (!at) return true;
    // ISO 8601 strings compare lexicographically (same format)
    return at >= cutoff;
  });

  // Cap to last AUDIT_MAX_ITEMS (keep newest at end)
  if (kept.length > AUDIT_MAX_ITEMS) {
    return kept.slice(kept.length - AUDIT_MAX_ITEMS);
  }
  return kept;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";

  // --- CORS
  const origin = req.headers.get("origin") || "";
  const corsHeaders = {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-allow-credentials": "true",
  };
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: corsHeaders });

  if (!key) return json({ error: "Missing ?key=" }, 400, corsHeaders);

  // --- Public reads (optional)
  if (req.method === "GET" && PUBLIC_READ_KEYS.has(key)) {
    const storeName = context?.site?.id ? `kv_${context.site.id}` : "kv_default";
    const store = getStore(storeName);
    const raw = await store.get(key, { type: "text" });
    const val = raw ? safeJsonParse(raw) : null;
    return json({ key, value: val }, 200, corsHeaders);
  }

  // --- Require logged-in user for everything else
  const user = context?.clientContext?.user;
  if (!user) return json({ error: "Unauthorized (login required)" }, 401, corsHeaders);

  const email = normalizeEmail(user.email);
  const admin = isAdmin(user);
  const userId = String(user?.sub || user?.id || user?.user_metadata?.id || "");

  const storeName = context?.site?.id ? `kv_${context.site.id}` : "kv_default";
  const store = getStore(storeName);

  try {
    async function getValue() {
      const raw = await store.get(key, { type: "text" });
      return raw ? safeJsonParse(raw) : null;
    }
    async function setValue(value) {
      await store.set(key, JSON.stringify(value));
    }

    /* =========================
       AUDIT LOG KEY (special)
       ========================= */
    if (key === AUDIT_KEY) {
      // Non-admin must be active to write audit events.
      if (!admin) {
        const usersList = (await store.get("anw_users", { type: "json" })) || [];
        const my = Array.isArray(usersList)
          ? usersList.find(u => normalizeEmail(u?.email) === email)
          : null;
        const st = my?.status || "pending";
        if (!isActiveStatus(st)) {
          return json({ error: "Account pending approval (no access yet)" }, 403, corsHeaders);
        }
      }

      // GET: admin only, with optional ?eircode= filter
      if (req.method === "GET") {
        if (!admin) return json({ error: "Forbidden" }, 403, corsHeaders);
        const eirFilter = normalizeEircode(url.searchParams.get("eircode") || "");
        const rawList = (await getValue()) || [];
        const list = applyAuditRetention(rawList);

        const filtered = eirFilter
          ? list.filter(x => normalizeEircode(x?.eircode) === eirFilter)
          : list;

        // Return newest first for admin convenience
        const out = [...filtered].reverse();
        return json({ key, value: out }, 200, corsHeaders);
      }

      // DELETE: admin only
      if (req.method === "DELETE") {
        if (!admin) return json({ error: "Forbidden" }, 403, corsHeaders);
        await store.delete(key);
        return json({ ok: true }, 200, corsHeaders);
      }

      // POST: append one event (admin or resident)
      if (req.method === "POST") {
        const body = await readBodyJson(req);
        const payload = body && body.value !== undefined ? body.value : body;

        // Accept either: {event, eircode, at?, meta?}
        const evRaw = payload && typeof payload === "object" ? payload : null;
        if (!evRaw) return json({ error: "Invalid body" }, 400, corsHeaders);

        const current = (await getValue()) || [];
        const list = applyAuditRetention(current);

        const entry = normalizeAuditEvent(evRaw, { email, userId });

        // extra safety: keep list append-only
        const next = applyAuditRetention([...list, entry]);
        await setValue(next);

        return json({ ok: true }, 200, corsHeaders);
      }

      // PUT: admin only (bulk replace), always re-apply retention
      if (req.method === "PUT") {
        if (!admin) return json({ error: "Forbidden" }, 403, corsHeaders);
        const body = await readBodyJson(req);
        const payload = body && body.value !== undefined ? body.value : body;

        const arr = Array.isArray(payload) ? payload : [];
        const next = applyAuditRetention(arr);
        await setValue(next);
        return json({ ok: true }, 200, corsHeaders);
      }

      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    // ===== anw_users special rules =====
    if (key === "anw_users") {
      const current = (await getValue()) || [];
      const usersList = Array.isArray(current) ? current : [];

      const myIndex = usersList.findIndex(u => normalizeEmail(u?.email) === email);
      const myRecord = myIndex >= 0 ? usersList[myIndex] : null;
      const myStatus = myRecord?.status || "pending";
      const amActive = isActiveStatus(myStatus);

      if (req.method === "GET") {
        if (admin) return json({ key, value: usersList }, 200, corsHeaders);
        return json({ key, value: myRecord ? [myRecord] : [] }, 200, corsHeaders);
      }

      if (req.method === "DELETE") {
        if (!admin) return json({ error: "Forbidden" }, 403, corsHeaders);
        await store.delete(key);
        return json({ ok: true }, 200, corsHeaders);
      }

      if (req.method === "POST" || req.method === "PUT") {
        const body = await readBodyJson(req);
        const payload = body && body.value !== undefined ? body.value : body;

        if (admin) {
          const nextList = Array.isArray(payload) ? payload : usersList;
          enforceUniqueEircode(nextList);
          await setValue(nextList);
          return json({ ok: true }, 200, corsHeaders);
        }

        const incomingRaw = payload && typeof payload === "object" ? payload : {};
        // Some pages send [me] (array) for compatibility. Accept it safely.
        const incoming = Array.isArray(incomingRaw)
          ? (incomingRaw.find(x => normalizeEmail(x?.email) === email) || incomingRaw[0] || {})
          : incomingRaw;

        const next = {
          ...(myRecord || {}),
          email, // force identity email

          // Basic editable fields
          name: incoming.name ?? (myRecord?.name || ""),
          phone: incoming.phone ?? (myRecord?.phone || ""),

          // Eircode normally protected in UI, but keep server-side normalization if provided
          eircode: incoming.eircode
            ? normalizeEircode(incoming.eircode)
            : normalizeEircode(myRecord?.eircode || ""),

          // Profile preferences (resident editable)
          coordinator: incoming.isCoordinator !== undefined
            ? !!incoming.isCoordinator
            : (incoming.coordinator !== undefined ? !!incoming.coordinator : !!(myRecord?.isCoordinator || myRecord?.coordinator)),
          isCoordinator: incoming.isCoordinator !== undefined
            ? !!incoming.isCoordinator
            : (incoming.coordinator !== undefined ? !!incoming.coordinator : !!(myRecord?.isCoordinator || myRecord?.coordinator)),

          // Alerts consent can be updated from Profile page
          alertsConsent: (incoming.alertsConsent && typeof incoming.alertsConsent === "object")
            ? incoming.alertsConsent
            : (myRecord?.alertsConsent || undefined),

          // Keep these true once accepted (profile sets it on save)
          termsAccepted: incoming.termsAccepted !== undefined ? !!incoming.termsAccepted : !!(myRecord?.termsAccepted),
          termsAcceptedAt: incoming.termsAcceptedAt || myRecord?.termsAcceptedAt || undefined,
        };


        // resident cannot self-approve
        next.status = amActive ? myStatus : "pending";

        // block resident from roles/admin fields
        delete next.role;
        delete next.roles;

        const tempList = [...usersList];
        if (myIndex >= 0) tempList[myIndex] = next;
        else tempList.push(next);

        enforceUniqueEircode(tempList);

        await setValue(tempList);
        return json({ ok: true }, 200, corsHeaders);
      }

      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    // ===== For ALL other keys =====

    // If not admin, must be ACTIVE and must respect key permissions
    if (!admin) {
      const usersList = (await store.get("anw_users", { type: "json" })) || [];
      const my = Array.isArray(usersList)
        ? usersList.find(u => normalizeEmail(u?.email) === email)
        : null;

      const st = my?.status || "pending";
      if (!isActiveStatus(st)) {
        return json({ error: "Account pending approval (no access yet)" }, 403, corsHeaders);
      }

      if (req.method === "GET") {
        if (!RESIDENT_READ_KEYS.has(key)) return json({ error: "Forbidden" }, 403, corsHeaders);
      } else if (req.method === "POST" || req.method === "PUT") {
        if (!RESIDENT_WRITE_KEYS.has(key)) return json({ error: "Forbidden" }, 403, corsHeaders);
      } else if (req.method === "DELETE") {
        return json({ error: "Forbidden" }, 403, corsHeaders);
      }
    }

    // Apply method behavior
    if (req.method === "GET") {
      const val = await getValue();
      return json({ key, value: val }, 200, corsHeaders);
    }

    if (req.method === "DELETE") {
      if (!admin) return json({ error: "Forbidden" }, 403, corsHeaders);
      await store.delete(key);
      return json({ ok: true }, 200, corsHeaders);
    }

    if (req.method === "POST" || req.method === "PUT") {
      const body = await readBodyJson(req);
      const payload = body && body.value !== undefined ? body.value : body;

      if (!admin && key === "anw_incidents") {
        const existing = await getValue();
        enforceIncidentsAppendOnly(existing, payload, email);
      }

      await setValue(payload);
      return json({ ok: true }, 200, corsHeaders);
    }

    return json({ error: "Method not allowed" }, 405, corsHeaders);
  } catch (err) {
    return json({ error: String(err?.message || err || "Unknown error") }, 500, corsHeaders);
  }
};
