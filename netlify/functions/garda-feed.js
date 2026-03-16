/**
 * netlify/functions/garda-feed.js
 * Stable Garda & Safety feed for dashboard.
 * Returns one official curated resource per category + recent official updates.
 * This avoids duplicated or incorrect category links from broad sitemap parsing.
 */

import { getStore } from "@netlify/blobs";

const HOMEPAGE_URL = "https://www.garda.ie/en/";
const CACHE_STORE = "anw-garda-cache";
const CACHE_KEY = "feed-v3";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

const CURATED_CATEGORIES = [
  { label: "Fraud / Economic Crime", title: "Fraud", category: "Fraud / Economic Crime", url: "https://www.garda.ie/en/crime/fraud/", snippet: "Official Garda guidance on fraud, scams and economic crime." },
  { label: "Cyber Crime", title: "Cyber Crime", category: "Cyber Crime", url: "https://www.garda.ie/en/crime/cyber-crime/", snippet: "Official Garda guidance on staying safe online and reporting cyber incidents." },
  { label: "Burglary & Theft", title: "Securing your home", category: "Burglary & Theft", url: "https://www.garda.ie/en/crime-prevention/securing-your-home/", snippet: "Official Garda guidance on securing your home and preventing burglary." },
  { label: "Drugs", title: "Drugs", category: "Drugs", url: "https://www.garda.ie/en/crime/drugs/", snippet: "Official Garda guidance on drugs and related crime prevention." },
  { label: "Domestic Abuse", title: "Domestic abuse", category: "Domestic Abuse", url: "https://www.garda.ie/en/crime/domestic-abuse/domestic-abuse.html", snippet: "Official Garda support and reporting information for domestic abuse." },
  { label: "Traffic Matters", title: "Road safety", category: "Traffic Matters", url: "https://www.garda.ie/en/roads-policing/road-safety/", snippet: "Road safety and roads policing resources from Garda." },
  { label: "Community Policing", title: "Neighbourhood Watch", category: "Community Policing", url: "https://www.garda.ie/en/crime-prevention/community-engagement/neighbourhood-watch.html", snippet: "Neighbourhood Watch and community safety information for residents." },
  { label: "Useful Contacts", title: "Useful contact numbers", category: "Useful Contacts", url: "https://www.garda.ie/en/contact-us/useful-contact-numbers/", snippet: "Emergency and useful Garda contact numbers." }
];

function decodeHtml(text = "") {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(text = "") {
  return decodeHtml(String(text).replace(/<[^>]*>/g, " "));
}

function absoluteUrl(url = "") {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `https://www.garda.ie${url}`;
  return `https://www.garda.ie/${url.replace(/^\.\//, "")}`;
}

function slugify(text = "") {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function validGardaUrl(url = "") {
  const value = String(url || "").trim();
  return /^https:\/\/(www\.)?garda\.ie\//i.test(value) && !/(404|page-not-found|\/403\/\?404)/i.test(value);
}

function looksBrokenText(text = "") {
  const value = String(text || "").toLowerCase();
  return value.includes("page not found") || value.includes(" 404") || value.startsWith("404");
}

function dedupeByUrl(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.url || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyCategory(title = "", url = "", snippet = "") {
  const joined = `${title} ${url} ${snippet}`.toLowerCase();
  if (/(fraud|scam|economic-crime)/.test(joined)) return "Fraud / Economic Crime";
  if (/(cyber|online|phishing)/.test(joined)) return "Cyber Crime";
  if (/(burglary|theft|robbery|securing-your-home)/.test(joined)) return "Burglary & Theft";
  if (/(drug)/.test(joined)) return "Drugs";
  if (/(domestic-abuse|coercive-control)/.test(joined)) return "Domestic Abuse";
  if (/(roads-policing|traffic|road-safety|dangerous-driving)/.test(joined)) return "Traffic Matters";
  if (/(community|neighbourhood-watch|community-alert|crime-prevention)/.test(joined)) return "Community Policing";
  if (/(contact-us|station-directory|contact-numbers|useful contact)/.test(joined)) return "Useful Contacts";
  return "Other";
}

async function fetchText(url, timeoutMs = 1800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "AderrigNW/1.0 (+Netlify Function)",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function urlExists(url, timeoutMs = 1200) {
  if (!validGardaUrl(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "AderrigNW/1.0 (+Netlify Function)",
        "accept": "text/html,application/xhtml+xml"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!res.ok) return false;
    const finalUrl = res.url || url;
    if (!validGardaUrl(finalUrl)) return false;
    const body = await res.text();
    if (looksBrokenText(body)) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function parseHomepage(html = "") {
  const items = [];
  const text = String(html);
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = re.exec(text)) !== null) {
    const url = absoluteUrl(match[1]);
    const title = stripTags(match[2]);
    if (!validGardaUrl(url) || !title || title.length < 12) continue;
    if (!/(crime|garda|appeal|warning|fraud|cyber|traffic|road|community|watch|alert|safety)/i.test(title)) continue;
    items.push({
      id: `update-${slugify(title)}`,
      title,
      url,
      date: "Latest update",
      snippet: "Official Garda update",
      category: classifyCategory(title, url, "Official Garda update"),
      source: "garda.ie",
      type: "update"
    });
  }
  return dedupeByUrl(items).slice(0, 8);
}

async function validateItems(items = [], limit = 12) {
  const input = dedupeByUrl(items).filter((item) => validGardaUrl(item.url));
  const toCheck = input.slice(0, limit);
  const rest = input.slice(limit);
  const checks = await Promise.allSettled(toCheck.map((item) => urlExists(item.url).then((ok) => ok ? item : null)));
  const valid = checks
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
  return [...valid, ...rest];
}

async function fetchHomepageUpdates() {
  try {
    const html = await fetchText(HOMEPAGE_URL, 1800);
    return await validateItems(parseHomepage(html), 8);
  } catch {
    return [];
  }
}

function buildPayload({ categories, recent, stale = false }) {
  return {
    source: "garda.ie",
    homepage: HOMEPAGE_URL,
    updated: new Date().toISOString(),
    stale,
    categories: dedupeByUrl(categories),
    recent: dedupeByUrl(recent),
    emergency: {
      urgent: "999/112",
      confidential: "1800 666 111",
      contactsUrl: "https://www.garda.ie/en/contact-us/useful-contact-numbers/"
    }
  };
}

async function getCacheStore() {
  try {
    return getStore(CACHE_STORE);
  } catch {
    return null;
  }
}

async function readCache() {
  const store = await getCacheStore();
  if (!store) return null;
  try {
    return await store.get(CACHE_KEY, { type: "json" });
  } catch {
    return null;
  }
}

async function writeCache(payload) {
  const store = await getCacheStore();
  if (!store) return;
  try {
    await store.setJSON(CACHE_KEY, { cachedAt: Date.now(), payload });
  } catch {}
}

async function buildFreshPayload() {
  const [categories, recent] = await Promise.all([
    validateItems(CURATED_CATEGORIES.map((item) => ({ ...item, date: "Official link" })), 8),
    fetchHomepageUpdates()
  ]);
  return buildPayload({ categories: categories.length ? categories : CURATED_CATEGORIES, recent, stale: false });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      ...extraHeaders
    }
  });
}

export default async function handler() {
  const cached = await readCache();
  const now = Date.now();

  if (cached?.payload && cached?.cachedAt && (now - cached.cachedAt) < CACHE_TTL_MS) {
    return jsonResponse(cached.payload, 200, { "x-garda-cache": "HIT" });
  }

  try {
    const payload = await Promise.race([
      buildFreshPayload(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("refresh-timeout")), 4200))
    ]);
    await writeCache(payload);
    return jsonResponse(payload, 200, { "x-garda-cache": "MISS" });
  } catch {
    if (cached?.payload) {
      const stalePayload = { ...cached.payload, stale: true, updated: cached.payload.updated || new Date(cached.cachedAt).toISOString() };
      return jsonResponse(stalePayload, 200, { "x-garda-cache": "STALE" });
    }

    const fallbackPayload = buildPayload({
      categories: CURATED_CATEGORIES.map((item) => ({ ...item, date: "Official link" })),
      recent: [],
      stale: true
    });
    return jsonResponse(fallbackPayload, 200, { "x-garda-cache": "FALLBACK" });
  }
}
