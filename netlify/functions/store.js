import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const value = url.searchParams.get("value");

  if (!key) {
    return new Response(
      JSON.stringify({ error: "key is required" }),
      { status: 400 }
    );
  }

  const store = getStore("aderrig-store");

  if (value !== null) {
    // SALVAR
    await store.set(key, value);
  }

  // LER
  const storedValue = await store.get(key);

  return new Response(
    JSON.stringify({ key, value: storedValue }),
    { headers: { "Content-Type": "application/json" } }
  );
};
