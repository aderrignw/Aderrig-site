import { getStore } from "@netlify/blobs";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function normalizeEircode(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").trim();
}

function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
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
    .concat(user?.userRoles || []);

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

export default async (req, context) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return json({ error: "missing key" }, 400);
  }

  const store = getStore("aderrig-nw");

  try {
    if (key === "nearby_support" && req.method === "POST") {
      const body = await readJsonBody(req);
      const eircode = normalizeEircode(body?.eircode || body?.eir || "");
      const bodyAddress = String(body?.address || body?.street || "");

      if (!eircode && !bodyAddress) {
        return json({ error: "missing eircode or address" }, 400);
      }

      let users = [];
      try {
        const rawUsers = await store.get("anw_users");
        const parsedUsers = rawUsers ? JSON.parse(rawUsers) : [];
        users = Array.isArray(parsedUsers) ? parsedUsers : [];
      } catch {
        users = [];
      }

      const activeUsers = users.filter((u) => isActiveStatus(u?.status));
      const currentUser = context?.clientContext?.user || null;
      const currentUserRecord = currentUser
        ? users.find((u) => normalizeEmail(u?.email) === normalizeEmail(currentUser.email)) || null
        : null;

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

      if (!currentUser) {
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
      let raw = await store.get(key);

      if (!raw) {
        raw = "[]";
        await store.set(key, raw);
      }

      try {
        const data = JSON.parse(raw);
        return json(data);
      } catch {
        await store.set(key, "[]");
        return json([]);
      }
    }

    if (req.method === "POST") {
      const body = await req.text();

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return json({ error: "invalid json" }, 400);
      }

      await store.set(key, JSON.stringify(parsed));
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: err?.message || "server error" }, 500);
  }
};
