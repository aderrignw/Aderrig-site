import { getStore } from "@netlify/blobs";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

function getUserKey(u) {
  return (
    normalizeEmail(u?.email) ||
    normalizeEmail(u?.userEmail) ||
    normalizeEmail(u?.loginEmail) ||
    normalizeEmail(u?.netlifyEmail) ||
    ""
  );
}

function getTimestamp(u) {
  return (
    Date.parse(u?.updatedAt || u?.modifiedAt || u?.createdAt || 0) || 0
  );
}

export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return json({ error: "missing key" }, 400);
  }

  const store = getStore("aderrig-nw");

  try {
    // ================= GET =================
    if (req.method === "GET") {
      let raw = await store.get(key);

      if (!raw) {
        raw = "[]";
        await store.set(key, raw);
      }

      try {
        return json(JSON.parse(raw));
      } catch {
        await store.set(key, "[]");
        return json([]);
      }
    }

    // ================= POST =================
    if (req.method === "POST") {
      const body = await req.text();

      let incoming;
      try {
        incoming = JSON.parse(body);
      } catch {
        return json({ error: "invalid json" }, 400);
      }

      // 🚨 IMPORTANTE: só tratar anw_users
      if (key !== "anw_users") {
        await store.set(key, JSON.stringify(incoming));
        return json({ ok: true });
      }

      // ================= MERGE anw_users =================
      let current = [];
      try {
        const raw = await store.get(key);
        current = raw ? JSON.parse(raw) : [];
      } catch {
        current = [];
      }

      const map = new Map();

      // carregar atuais
      current.forEach(u => {
        const k = getUserKey(u);
        if (k) map.set(k, u);
      });

      // aplicar incoming com prioridade de updatedAt
      incoming.forEach(u => {
        const k = getUserKey(u);
        if (!k) return;

        const existing = map.get(k);

        if (!existing) {
          map.set(k, u);
        } else {
          const existingTs = getTimestamp(existing);
          const incomingTs = getTimestamp(u);

          map.set(k, incomingTs >= existingTs ? { ...existing, ...u } : existing);
        }
      });

      const merged = Array.from(map.values());

      await store.set(key, JSON.stringify(merged));

      return json({ ok: true, merged: true });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: err?.message || "server error" }, 500);
  }
};
