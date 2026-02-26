const { getStore } = require("@netlify/blobs");

function makeStore() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

  if (siteID && token) {
    return getStore({ name: "anw-store", siteID, token });
  }
  return getStore("anw-store");
}

exports.handler = async (event) => {
  try {
    const store = makeStore();

    const user = event.context.clientContext?.user;
    if (!user || !user.email) {
      return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    }
    const email = String(user.email).toLowerCase().trim();

    const rawUsers = await store.get("anw_users", { type: "json" });
    const users = Array.isArray(rawUsers) ? rawUsers : [];

    const dbUser = users.find(u => u?.email && String(u.email).toLowerCase().trim() === email);

    const isAdminIdentity = user.app_metadata?.roles?.includes("admin") || false;
    const isOwnerFromDb = !!(dbUser && String(dbUser.role || '').toLowerCase() === "owner");

    // Master email (fallback hard-coded for this project). You can override with Netlify env var MASTER_EMAIL.
    const masterEmail = String(process.env.MASTER_EMAIL || "claudiosantos1968@gmail.com").toLowerCase().trim();
    const hasOwnerAlready = users.some(u => String(u?.role || '').toLowerCase() === "owner");
    const isBootstrapOwner = !!(masterEmail && email === masterEmail && !hasOwnerAlready);

    const isAdmin = isAdminIdentity || isOwnerFromDb || isBootstrapOwner;

    if (event.httpMethod === "GET") {
      const key = event.queryStringParameters?.key;
      if (!key) return { statusCode: 400, body: JSON.stringify({ error: "Missing key" }) };

      if (key === "anw_users") {
        if (isAdmin) return { statusCode: 200, body: JSON.stringify(users) };
        return { statusCode: 200, body: JSON.stringify({ me: dbUser || null }) };
      }

      const data = await store.get(key, { type: "json" });
      return { statusCode: 200, body: JSON.stringify(data || null) };
    }

    if (event.httpMethod === "POST") {
      if (!isAdmin) {
        return { statusCode: 403, body: JSON.stringify({ error: "Write not allowed (admin/owner only)" }) };
      }

      const body = JSON.parse(event.body || "{}");
      const { key, value } = body;
      if (!key) return { statusCode: 400, body: JSON.stringify({ error: "Missing key" }) };

      if (isBootstrapOwner && key !== "anw_users") {
        return { statusCode: 403, body: JSON.stringify({ error: "Bootstrap owner can only write anw_users" }) };
      }

      await store.set(key, value);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (error) {
    console.error("STORE FUNCTION ERROR:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
