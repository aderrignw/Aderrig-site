const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    const store = getStore("anw-store");

    const user = event.context.clientContext?.user;
    if (!user || !user.email) {
      return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    }

    const email = String(user.email).toLowerCase().trim();

    // Load registrations (anw_users)
    const rawUsers = await store.get("anw_users", { type: "json" });
    const users = Array.isArray(rawUsers) ? rawUsers : [];

    const dbUser = users.find(u => u?.email && String(u.email).toLowerCase().trim() === email);

    const isAdminIdentity = user.app_metadata?.roles?.includes("admin") || false;
    const isOwnerFromDb = !!(dbUser && dbUser.role === "owner");
    const isAdmin = isAdminIdentity || isOwnerFromDb;

    if (event.httpMethod === "GET") {
      const key = event.queryStringParameters?.key;
      if (!key) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing key" }) };
      }

      // ✅ Special safe read for anw_users
      if (key === "anw_users") {
        if (isAdmin) {
          return { statusCode: 200, body: JSON.stringify(users) };
        }
        // non-admin sees only themselves
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

      if (!key) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing key" }) };
      }

      await store.set(key, value);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (error) {
    console.error("STORE FUNCTION ERROR:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", details: error.message })
    };
  }
};
