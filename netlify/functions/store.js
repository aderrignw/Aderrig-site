// netlify/functions/store.js  (ESM)
// Fix: Use ESM import (project has "type": "module") and pass Blobs creds explicitly.
// Also includes safe debug endpoint: ?key=__env
import { getStore } from "@netlify/blobs";

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const normEmail = (v) => String(v || "").trim().toLowerCase();

const isMasterEmail = (email) => {
  const master = normEmail(process.env.MASTER_EMAIL || process.env.ANW_MASTER_EMAIL || "");
  return !!master && normEmail(email) === master;
};

const getBlobsCreds = () => {
  // Prefer your current env var names, but also accept common alternatives
  const siteID = String(
    process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || ""
  ).trim();
  const token = String(
    process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN || ""
  ).trim();

  if (!siteID || !token) {
    const missing = [
      !siteID ? "NETLIFY_BLOBS_SITE_ID (or NETLIFY_SITE_ID)" : null,
      !token ? "NETLIFY_BLOBS_TOKEN (or NETLIFY_AUTH_TOKEN)" : null,
    ].filter(Boolean);
    throw new Error(
      `Missing Blobs credentials in runtime: ${missing.join(
        ", "
      )}. In Netlify UI, scope them to Functions/Runtime (Production).`
    );
  }
  return { siteID, token };
};

const getCentralStore = (context) => {
  const fixed = String(process.env.CENTRAL_STORE_NAME || "").trim();
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : "kv_default");
  const { siteID, token } = getBlobsCreds();
  // This is the signature shown in Netlify docs:
  return getStore(storeName, { siteID, token });
};

const getIdentityUser = async (req, context) => {
  const ctxUser = context?.clientContext?.user;
  if (ctxUser?.email) return ctxUser;

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  // Build absolute base URL
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = req.headers.get("host") || "";
  const base = String(process.env.URL || process.env.DEPLOY_PRIME_URL || (host ? `${proto}://${host}` : "")).trim();
  if (!base) return null;

  try {
    const res = await fetch(`${base}/.netlify/identity/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

export const handler = async (event, context) => {
  try {
    const key = String(event.queryStringParameters?.key || "").trim();
    if (!key) return json(400, { ok: false, error: "Missing key" });

    if (event.httpMethod === "GET" && key === "__env") {
      const hasSite = !!String(process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || "").trim();
      const hasTok = !!String(process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN || "").trim();
      return json(200, {
        ok: true,
        has_siteID_var: hasSite,
        has_token_var: hasTok,
        CENTRAL_STORE_NAME: String(process.env.CENTRAL_STORE_NAME || "").trim() || null,
      });
    }

    const store = getCentralStore(context);

    // Build a Request-like wrapper to read headers nicely
    const req = new Request("https://local/", { headers: event.headers || {} });

    const user = await getIdentityUser(req, context);
    const email = user?.email ? normEmail(user.email) : "";
    const master = isMasterEmail(email);

    const loadValue = async (defaultVal) => {
      const v = await store.get(key, { type: "json" });
      return v == null ? defaultVal : v;
    };

    if (event.httpMethod === "GET") {
      const data = await loadValue(key === "anw_users" ? [] : {});
      if (key === "anw_users") {
        if (master) return json(200, Array.isArray(data) ? data : []);
        if (!email) return json(401, { ok: false, error: "Not authenticated" });
        const arr = Array.isArray(data) ? data : [];
        const me = arr.find((u) => normEmail(u?.email) === email) || null;
        return json(200, { me });
      }
      return json(200, data);
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try { body = JSON.parse(event.body || "{}"); } catch {}
      const action = String(body.action || "");

      if (key === "anw_users") {
        if (!email && !master) return json(401, { ok: false, error: "Not authenticated" });

        const users = await loadValue([]);
        const arr = Array.isArray(users) ? users : [];

        if (action === "append_me") {
          if (!email) return json(401, { ok: false, error: "Not authenticated" });

          const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
          const pEmail = normEmail(profile.email || email);
          if (pEmail !== email) return json(403, { ok: false, error: "Email mismatch" });

          const now = new Date().toISOString();
          const record = {
            ...profile,
            email,
            status: profile.status || (master ? "active" : "pending"),
            role: profile.role || (master ? "owner" : "resident"),
            createdAt: profile.createdAt || now,
            updatedAt: now,
          };

          const idx = arr.findIndex((u) => normEmail(u?.email) === email);
          if (idx >= 0) arr[idx] = { ...arr[idx], ...record };
          else arr.push(record);

          await store.set(key, arr, { type: "json" });
          return json(200, { ok: true, me: record });
        }

        if (action === "admin_save_users") {
          if (!master) return json(403, { ok: false, error: "Admin only" });
          const list = Array.isArray(body.users) ? body.users : [];
          await store.set(key, list, { type: "json" });
          return json(200, { ok: true, count: list.length });
        }

        return json(400, { ok: false, error: "Unknown action" });
      }

      if (!master) return json(403, { ok: false, error: "Admin only" });
      await store.set(key, body.value ?? body, { type: "json" });
      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
};
