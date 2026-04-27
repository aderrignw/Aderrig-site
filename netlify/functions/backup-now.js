
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
    member: "resident",
    resident: "resident",
    tenant: "tenant",
    tennant: "tenant",
    locatario: "tenant",
    "locatário": "tenant",
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

function hasBackupAccessRole(user) {
  const roles = collectProfileRoles(user).map(normalizeRoleName);
  return roles.includes("owner") || roles.includes("admin");
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

  // Backup/restore access is highly sensitive and must require a trusted identity.
  // Never allow master-email or role fallback from an unverified bearer payload.
  if (!ctx?.trustedIdentity) return false;

  const currentEmails = extractCandidateEmails(currentUser);
  if (!currentEmails.length) return false;

  if (MASTER_EMAIL && currentEmails.includes(MASTER_EMAIL)) {
    return true;
  }

  if (hasBackupAccessRole(currentUser)) {
    return true;
  }

  const store = getCentralStore(context);
  const users = (await safeGetJson(store, "anw_users", [])) ?? [];
  if (!Array.isArray(users) || !users.length) return false;

  const match = users.find((user) =>
    extractCandidateEmails(user).some((email) => currentEmails.includes(email))
  );

  return !!(match && isApprovedUser(match) && hasBackupAccessRole(match));
}

const REMOVAL_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

function parseISO(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : NaN;
}

function shouldPurgeRemovedUser(user, now = Date.now()) {
  const status = String(user?.status || "").toLowerCase().trim();
  if (status !== "removed") return false;

  const explicit = parseISO(user?.removePurgeAfter);
  if (Number.isFinite(explicit)) return explicit <= now;

  const removedAt = parseISO(user?.removedAt || user?.statusChangedAt);
  if (Number.isFinite(removedAt)) return (removedAt + REMOVAL_RETENTION_MS) <= now;

  return false;
}

async function purgeExpiredRemovedResidents(store) {
  const users = (await safeGetJson(store, "anw_users", [])) ?? [];
  if (!Array.isArray(users) || !users.length) {
    return { purged: 0, remaining: Array.isArray(users) ? users.length : 0 };
  }

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
    await safeSetJson(store, "anw_users", kept, {
      metadata: {
        updatedAt: new Date().toISOString(),
        reason: "purge-expired-removed-users",
      },
    });
  }

  return { purged, remaining: kept.length };
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

export default withSecurity(
  {
    methods: ["POST"],
    maxBodyBytes: 256 * 1024,
  },
  async (ctx, req, context) => {
    if (!(await isBackupAuthorized(ctx, context))) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    try {
      const store = getCentralStore(context);
      const purgeResult = await purgeExpiredRemovedResidents(store);

      const createdAt = new Date().toISOString();
      const id = `BKP-${createdAt.replace(/[:.]/g, "-")}`;
      const snapshot = { id, createdAt, includes: DATA_KEYS, purgeResult, data: {} };

      for (const key of DATA_KEYS) {
        snapshot.data[key] = (await safeGetJson(store, key, null)) ?? null;
      }

      await safeSetJson(store, `anw_backup_${id}`, snapshot, {
        metadata: { createdAt, kind: "backup" },
      });

      const indexKey = "anw_backups_index";
      const idx = (await safeGetJson(store, indexKey, { items: [] })) ?? { items: [] };
      idx.items = Array.isArray(idx.items) ? idx.items : [];
      idx.items.unshift(buildBackupListItem(snapshot, { purgeResult }));
      idx.items = idx.items.slice(0, 100);
      await safeSetJson(store, indexKey, idx, { metadata: { updatedAt: createdAt } });

      return jsonResponse({ ok: true, id, purgeResult }, 200);
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e?.message || e) }, 500);
    }
  }
);
