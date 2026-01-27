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
function isScheduledInvocation(req){
  const ev = (req.headers.get("x-netlify-event") || "").toLowerCase();
  return ev === "schedule";
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

    const settings = (await store.get("anw_backup_settings", { type: "json" })) ?? { enabled: false };
    if (!settings.enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "disabled" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const createdAt = new Date().toISOString();
    const id = `BKP-${createdAt.replace(/[:.]/g, "-")}`;
    const snapshot = { id, createdAt, includes: DATA_KEYS, data: {} };

    for (const key of DATA_KEYS) {
      const v = await store.get(key, { type: "json" });
      snapshot.data[key] = v ?? null;
    }

    await store.set(`anw_backup_${id}`, snapshot, { metadata: { createdAt, kind: "backup" } });

    const indexKey = "anw_backups_index";
    const idx = (await store.get(indexKey, { type: "json" })) ?? { items: [] };
    idx.items = Array.isArray(idx.items) ? idx.items : [];
    idx.items.unshift({ id, createdAt, includes: DATA_KEYS });
    idx.items = idx.items.slice(0, 100);
    await store.set(indexKey, idx, { metadata: { updatedAt: createdAt } });

    return new Response(JSON.stringify({ ok: true, id, scheduled: true }), {
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
