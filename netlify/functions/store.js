
import { getStore } from "@netlify/blobs";
import { withSecurity, jsonResponse, normalizeEmail } from "./aderrig-security-layer.mjs";

function json(data, status = 200, extraHeaders = {}) {
  return jsonResponse(data, status, extraHeaders);
}

function normalizeEircode(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isActiveStatus(value) {
  const s = String(value || "").toLowerCase().trim();
  return ["active", "approved", "enabled"].includes(s);
}

function commonPrefixLen(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  let n = 0;
  for (let i = 0; i < Math.min(aa.length, bb.length); i += 1) {
    if (aa[i] !== bb[i]) break;
    n += 1;
  }
  return n;
}

function volunteerRoleLabels(user) {
  const vr = user?.vol_roles || user?.volunteerRoles || user?.volunteer_roles || {};
  const roles = [];
  if (vr.streetWatch) roles.push("Street watch");
  if (vr.leaflets) roles.push("Leaflets");
  if (vr.tech || vr.techSupport) roles.push("Tech support");
  if (vr.elderly) roles.push("Elderly checks");
  if (vr.cleanUp || vr.cleanup) roles.push("Community Clean-Up");
  if (vr.parkingAssistance || vr.parking) roles.push("Parking Assistance");
  if (vr.meetings || vr.meetingOrganiser || vr.organiser) roles.push("Meetings");
  if (vr.translation) roles.push("Translation");
  return roles;
}

const STREET_ALIASES = {
  "aderrig grove": ["aderrig grove", "grove"],
  "aderrig lawn": ["aderrig lawn", "lawn"],
  "aderrig court": ["aderrig court", "court"],
  "aderrig green": ["aderrig green", "green"],
  "aderrig walk": ["aderrig walk", "walk"],
  "aderrig lane": ["aderrig lane", "lane"],
  "aderrig street": ["aderrig street", "street"],
  "aderrig place": ["aderrig place", "place"],
  "aderrig park avenue": [
    "aderrig park avenue",
    "park avenue",
    "aderrig park ave",
    "aderrig park av",
  ],
  "aderrig heights": ["aderrig heights", "heights", "celbridge link road"],
  "airlie park road west": ["airlie park road west", "airlie park west", "airlie west"],
  "adamstown way": ["adamstown way"],
  "aderrig glen": ["aderrig glen", "glen"],
  "aderrig close": ["aderrig close", "close"],
  "aderrig gardens": ["aderrig gardens", "gardens"],
  "aderrig drive": ["aderrig drive", "drive"],
  "aderrig park": ["aderrig park"],
};

const STREET_NETWORK = {
  "aderrig grove": {
    direct: ["aderrig court", "aderrig place", "airlie park road west", "aderrig heights"],
    cluster: ["aderrig lawn", "aderrig lane", "aderrig walk"],
  },
  "aderrig court": {
    direct: ["aderrig grove", "aderrig lane", "aderrig place", "aderrig walk", "aderrig heights"],
    cluster: ["aderrig green", "aderrig lawn"],
  },
  "aderrig lane": {
    direct: ["aderrig court", "aderrig walk", "aderrig street", "adamstown way"],
    cluster: ["aderrig grove", "aderrig green", "aderrig place"],
  },
  "aderrig place": {
    direct: ["aderrig grove", "aderrig court", "aderrig lawn", "aderrig green", "aderrig walk"],
    cluster: ["aderrig lane", "aderrig street", "aderrig park avenue"],
  },
  "aderrig walk": {
    direct: ["aderrig court", "aderrig lane", "aderrig place", "aderrig green", "aderrig street"],
    cluster: ["aderrig grove", "aderrig lawn", "aderrig park avenue"],
  },
  "aderrig lawn": {
    direct: ["aderrig place", "aderrig green", "airlie park road west", "aderrig park avenue"],
    cluster: ["aderrig grove", "aderrig walk"],
  },
  "aderrig green": {
    direct: ["aderrig place", "aderrig walk", "aderrig lawn", "aderrig street", "aderrig park avenue"],
    cluster: ["aderrig court", "aderrig lane"],
  },
  "aderrig street": {
    direct: ["aderrig walk", "aderrig lane", "aderrig green", "aderrig park avenue", "adamstown way"],
    cluster: ["aderrig place", "aderrig lawn"],
  },
  "aderrig park avenue": {
    direct: ["aderrig lawn", "aderrig green", "aderrig street", "adamstown way"],
    cluster: ["aderrig place", "aderrig walk", "aderrig glen"],
  },
  "airlie park road west": {
    direct: ["aderrig grove", "aderrig lawn"],
    cluster: ["aderrig place", "aderrig heights"],
  },
  "adamstown way": {
    direct: ["aderrig lane", "aderrig street", "aderrig park avenue"],
    cluster: ["aderrig green", "aderrig walk"],
  },
  "aderrig heights": {
    direct: ["aderrig grove", "aderrig court"],
    cluster: ["airlie park road west", "aderrig lane", "aderrig place"],
  },
  "aderrig glen": {
    direct: ["aderrig park avenue"],
    cluster: ["aderrig street", "aderrig green", "aderrig close", "aderrig gardens"],
  },
  "aderrig close": {
    direct: ["aderrig gardens", "aderrig park", "aderrig drive"],
    cluster: ["aderrig glen"],
  },
  "aderrig gardens": {
    direct: ["aderrig close", "aderrig park", "aderrig drive"],
    cluster: ["aderrig glen"],
  },
  "aderrig drive": {
    direct: ["aderrig park", "aderrig close", "aderrig gardens"],
    cluster: [],
  },
  "aderrig park": {
    direct: ["aderrig close", "aderrig gardens", "aderrig drive"],
    cluster: [],
  },
};

const ADMIN_ONLY_KEYS = new Set([
  "acl",
  "anw_backup_settings",
  "anw_audit_log",
  "anw_backups_index",
  "anw_help_center_admin",
  "anw_project_recipients",
  "anw_project_monitoring",
  "anw_alert_contacts",
  "anw_tasks",
]);

const AUTHENTICATED_READ_KEYS = new Set([
  "anw_notices",
  "anw_projects",
  "anw_alerts",
  "anw_handbook_help_content",
  "anw_help_center_public",
  "anw_parking_registry_v1",
]);

const USER_SUBMISSION_KEYS = new Set([
  "anw_incidents",
  "anw_parking_registry_v1",
  "anw_election_interest",
  "anw_expressions_of_interest",
  "anw_volunteer_interest",
]);

const SELF_SERVICE_ALLOWED_FIELDS = new Set([
  "name",
  "phone",
  "mobile",
  "avatar",
  "avatarUrl",
  "profileImage",
  "photo",
  "profilePhoto",
  "photoUrl",
  "photoURL",
  "residentType",
  "vol_roles",
  "volunteerRoles",
  "volunteer_roles",
  "volRoles",
  "alertsConsent",
  "interest",
  "termsAccepted",
  "termsAcceptedAt",
  "parkingSpace",
  "vehicleReg",
  "vehicleRegs",
  "vehicles",
  "preferences",
  "language",
  "updatedAt",
  "modifiedAt",
]);

const REGISTRATION_BOOTSTRAP_FIELDS = new Set([
  "name",
  "fullName",
  "email",
  "userEmail",
  "loginEmail",
  "netlifyEmail",
  "eircode",
  "eir",
  "address",
  "fullAddress",
  "streetAddress",
  "householdAddress",
  "phone",
  "mobile",
  "residentType",
  "managementCompany",
  "status",
  "role",
  "isCoordinator",
  "isVolunteer",
  "termsAccepted",
  "termsAcceptedAt",
  "createdAt",
  "updatedAt",
]);

function isBackupKey(key) {
  return /^anw_backup_/i.test(String(key || "")) || /^backup_/i.test(String(key || ""));
}

function isAdminManagedKey(key) {
  return ADMIN_ONLY_KEYS.has(key) || isBackupKey(key);
}

const ADMIN_ROLE_NAMES = new Set([
  "admin",
  "owner",
  "platform support",
  "platform_support",
  "area coordinator",
  "area_coordinator",
  "aux coordinator",
  "aux_coordinator",
  "assistant area coordinator",
  "assistant_area_coordinator",
  "platformsupport",
  "areacoordinator",
  "auxcoordinator",
  "assistantareacoordinator",
]);

function userHasAdminPrivilegesFromRecord(userRecord) {
  if (!userRecord || typeof userRecord !== "object") return false;

  const roles = getUserRolesNormalized(userRecord);

  // Owner recognition option 2: role/type/access contains owner.
  if (roles.includes("owner")) return true;

  // Owner recognition option 3: explicit owner flag in anw_users.
  if (userRecord.isOwner === true) return true;

  // Existing admin role recognition preserved.
  return roles.some((role) => ADMIN_ROLE_NAMES.has(role));
}

function findUserRecordByEmail(users, email) {
  const currentEmail = normalizeEmail(email || "");
  if (!currentEmail) return null;
  return (Array.isArray(users) ? users : []).find((user) => getUserEmails(user).includes(currentEmail)) || null;
}

async function enrichSecurityContext(baseCtx, store) {
  if (!baseCtx?.user) return baseCtx;

  // Balanced production rule:
  // Trusted Netlify identity is accepted directly.
  // If the platform only provides a bearer payload and JWT secret verification is not available,
  // do not trust roles from the token itself. Instead, check the server-side anw_users record.
  // Admin elevation still requires a matching approved owner/admin profile stored on the backend.
  const hasAuthenticatedEmail = getIdentityEmails(baseCtx?.user).length > 0;
  if (!baseCtx?.trustedIdentity || !hasAuthenticatedEmail) {
    return {
      ...baseCtx,
      currentUserRecord: null,
    };
  }

  try {
    const users = await getJsonArray(store, "anw_users");
    const currentUserRecord = findUserRecordByIdentity(users, baseCtx?.user);
    if (!currentUserRecord || !userHasAdminPrivilegesFromRecord(currentUserRecord)) {
      return {
        ...baseCtx,
        roles: [],
        role: "",
        isAdmin: false,
        isOwner: false,
        currentUserRecord: currentUserRecord || null,
      };
    }

    const mergedRoles = Array.from(new Set([
      ...(Array.isArray(baseCtx.roles) ? baseCtx.roles : []),
      ...getUserRolesNormalized(currentUserRecord),
    ].filter(Boolean)));

    return {
      ...baseCtx,
      roles: mergedRoles,
      role: mergedRoles[0] || "admin",
      isAdmin: true,
      isOwner: mergedRoles.includes("owner") || currentUserRecord?.isOwner === true,
      currentUserRecord,
    };
  } catch {
    return baseCtx;
  }
}

function mayReadKey(key, ctx) {
  if (key === "nearby_support") return true;
  if (key === "anw_users") return !!ctx.user;
  if (isAdminManagedKey(key)) return !!ctx.isAdmin;
  if (AUTHENTICATED_READ_KEYS.has(key)) return !!ctx.user;
  return !!ctx.isAdmin;
}

function mayWriteKey(key, ctx) {
  if (key === "nearby_support") return true;
  if (key === "anw_users") return !!ctx.user;
  if (isAdminManagedKey(key)) return !!ctx.isAdmin;
  if (USER_SUBMISSION_KEYS.has(key)) return !!ctx.user;
  return !!ctx.isAdmin;
}

function extractStreetFromAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = normalizeText(raw);

  for (const [street, aliases] of Object.entries(STREET_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(normalizeText(alias)))) {
      return street;
    }
  }

  return "";
}

function uniqBy(arr, getKey) {
  const seen = new Set();
  return (Array.isArray(arr) ? arr : []).filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getUserAddress(user) {
  return (
    user?.address ||
    user?.fullAddress ||
    user?.streetAddress ||
    user?.householdAddress ||
    user?.homeAddress ||
    ""
  );
}

function getUserStreet(user) {
  return extractStreetFromAddress(getUserAddress(user));
}

function getUserRolesNormalized(user) {
  const direct = []
    .concat(user?.role || [])
    .concat(user?.roles || [])
    .concat(user?.userRole || [])
    .concat(user?.userRoles || [])
    .concat(user?.type || [])
    .concat(user?.residentType || []);

  return direct
    .flatMap((v) => (Array.isArray(v) ? v : String(v || "").split(/[;,|]/)))
    .map((v) => normalizeText(v))
    .filter(Boolean);
}

function isCoordinatorUser(user) {
  const roles = getUserRolesNormalized(user);
  return !!(
    user?.isCoordinator ||
    user?.coordinator ||
    roles.includes("street coordinator") ||
    roles.includes("street coordinator admin") ||
    roles.includes("street_admin") ||
    roles.includes("street admin")
  );
}

function isVolunteerUser(user) {
  const roles = getUserRolesNormalized(user);
  const roleLabels = volunteerRoleLabels(user);
  return !!(
    user?.isVolunteer ||
    user?.volunteer ||
    roleLabels.length ||
    roles.includes("volunteer")
  );
}

function buildCoordinatorItem(user, relation, score) {
  return {
    name: user?.name || "Coordinator",
    email: user?.email || null,
    phone: user?.phone || null,
    role: "Street coordinator",
    street: getUserStreet(user) || null,
    relation,
    score,
  };
}

function buildVolunteerItem(user, relation, score) {
  const roleLabels = volunteerRoleLabels(user);
  return {
    name: user?.name || "Volunteer",
    email: user?.email || null,
    phone: user?.phone || null,
    role: roleLabels.length ? roleLabels.join(", ") : "Volunteer",
    street: getUserStreet(user) || null,
    relation,
    score,
  };
}

function getStreetLinks(street) {
  const node = STREET_NETWORK[street] || { direct: [], cluster: [] };
  return {
    direct: Array.isArray(node.direct) ? node.direct : [],
    cluster: Array.isArray(node.cluster) ? node.cluster : [],
  };
}

function scoreByStreet(targetStreet, candidateStreet) {
  if (!targetStreet || !candidateStreet) return 0;
  if (targetStreet === candidateStreet) return 300;

  const links = getStreetLinks(targetStreet);
  if (links.direct.includes(candidateStreet)) return 200;
  if (links.cluster.includes(candidateStreet)) return 120;

  return 0;
}

function scoreByEircode(targetEircode, candidateUser) {
  const candidateEir = normalizeEircode(candidateUser?.eircode || candidateUser?.eir || "");
  if (!targetEircode || !candidateEir) return 0;
  const prefix = commonPrefixLen(candidateEir, targetEircode);
  if (prefix >= 7) return 80;
  if (prefix >= 5) return 50;
  if (prefix >= 3) return 25;
  return 0;
}

function resolveTargetStreet({ users, eircode, currentUserRecord, bodyAddress }) {
  const explicitAddressStreet = extractStreetFromAddress(bodyAddress);
  if (explicitAddressStreet) return explicitAddressStreet;

  const meStreet = getUserStreet(currentUserRecord);
  if (meStreet) return meStreet;

  const exactEirMatch = (Array.isArray(users) ? users : []).find((u) => {
    return normalizeEircode(u?.eircode || u?.eir || "") === eircode && !!getUserStreet(u);
  });
  if (exactEirMatch) return getUserStreet(exactEirMatch);

  return "";
}

function sortPeople(list) {
  return (Array.isArray(list) ? list : []).sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function getUserEmails(user) {
  return [
    normalizeEmail(user?.email),
    normalizeEmail(user?.userEmail),
    normalizeEmail(user?.loginEmail),
    normalizeEmail(user?.netlifyEmail),
    normalizeEmail(user?.user_metadata?.email),
    normalizeEmail(user?.app_metadata?.email),
  ].filter(Boolean);
}

function uniqueEmails(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeEmail(value))
    .filter(Boolean)));
}

function getIdentityEmails(identityUser) {
  if (!identityUser || typeof identityUser !== "object") return [];
  return uniqueEmails(getUserEmails(identityUser));
}

function getPrimaryIdentityEmail(identityUser) {
  return getIdentityEmails(identityUser)[0] || "";
}

function findUserRecordByIdentity(users, identityUser) {
  const identityEmails = getIdentityEmails(identityUser);
  if (!identityEmails.length) return null;
  return (Array.isArray(users) ? users : []).find((user) => {
    const emails = getUserEmails(user);
    return emails.some((email) => identityEmails.includes(email));
  }) || null;
}

function getUserReg(user) {
  return String(
    user?.regId ||
    user?.regNo ||
    user?.registrationNo ||
    ""
  ).trim().toUpperCase();
}

function getUserTimestamp(user) {
  return Date.parse(
    user?.updatedAt || user?.modifiedAt || user?.createdAt || 0
  ) || 0;
}

function sameUser(a, b) {
  const regA = getUserReg(a);
  const regB = getUserReg(b);
  if (regA && regB && regA === regB) return true;

  const emailsA = getUserEmails(a);
  const emailsB = getUserEmails(b);
  if (!emailsA.length || !emailsB.length) return false;

  return emailsA.some((email) => emailsB.includes(email));
}

function mergeUserRecords(existing, incoming) {
  const existingTs = getUserTimestamp(existing);
  const incomingTs = getUserTimestamp(incoming);

  if (incomingTs >= existingTs) {
    return { ...existing, ...incoming };
  }

  return { ...incoming, ...existing };
}

function sanitizeSelfServiceUserUpdate(incoming, currentEmail, existingUser) {
  const wrapped = incoming && typeof incoming === "object" && incoming.action && incoming.profile
    ? incoming.profile
    : incoming;
  const source = wrapped && typeof wrapped === "object" ? wrapped : {};
  const existing = existingUser && typeof existingUser === "object" ? existingUser : null;
  const clean = existing ? { ...existing } : {};

  for (const [key, value] of Object.entries(source)) {
    if (SELF_SERVICE_ALLOWED_FIELDS.has(key)) {
      clean[key] = value;
      continue;
    }

    if (!existing && REGISTRATION_BOOTSTRAP_FIELDS.has(key)) {
      clean[key] = value;
      continue;
    }

    if (existing && REGISTRATION_BOOTSTRAP_FIELDS.has(key) && (clean[key] == null || clean[key] === "")) {
      clean[key] = value;
    }
  }

  if (source.eir && !clean.eircode) clean.eircode = source.eir;
  if (source.eircode && !clean.eir) clean.eir = source.eircode;
  if (source.fullAddress && !clean.address) clean.address = source.fullAddress;
  if (source.address && !clean.fullAddress) clean.fullAddress = source.address;

  clean.email = currentEmail || source.email || clean.email || "";
  clean.userEmail = clean.userEmail || clean.email || currentEmail || "";
  clean.loginEmail = clean.loginEmail || clean.email || currentEmail || "";
  clean.netlifyEmail = clean.netlifyEmail || clean.email || currentEmail || "";

  if (!existing) {
    if (!clean.status) clean.status = "pending";
    if (!clean.role) clean.role = "resident";
    if (!clean.createdAt) clean.createdAt = source.createdAt || new Date().toISOString();
  }

  clean.updatedAt = source.updatedAt || new Date().toISOString();

  return clean;
}

function filterUsersForSelf(users, currentEmail) {
  return (Array.isArray(users) ? users : []).filter((u) => {
    return getUserEmails(u).includes(currentEmail);
  });
}

function filterParkingRegistryForSelf(data, currentEmail) {
  const registry = data && typeof data === "object" ? data : {};
  const submissions = registry.submissions && typeof registry.submissions === "object" ? registry.submissions : {};
  const filteredSubmissions = {};
  const email = normalizeEmail(currentEmail || "");

  for (const [submissionKey, submission] of Object.entries(submissions)) {
    const submissionEmail = normalizeEmail(submission?.residentEmail || submission?.email || submission?.userEmail || "");
    if (email && (normalizeEmail(submissionKey) === email || submissionEmail === email)) {
      filteredSubmissions[submissionKey] = submission;
    }
  }

  return {
    ...registry,
    submissions: filteredSubmissions,
  };
}


function getSubmissionEmails(entry) {
  if (!entry || typeof entry !== "object") return [];
  return [
    entry.email,
    entry.userEmail,
    entry.loginEmail,
    entry.netlifyEmail,
    entry.residentEmail,
    entry.reporterEmail,
    entry.submittedBy,
    entry.submittedByEmail,
    entry.createdBy,
    entry.createdByEmail,
    entry.ownerEmail,
  ].map(normalizeEmail).filter(Boolean);
}

function getSubmissionId(entry) {
  return String(
    entry?.id ||
    entry?.incidentId ||
    entry?.reportId ||
    entry?.reference ||
    entry?.ref ||
    entry?.submissionId ||
    entry?.interestId ||
    entry?.createdAt ||
    ""
  ).trim();
}

function submissionBelongsToEmail(entry, currentEmail) {
  const email = normalizeEmail(currentEmail || "");
  if (!email || !entry || typeof entry !== "object") return false;
  const emails = getSubmissionEmails(entry);
  if (!emails.length) return true;
  return emails.includes(email);
}

function stampSelfSubmission(entry, currentEmail) {
  const source = entry && typeof entry === "object" ? entry : {};
  const now = new Date().toISOString();
  return {
    ...source,
    email: source.email || currentEmail,
    userEmail: source.userEmail || currentEmail,
    submittedByEmail: source.submittedByEmail || source.submittedBy || currentEmail,
    updatedAt: now,
    createdAt: source.createdAt || now,
  };
}

function mergeSelfSubmissionArray(currentValue, incomingValue, currentEmail) {
  const current = Array.isArray(currentValue) ? currentValue.slice() : [];
  const incoming = (Array.isArray(incomingValue) ? incomingValue : [incomingValue])
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => submissionBelongsToEmail(entry, currentEmail))
    .map((entry) => stampSelfSubmission(entry, currentEmail));

  if (!incoming.length) {
    return { ok: false, error: "self submission write requires own record" };
  }

  for (const item of incoming) {
    const itemId = getSubmissionId(item);
    const idx = current.findIndex((existing) => {
      if (!existing || typeof existing !== "object") return false;
      const existingId = getSubmissionId(existing);
      if (itemId && existingId && itemId === existingId) return true;
      return getSubmissionEmails(existing).includes(currentEmail) && getSubmissionEmails(item).includes(currentEmail) && itemId && existingId && itemId === existingId;
    });

    if (idx >= 0) {
      current[idx] = {
        ...current[idx],
        ...item,
        email: currentEmail,
        userEmail: currentEmail,
        updatedAt: new Date().toISOString(),
      };
    } else {
      current.push(item);
    }
  }

  return { ok: true, value: current, count: incoming.length };
}

function mergeSelfSubmissionObject(currentValue, incomingValue, currentEmail) {
  const current = currentValue && typeof currentValue === "object" && !Array.isArray(currentValue) ? { ...currentValue } : {};
  const source = incomingValue && typeof incomingValue === "object" && !Array.isArray(incomingValue) ? incomingValue : {};

  if (source.submissions && typeof source.submissions === "object") {
    const next = {
      ...current,
      submissions: current.submissions && typeof current.submissions === "object" ? { ...current.submissions } : {},
      updatedAt: new Date().toISOString(),
    };

    const ownEntry = Object.entries(source.submissions).find(([submissionKey, submission]) => {
      const submissionEmail = normalizeEmail(submission?.residentEmail || submission?.email || submission?.userEmail || submission?.submittedByEmail || "");
      return normalizeEmail(submissionKey) === currentEmail || submissionEmail === currentEmail;
    });

    if (!ownEntry) {
      return { ok: false, error: "self submission write requires own record" };
    }

    const [, submission] = ownEntry;
    next.submissions[currentEmail] = stampSelfSubmission(submission, currentEmail);
    return { ok: true, value: next, count: 1 };
  }

  if (!submissionBelongsToEmail(source, currentEmail)) {
    return { ok: false, error: "self submission write requires own record" };
  }

  const key = currentEmail;
  const existing = current[key] && typeof current[key] === "object" ? current[key] : {};
  current[key] = {
    ...existing,
    ...stampSelfSubmission(source, currentEmail),
  };
  current.updatedAt = new Date().toISOString();
  return { ok: true, value: current, count: 1 };
}

async function mergeSelfSubmissionStoreValue(store, key, parsed, currentEmail) {
  let currentValue;
  try {
    const rawCurrent = await store.get(key);
    currentValue = rawCurrent ? JSON.parse(rawCurrent) : [];
  } catch {
    currentValue = [];
  }

  const mergeResult = Array.isArray(currentValue)
    ? mergeSelfSubmissionArray(currentValue, parsed, currentEmail)
    : mergeSelfSubmissionObject(currentValue, parsed, currentEmail);

  if (!mergeResult.ok) return mergeResult;

  await store.set(key, JSON.stringify(mergeResult.value));
  return mergeResult;
}

async function getJsonArray(store, key) {
  try {
    const raw = await store.get(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default withSecurity(
  {
    methods: ["GET", "POST"],
    maxBodyBytes: 1024 * 1024 * 2,
  },
  async (ctx, req) => {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return json({ error: "missing key" }, 400);
    }

    const store = getStore("aderrig-nw");
    const secureCtx = await enrichSecurityContext(ctx, store);

    try {
      if (key === "nearby_support" && req.method === "POST") {
        const body = await readJsonBody(req);
        const eircode = normalizeEircode(body?.eircode || body?.eir || "");
        const bodyAddress = String(body?.address || body?.street || "");

        if (!eircode && !bodyAddress) {
          return json({ error: "missing eircode or address" }, 400);
        }

        const users = await getJsonArray(store, "anw_users");
        const activeUsers = users.filter((u) => isActiveStatus(u?.status));

        const currentIdentityEmails = getIdentityEmails(ctx?.user);
        const currentUserEmail = currentIdentityEmails[0] || "";
        const currentUserRecord = findUserRecordByIdentity(users, ctx?.user);

        const targetStreet = resolveTargetStreet({
          users: activeUsers,
          eircode,
          currentUserRecord,
          bodyAddress,
        });

        const matched = activeUsers
          .map((user) => {
            const street = getUserStreet(user);
            const streetScore = scoreByStreet(targetStreet, street);
            const eirScore = streetScore > 0 ? 0 : scoreByEircode(eircode, user);
            const score = streetScore || eirScore;
            const relation = streetScore >= 300
              ? "same_street"
              : streetScore >= 200
                ? "connected_street"
                : streetScore >= 120
                  ? "cluster_street"
                  : eirScore > 0
                    ? "eircode_fallback"
                    : "";

            return { user, score, relation };
          })
          .filter((item) => item.score > 0);

        const coordinators = uniqBy(
          sortPeople(
            matched
              .filter((item) => isCoordinatorUser(item.user))
              .map((item) => buildCoordinatorItem(item.user, item.relation, item.score))
          ).slice(0, 5),
          (item) => normalizeEmail(item.email || item.name)
        );

        const volunteers = uniqBy(
          sortPeople(
            matched
              .filter((item) => isVolunteerUser(item.user))
              .map((item) => buildVolunteerItem(item.user, item.relation, item.score))
          ).slice(0, 8),
          (item) => normalizeEmail(item.email || item.name)
        );

        const counts = {
          coordinators: coordinators.length,
          volunteers: volunteers.length,
        };

        if (!currentUserEmail) {
          return json({
            ok: true,
            mode: "public",
            eircode,
            targetStreet: targetStreet || null,
            counts,
          });
        }

        const canSeeDetails = !!currentUserRecord && isActiveStatus(currentUserRecord?.status);
        if (!canSeeDetails) {
          return json({
            ok: true,
            mode: "counts",
            eircode,
            targetStreet: targetStreet || null,
            counts,
          });
        }

        return json({
          ok: true,
          mode: "details",
          eircode,
          targetStreet: targetStreet || null,
          counts,
          coordinators,
          volunteers,
          streetNetworkVersion: "aderrig-v2-full-street-map",
        });
      }

      if (req.method === "GET") {
        if (!mayReadKey(key, secureCtx)) {
          return json({ error: secureCtx.user ? "forbidden" : "unauthorized" }, secureCtx.user ? 403 : 401);
        }

        let raw = await store.get(key);

        if (!raw) {
          raw = "[]";
          await store.set(key, raw);
        }

        try {
          const data = JSON.parse(raw);

          if (key === "anw_users" && !secureCtx.isAdmin) {
            const currentEmail = getPrimaryIdentityEmail(secureCtx?.user);
            return json(filterUsersForSelf(data, currentEmail));
          }

          if (key === "anw_parking_registry_v1" && !secureCtx.isAdmin) {
            const currentEmail = getPrimaryIdentityEmail(secureCtx?.user);
            return json(filterParkingRegistryForSelf(data, currentEmail));
          }

          return json(data);
        } catch {
          await store.set(key, "[]");
          return json(key === "anw_users" && !secureCtx.isAdmin ? [] : []);
        }
      }

      if (req.method === "POST") {
        if (!mayWriteKey(key, secureCtx)) {
          return json({ error: secureCtx.user ? "forbidden" : "unauthorized" }, secureCtx.user ? 403 : 401);
        }

        const bodyText = await req.text();

        let parsed;
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        // 🔒 OWNER-ONLY RESTORE PROTECTION
        // Restore can overwrite live production data, so it must be restricted to owner only.
        if (String(key || "").toLowerCase().includes("restore")) {
          if (!secureCtx.isOwner) {
            return json({ error: "restore allowed only for owner" }, 403);
          }
        }


        if (key !== "anw_users") {
          if (key === "anw_parking_registry_v1" && !secureCtx.isAdmin) {
            const currentEmail = getPrimaryIdentityEmail(secureCtx?.user);
            if (!currentEmail) {
              return json({ error: "unauthorized" }, 401);
            }

            let currentRegistry = {};
            try {
              const rawCurrent = await store.get(key);
              currentRegistry = rawCurrent ? JSON.parse(rawCurrent) : {};
            } catch {
              currentRegistry = {};
            }

            const nextRegistry = currentRegistry && typeof currentRegistry === "object" ? { ...currentRegistry } : {};
            nextRegistry.allocations = Array.isArray(currentRegistry?.allocations) ? currentRegistry.allocations : [];
            nextRegistry.policy = currentRegistry?.policy || null;
            nextRegistry.updatedAt = new Date().toISOString();
            nextRegistry.submissions = currentRegistry?.submissions && typeof currentRegistry.submissions === "object" ? { ...currentRegistry.submissions } : {};

            const submittedEntries = Object.entries(parsed?.submissions && typeof parsed.submissions === "object" ? parsed.submissions : {});
            const ownEntry = submittedEntries.find(([submissionKey, submission]) => {
              const submissionEmail = normalizeEmail(submission?.residentEmail || submission?.email || submission?.userEmail || "");
              return normalizeEmail(submissionKey) === currentEmail || submissionEmail === currentEmail;
            });

            if (!ownEntry) {
              return json({ error: "parking registry write requires own submission" }, 400);
            }

            const [, submission] = ownEntry;
            nextRegistry.submissions[currentEmail] = {
              ...(nextRegistry.submissions[currentEmail] || {}),
              ...(submission && typeof submission === "object" ? submission : {}),
              residentEmail: currentEmail,
              email: currentEmail,
              updatedAt: new Date().toISOString(),
            };

            await store.set(key, JSON.stringify(nextRegistry));
            return json({ ok: true, scope: "self", key });
          }

          if (USER_SUBMISSION_KEYS.has(key) && !secureCtx.isAdmin) {
            const currentEmail = getPrimaryIdentityEmail(secureCtx?.user);
            if (!currentEmail) {
              return json({ error: "unauthorized" }, 401);
            }

            const mergeResult = await mergeSelfSubmissionStoreValue(store, key, parsed, currentEmail);
            if (!mergeResult.ok) {
              return json({ error: mergeResult.error || "self submission write failed" }, 400);
            }

            return json({ ok: true, scope: "self", key, merged: true, count: mergeResult.count || 0 });
          }

          await store.set(key, JSON.stringify(parsed));
          return json({ ok: true });
        }

        let current = [];
        try {
          const rawCurrent = await store.get(key);
          const parsedCurrent = rawCurrent ? JSON.parse(rawCurrent) : [];
          current = Array.isArray(parsedCurrent) ? parsedCurrent : [];
        } catch {
          current = [];
        }

        if (secureCtx.isAdmin) {
          if (!Array.isArray(parsed)) {
            return json({ error: "anw_users must be an array" }, 400);
          }

          const merged = Array.isArray(current) ? current.slice() : [];

          for (const incomingUser of parsed) {
            if (!incomingUser || typeof incomingUser !== "object") continue;

            const idx = merged.findIndex((existingUser) => sameUser(existingUser, incomingUser));

            if (idx === -1) {
              merged.push(incomingUser);
            } else {
              merged[idx] = mergeUserRecords(merged[idx], incomingUser);
            }
          }

          await store.set(key, JSON.stringify(merged));
          return json({ ok: true, merged: true, scope: "admin" });
        }

        const currentEmail = getPrimaryIdentityEmail(secureCtx?.user);
        if (!currentEmail) {
          return json({ error: "unauthorized" }, 401);
        }

        const incomingRecords = (Array.isArray(parsed) ? parsed : [parsed])
          .filter((record) => record && typeof record === "object");

        if (!incomingRecords.length) {
          return json({ error: "no valid user payload" }, 400);
        }

        const merged = Array.isArray(current) ? current.slice() : [];

        for (const rawIncomingUser of incomingRecords) {
          const idx = merged.findIndex((existingUser) => {
            const emails = getUserEmails(existingUser);
            return emails.includes(currentEmail);
          });

          const sanitized = sanitizeSelfServiceUserUpdate(rawIncomingUser, currentEmail, idx >= 0 ? merged[idx] : null);

          if (idx === -1) {
            merged.push(sanitized);
          } else {
            merged[idx] = sanitized;
          }
        }

        await store.set(key, JSON.stringify(merged));
        return json({ ok: true, merged: true, scope: "self" });
      }

      return json({ error: "method not allowed" }, 405);
    } catch (err) {
      return json({ error: err?.message || "server error" }, 500);
    }
  }
);
