// netlify/functions/store.js (ESM)
// v5: extra diagnostics + stronger fallbacks for Netlify Blobs initialization.
// - Uses CENTRAL_STORE_NAME if provided (you set it to "aderrig-nw").
// - Uses siteID from NETLIFY_BLOBS_SITE_ID or NETLIFY_SITE_ID.
// - Uses token from NETLIFY_AUTH_TOKEN (preferred) or NETLIFY_BLOBS_TOKEN.
//
// Debug endpoints:
//   GET ?key=__env   -> shows which env vars exist + store name used (no secrets).
//   GET ?key=__probe -> tries getStore with/without options and reports what worked.

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

async function openStore(context, mode = "auto") {
  const name = getStoreName(context);
  const { siteID, token } = getCreds();

  if (mode === "auto") {
    return getStore(name);
  }

  if (!siteID || !token) {
    throw new Error(`Missing creds for manual mode. siteID? ${!!siteID} token? ${!!token}`);
  }

  return getStore(name, { siteID, token });
}

export const handler = async (event, context) => {
  const key = str(event.queryStringParameters?.key);

  try {
    if (!key) return jsonResp(400, { ok: false, error: "Missing key" });

    if (event.httpMethod === "GET" && key === "__env") {
      const name = getStoreName(context);
      const creds = getCreds();
      return jsonResp(200, {
        ok: true,
        storeName: name,
        CENTRAL_STORE_NAME: str(process.env.CENTRAL_STORE_NAME) || null,
        has_NETLIFY_BLOBS_SITE_ID: has(process.env.NETLIFY_BLOBS_SITE_ID),
        has_NETLIFY_SITE_ID: has(process.env.NETLIFY_SITE_ID),
        siteID_prefix: redactedSiteID(creds.siteID),
        has_NETLIFY_AUTH_TOKEN: has(process.env.NETLIFY_AUTH_TOKEN),
        has_NETLIFY_BLOBS_TOKEN: has(process.env.NETLIFY_BLOBS_TOKEN),
      });
    }

    if (event.httpMethod === "GET" && key === "__probe") {
      const name = getStoreName(context);
      const creds = getCreds();

      let autoOk = false;
      let autoErr = null;
      try {
        const s = await openStore(context, "auto");
        await s.set("__probe__", "ok");
        autoOk = true;
      } catch (e) {
        autoErr = String(e?.message || e);
      }

      let manualOk = false;
      let manualErr = null;
      try {
        const s = await openStore(context, "manual");
        await s.set("__probe__", "ok");
        manualOk = true;
      } catch (e) {
        manualErr = String(e?.message || e);
      }

      return jsonResp(200, {
        ok: true,
        storeName: name,
        siteID_prefix: redactedSiteID(creds.siteID),
        hasToken: !!creds.token,
        autoOk,
        autoErr,
        manualOk,
        manualErr,
      });
    }

    const store = await openStore(context, "manual");

    if (event.httpMethod === "GET") {
      const value = await store.get(key, { type: "json" });
      return jsonResp(200, value ?? (key === "anw_users" ? [] : {}));
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try { body = JSON.parse(event.body || "{}"); } catch {}
      await store.set(key, body, { type: "json" });
      return jsonResp(200, { ok: true });
    }

    return jsonResp(405, { ok: false, error: "Method not allowed" });
  } catch (err) {
    return jsonResp(500, { ok: false, error: String(err?.message || err) });
  }
};
