/* netlify/functions/store.js
   Robust Netlify Blobs init:
   - Works whether @netlify/blobs expects (name, opts) OR ({ name, siteID, token }) style.
   - Uses explicit NETLIFY_BLOBS_SITE_ID / NETLIFY_BLOBS_TOKEN to avoid MissingBlobsEnvironmentError.
   - Includes safe env debug endpoint: ?key=__env
*/
const { getStore } = require("@netlify/blobs");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function isMasterEmail(email) {
  const master = normEmail(process.env.MASTER_EMAIL || process.env.ANW_MASTER_EMAIL || "");
  return !!master && normEmail(email) === master;
}

function getBlobsCreds() {
  const siteID = String(process.env.NETLIFY_BLOBS_SITE_ID || "").trim();
  const token = String(process.env.NETLIFY_BLOBS_TOKEN || "").trim();
  if (!siteID || !token) {
    const missing = [
      !siteID ? "NETLIFY_BLOBS_SITE_ID" : null,
      !token ? "NETLIFY_BLOBS_TOKEN" : null,
    ].filter(Boolean);
    throw new Error(
      `Missing Netlify Blobs credentials in function runtime: ${missing.join(
        ", "
      )}. Check Environment variables scopes: Functions + Runtime (Production).`
    );
  }
  return { siteID, token };
}

/**
 * Some versions of @netlify/blobs support:
 *   getStore(name, { siteID, token })
 * Others support:
 *   getStore({ name, siteID, token })
 * This helper tries both + handles siteId casing.
 */
function createStore(storeName) {
  const { siteID, token } = getBlobsCreds();

  const optsVariants = [
    { siteID, token },
    { siteId: siteID, token },
    { siteID, siteId: siteID, token },
  ];

  // 1) try (name, opts)
  for (const opts of optsVariants) {
    try {
      return getStore(storeName, opts);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (!msg.includes("MissingBlobsEnvironmentError")) throw e;
    }
  }

  // 2) try ({ name, ...opts })
  for (const opts of optsVariants) {
    try {
      return getStore({ name: storeName, ...opts });
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (!msg.includes("MissingBlobsEnvironmentError")) throw e;
    }
  }

  // If we got here, surface the original error clearly
  throw new Error(
    "MissingBlobsEnvironmentError: unable to initialize Netlify Blobs store even though credentials are present. " +
      "This usually means the installed @netlify/blobs package expects a different initialization signature."
  );
}

function getCentralStore(context) {
  const fixed = String(process.env.CENTRAL_STORE_NAME || "").trim();
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : "kv_default");
  return createStore(storeName);
}

async function getIdentityUser(event, context) {
  const ctxUser = context?.clientContext?.user;
  if (ctxUser?.email) return ctxUser;

  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const proto =
    String(event.headers?.["x-forwarded-proto"] || event.headers?.["X-Forwarded-Proto"] || "https")
      .split(",")[0]
      .trim();
  const host = event.headers?.host || event.headers?.Host || "";
  const base =
    String(process.env.URL || process.env.DEPLOY_PRIME_URL || (host ? `${proto}://${host}` : "")).trim();
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
}

exports.handler = async (event, context) => {
  try {
    const key = String(event.queryStringParameters?.key || "").trim();
    if (!key) return json(400, { ok: false, error: "Missing key" });

    // Safe debug endpoint (only booleans)
    if (event.httpMethod === "GET" && key === "__env") {
      return json(200, {
        ok: true,
        has_NETLIFY_BLOBS_SITE_ID: !!String(process.env.NETLIFY_BLOBS_SITE_ID || "").trim(),
        has_NETLIFY_BLOBS_TOKEN: !!String(process.env.NETLIFY_BLOBS_TOKEN || "").trim(),
        CENTRAL_STORE_NAME: String(process.env.CENTRAL_STORE_NAME || "").trim() || null,
      });
    }

    const store = getCentralStore(context);

    const user = await getIdentityUser(event, context);
    const email = user?.email ? normEmail(user.email) : "";
    const master = isMasterEmail(email);

    async function loadValue(defaultVal) {
      const v = await store.get(key, { type: "json" });
      return v == null ? defaultVal : v;
    }

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
      try {
        body = JSON.parse(event.body || "{}");
      } catch {}

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
    return json(500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
};
