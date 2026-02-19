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


export default async (req, context) => {
  if (!isPrivileged(context) && !isAuthorized(req)) {
    return new Response(JSON.stringify({ ok:false, error:"Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  try {
    const store = getCentralStore(context);
    const idx = (await store.get("anw_backups_index", { type: "json" })) ?? { items: [] };
    const items = Array.isArray(idx.items) ? idx.items : [];
    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control":"no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e), items: [] }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};
