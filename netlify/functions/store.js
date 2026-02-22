// netlify/functions/store.js

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    const store = getStore("anw-store");

    // ==============================
    // AUTENTICAÇÃO
    // ==============================

    const user = event.context.clientContext?.user;

    if (!user || !user.email) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Not authenticated" })
      };
    }

    const email = user.email.toLowerCase().trim();

    // ==============================
    // CARREGA USUÁRIOS DO KV
    // ==============================

    let users = [];
    const rawUsers = await store.get("anw_users", { type: "json" });

    if (Array.isArray(rawUsers)) {
      users = rawUsers;
    }

    const dbUser = users.find(u =>
      u.email &&
      u.email.toLowerCase().trim() === email
    );

    // ==============================
    // VERIFICA ADMIN / OWNER
    // ==============================

    const isAdminIdentity =
      user.app_metadata?.roles?.includes("admin") || false;

    const isOwnerFromDb =
      dbUser && dbUser.role === "owner";

    const isAdmin = isAdminIdentity || isOwnerFromDb;

    // ==============================
    // GET
    // ==============================

    if (event.httpMethod === "GET") {
      const key = event.queryStringParameters?.key;

      if (!key) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing key" })
        };
      }

      // Usuário comum só pode ler dados públicos ou próprios
      if (!isAdmin) {
        if (key === "anw_users") {
          return {
            statusCode: 403,
            body: JSON.stringify({
              error: "Not authorized (server thinks you are not admin)"
            })
          };
        }
      }

      const data = await store.get(key, { type: "json" });

      return {
        statusCode: 200,
        body: JSON.stringify(data || null)
      };
    }

    // ==============================
    // POST (WRITE)
    // ==============================

    if (event.httpMethod === "POST") {
      if (!isAdmin) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: "Write not allowed (admin/owner only)"
          })
        };
      }

      const body = JSON.parse(event.body || "{}");
      const { key, value } = body;

      if (!key) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing key" })
        };
      }

      await store.set(key, value);

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };
    }

    // ==============================
    // METHOD NOT ALLOWED
    // ==============================

    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };

  } catch (error) {
    console.error("STORE FUNCTION ERROR:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message
      })
    };
  }
};
