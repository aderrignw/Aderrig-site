import { getStore } from "@netlify/blobs";

/**
 * OPEN MODE (temporary)
 * =====================
 * This function is intentionally "open" so you can reliably create anw_users
 * and unblock development.
 *
 * - NO Netlify Identity required
 * - ANYONE can GET/POST/PUT/DELETE any key
 * - ALWAYS uses ONE central Blobs store so data is consistent
 * - ALWAYS ensures MASTER user exists in anw_users as ACTIVE OWNER
 *
 * IMPORTANT: Once everything is working, lock this down again.
 */

// ---- Central store name (single place for all data)
function getCentralStore(context){
  const fixed = (process?.env?.CENTRAL_STORE_NAME || "aderrignw").trim();
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : "kv_default");
  return getStore(storeName);
}

// ---- Master user (auto-created/auto-approved)
const MASTER_EMAIL  = "claudiosantos1968@gmail.com";
const MASTER_NAME   = "Claudio Santos";
const MASTER_EIRCODE = "K78T2W8";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function safeJsonParse(s) { try { return JSON.parse(s); } catch { return s; } }
function normalizeEmail(e){ return String(e || "").trim().toLowerCase(); }
function normalizeEircode(e){ return String(e || "").replace(/\s+/g,"").toUpperCase(); }

async function ensureMaster(store){
  const key = "anw_users";
  let list = (await store.get(key, { type: "json" })) || [];
  list = Array.isArray(list) ? list : [];
  const masterEmail = normalizeEmail(MASTER_EMAIL);
  const idx = list.findIndex(u => normalizeEmail(u?.email) === masterEmail);
  const patch = {
    name: MASTER_NAME,
    email: masterEmail,
    eircode: normalizeEircode(MASTER_EIRCODE),
    role: "owner",
    status: "active",
    residentType: "Owner",
    updatedAt: new Date().toISOString(),
    createdAt: (idx >= 0 && list[idx]?.createdAt) ? list[idx].createdAt : new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = { ...(list[idx]||{}), ...patch };
  else list.push(patch);
  await store.set(key, JSON.stringify(list));
  return list.length;
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

  const store = getCentralStore(context);

  try{
    // Always keep master present
    await ensureMaster(store);

    if (req.method === "GET") {
      const raw = await store.get(key, { type: "text" });
      const val = raw ? safeJsonParse(raw) : null;
      return json({ key, value: val }, 200, corsHeaders);
    }

    if (req.method === "DELETE") {
      await store.delete(key);
      await ensureMaster(store);
      return json({ ok: true }, 200, corsHeaders);
    }

    if (req.method === "POST" || req.method === "PUT") {
      const text = await req.text();
      const body = text ? (safeJsonParse(text) || null) : null;
      const payload = (body && typeof body === "object" && "value" in body) ? body.value : body;

      // Special: if writing anw_users, auto-approve master + normalize basics
      if (key === "anw_users") {
        let list = Array.isArray(payload) ? payload : (payload && typeof payload === "object" ? [payload] : []);
        list = list.map(u => ({
          ...u,
          email: normalizeEmail(u?.email),
          eircode: normalizeEircode(u?.eircode),
          // if they pass status/role keep; otherwise default to active for now
          status: (u?.status || "active"),
          role: (u?.role || ""),
        }));
        await store.set(key, JSON.stringify(list));
        await ensureMaster(store);
        return json({ ok: true, key, count: list.length }, 200, corsHeaders);
      }

      await store.set(key, JSON.stringify(payload));
      return json({ ok: true }, 200, corsHeaders);
    }

    return json({ error: "Method not allowed" }, 405, corsHeaders);

  }catch(e){
    return json({ error: String(e?.message || e || "Unknown error") }, 500, corsHeaders);
  }
};
