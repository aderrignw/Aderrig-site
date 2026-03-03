const { getStore } = require("@netlify/blobs");

function getCentralStore(context) {
  const fixed = (process.env.CENTRAL_STORE_NAME || "").trim();
  const storeName =
    fixed || (context?.site?.id ? `kv_${context.site.id}` : "kv_default");
  return getStore(storeName);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function isMasterEmail(email) {
  const master = normEmail(
    process.env.MASTER_EMAIL || process.env.ANW_MASTER_EMAIL || ""
  );
  return master && normEmail(email) === master;
}

async function getIdentityUser(event, context) {
  // Primeiro tenta pegar direto do contexto do Netlify
  const ctxUser = context?.clientContext?.user;
  if (ctxUser?.email) return ctxUser;

  // Fallback via JWT
  const auth =
    event.headers.authorization || event.headers.Authorization || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const proto =
    (event.headers["x-forwarded-proto"] || "https")
      .split(",")[0]
      .trim();
  const host = event.headers.host;
  const base =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    (host ? `${proto}://${host}` : "");

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
  const key = event.queryStringParameters?.key;
  if (!key) return json(400, { ok: false, error: "Missing key" });

  const store = getCentralStore(context);
  const user = await getIdentityUser(event, context);
  const email = user?.email ? normEmail(user.email) : "";
  const isMaster = isMasterEmail(email);

  async function load(defaultVal) {
    const v = await store.get(key, { type: "json" });
    return v == null ? defaultVal : v;
  }

  // =======================
  // GET
  // =======================
  if (event.httpMethod === "GET") {
    const data = await load(key === "anw_users" ? [] : {});

    if (key === "anw_users") {
      if (isMaster) return json(200, data);

      if (!email)
        return json(401, { ok: false, error: "Not authenticated" });

      const me = data.find((u) => normEmail(u.email) === email) || null;
      return json(200, { me });
    }

    return json(200, data);
  }

  // =======================
  // POST
  // =======================
  if (event.httpMethod === "POST") {
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {}

    const action = body.action || "";

    if (key === "anw_users") {
      if (!email)
        return json(401, { ok: false, error: "Not authenticated" });

      const users = await load([]);
      const now = new Date().toISOString();

      if (action === "append_me") {
        const profile = body.profile || {};
        const existsIndex = users.findIndex(
          (u) => normEmail(u.email) === email
        );

        const record = {
          ...profile,
          email,
          status: isMaster ? "active" : "pending",
          role: isMaster ? "owner" : "resident",
          updatedAt: now,
        };

        if (existsIndex >= 0) {
          users[existsIndex] = { ...users[existsIndex], ...record };
        } else {
          users.push({
            ...record,
            createdAt: now,
          });
        }

        await store.set(key, users, { type: "json" });

        return json(200, { ok: true, me: record });
      }

      if (action === "admin_save_users") {
        if (!isMaster)
          return json(403, { ok: false, error: "Admin only" });

        await store.set(key, body.users || [], { type: "json" });
        return json(200, { ok: true });
      }

      return json(400, { ok: false, error: "Unknown action" });
    }

    return json(403, { ok: false, error: "Not allowed" });
  }

  return json(405, { ok: false, error: "Method not allowed" });
};
