import { getStore } from "@netlify/blobs";

/**
 * Generic KV store for the site (Netlify Blobs).
 *
 * GET    /.netlify/functions/store?key=anw_users
 * PUT    /.netlify/functions/store?key=anw_users   (body: JSON)
 * DELETE /.netlify/functions/store?key=anw_users
 *
 * Returns:
 *   { key, value }  on GET
 *   { ok, key }     on PUT/DELETE
 */
export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing ?key=" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // In Functions, siteID/token are provided automatically.
    const store = getStore({ name: "aderrig-nw", consistency: "strong" });

    if (req.method === "GET") {
      const raw = await store.get(key);
      const value = raw ? JSON.parse(raw) : null;
      return new Response(JSON.stringify({ key, value }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const bodyText = await req.text();
      const parsed = bodyText ? JSON.parse(bodyText) : null;
      await store.set(key, JSON.stringify(parsed));
      return new Response(JSON.stringify({ ok: true, key }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      await store.delete(key);
      return new Response(JSON.stringify({ ok: true, key }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
