import { getStore } from "@netlify/blobs";

export default async (req, context) => {

  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing key" }),
      { status: 400 }
    );
  }

  const store = getStore("aderrig-nw");

  try {

    // ---------- GET ----------
    if (req.method === "GET") {

      let raw = await store.get(key);

      if (!raw) {
        raw = "[]";
        await store.set(key, raw);
      }

      try {
        const parsed = JSON.parse(raw);
        return new Response(JSON.stringify(parsed), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (e) {

        // JSON corrompido -> reparar
        await store.set(key, "[]");

        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ---------- POST ----------
    if (req.method === "POST") {

      const body = await req.text();

      let parsed;

      try {
        parsed = JSON.parse(body);
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, error: "invalid JSON body" }),
          { status: 400 }
        );
      }

      await store.set(key, JSON.stringify(parsed));

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "method not allowed" }),
      { status: 405 }
    );

  } catch (err) {

    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500 }
    );

  }
};
