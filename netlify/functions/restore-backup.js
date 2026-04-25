
import { getStore } from "@netlify/blobs";
import {
  withSecurity,
  jsonResponse,
  normalizeEmail,
} from "./aderrig-security-layer.mjs";

function getCentralStore(context) {
  const fixed = (process && process.env && process.env.CENTRAL_STORE_NAME)
    ? String(process.env.CENTRAL_STORE_NAME)
    : "";
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : "kv_default");
  return getStore(storeName);
}

async function safeGetJson(store, key, fallback = null) {
  try {
    const value = await store.get(key, { type: "json" });
    return value ?? fallback;
  } catch (_) {
    try {
      const raw = await store.get(key);
      if (raw == null || raw === "") return fallback;
      if (typeof raw === "string") return JSON.parse(raw);
      if (raw && typeof raw === "object") return raw;
      return fallback;
    } catch (_err) {
      return fallback;
    }
  }
}

async function safeSetJson(store, key, value, options = {}) {
  return store.set(key, JSON.stringify(value), options);
}

const MASTER_EMAIL = String(
  process?.env?.MASTER_EMAIL || "claudiosantos1968@gmail.com"
).trim().toLowerCase();

function normalizeRoleName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const clean = raw.replace(/[\s\-]+/g, "_");
  const aliasMap = {
    owner: "owner",
    proprietario: "owner",
    "proprietário": "owner",
    homeowner: "owner",
    householder: "owner",
    admin: "admin",
    administrator: "admin",
  };
  return aliasMap[clean] || clean;
}

function collectProfileRoles(user) {
  const out = [];
  const pushAny = (value) => {
    if (value == null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach(pushAny);
      return;
    }
    if (typeof value === "string" && /[;,|]/.test(value)) {
      value.split(/[;,|]/).forEach(pushAny);
      return;
    }
    out.push(String(value));
  };

  if (!user || typeof user !== "object") return out;
  pushAny(user.type);
  pushAny(user.role);
  pushAny(user.roles);
  pushAny(user.residentType);
  pushAny(user.position);
  pushAny(user.title);
  pushAny(user.access);
  pushAny(user.userRole);
  pushAny(user.userRoles);
  pushAny(user.app_metadata?.roles);
  pushAny(user.app_metadata?.role);
  pushAny(user.user_metadata?.roles);
  pushAny(user.user_metadata?.role);
  return out;
}

function hasOwnerAccessRole(user) {
  const roles = collectProfileRoles(user).map(normalizeRoleName);
  return roles.includes("owner") || user?.isOwner === true;
}

function isApprovedUser(user) {
  if (!user || typeof user !== "object") return false;
  if (user.approved === true || user.active === true) return true;
  const status = String(user.status ?? user.accountStatus ?? user.registrationStatus ?? "")
    .trim()
    .toLowerCase();
  return status === "approved" || status === "active" || status === "enabled";
}

function extractCandidateEmails(user) {
  const values = [
    user?.email,
    user?.user_metadata?.email,
    user?.userEmail,
    user?.loginEmail,
    user?.netlifyEmail,
  ];
  return [...new Set(values.map(normalizeEmail).filter(Boolean))];
}

async function isBackupAuthorized(ctx, context) {
  const currentUser = ctx?.user;
  if (!currentUser) return false;

  const currentEmails = extractCandidateEmails(currentUser);
  if (!currentEmails.length) return false;

  if (MASTER_EMAIL && currentEmails.includes(MASTER_EMAIL)) {
    return true;
  }

  if (hasOwnerAccessRole(currentUser)) {
    return true;
  }

  const store = getCentralStore(context);
  const users = (await safeGetJson(store, "anw_users", [])) ?? [];
  if (!Array.isArray(users) || !users.length) return false;

  const match = users.find((user) =>
    extractCandidateEmails(user).some((email) => currentEmails.includes(email))
  );

  return !!(match && isApprovedUser(match) && hasOwnerAccessRole(match));
}

function buildBackupListItem(snapshot, extra = {}) {
  const json = JSON.stringify(snapshot);
  return {
    id: snapshot.id,
    fileName: `${snapshot.id}.json`,
    createdAt: snapshot.createdAt,
    includes: Array.isArray(snapshot.includes) ? snapshot.includes : [],
    sizeBytes: Buffer.byteLength(json, "utf8"),
    ...extra,
  };
}

const DATA_KEYS = [
  "anw_users",
  "anw_incidents",
  "anw_tasks",
  "anw_projects",
  "anw_project_monitoring",
  "anw_project_recipients",
  "anw_alerts",
  "anw_alert_contacts",
  "anw_contacts",
  "anw_notices",
  "anw_elections",
  "anw_election_interest",
  "anw_votes",
  "anw_team_votes",
  "anw_election_settings",
  "anw_handbook_categories",
  "anw_handbook_items",
  "anw_handbook_read_receipts",
  "anw_parking_registry_v1",
  "anw_parking_policy_v1",
  "acl",
  "anw_backup_settings",
  "anw_audit_log",
];

async function addBackupIndexEntry(store, item) {
  const indexKey = "anw_backups_index";
  const idx = (await safeGetJson(store, indexKey, { items: [] })) ?? { items: [] };
  idx.items = Array.isArray(idx.items) ? idx.items : [];
  idx.items.unshift(item);
  idx.items = idx.items.slice(0, 100);
  await safeSetJson(store, indexKey, idx, {
    metadata: { updatedAt: new Date().toISOString() },
  });
}

async function createSafetyBackup(store, note) {
  const createdAt = new Date().toISOString();
  const id = `BKP-SAFETY-${createdAt.replace(/[:.]/g, "-")}`;
  const snapshot = {
    id,
    createdAt,
    includes: DATA_KEYS,
    kind: "safety-before-restore",
    note: note || "",
    data: {},
  };

  for (const key of DATA_KEYS) {
    snapshot.data[key] = (await safeGetJson(store, key, null)) ?? null;
  }

  await safeSetJson(store, `anw_backup_${id}`, snapshot, {
    metadata: {
      createdAt,
      kind: "backup",
      backupType: "safety-before-restore",
    },
  });
  await addBackupIndexEntry(store, buildBackupListItem(snapshot, { kind: "safety-before-restore" }));
  return id;
}

export default withSecurity(
  {
    methods: ["POST"],
    maxBodyBytes: 1024 * 1024 * 5,
  },
  async (ctx, req, context) => {
    if (!(await isBackupAuthorized(ctx, context))) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    try {
      const body = await req.json().catch(() => ({}));
      const uploaded = body?.snapshot;
      const requestedId = String(body?.id || uploaded?.id || "").trim();

      const store = getCentralStore(context);
      let snap = null;
      let id = requestedId;

      if (uploaded && typeof uploaded === "object") {
        snap = uploaded;
      } else if (requestedId) {
        snap = await safeGetJson(store, `anw_backup_${requestedId}`, null);
      } else {
        const idx = (await safeGetJson(store, "anw_backups_index", { items: [] })) ?? { items: [] };
        const latest = Array.isArray(idx.items) ? idx.items[0] : null;
        if (latest?.id) {
          id = String(latest.id).trim();
          snap = await safeGetJson(store, `anw_backup_${id}`, null);
        }
      }

      if (!snap || typeof snap !== "object" || !snap.data || typeof snap.data !== "object") {
        return jsonResponse({ ok: false, error: "Backup not found or invalid" }, 404);
      }

      if (!id) {
        id = String(snap.id || "uploaded-file");
      }

      const safetyBackupId = await createSafetyBackup(store, `Before restore of ${id}`);

      const restoredKeys = [];
      const preservedKeys = [];
      for (const key of DATA_KEYS) {
        if (Object.prototype.hasOwnProperty.call(snap.data, key)) {
          await safeSetJson(store, key, snap.data[key], {
            metadata: {
              updatedAt: new Date().toISOString(),
              reason: `restore-from-${id}`,
            },
          });
          restoredKeys.push(key);
        } else {
          preservedKeys.push(key);
        }
      }

      const restoreLogKey = "anw_restore_log";
      const log = (await safeGetJson(store, restoreLogKey, { items: [] })) ?? { items: [] };
      log.items = Array.isArray(log.items) ? log.items : [];
      log.items.unshift({
        restoredAt: new Date().toISOString(),
        backupId: id,
        safetyBackupId,
        restoredKeys,
        preservedKeys,
      });
      log.items = log.items.slice(0, 100);
      await safeSetJson(store, restoreLogKey, log, {
        metadata: { updatedAt: new Date().toISOString() },
      });

      return jsonResponse({
        ok: true,
        id,
        safetyBackupId,
        restoredKeys,
        preservedKeys,
      }, 200);
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e?.message || e) }, 500);
    }
  }
);
