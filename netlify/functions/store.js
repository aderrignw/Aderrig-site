import { getStore } from "@netlify/blobs";

export default async (req) => {
  try {
    const url = new URL(req.url);

    // 1) tenta pegar key pela querystring
    let key = url.searchParams.get("key");

    // 2) se não vier, tenta pegar pelo JSON body
    let body = null;
    if (!key && req.method !== "GET") {
      try {
        body = await req.json();
        key = body?.key;
      } catch (_) {}
    }

    if (!key) {
      return new Response(JSON.stringify({ error: "Missing key" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const store = getStore("aderrig");

    if (req.method === "GET") {
      const value = await store.get(key, { type: "json" });
      return new Response(JSON.stringify({ key, value }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const value = body?.value;
      if (typeof value === "undefined") {
        return new Response(JSON.stringify({ error: "Missing value" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      await store.set(key, value, { metadata: { updatedAt: Date.now() } });
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
