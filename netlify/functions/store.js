// Netlify Function: store.js
// Provides authenticated access to Netlify Blobs-backed KV store used by the site.
//
// Security model:
// - Admin (email in env MASTER_EMAIL or role 'admin'/'owner') can GET/POST/DELETE any key.
// - Normal authenticated users can:
//    * GET anw_users -> returns {me: <their profile or null>}
//    * POST anw_users with {action:'append_me', value:<profile>} to create their own pending profile
//
// Notes:
// - This function relies on NETLIFY_BLOBS_TOKEN + NETLIFY_BLOBS_SITE_ID env vars.
// - Do NOT expose tokens to the browser.

const { getStore } = require("@netlify/blobs");

function json(statusCode, body){
  return { statusCode, headers: { "Content-Type":"application/json" }, body: JSON.stringify(body) };
}

function normalizeEir(v){
  return String(v||"").toUpperCase().replace(/\s+/g,"").trim();
}

function safeText(v, max=300){
  const s = String(v||"").trim();
  return s.length > max ? s.slice(0, max) : s;
}

function isTruthyRole(roles, r){
  if(!roles) return false;
  if(Array.isArray(roles)) return roles.map(x=>String(x).toLowerCase()).includes(r);
  const s = String(roles).toLowerCase();
  return s.split(/[\s,]+/).includes(r);
}

exports.handler = async (event, context) => {
  try{
    const key = (event.queryStringParameters && event.queryStringParameters.key) ? String(event.queryStringParameters.key) : "";
    if(!key) return json(400, { ok:false, error:"Missing key" });

    const user = context && context.clientContext && context.clientContext.user ? context.clientContext.user : null;
    const email = user && user.email ? String(user.email).toLowerCase() : "";
    const roles = user && user.app_metadata ? user.app_metadata.roles : null;

    const master = process.env.MASTER_EMAIL ? String(process.env.MASTER_EMAIL).toLowerCase() : "";
    const isAdmin = (!!email) && (email === master || isTruthyRole(roles,"admin") || isTruthyRole(roles,"owner"));

    if(!user) return json(401, { ok:false, error:"Not authenticated" });

    const store = getStore("anw_store");

    if(event.httpMethod === "GET"){
      const val = await store.get(key, { type:"json" });

      // Non-admins can only view their own profile inside anw_users
      if(!isAdmin && key === "anw_users"){
        const users = Array.isArray(val) ? val : [];
        const me = users.find(u => String(u.email||"").toLowerCase() === email) || null;
        return json(200, { ok:true, me });
      }

      if(!isAdmin) return json(403, { ok:false, error:"Forbidden" });
      return json(200, { ok:true, value: (val===undefined? null : val) });
    }

    if(event.httpMethod === "DELETE"){
      if(!isAdmin) return json(403, { ok:false, error:"Forbidden" });
      await store.delete(key);
      return json(200, { ok:true });
    }

    if(event.httpMethod === "POST"){
      const body = event.body ? JSON.parse(event.body) : {};
      const action = body.action ? String(body.action) : "";

      // Resident self-registration append
      if(!isAdmin && key === "anw_users" && action === "append_me"){
        const incoming = body.value || {};
        const inEmail = String(incoming.email||"").toLowerCase();
        if(!inEmail || inEmail !== email){
          return json(400, { ok:false, error:"Email mismatch" });
        }
        const inEir = normalizeEir(incoming.eircode || incoming.eir || "");
        if(!inEir) return json(400, { ok:false, error:"Missing eircode" });

        let users = await store.get("anw_users", { type:"json" });
        if(!Array.isArray(users)) users = [];

        if(users.some(u => String(u.email||"").toLowerCase() === inEmail)){
          return json(409, { ok:false, error:"A user with this email address has already been registered" });
        }
        if(users.some(u => normalizeEir(u.eircode||"") === inEir)){
          return json(409, { ok:false, error:"This eircode is already registered" });
        }

        const nowIso = new Date().toISOString();
        const newUser = {
          name: safeText(incoming.name, 120),
          email: inEmail,
          eircode: inEir,
          address: safeText(incoming.address, 200),
          phone: safeText(incoming.phone, 40),

          // roles/flags (never allow self to set admin/owner)
          residentType: safeText(incoming.residentType || incoming.type, 20),
          type: safeText(incoming.type || incoming.residentType, 20),

          managementCompany: safeText(incoming.managementCompany || incoming.management, 80),

          coordinator: !!incoming.coordinator,
          isCoordinator: !!incoming.isCoordinator || !!incoming.coordinator,

          volunteer: !!incoming.volunteer,
          isVolunteer: !!incoming.isVolunteer || !!incoming.volunteer,
          vol_roles: incoming.vol_roles && typeof incoming.vol_roles === "object" ? incoming.vol_roles : {},

          termsAccepted: true,
          termsAcceptedAt: incoming.termsAcceptedAt ? String(incoming.termsAcceptedAt) : nowIso,
          alertsConsent: incoming.alertsConsent && typeof incoming.alertsConsent === "object" ? incoming.alertsConsent : { optIn:false, updatedAt: nowIso, history: [ { at: nowIso, optIn:false, source:"register" } ] },

          status: "pending",
          createdAt: nowIso,
          regDate: nowIso
        };

        users.push(newUser);
        await store.set("anw_users", users, { type:"json" });
        return json(200, { ok:true, value:{ me:newUser } });
      }

      // Admin full write
      if(!isAdmin) return json(403, { ok:false, error:"Forbidden" });

      const value = body.value;
      await store.set(key, value, { type:"json" });
      return json(200, { ok:true });
    }

    return json(405, { ok:false, error:"Method not allowed" });

  }catch(e){
    return json(500, { ok:false, error: (e && e.message) ? e.message : String(e) });
  }
};
