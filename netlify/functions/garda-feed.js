/**
 * netlify/functions/garda-feed.js
 * Dynamic Garda & Safety feed for dashboard.
 *
 * Behaviour:
 * - Discovers categories and pages from the official Garda sitemap.
 * - Falls back to a minimal set of official links if Garda.ie is slow.
 * - Filters obvious 404 / page-not-found links.
 * - Keeps a short in-memory cache so the dashboard opens quickly.
 */

const SITEMAP_URL = 'https://www.garda.ie/sitemap.aspx';
const HOMEPAGE_URL = 'https://www.garda.ie/';
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_ITEMS = 36;
const PER_CATEGORY_LIMIT = 6;
const ROOT_CATEGORY_LABELS = {
  'crime-prevention': 'Crime Prevention',
  'community-garda': 'Community Garda',
  'roads-policing': 'Roads Policing',
  'crime': 'Crime',
  'contact-us': 'Contact Us',
  'victim-services': 'Victim Services',
  'information-centre': 'Information Centre',
  'campaigns': 'Campaigns'
};
const ALLOWED_ROOTS = new Set(Object.keys(ROOT_CATEGORY_LABELS));

const FALLBACK_ITEMS = [
  {
    id: 'crime-prevention',
    category: 'Crime Prevention',
    title: 'Crime Prevention',
    url: 'https://www.garda.ie/en/crime-prevention/',
    snippet: 'Official Garda crime prevention guidance and local safety resources.',
    date: 'Official link'
  },
  {
    id: 'community-garda-toolkit',
    category: 'Community Garda',
    title: 'Community Policing Toolkit',
    url: 'https://www.garda.ie/en/community-garda/community-policing-toolkit/',
    snippet: 'Official Garda community engagement, watch schemes and local policing resources.',
    date: 'Official link'
  },
  {
    id: 'roads-policing',
    category: 'Roads Policing',
    title: 'Roads Policing',
    url: 'https://www.garda.ie/en/roads-policing/',
    snippet: 'Road safety information and official roads policing resources.',
    date: 'Official link'
  },
  {
    id: 'contact-numbers',
    category: 'Contact Us',
    title: 'Useful contact numbers',
    url: 'https://www.garda.ie/en/contact-us/useful-contact-numbers/',
    snippet: 'Emergency and useful Garda contact numbers.',
    date: 'Official link'
  }
];

const state = globalThis.__ANW_GARDA_FEED_STATE || (globalThis.__ANW_GARDA_FEED_STATE = {
  payload: null,
  expiresAt: 0,
  pending: null
});

function decodeHtml(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(text = '') {
  return decodeHtml(String(text).replace(/<[^>]*>/g, ' '));
}

function absoluteUrl(url = '') {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `https://www.garda.ie${url}`;
  return `https://www.garda.ie/${url.replace(/^\.\//, '')}`;
}

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function titleCaseSlug(slug = '') {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

function isGardaUrl(url = '') {
  return /^https:\/\/(www\.)?garda\.ie\//i.test(String(url || ''));
}

function looksBadUrl(url = '') {
  const value = String(url || '').toLowerCase();
  return !value ||
    value.includes('/403/?404') ||
    value.includes('/404/') ||
    value.includes('page-not-found') ||
    value.includes('/search') ||
    value.includes('cookie-policy') ||
    value.includes('cookie-management') ||
    value.endsWith('.pdf') ||
    value.endsWith('.jpg') ||
    value.endsWith('.jpeg') ||
    value.endsWith('.png');
}

function looksBadTitle(title = '') {
  const value = String(title || '').trim().toLowerCase();
  if (!value) return true;
  return [
    'home', 'baile', 'skip to main content', 'cookie policy', 'cookie management',
    'accept all cookies', 'necessary cookies only', 'manage cookies', 'register',
    'view all', 'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ].includes(value) || /^20\d{2}$/.test(value);
}

function deriveCategory(url = '') {
  try {
    const path = new URL(url).pathname.replace(/^\/en\//, '').replace(/^\/+|\/+$/g, '');
    const [root] = path.split('/');
    if (!root || !ALLOWED_ROOTS.has(root)) return '';
    return ROOT_CATEGORY_LABELS[root] || titleCaseSlug(root);
  } catch {
    return '';
  }
}

function dedupeByUrl(items = []) {
  const seen = new Set();
  return items.filter(item => {
    const key = String(item?.url || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'AderrigNW/1.0 (+Netlify Function)',
        'accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseAnchorLinks(html = '') {
  const results = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = re.exec(String(html))) !== null) {
    const url = absoluteUrl(match[1]);
    const title = stripTags(match[2]);
    if (!isGardaUrl(url) || looksBadUrl(url) || looksBadTitle(title)) continue;
    const category = deriveCategory(url);
    if (!category) continue;

    let snippet = '';
    if (category === 'Crime Prevention') snippet = 'Official Garda prevention and community safety guidance.';
    else if (category === 'Community Garda') snippet = 'Official community policing, watch schemes and local engagement resources.';
    else if (category === 'Roads Policing') snippet = 'Official roads policing and road safety guidance.';
    else if (category === 'Contact Us') snippet = 'Official Garda contacts and station information.';
    else if (category === 'Crime') snippet = 'Official Garda crime information and reporting guidance.';
    else if (category === 'Victim Services') snippet = 'Official Garda support resources for victims and reporting.';
    else if (category === 'Information Centre') snippet = 'Official Garda information resources and frequently used guidance.';
    else if (category === 'Campaigns') snippet = 'Official Garda campaigns and awareness resources.';

    results.push({
      id: slugify(`${category}-${title}-${url}`),
      category,
      title,
      url,
      snippet,
      date: 'Official link'
    });
  }
  return dedupeByUrl(results);
}

function selectDynamicItems(items = []) {
  const grouped = new Map();
  for (const item of items) {
    const category = item.category || 'Other';
    if (!grouped.has(category)) grouped.set(category, []);
    const arr = grouped.get(category);
    if (arr.length >= PER_CATEGORY_LIMIT) continue;
    arr.push(item);
  }

  const selected = [];
  for (const [category, arr] of grouped.entries()) {
    arr
      .sort((a, b) => {
        const depthA = new URL(a.url).pathname.split('/').filter(Boolean).length;
        const depthB = new URL(b.url).pathname.split('/').filter(Boolean).length;
        return depthA - depthB || a.title.localeCompare(b.title);
      })
      .forEach(item => selected.push(item));
  }

  return selected.slice(0, MAX_ITEMS);
}

function buildCategories(items = []) {
  const grouped = new Map();
  for (const item of items) {
    const category = item.category || 'Other';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, entries]) => ({
      id: slugify(category),
      label: category,
      category,
      title: category,
      url: entries[0]?.url || HOMEPAGE_URL,
      snippet: `${entries.length} working official Garda link${entries.length === 1 ? '' : 's'} found.`,
      count: entries.length
    }));
}

async function fetchDynamicItems() {
  const html = await fetchText(SITEMAP_URL, 2600);
  const parsed = parseAnchorLinks(html);
  const selected = selectDynamicItems(parsed);
  if (!selected.length) throw new Error('No Garda sitemap links discovered');
  return selected;
}

async function buildPayload() {
  try {
    const items = await fetchDynamicItems();
    return {
      source: 'garda.ie',
      sitemap: SITEMAP_URL,
      updated: new Date().toISOString(),
      dynamic: true,
      items,
      categories: buildCategories(items),
      emergency: {
        urgent: '999/112',
        confidential: '1800 666 111',
        contactsUrl: 'https://www.garda.ie/en/contact-us/useful-contact-numbers/'
      }
    };
  } catch (err) {
    console.warn('garda-feed dynamic discovery failed', err?.message || err);
    return {
      source: 'garda.ie',
      sitemap: SITEMAP_URL,
      updated: new Date().toISOString(),
      dynamic: false,
      items: FALLBACK_ITEMS,
      categories: buildCategories(FALLBACK_ITEMS),
      emergency: {
        urgent: '999/112',
        confidential: '1800 666 111',
        contactsUrl: 'https://www.garda.ie/en/contact-us/useful-contact-numbers/'
      }
    };
  }
}

export default async function handler() {
  const now = Date.now();
  if (state.payload && state.expiresAt > now) {
    return new Response(JSON.stringify(state.payload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300'
      }
    });
  }

  if (!state.pending) {
    state.pending = buildPayload()
      .then(payload => {
        state.payload = payload;
        state.expiresAt = Date.now() + CACHE_TTL_MS;
        return payload;
      })
      .finally(() => {
        state.pending = null;
      });
  }

  const payload = await state.pending;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
}
