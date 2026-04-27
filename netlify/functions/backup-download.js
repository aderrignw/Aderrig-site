
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

export default withSecurity(
  {
    methods: ["GET"],
    maxBodyBytes: 128 * 1024,
  },
  async (ctx, req, context) => {
    if (!(await isBackupAuthorized(ctx, context))) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    try {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) {
        return jsonResponse({ ok: false, error: "Missing id" }, 400);
      }

      const store = getCentralStore(context);
      const snap = await safeGetJson(store, `anw_backup_${id}`, null);
      if (!snap) {
        return jsonResponse({ ok: false, error: "Not found" }, 404);
      }

      return new Response(JSON.stringify(snap, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          "referrer-policy": "same-origin",
          "content-disposition": `attachment; filename="${id}.json"`,
        },
      });
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e?.message || e) }, 500);
    }
  }
);
