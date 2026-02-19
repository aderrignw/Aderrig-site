import { getStore } from "@netlify/blobs";


function getCentralStore(context){
  const fixed = (process?.env?.CENTRAL_STORE_NAME || "").trim();
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : "kv_default");
  return getStore(storeName);
}

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
  "anw_handbook",
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
  const lowered = list.map(String).map(r => r.toLowerCase());
  return lowered.includes("admin") || lowered.includes("owner");
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

  // === DEV-ONLY: one-off reset of residents/users ===
  // Call in browser while running `netlify dev`:
  //   /.netlify/functions/store?key=anw_users&reset=1
  if (process.env.NETLIFY_DEV && url.searchParams.get("reset") === "1" && key === "anw_users") {
    const store = getCentralStore(context);
    await store.delete("anw_users");
    return json({ ok: true, deleted: "anw_users" }, 200, corsHeaders);
  }


  if (!key) return json({ error: "Missing ?key=" }, 400, corsHeaders);

  // =========================
  // SPECIAL: Nearby support lookup (Home page)
  // - Public (no login): returns counts only
  // - Logged-in + ACTIVE: returns names/phones + roles
  // =========================
  if (key === "nearby_support" && req.method === "POST") {
    // IMPORTANT:
    // Local dev and some environments may not have Blobs configured.
    // The Home page must NEVER fail because of that — it should safely return 0/0.
    let list = [];
    const body = await readBodyJson(req);
    const eircode = normalizeEircode(body?.eircode || body?.eir || "");
    if (!eircode) return json({ error: "Missing eircode" }, 400, corsHeaders);

    // Resolve an address for the Eircode (best-effort).
    // If Google Maps key is not configured yet, we fall back to OpenStreetMap Nominatim so local tests still show an address.
    async function resolveAddress(q) {
      const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_KEY || "";
      try {
        if (key) {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
          const r = await fetch(url);
          const data = await r.json();
          const first = data?.results?.[0];
          return first?.formatted_address || "";
        }
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { headers: { "accept": "application/json", "user-agent": "AderrigNW/1.0 (Netlify Function)" } });
        const data = await r.json();
        return (Array.isArray(data) && data[0]?.display_name) ? data[0].display_name : "";
      } catch (e) {
        return "";
      }
    }

    const address = await resolveAddress(eircode);

    try {
      const store = getCentralStore(context);
      const usersList = (await store.get("anw_users", { type: "json" })) || [];
      list = Array.isArray(usersList) ? usersList : [];
    } catch (e) {
      // Fail-safe: no store available, treat as no nearby support.
      const counts = { coordinators: 0, volunteers: 0 };
      const user = context?.clientContext?.user;
      return json({ ok: true, mode: user ? "counts" : "public", eircode, counts }, 200, corsHeaders);
    }

    function commonPrefixLen(a, b) {
      let n = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) break;
        n++;
      }
      return n;
    }

    const active = list.filter(u => isActiveStatus(u?.status || "pending"));
    const scored = active.map(u => {
      const ue = normalizeEircode(u?.eircode || u?.eir || "");
      const score = commonPrefixLen(ue, eircode);
      return { u, score };
    }).filter(x => x.score >= 3);

    scored.sort((a, b) => b.score - a.score);

    const coords = [];
    const vols = [];
    for (const { u } of scored) {
      const isCoord = !!(u?.isCoordinator ?? u?.coordinator);
      const isVol   = !!(u?.isVolunteer ?? u?.volunteer);
      if (isCoord) coords.push(u);
      if (isVol)   vols.push(u);
    }

    const counts = { coordinators: coords.length, volunteers: vols.length };

    // If not logged in (public): counts only
    const user = context?.clientContext?.user;
    if (!user) {
      return json({ ok: true, mode: "public", eircode, address, counts }, 200, corsHeaders);
    }

    // Logged-in: only ACTIVE residents can see names/phones
    const email = normalizeEmail(user.email);
    const me = list.find(u => normalizeEmail(u?.email) === email);
    const isApproved = !!me && isActiveStatus(me?.status || "pending");

    if (!isApproved) {
      return json({ ok: true, mode: "counts", eircode, address, counts }, 200, corsHeaders);
    }

    function volunteerRoleLabels(u) {
      const vr = u?.volunteerRoles || u?.volunteer_roles || u?.volunteer || {};
      const roles = [];
      if (vr.streetWatch)  roles.push("Street watch");
      if (vr.leaflets)     roles.push("Leaflets");
      if (vr.techSupport)  roles.push("Tech support");
      if (vr.elderly)      roles.push("Elderly checks");
      if (vr.cleanUp)      roles.push("Community Clean-Up");
      if (vr.parking)      roles.push("Parking Assistance");
      if (vr.meetings)     roles.push("Meetings");
      if (vr.translation)  roles.push("Translation");
      return roles;
    }

    const coordinators = coords.map(u => ({
      name: u?.name || "Coordinator",
      phone: u?.phone || null,
      role: "Street coordinator"
    }));

    const volunteers = vols.map(u => {
      const roles = volunteerRoleLabels(u);
      return {
        name: u?.name || "Volunteer",
        phone: u?.phone || null,
        role: roles.length ? roles.join(", ") : "Volunteer"
      };
    });

    return json({
      ok: true,
      mode: "details",
      eircode,
      counts,
      coordinators,
      volunteers
    }, 200, corsHeaders);
  }


  // --- Public reads (optional)
  if (req.method === "GET" && PUBLIC_READ_KEYS.has(key)) {
    const store = getCentralStore(context);
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

  const store = getCentralStore(context);

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

        // Front-end may send the full users array; accept either a single object or an array and
        // extract the record for the logged-in email.
        const incomingRaw = Array.isArray(payload)
          ? (payload.find(u => normalizeEmail(u?.email) === email) || {})
          : (payload && typeof payload === "object" ? payload : {});

        // Allowlist of fields residents can write to their own record (used at registration / profile edits).
        const incoming = {
          name: incomingRaw.name,
          phone: incomingRaw.phone,
          eircode: incomingRaw.eircode,
          address: incomingRaw.address,
          residentType: incomingRaw.residentType ?? incomingRaw.type,
          managementCompany: incomingRaw.managementCompany,
          coordinator: incomingRaw.coordinator ?? incomingRaw.isCoordinator,
          isCoordinator: incomingRaw.isCoordinator ?? incomingRaw.coordinator,
          volunteer: incomingRaw.volunteer ?? incomingRaw.isVolunteer,
          isVolunteer: incomingRaw.isVolunteer ?? incomingRaw.volunteer,
          vol_roles: incomingRaw.vol_roles,
          termsAcceptedAt: incomingRaw.termsAcceptedAt,
          termsAccepted: incomingRaw.termsAccepted,
          alertsConsent: incomingRaw.alertsConsent,
          createdAt: incomingRaw.createdAt,
          regDate: incomingRaw.regDate,
        };

        const next = {
          ...(myRecord || {}),
          // force identity email (cannot be changed client-side)
          email,
          name: incoming.name ?? (myRecord?.name || ""),
          phone: incoming.phone ?? (myRecord?.phone || ""),
          address: incoming.address ?? (myRecord?.address || ""),
          residentType: incoming.residentType ?? (myRecord?.residentType || myRecord?.type || ""),
          managementCompany: incoming.managementCompany ?? (myRecord?.managementCompany || ""),
          coordinator: incoming.coordinator ?? (myRecord?.coordinator || false),
          isCoordinator: incoming.isCoordinator ?? (myRecord?.isCoordinator || false),
          volunteer: incoming.volunteer ?? (myRecord?.volunteer || false),
          isVolunteer: incoming.isVolunteer ?? (myRecord?.isVolunteer || false),
          vol_roles: incoming.vol_roles ?? (myRecord?.vol_roles || {}),
          termsAcceptedAt: incoming.termsAcceptedAt ?? (myRecord?.termsAcceptedAt || ""),
          termsAccepted: incoming.termsAccepted ?? (myRecord?.termsAccepted || false),
          alertsConsent: incoming.alertsConsent ?? (myRecord?.alertsConsent || null),
          createdAt: incoming.createdAt ?? (myRecord?.createdAt || ""),
          regDate: incoming.regDate ?? (myRecord?.regDate || ""),
          eircode: incoming.eircode ? normalizeEircode(incoming.eircode) : normalizeEircode(myRecord?.eircode || ""),
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
    const message = String(err?.message || err || "Unknown error");

    // Friendly fallback for Home lookup (return 0 instead of a hard failure)
    if (key === "nearby_support" && req.method === "POST") {
      const body = await readBodyJson(req).catch(() => null);
      const eircode = normalizeEircode(body?.eircode || body?.eir || "");
      const counts = { coordinators: 0, volunteers: 0 };
      const user = context?.clientContext?.user;
      const mode = user ? "counts" : "public";
      return json({ ok: true, mode, eircode, counts, warning: message }, 200, corsHeaders);
    }

    return json({ error: message }, 500, corsHeaders);
  }

};
