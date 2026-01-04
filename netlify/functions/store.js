import { getStore } from "@netlify/blobs";

/**
 * Simple KV store (Netlify Blobs) exposed via a Netlify Function.
 *
 * Usage:
 *   GET    /.netlify/functions/store?key=incidents
 *   PUT    /.netlify/functions/store?key=incidents   (JSON body: { "value": ... } OR any JSON)
 *   POST   /.netlify/functions/store?key=incidents   (same as PUT)
 *   DELETE /.netlify/functions/store?key=incidents
 */
export default async (req, context) => {
  const url = new URL(req.url);

  // --- CORS (safe default for same-site usage)
  const origin = req.headers.get("origin") || "*";
  const corsHeaders = {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "content-type": "application/json; charset=utf-8",
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  const key = url.searchParams.get("key");
  if (!key) {
    return new Response(JSON.stringify({ error: "Missing ?key=" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // One store per site; the name can be anything stable.
  // Using the site ID avoids collisions if you reuse the code in other sites.
  const storeName = context?.site?.id ? `kv_${context.site.id}` : "kv_default";
  const store = getStore(storeName);

  try {
    if (req.method === "GET") {
      const raw = await store.get(key); // returns string or null
      const value = raw == null ? null : safeJsonParse(raw);
      return new Response(JSON.stringify({ key, value }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const bodyText = await req.text();
      const bodyJson = bodyText ? safeJsonParse(bodyText) : null;

      // Accept either { value: ... } or raw JSON as the value.
      const value = bodyJson && typeof bodyJson === "object" && "value" in bodyJson
        ? bodyJson.value
        : bodyJson;

      await store.set(key, JSON.stringify(value));
      return new Response(JSON.stringify({ ok: true, key }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method === "DELETE") {
      await store.delete(key);
      return new Response(JSON.stringify({ ok: true, key }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err?.message || err || "Unknown error") }),
      { status: 500, headers: corsHeaders }
    );
  }
};

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s; // if it wasn't JSON, return raw string
  }
}
