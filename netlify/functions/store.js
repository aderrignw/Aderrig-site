import { getStore } from "@netlify/blobs";

export default async (req) => {

  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return new Response(JSON.stringify({ error: "missing key" }), { status: 400 });
  }

  const store = getStore("aderrig-nw");

  try {

    if (req.method === "GET") {

      let raw = await store.get(key);

      if (!raw) {
        raw = "[]";
        await store.set(key, raw);
      }

      try {
        const data = JSON.parse(raw);
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" }
        });

      } catch {

        await store.set(key, "[]");

        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (req.method === "POST") {

      const body = await req.text();

      let parsed;

      try {
        parsed = JSON.parse(body);
      } catch {
        return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
      }

      await store.set(key, JSON.stringify(parsed));

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });

  } catch (err) {

    return new Response(JSON.stringify({ error: err.message }), { status: 500 });

  }
};
