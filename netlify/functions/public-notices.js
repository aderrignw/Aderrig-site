/*
  Public Notices feed (Home banner)
  - No auth required
  - Returns notices explicitly marked for Home + Public
  - Bin notices are returned in chronological order and are NOT truncated,
    so the Home page can compute "completed this week + next week" correctly.
*/

import { getStore } from "@netlify/blobs";
import { withSecurity, jsonResponse } from "./aderrig-security-layer.mjs";

function getCentralStore(context){
  const fixed = (process?.env?.CENTRAL_STORE_NAME || "").trim();
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : "kv_default");
  return getStore(storeName);
}

const KEY_NOTICES = "anw_notices";
const KEY_ACL = "anw_acl";

function safeJsonParse(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function isBinNotice(n) {
  const cat = normalizeText(n?.category);
  const type = normalizeText(n?.meta?.type);
  const title = normalizeText(n?.title);
  return cat === "bins" || type === "bin_collection_import" || title.includes("bin collection");
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [m, d, y] = raw.split("/").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isNotStarted(n) {
  const d = parseDateValue(n?.startsAt || n?.startsOn || n?.startDate || n?.showFrom || "");
  return !!(d && d.getTime() > Date.now());
}

function isExpired(n) {
  const d = parseDateValue(n?.expiresAt || n?.endsOn || n?.endDate || n?.expires || n?.showUntil || "");
  return !!(d && d.getTime() < Date.now());
}

function isPublicHome(n) {
  const home = n?.home || {};
  return !!home.enabled && String(home.visibility || "").toLowerCase() === "public";
}

async function loadKey(store, key) {
  const raw = await store.get(key);
  if (!raw) return null;
  return safeJsonParse(raw, null);
}

function aclAllowsPublicHome(acl) {
  if (!acl || typeof acl !== "object") return true;
  const roles = acl["feature:home_notice_bar"];
  if (!Array.isArray(roles)) return true;
  return roles.map(String).map((r) => r.toLowerCase()).includes("public");
}

function binSortTs(n) {
  const d = parseDateValue(n?.date || n?.meta?.collectionDate || n?.meta?.date || n?.startsOn || n?.startDate || null);
  return d ? d.getTime() : 0;
}

function createdSortTs(n) {
  const d = parseDateValue(n?.createdAt || null);
  return d ? d.getTime() : 0;
}

export default withSecurity(
  {
    methods: ["GET"],
    maxBodyBytes: 128 * 1024,
  },
  async (_ctx, _req, context) => {
    try {
      const store = getCentralStore(context);
      const acl = await loadKey(store, KEY_ACL);

      if (!aclAllowsPublicHome(acl)) {
        return jsonResponse({ items: [] }, 200);
      }

      const all = (await loadKey(store, KEY_NOTICES)) || [];
      const list = Array.isArray(all) ? all : [];

      const publicHome = list
        .filter((n) => n && typeof n === "object")
        .filter(isPublicHome)
        .filter((n) => !isExpired(n))
        .filter((n) => isBinNotice(n) || !isNotStarted(n));

      const binItems = publicHome
        .filter(isBinNotice)
        .sort((a, b) => binSortTs(a) - binSortTs(b));

      const regularItems = publicHome
        .filter((n) => !isBinNotice(n))
        .sort((a, b) => createdSortTs(b) - createdSortTs(a))
        .slice(0, 20);

      const items = [...binItems, ...regularItems].map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        category: n.category,
        home: n.home,
        startsAt: n.startsAt || n.startsOn || n.startDate || null,
        expiresAt: n.expiresAt || n.endsOn || n.endDate || n.expires || null,
        date: n.date || null,
        bin: n.bin || null,
        provider: n.provider || null,
        meta: n.meta || null
      }));

      return jsonResponse({ items }, 200);
    } catch (err) {
      return jsonResponse(
        {
          error: "Unable to load public notices.",
          detail: String(err?.message || err || "")
        },
        200
      );
    }
  }
);
