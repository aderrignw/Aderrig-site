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

/**
 * Use an explicit siteID/token so the function works even when the runtime
 * doesn't auto-configure Netlify Blobs (prevents MissingBlobsEnvironmentError).
 */
function makeStore(context) {
  const siteID = String(process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || "").trim();
  const token = String(process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || "").trim();

  if (!siteID || !token) {
    throw new Error(
      "Missing NETLIFY_BLOBS_SITE_ID/NETLIFY_BLOBS_TOKEN env vars. Add them to Netlify (Functions/Runtime scope)."
    );
  }

  const fixed = String(process.env.CENTRAL_STORE_NAME || "").trim();
  const storeName =
    fixed ||
    (context && context.site && context.site.id ? `kv_${context.site.id}` : `kv_${siteID}`);

  return getStore(storeName, { siteID, token });
}

function getAuthHeader(event) {
  return (
    (event.headers && (event.headers.authorization || event.headers.Authorization)) ||
    ""
  );
}

/**
 * Prefer Netlify-injected Identity context (fast + reliable).
 * Fallback: call GoTrue endpoint using an ABSOLUTE URL (Node fetch requires absolute).
 */
async function getIdentityUser(event, context) {
  const ctxUser = context && context.clientContext && context.clientContext.user;
  if (ctxUser && ctxUser.email) return ctxUser;

  const auth = getAuthHeader(event);
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const proto = String(event.headers?.["x-forwarded-proto"] || event.headers?.["X-Forwarded-Proto"] || "https")
    .split(",")[0]
    .trim();
  const host = event.headers?.host || event.headers?.Host || "";
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
}

exports.handler = async (event, context) => {
  try {
    const key = event.queryStringParameters?.key ? String(event.queryStringParameters.key) : "";
    if (!key) return json(400, { ok: false, error: "Missing key" });

    const store = makeStore(context);
    const user = await getIdentityUser(event, context);
    const email = user && user.email ? normEmail(user.email) : "";
    const master = isMasterEmail(email);

    async function loadValue(defaultVal) {
      const v = await store.get(key, { type: "json" });
      return v == null ? defaultVal : v;
    }

    // GET
    if (event.httpMethod === "GET") {
      const data = await loadValue(key === "anw_users" ? [] : {});
      if (key === "anw_users") {
        if (master) return json(200, Array.isArray(data) ? data : []);
        if (!email) return json(401, { ok: false, error: "Not authenticated" });
        const arr = Array.isArray(data) ? data : [];
        const me = arr.find((u) => normEmail(u && u.email) === email) || null;
        return json(200, { me });
      }
      return json(200, data);
    }

    // POST
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
            updatedAt: now,
          };

          const idx = arr.findIndex((u) => normEmail(u && u.email) === email);
          if (idx >= 0) {
            // Update existing record (prevents being stuck as pending)
            arr[idx] = { ...arr[idx], ...record };
          } else {
            arr.push({ ...record, createdAt: profile.createdAt || now });
          }

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

      // Other keys: master-only writes
      if (!master) return json(403, { ok: false, error: "Admin only" });
      await store.set(key, body.value ?? body, { type: "json" });
      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    return json(500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
};
