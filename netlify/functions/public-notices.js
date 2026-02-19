/*
  Public Notices feed (Home banner)
  - No auth required
  - Returns ONLY notices explicitly marked for Home + Public
  - Optional: respects ACL key "feature:home_notice_bar" for role "public"
*/

import { getStore } from '@netlify/blobs';

function getCentralStore(context){
  const fixed = (process?.env?.CENTRAL_STORE_NAME || '').trim();
  const storeName = fixed || (context?.site?.id ? `kv_${context.site.id}` : 'kv_default');
  return getStore(storeName);
}


const KEY_NOTICES = 'anw_notices';
const KEY_ACL = 'anw_acl';

function safeJsonParse(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}


function isNotStarted(n) {
  const st = n?.startsAt ? Date.parse(n.startsAt) : NaN;
  return !Number.isNaN(st) && st > Date.now();
}

function isStarted(n) {
  return !isNotStarted(n);
}
function isExpired(n) {
  const exp = n?.expiresAt ? Date.parse(n.expiresAt) : NaN;
  return !Number.isNaN(exp) && exp < Date.now();
}

function isPublicHome(n) {
  const home = n?.home || {};
  return !!home.enabled && String(home.visibility || '').toLowerCase() === 'public';
}

async function loadKey(store, key) {
  const raw = await store.get(key);
  if (!raw) return null;
  return safeJsonParse(raw, null);
}

function aclAllowsPublicHome(acl) {
  // If ACL missing or malformed, default to ALLOW to avoid breaking Home.
  if (!acl || typeof acl !== 'object') return true;
  const roles = acl['feature:home_notice_bar'];
  if (!Array.isArray(roles)) return true;
  return roles.map(String).map(r => r.toLowerCase()).includes('public');
}

export default async (req, context) => {
  try {
    const store = getCentralStore(context);
    const acl = await loadKey(store, KEY_ACL);

    if (!aclAllowsPublicHome(acl)) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    const all = (await loadKey(store, KEY_NOTICES)) || [];
    const list = Array.isArray(all) ? all : [];
    const items = list
      .filter(n => n && typeof n === 'object')
      .filter(n => !isExpired(n)).filter(isStarted)
      .filter(isPublicHome)
      .sort((a, b) => Date.parse(b?.createdAt || 0) - Date.parse(a?.createdAt || 0))
      .slice(0, 8)
      .map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        category: n.category,
        home: n.home
      }));

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unable to load public notices.' }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }
};
