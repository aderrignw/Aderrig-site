/*
  Public Notices feed (Home banner)
  - No auth required
  - Returns notices explicitly marked for Home + Public
  - Bin notices are allowed through even when their display window has not started yet,
    so the Home page can show the upcoming collection as "Next collection".
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

function normalizeText(v) {
  return String(v || '').trim().toLowerCase();
}

function isBinNotice(n) {
  const cat = normalizeText(n?.category);
  const type = normalizeText(n?.meta?.type);
  const title = normalizeText(n?.title);
  return cat === 'bins' || type === 'bin_collection_import' || title.includes('bin collection');
}

function isNotStarted(n) {
  const startValue = n?.startsAt || n?.startsOn || n?.startDate || n?.showFrom || '';
  const st = startValue ? Date.parse(startValue) : NaN;
  return !Number.isNaN(st) && st > Date.now();
}

function isExpired(n) {
  const endValue = n?.expiresAt || n?.endsOn || n?.endDate || n?.expires || n?.showUntil || '';
  const exp = endValue ? Date.parse(endValue) : NaN;
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
      .filter(isPublicHome)
      .filter(n => !isExpired(n))
      .filter(n => isBinNotice(n) || !isNotStarted(n))
      .sort((a, b) => Date.parse(b?.createdAt || 0) - Date.parse(a?.createdAt || 0))
      .slice(0, 20)
      .map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        category: n.category,
        home: n.home,
        startsAt: n.startsAt || n.startsOn || n.startDate || null,
        expiresAt: n.expiresAt || n.endsOn || n.endDate || n.expires || null,
        date: n.date || null,
        bin: n.bin || null,
        provider: n.provider || null,
        meta: n.meta || null
      }));

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Unable to load public notices.' }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }
};
