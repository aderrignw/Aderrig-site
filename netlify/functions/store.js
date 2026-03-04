// netlify/functions/store.js (ESM)
// v6: try ALL known @netlify/blobs init signatures + siteID/siteId casing.
// Debug:
//   GET ?key=__env   -> shows env presence + store name (no secrets)
//   GET ?key=__probe -> tries each init variant and reports which works

import { getStore } from "@netlify/blobs";

const jsonResp = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const str = (v) => String(v ?? "").trim();
const has = (v) => !!str(v);

function getStoreName(context) {
  const fixed = str(process.env.CENTRAL_STORE_NAME || process.env.CENTRAL_STORE || "");
  if (fixed) return fixed;
  const site = context?.site?.id ? str(context.site.id) : "";
  return site ? `kv_${site}` : "kv_default";
}

function getCreds() {
  const siteID = str(process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID);
  const token = str(process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_BLOBS_TOKEN);
  return { siteID, token };
}

function redactedSiteID(siteID) {
  if (!siteID) return null;
  return siteID.slice(0, 8) + "…";
}

function initStore(name, siteID, token) {
  if (!siteID || !token) throw new Error("Missing siteID/token in runtime (manual init).");

  const variants = [
    () => ({ store: getStore(name, { siteID, token }), variant: "name + {siteID,token}" }),
    () => ({ store: getStore(name, { siteId: siteID, token }), variant: "name + {siteId,token}" }),
    () => ({ store: getStore(name, { siteID, siteId: siteID, token }), variant: "name + {siteID,siteId,token}" }),
    () => ({ store: getStore({ name, siteID, token }), variant: "{name,siteID,token}" }),
    () => ({ store: getStore({ name, siteId: siteID, token }), variant: "{name,siteId,token}" }),
    () => ({ store: getStore({ name, siteID, siteId: siteID, token }), variant: "{name,siteID,siteId,token}" }),
  ];

  let lastErr = null;
  for (const fn of variants) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to initialize store");
}

async function probeVariants(context) {
  const name = getStoreName(context);
  const { siteID, token } = getCreds();

  let autoOk = false, autoErr = null;
  try {
    const s = getStore(name);
    await s.set("__probe__", "ok");
    autoOk = true;
  } catch (e) {
    autoErr = String(e?.message || e);
  }

  const tried = [];
  let manualOk = false, manualErr = null, manualVariant = null;

  if (siteID && token) {
    const variants = [
      ["name + {siteID,token}", () => getStore(name, { siteID, token })],
      ["name + {siteId,token}", () => getStore(name, { siteId: siteID, token })],
      ["name + {siteID,siteId,token}", () => getStore(name, { siteID, siteId: siteID, token })],
      ["{name,siteID,token}", () => getStore({ name, siteID, token })],
      ["{name,siteId,token}", () => getStore({ name, siteId: siteID, token })],
      ["{name,siteID,siteId,token}", () => getStore({ name, siteID, siteId: siteID, token })],
    ];

    for (const [label, mk] of variants) {
      try {
        const s = mk();
        await s.set("__probe__", "ok");
        tried.push({ label, ok: true });
        manualOk = true;
        manualVariant = label;
        break;
      } catch (e) {
        const msg = String(e?.message || e);
        tried.push({ label, ok: false, err: msg });
        manualErr = msg;
      }
    }
  } else {
    manualErr = "Missing siteID/token (runtime)";
  }

  return {
    storeName: name,
    siteID_prefix: redactedSiteID(siteID),
    has_NETLIFY_BLOBS_SITE_ID: has(process.env.NETLIFY_BLOBS_SITE_ID),
    has_NETLIFY_SITE_ID: has(process.env.NETLIFY_SITE_ID),
    has_NETLIFY_AUTH_TOKEN: has(process.env.NETLIFY_AUTH_TOKEN),
    has_NETLIFY_BLOBS_TOKEN: has(process.env.NETLIFY_BLOBS_TOKEN),
    autoOk,
    autoErr,
    manualOk,
    manualVariant,
    manualErr,
    tried,
  };
}

export const handler = async (event, context) => {
  const key = str(event.queryStringParameters?.key);

  try {
    if (!key) return jsonResp(400, { ok: false, error: "Missing key" });

    if (event.httpMethod === "GET" && key === "__env") {
      const name = getStoreName(context);
      const { siteID } = getCreds();
      return jsonResp(200, {
        ok: true,
        storeName: name,
        CENTRAL_STORE_NAME: str(process.env.CENTRAL_STORE_NAME) || null,
        has_NETLIFY_BLOBS_SITE_ID: has(process.env.NETLIFY_BLOBS_SITE_ID),
        has_NETLIFY_SITE_ID: has(process.env.NETLIFY_SITE_ID),
        siteID_prefix: redactedSiteID(siteID),
        has_NETLIFY_AUTH_TOKEN: has(process.env.NETLIFY_AUTH_TOKEN),
        has_NETLIFY_BLOBS_TOKEN: has(process.env.NETLIFY_BLOBS_TOKEN),
      });
    }

    if (event.httpMethod === "GET" && key === "__probe") {
      const r = await probeVariants(context);
      return jsonResp(200, { ok: true, ...r });
    }

    const name = getStoreName(context);
    const { siteID, token } = getCreds();
    const { store, variant } = initStore(name, siteID, token);

    if (event.httpMethod === "GET") {
      const value = await store.get(key, { type: "json" });
      return jsonResp(200, value ?? (key === "anw_users" ? [] : {}));
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try { body = JSON.parse(event.body || "{}"); } catch {}
      await store.set(key, body, { type: "json" });
      return jsonResp(200, { ok: true, used: variant });
    }

    return jsonResp(405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    return jsonResp(500, { ok: false, error: String(err?.message || err) });
  }
};
