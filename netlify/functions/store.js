/* =========================================================
   ADERRIG NW — Netlify Function: store.js
   ---------------------------------------------------------
   ✔ nearby_support (Eircode PREFIX search)
   ✔ Counts when public
   ✔ Details when logged in
   ✔ Netlify Identity compatible
   ========================================================= */

const { v4: uuidv4 } = require("uuid");

/* =========================
   MOCK DATABASE (TEMPORARY)
   =========================
   Depois você pode trocar por:
   - Fauna
   - Supabase
   - Firebase
   - Netlify Blobs
*/

const USERS = [
  {
    id: uuidv4(),
    name: "John Murphy",
    role: "Street Coordinator",
    phone: "087 111 2222",
    eircode: "K78T3X1",
  },
  {
    id: uuidv4(),
    name: "Mary O'Brien",
    role: "Volunteer",
    phone: "086 333 4444",
    eircode: "K78A1B2",
  },
  {
    id: uuidv4(),
    name: "Patrick Doyle",
    role: "Volunteer",
    phone: "085 555 6666",
    eircode: "K78C9D4",
  },
];

/* =========================
   Helpers
   ========================= */

function normalizeEircode(e) {
  return (e || "").toUpperCase().replace(/\s+/g, "");
}

function eirPrefix(e) {
  // PREFIX MODE (K78)
  return normalizeEircode(e).substring(0, 3);
}

function isLoggedIn(event) {
  return !!event.headers.authorization;
}

/* =========================
   Main Handler
   ========================= */

exports.handler = async (event) => {
  try {
    const key = event.queryStringParameters?.key;

    /* =====================================================
       NEARBY SUPPORT (HOME PAGE)
       ===================================================== */
    if (key === "nearby_support") {
      const body = JSON.parse(event.body || "{}");
      const inputEircode = normalizeEircode(body.eircode);

      if (!inputEircode || inputEircode.length < 3) {
        return json(400, { error: "Invalid Eircode" });
      }

      const prefix = eirPrefix(inputEircode);

      const nearby = USERS.filter(
        (u) => eirPrefix(u.eircode) === prefix
      );

      const coordinators = nearby.filter(
        (u) => u.role === "Street Coordinator"
      );

      const volunteers = nearby.filter(
        (u) => u.role !== "Street Coordinator"
      );

      /* ===== PUBLIC (NOT LOGGED) ===== */
      if (!isLoggedIn(event)) {
        return json(200, {
          mode: "counts",
          counts: {
            coordinators: coordinators.length,
            volunteers: volunteers.length,
          },
        });
      }

      /* ===== LOGGED IN ===== */
      return json(200, {
        mode: "details",
        counts: {
          coordinators: coordinators.length,
          volunteers: volunteers.length,
        },
        coordinators: coordinators.map((u) => ({
          name: u.name,
          phone: u.phone,
        })),
        volunteers: volunteers.map((u) => ({
          name: u.name,
          role: u.role,
          phone: u.phone,
        })),
      });
    }

    /* =====================================================
       DEFAULT
       ===================================================== */
    return json(404, { error: "Unknown key" });
  } catch (err) {
    console.error("STORE ERROR:", err);
    return json(500, { error: "Server error" });
  }
};

/* =========================
   Response helper
   ========================= */
function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  };
}
