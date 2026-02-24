const { getStore } = require("@netlify/blobs");

/**
 * Store strategy:
 * 1) If you provide explicit credentials (for non-Netlify environments), use them:
 *    - NETLIFY_BLOBS_SITE_ID / NETLIFY_BLOBS_TOKEN (preferred)
 *    - NETLIFY_SITE_ID / NETLIFY_API_TOKEN (fallback)
 * 2) Otherwise, on Netlify Functions, use implicit environment via getStore({ name }).
 *
 * This avoids the 500 you saw:
 * "environment has not been configured to use Netlify Blobs ... supply siteID, token"
 */
function makeStore() {
  const siteID =
    process.env.NETLIFY_BLOBS_SITE_ID ||
    process.env.NETLIFY_SITE_ID;

  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_API_TOKEN;

  // If running outside Netlify, you MUST provide siteID + token.
  if (siteID && token) {
    return getStore({ name: "anw-store", siteID, token });
  }

  // If running on Netlify, implicit configuration should be available.
  return getStore({ name: "anw-store" });
}

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

exports.handler = async (event) => {
  try {
    const store = makeStore();

    const user = event.context?.clientContext?.user;
    if (!user || !user.email) {
      return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    }

    const email = normEmail(user.email);

    // Load users DB
    let rawUsers = null;
    try {
      rawUsers = await store.get("anw_users", { type: "json" });
    } catch (e) {
      // If blobs isn't configured, bubble a detailed message (so front-end can show exact cause)
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Store not available",
          details: e && e.message ? e.message : String(e),
          hint:
            "Configure Netlify Blobs or provide NETLIFY_BLOBS_SITE_ID + NETLIFY_BLOBS_TOKEN (or NETLIFY_SITE_ID + NETLIFY_API_TOKEN) in Netlify Environment variables and redeploy.",
        }),
      };
    }

    const users = Array.isArray(rawUsers) ? rawUsers : [];

    const dbUser = users.find((u) => normEmail(u?.email) === email) || null;

    const isAdminIdentity = !!(user.app_metadata?.roles?.includes("admin"));
    const isOwnerFromDb = !!(dbUser && normEmail(dbUser.role) === "owner");

    const masterEmail = normEmail(process.env.MASTER_EMAIL || "claudiosantos1968@gmail.com");
    const hasOwnerAlready = users.some((u) => normEmail(u?.role) === "owner");
    const isBootstrapOwner = !!(masterEmail && email === masterEmail && !hasOwnerAlready);

    const isAdmin = isAdminIdentity || isOwnerFromDb || isBootstrapOwner;

    // Bootstrap: if master email is first user and no owner exists, create an owner record automatically.
    if (isBootstrapOwner) {
      const bootstrap = {
        email: masterEmail,
        name: user.user_metadata?.full_name || user.user_metadata?.name || "Owner",
        eircode: user.user_metadata?.eircode || "",
        role: "owner",
        status: "active",
        approved: true,
        createdAt: new Date().toISOString(),
      };
      users.unshift(bootstrap);
      await store.set("anw_users", users);
    }

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

      await store.set(key, value);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    console.error("STORE FUNCTION ERROR:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
