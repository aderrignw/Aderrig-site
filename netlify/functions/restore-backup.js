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

async function addBackupIndexEntry(store, item){
  const indexKey = "anw_backups_index";
  const idx = (await store.get(indexKey, { type: "json" })) ?? { items: [] };
  idx.items = Array.isArray(idx.items) ? idx.items : [];
  idx.items.unshift(item);
  idx.items = idx.items.slice(0, 100);
  await store.set(indexKey, idx, { metadata: { updatedAt: new Date().toISOString() } });
}

async function createSafetyBackup(store, note){
  const createdAt = new Date().toISOString();
  const id = `BKP-SAFETY-${createdAt.replace(/[:.]/g, "-")}`;
  const snapshot = {
    id,
    createdAt,
    includes: DATA_KEYS,
    kind: "safety-before-restore",
    note: note || '',
    data: {}
  };

  for (const key of DATA_KEYS) {
    const v = await store.get(key, { type: "json" });
    snapshot.data[key] = v ?? null;
  }

  await store.set(`anw_backup_${id}`, snapshot, { metadata: { createdAt, kind: "backup", backupType: "safety-before-restore" } });
  await addBackupIndexEntry(store, { id, createdAt, includes: DATA_KEYS, kind: "safety-before-restore" });
  return id;
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok:false, error:"Method not allowed" }), { status: 405, headers: { "content-type": "application/json; charset=utf-8" } });
  }

  if (!isPrivileged(context) && !isAuthorized(req)) {
    return new Response(JSON.stringify({ ok:false, error:"Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
    if (!id) {
      return new Response(JSON.stringify({ ok:false, error:"Missing backup id" }), { status: 400, headers: { "content-type":"application/json; charset=utf-8" } });
    }

    const store = getCentralStore(context);
    const snap = await store.get(`anw_backup_${id}`, { type: "json" });
    if (!snap || typeof snap !== 'object' || !snap.data || typeof snap.data !== 'object') {
      return new Response(JSON.stringify({ ok:false, error:"Backup not found or invalid" }), { status: 404, headers: { "content-type":"application/json; charset=utf-8" } });
    }

    const safetyBackupId = await createSafetyBackup(store, `Before restore of ${id}`);

    const restoredKeys = [];
    const preservedKeys = [];
    for (const key of DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(snap.data, key)) {
        await store.set(key, snap.data[key]);
        restoredKeys.push(key);
      } else {
        preservedKeys.push(key);
      }
    }

    const restoreLogKey = "anw_restore_log";
    const log = (await store.get(restoreLogKey, { type: "json" })) ?? { items: [] };
    log.items = Array.isArray(log.items) ? log.items : [];
    log.items.unshift({
      restoredAt: new Date().toISOString(),
      backupId: id,
      safetyBackupId,
      restoredKeys,
      preservedKeys
    });
    log.items = log.items.slice(0, 100);
    await store.set(restoreLogKey, log, { metadata: { updatedAt: new Date().toISOString() } });

    return new Response(JSON.stringify({
      ok: true,
      id,
      safetyBackupId,
      restoredKeys,
      preservedKeys
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control":"no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};
