const { getStore } = require("@netlify/blobs");

function makeStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;

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
    const masterEmail = String(process.env.MASTER_EMAIL || "claudiosantos1968@gmail.com").toLowerCase().trim();
    const isMaster = !!(masterEmail && email === masterEmail);

    const isAdmin = isAdminIdentity || isOwnerFromDb || isMaster;

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
      const body = JSON.parse(event.body || "{}");
      const { key, value, action } = body;

      if (!key) return { statusCode: 400, body: JSON.stringify({ error: "Missing key" }) };

      // Allow non-admin users to append ONLY their own profile to anw_users
      if (key === "anw_users" && action === "append_me") {
        const incoming = value && typeof value === "object" ? value : null;
        if (!incoming || !incoming.email) {
          return { statusCode: 400, body: JSON.stringify({ error: "Missing user payload" }) };
        }
        const incomingEmail = String(incoming.email).toLowerCase().trim();
        if (incomingEmail !== email) {
          return { statusCode: 403, body: JSON.stringify({ error: "Can only register your own email" }) };
        }

        // Enforce uniqueness by email and eircode
        const hasEmail = users.some(u => String(u?.email || "").toLowerCase().trim() === incomingEmail);
        if (hasEmail) {
          return { statusCode: 409, body: JSON.stringify({ error: "Email already registered" }) };
        }
        const incomingEir = String(incoming.eircode || "").toUpperCase().replace(/\s+/g, "").trim();
        if (incomingEir) {
          const hasEir = users.some(u => String(u?.eircode || "").toUpperCase().replace(/\s+/g, "").trim() === incomingEir);
          if (hasEir) {
            return { statusCode: 409, body: JSON.stringify({ error: "Eircode already registered" }) };
          }
        }

        const record = { ...incoming };
        if (!record.status) record.status = "pending";
        if (email === masterEmail) {
          record.role = record.role || "owner";
          record.status = "active";
        }

        users.push(record);
        await store.set("anw_users", users);
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // Everything else: admin/owner only
      if (!isAdmin) {
        return { statusCode: 403, body: JSON.stringify({ error: "Write not allowed (admin/owner only)" }) };
      }

      await store.set(key, value);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    if (event.httpMethod === "DELETE") {
      const key = event.queryStringParameters?.key;
      const devReset = event.queryStringParameters?.dev_reset;
      if (!key) return { statusCode: 400, body: JSON.stringify({ ok:false, error: "Missing key" }) };

      if (!isAdmin || devReset !== "1") {
        return { statusCode: 403, body: JSON.stringify({ ok:false, error: "DELETE not allowed" }) };
      }

      if (key !== "anw_users") {
        return { statusCode: 403, body: JSON.stringify({ ok:false, error: "Can only reset anw_users" }) };
      }

      const emailParam = (event.queryStringParameters?.email || "").toLowerCase().trim();
      if (emailParam) {
        const before = users.length;
        const kept = users.filter(u => String(u?.email||"").toLowerCase().trim() !== emailParam);
        await store.set("anw_users", kept);
        return { statusCode: 200, body: JSON.stringify({ ok:true, removed: before - kept.length }) };
      }

      await store.set("anw_users", []);
      return { statusCode: 200, body: JSON.stringify({ ok:true, removed:"all" }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (error) {
    console.error("STORE FUNCTION ERROR:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};