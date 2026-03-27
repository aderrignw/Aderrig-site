import { getStore } from "@netlify/blobs";

function getCentralStore(context){
  const fixed = (process && process.env && process.env.CENTRAL_STORE_NAME) ? String(process.env.CENTRAL_STORE_NAME) : '';
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : 'kv_default');
  return getStore(storeName);
}

const ADMIN_TOKEN = (process?.env?.ANW_ADMIN_TOKEN || "").trim();
const MASTER_EMAIL = String(process?.env?.MASTER_EMAIL || 'claudiosantos1968@gmail.com').trim().toLowerCase();
function getBearerToken(req) {
  try {
    const auth = req.headers.get("authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}
function isAuthorized(req) {
  if (!ADMIN_TOKEN) return false;
  const token = getBearerToken(req);
  return !!token && token === ADMIN_TOKEN;
}

function decodeBase64Url(value) {
  const input = String(value || "");
  if (!input) return "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}
function parseJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
}
function parseNetlifyCustomContext(context) {
  try {
    const raw = context?.clientContext?.custom?.netlify;
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    return JSON.parse(Buffer.from(String(raw), "base64").toString("utf8"));
  } catch {
    return null;
  }
}
function normalizeEmail(value){
  return String(value || "").trim().toLowerCase();
}
function normalizeRoleName(value){
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "resident";
  const clean = raw.replace(/[\s\-]+/g, "_");
  const aliasMap = {
    owner: "owner",
    admin: "admin",
    homeowner: "resident",
    householder: "resident",
    member: "resident"
  };
  return aliasMap[clean] || clean;
}
function collectProfileRoles(user){
  const out = [];
  const pushAny = (v) => {
    if (v == null || v === "") return;
    if (Array.isArray(v)) return v.forEach(pushAny);
    out.push(String(v));
  };
  if (!user || typeof user !== "object") return out;
  pushAny(user.type);
  pushAny(user.role);
  pushAny(user.roles);
  pushAny(user.residentType);
  pushAny(user.position);
  pushAny(user.title);
  pushAny(user.access);
  pushAny(user.app_metadata?.roles);
  pushAny(user.app_metadata?.role);
  pushAny(user.user_metadata?.roles);
  return out;
}
function hasOwnerRole(user){
  return collectProfileRoles(user).map(normalizeRoleName).includes("owner");
}
function isApprovedUser(user){
  if (!user || typeof user !== 'object') return false;
  if (user.approved === true || user.active === true) return true;
  const status = String(user.status ?? user.accountStatus ?? user.registrationStatus ?? "").trim().toLowerCase();
  return status === 'approved' || status === 'active' || status === 'enabled';
}
function extractCandidateEmails(user){
  const values = [
    user?.email,
    user?.user_metadata?.email,
    user?.userEmail,
    user?.loginEmail,
    user?.netlifyEmail
  ];
  return [...new Set(values.map(normalizeEmail).filter(Boolean))];
}
function readCurrentUser(context, req) {
  const directUser = context?.clientContext?.user;
  if (directUser?.email) return directUser;
  const netlifyContext = parseNetlifyCustomContext(context);
  if (netlifyContext?.user?.email) return netlifyContext.user;
  if (netlifyContext?.identity?.email) return netlifyContext.identity;
  const token = getBearerToken(req);
  if (token) {
    const payload = parseJwtPayload(token);
    if (payload?.email) return payload;
  }
  return null;
}
async function isPrivileged(context, req){
  const currentUser = readCurrentUser(context, req);
  if (!currentUser) return false;
  const currentEmails = extractCandidateEmails(currentUser);
  if (!currentEmails.length) return false;
  if (MASTER_EMAIL && currentEmails.includes(MASTER_EMAIL)) return true;

  if (hasOwnerRole(currentUser) && isApprovedUser(currentUser)) return true;

  const store = getCentralStore(context);
  const users = (await store.get('anw_users', { type: 'json' })) ?? [];
  if (!Array.isArray(users) || !users.length) return false;
  const match = users.find((user) => {
    const emails = extractCandidateEmails(user);
    return emails.some((email) => currentEmails.includes(email));
  });
  return !!(match && isApprovedUser(match) && hasOwnerRole(match));
}

const REMOVAL_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

function parseISO(value){
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : NaN;
}

function shouldPurgeRemovedUser(user, now = Date.now()){
  const status = String(user?.status || "").toLowerCase().trim();
  if (status !== "removed") return false;

  const explicit = parseISO(user?.removePurgeAfter);
  if (Number.isFinite(explicit)) return explicit <= now;

  const removedAt = parseISO(user?.removedAt || user?.statusChangedAt);
  if (Number.isFinite(removedAt)) return (removedAt + REMOVAL_RETENTION_MS) <= now;

  return false;
}

async function purgeExpiredRemovedResidents(store){
  const users = (await store.get("anw_users", { type: "json" })) ?? [];
  if (!Array.isArray(users) || !users.length) return { purged: 0, remaining: Array.isArray(users) ? users.length : 0 };

  const kept = [];
  let purged = 0;
  for (const user of users) {
    if (shouldPurgeRemovedUser(user)) {
      purged += 1;
      continue;
    }
    kept.push(user);
  }

  if (purged > 0) {
    await store.set("anw_users", kept, { metadata: { updatedAt: new Date().toISOString(), reason: "purge-expired-removed-users" } });
  }

  return { purged, remaining: kept.length };
}

const DATA_KEYS = [
  "anw_users",
  "anw_incidents",
  "anw_tasks",
  "anw_projects",
  "anw_project_monitoring",
  "anw_alerts",
  "anw_contacts",
  "anw_elections",
  "anw_votes",
  "anw_team_votes",
  "anw_election_settings",
  "anw_acl",
  "anw_backup_settings"
];

export default async (req, context) => {
  if (!(await isPrivileged(context, req)) && !isAuthorized(req)) {
    return new Response(JSON.stringify({ ok:false, error:"Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  try {
    const store = getCentralStore(context);

    const purgeResult = await purgeExpiredRemovedResidents(store);

    const createdAt = new Date().toISOString();
    const id = `BKP-${createdAt.replace(/[:.]/g, "-")}`;
    const snapshot = { id, createdAt, includes: DATA_KEYS, purgeResult, data: {} };

    for (const key of DATA_KEYS) {
      const v = await store.get(key, { type: "json" });
      snapshot.data[key] = v ?? null;
    }

    await store.set(`anw_backup_${id}`, snapshot, { metadata: { createdAt, kind: "backup" } });

    const indexKey = "anw_backups_index";
    const idx = (await store.get(indexKey, { type: "json" })) ?? { items: [] };
    idx.items = Array.isArray(idx.items) ? idx.items : [];
    idx.items.unshift({ id, createdAt, includes: DATA_KEYS, purgeResult });
    idx.items = idx.items.slice(0, 100);
    await store.set(indexKey, idx, { metadata: { updatedAt: createdAt } });

    return new Response(JSON.stringify({ ok: true, id, purgeResult }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control":"no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};
