const { getStore } = require("@netlify/blobs");

const MASTER_EMAIL = "claudiosantos1968@gmail.com";
const MASTER_EIRCODE = "K78T2W8";

function norm(v) { return String(v || "").trim().toLowerCase(); }

function makeStore() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN   || process.env.NETLIFY_API_TOKEN;

  // If credentials are provided, use them (works everywhere).
  if (siteID && token) {
    return getStore({ name: "anw-store", siteID, token });
  }

  // Otherwise rely on Netlify's implicit environment (works on Netlify when Blobs is enabled).
  return getStore({ name: "anw-store" });
}

exports.handler = async (event) => {
  try {
    const store = makeStore();

    const user = event.context?.clientContext?.user;
    if (!user || !user.email) {
      return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    }

    const email = norm(user.email);

    let users = await store.get("anw_users", { type: "json" });
    if (!Array.isArray(users)) users = [];

    let rec = users.find(u => norm(u?.email) === email) || null;

    // Master is always allowed (owner + admin privileges) and must always have eircode.
    if (email === norm(MASTER_EMAIL)) {
      if (!rec) {
        rec = {
          email: MASTER_EMAIL,
          role: "owner",
          approved: true,
          status: "active",
          eircode: MASTER_EIRCODE,
          createdAt: new Date().toISOString()
        };
        users.unshift(rec);
      } else {
        // accept admin/owner naming but normalize to owner
        rec.role = "owner";
        rec.approved = true;
        rec.status = "active";
        rec.eircode = MASTER_EIRCODE;
      }
      await store.set("anw_users", users);
    }

    if (event.httpMethod === "GET") {
      const key = event.queryStringParameters?.key;
      if (!key) return { statusCode: 400, body: JSON.stringify({ error: "Missing key" }) };

      if (key === "anw_users") {
        return { statusCode: 200, body: JSON.stringify(users) };
      }

      const data = await store.get(key, { type: "json" });
      return { statusCode: 200, body: JSON.stringify(data || null) };
    }

    if (event.httpMethod === "POST") {
      // Only master/owner/admin should write; master always ok.
      const body = JSON.parse(event.body || "{}");
      const { key, value } = body || {};
      if (!key) return { statusCode: 400, body: JSON.stringify({ error: "Missing key" }) };

      // Minimal write policy: allow writes for master; you can tighten later.
      if (email !== norm(MASTER_EMAIL)) {
        return { statusCode: 403, body: JSON.stringify({ error: "Write not allowed" }) };
      }

      await store.set(key, value);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Store error",
        details: e && e.message ? e.message : String(e),
        hint: "If this mentions Blobs not configured, ensure NETLIFY_BLOBS_SITE_ID and NETLIFY_BLOBS_TOKEN are set and redeploy."
      })
    };
  }
};
