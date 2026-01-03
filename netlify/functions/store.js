import { getStore } from "@netlify/blobs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json",
};

async function readJsonBody(req) {
  // tenta ler JSON só quando fizer sentido
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;

  try {
    return await req.json();
  } catch {
    return null;
  }
}

function getKeyFromUrlOrBody(url, body) {
  // 1) querystring
  let key = url.searchParams.get("key") || url.searchParams.get("k");

  // 2) rota /store/<key> (caso o front esteja chamando assim)
  if (!key) {
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    // .../.netlify/functions/store/<key>
    if (last && last !== "store") key = last;
  }

  // 3) body JSON
  if (!key && body?.key) key = body.key;

  return key;
}

export default async (req) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const body = await readJsonBody(req);

    const key = getKeyFromUrlOrBody(url, body);

    if (!key) {
      return new Response(JSON.stringify({ error: "Missing key" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // store name (ok manter "aderrig")
    const store = getStore("aderrig");

    if (req.method === "GET") {
      const value = await store.get(key, { type: "json" });
      return new Response(JSON.stringify({ ok: true, key, value }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const value = body?.value;
      if (typeof value === "undefined") {
        return new Response(JSON.stringify({ error: "Missing value" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      await store.set(key, value, { metadata: { updatedAt: Date.now() } });

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
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};
