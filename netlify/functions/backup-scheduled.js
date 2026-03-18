import { getStore } from "@netlify/blobs";

function getCentralStore(context){
  const fixed = (process && process.env && process.env.CENTRAL_STORE_NAME) ? String(process.env.CENTRAL_STORE_NAME) : '';
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : 'kv_default');
  return getStore(storeName);
}

const ADMIN_TOKEN = (process?.env?.ANW_ADMIN_TOKEN || "").trim();
function isAuthorized(req) {
  if (!ADMIN_TOKEN) return false;
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1].trim() === ADMIN_TOKEN;
}

function extractRoles(user){
  const roles =
    user?.app_metadata?.roles ||
    user?.app_metadata?.role ||
    user?.user_metadata?.roles ||
    [];
  const list = Array.isArray(roles) ? roles : [roles];
  return list.map(String).map(r => r.toLowerCase());
}
function isOwnerUser(user){
  return extractRoles(user).includes("owner");
}
function isAdminUser(user){
  const rs = extractRoles(user);
  return rs.includes("admin") || rs.includes("owner");
}
function isPrivileged(context){
  const user = context?.clientContext?.user;
  if (!user) return false;
  return isOwnerUser(user) || isAdminUser(user);
}

function isScheduledInvocation(req){
  const ev = (req.headers.get("x-netlify-event") || "").toLowerCase();
  return ev === "schedule";
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
  // Allow Netlify cron OR admin token
  if (!isScheduledInvocation(req) && !isAuthorized(req)) {
    return new Response(JSON.stringify({ ok:false, error:"Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  try {
    const store = getCentralStore(context);

    const settings = (await store.get("anw_backup_settings", { type: "json" })) ?? { enabled: true, schedule: "0 2 * * *", timezone: "UTC" };
    if (!(await store.get("anw_backup_settings", { type: "json" }))) {
      await store.set("anw_backup_settings", Object.assign({}, settings, { updatedAt: new Date().toISOString() }), {
        metadata: { updatedAt: new Date().toISOString(), reason: "initial-enable-automatic-backup" }
      });
    }
    if (!settings.enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "disabled" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

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

    return new Response(JSON.stringify({ ok: true, id, scheduled: true, purgeResult }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};
