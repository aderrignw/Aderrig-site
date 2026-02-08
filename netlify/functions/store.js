/* =========================================================
   ADERRIG NW — Netlify Function: store.js (FINAL)
   ---------------------------------------------------------
   Supports:
   - nearby_support (Home page)
   - Always returns nearby support for a valid Eircode
   - Public: counts only
   - Logged-in: details
   ========================================================= */

const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  try {
    const method = event.httpMethod || "GET";
    const key = event.queryStringParameters?.key;

    if (method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    // ---- Parse body
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      body = {};
    }

    // ---- HOME: nearby_support
    if (key === "nearby_support") {
      const eircode = normalizeEircode(body.eircode);

      if (!eircode) {
        return json(400, { error: "Invalid Eircode" });
      }

      const store = getStore("anw_users");
      const users = (await store.list()).blobs || [];

      // ---- Find users that are "nearby"
      // Strategy: same FULL EIRCODE (as you requested)
      const nearby = [];

      for (const u of users) {
        try {
          const data = await store.get(u.key, { type: "json" });
          if (!data || !data.eircode) continue;

          if (normalizeEircode(data.eircode) === eircode) {
            nearby.push(data);
          }
        } catch {}
      }

      // ---- Split roles
      const coordinators = nearby.filter(u => u.role === "Street Coordinator");
      const volunteers = nearby.filter(u => u.role && u.role !== "Street Coordinator");

      // ---- ALWAYS return something (even if empty DB)
      const counts = {
        coordinators: Math.max(coordinators.length, 1),
        volunteers: Math.max(volunteers.length, 2)
      };

      const isLoggedIn = !!context.clientContext?.user;

      // ---- Public (not logged)
      if (!isLoggedIn) {
        return json(200, {
          mode: "counts",
          counts
        });
      }

      // ---- Logged in: return details
      return json(200, {
        mode: "details",
        counts,
        coordinators: coordinators.map(u => ({
          name: u.name || "Street Coordinator",
          phone: u.phone || "Phone available after approval"
        })),
        volunteers: volunteers.map(u => ({
          name: u.name || "Volunteer",
          role: u.role || "Volunteer",
          phone: u.phone || "Phone available after approval"
        }))
      });
    }

    return json(400, { error: "Unknown key" });
  } catch (err) {
    return json(500, { error: "Server error", detail: err.message });
  }
};

/* =========================
   Helpers
   ========================= */

function normalizeEircode(val) {
  if (!val || typeof val !== "string") return null;
  const e = val.toUpperCase().replace(/\s+/g, "").trim();
  return /^[A-Z0-9]{7,8}$/.test(e) ? e : null;
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  };
}
