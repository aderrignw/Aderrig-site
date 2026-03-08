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
  if (vr.meetings) roles.push("Meetings");
  if (vr.translation) roles.push("Translation");
  return roles;
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
    // Special route used by the home page.
    // Public users get counts only.
    // Logged-in + active residents get names and phone numbers too.
    if (key === "nearby_support" && req.method === "POST") {
      const body = await readJsonBody(req);
      const eircode = normalizeEircode(body?.eircode || body?.eir || "");

      if (!eircode) {
        return json({ error: "missing eircode" }, 400);
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
      const nearby = activeUsers
        .map((u) => ({
          user: u,
          score: commonPrefixLen(normalizeEircode(u?.eircode || u?.eir), eircode),
        }))
        .filter((item) => item.score >= 3)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.user);

      const coordinators = [];
      const volunteers = [];

      nearby.forEach((u) => {
        if (u?.isCoordinator || u?.coordinator) {
          coordinators.push({
            name: u?.name || "Coordinator",
            phone: u?.phone || null,
            role: "Street coordinator",
          });
        }

        const roleLabels = volunteerRoleLabels(u);
        const isVolunteer = !!(u?.isVolunteer || u?.volunteer || roleLabels.length);
        if (isVolunteer) {
          volunteers.push({
            name: u?.name || "Volunteer",
            phone: u?.phone || null,
            role: roleLabels.length ? roleLabels.join(", ") : "Volunteer",
          });
        }
      });

      const counts = {
        coordinators: coordinators.length,
        volunteers: volunteers.length,
      };

      const currentUser = context?.clientContext?.user || null;
      if (!currentUser) {
        return json({ ok: true, mode: "public", eircode, counts });
      }

      const myEmail = normalizeEmail(currentUser.email);
      const me = users.find((u) => normalizeEmail(u?.email) === myEmail);
      const canSeeDetails = !!me && isActiveStatus(me?.status);

      if (!canSeeDetails) {
        return json({ ok: true, mode: "counts", eircode, counts });
      }

      return json({
        ok: true,
        mode: "details",
        eircode,
        counts,
        coordinators,
        volunteers,
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
