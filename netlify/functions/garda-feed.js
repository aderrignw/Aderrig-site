/**
 * netlify/functions/garda-feed.js
 * Fast Garda & Safety feed for dashboard.
 * Tries to discover official Garda categories from the Garda sitemap,
 * removes broken/not-found links, and falls back to trusted official pages.
 */

const HOMEPAGE_URL = "https://www.garda.ie/en/";
const SITEMAP_URLS = [
  "https://www.garda.ie/sitemap.aspx",
  "https://www.garda.ie/en/sitemap.aspx"
];

const FALLBACK_CATEGORIES = [
  { label: "Fraud / Economic Crime", title: "Fraud", category: "Fraud / Economic Crime", url: "https://www.garda.ie/en/crime/fraud/", snippet: "Official Garda guidance on fraud, scams and economic crime." },
  { label: "Cyber Crime", title: "Cyber Crime", category: "Cyber Crime", url: "https://www.garda.ie/en/crime/cyber-crime/", snippet: "Official Garda guidance on staying safe online and reporting cyber incidents." },
  { label: "Burglary & Theft", title: "Burglary & Theft", category: "Burglary & Theft", url: "https://www.garda.ie/en/crime/burglary-theft/", snippet: "Burglary and theft prevention advice and reporting guidance." },
  { label: "Community Policing", title: "Neighbourhood Watch", category: "Community Policing", url: "https://www.garda.ie/en/crime-prevention/community-engagement/neighbourhood-watch.html", snippet: "Neighbourhood Watch and community safety information for residents." },
  { label: "Traffic Matters", title: "Roads Policing", category: "Traffic Matters", url: "https://www.garda.ie/en/roads-policing/", snippet: "Road safety and roads policing resources from Garda." },
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
  if (url.startsWith('/')) return `https://www.garda.ie${url}`;
  return `https://www.garda.ie/${url.replace(/^\.\//, '')}`;
}

function slugify(text = "") {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function validGardaUrl(url = "") {
  const value = String(url || "").trim();
  return /^https:\/\/(www\.)?garda\.ie\//i.test(value) && !/(404|page-not-found|\/403\/\?404)/i.test(value);
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

function classifyCategory(title = "", url = "") {
  const joined = `${title} ${url}`.toLowerCase();
  if (/(fraud|scam|economic-crime)/.test(joined)) return "Fraud / Economic Crime";
  if (/(cyber|online|phishing)/.test(joined)) return "Cyber Crime";
  if (/(burglary|theft|robbery|securing-your-home)/.test(joined)) return "Burglary & Theft";
  if (/(drug)/.test(joined)) return "Drugs";
  if (/(domestic-abuse|coercive-control)/.test(joined)) return "Domestic Abuse";
  if (/(roads-policing|traffic|road-safety|dangerous-driving)/.test(joined)) return "Traffic Matters";
  if (/(community|neighbourhood-watch|community-alert|crime-prevention)/.test(joined)) return "Community Policing";
  if (/(contact-us|station-directory|contact-numbers)/.test(joined)) return "Useful Contacts";
  return "Other";
}

async function fetchWithTimeout(url, accept = "text/html", timeoutMs = 1800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "AderrigNW/1.0 (+Netlify Function)",
        accept
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseSitemap(html = "") {
  const text = String(html);
  const items = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = re.exec(text)) !== null) {
    const url = absoluteUrl(match[1]);
    const title = stripTags(match[2]);
    if (!validGardaUrl(url) || !title) continue;
    if (title.length < 4 || /^(home|back|top)$/i.test(title)) continue;
    const category = classifyCategory(title, url);
    if (category === "Other") continue;
    items.push({
      id: `cat-${slugify(title)}`,
      label: category,
      title,
      category,
      url,
      snippet: "Official Garda resource"
    });
  }
  return dedupeByUrl(items);
}

function classifyUpdate(title = "", snippet = "") {
  return classifyCategory(title, snippet);
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
      category: classifyUpdate(title),
      source: "garda.ie",
      type: "update"
    });
  }
  return dedupeByUrl(items).slice(0, 8);
}

async function fetchDynamicCategories() {
  const results = await Promise.allSettled(SITEMAP_URLS.map((url) => fetchWithTimeout(url, "text/html", 1800)));
  const categories = [];
  for (const result of results) {
    if (result.status === "fulfilled") categories.push(...parseSitemap(result.value));
  }
  return dedupeByUrl([...categories, ...FALLBACK_CATEGORIES.map((item) => ({ ...item }))]);
}

async function fetchHomepageUpdates() {
  const html = await fetchWithTimeout(HOMEPAGE_URL, "text/html", 1800);
  return parseHomepage(html);
}

export default async function handler() {
  const [categoriesResult, recentResult] = await Promise.allSettled([
    fetchDynamicCategories(),
    fetchHomepageUpdates()
  ]);

  const categories = categoriesResult.status === "fulfilled" && categoriesResult.value.length
    ? categoriesResult.value
    : FALLBACK_CATEGORIES;
  const recent = recentResult.status === "fulfilled" ? recentResult.value : [];

  return new Response(
    JSON.stringify({
      source: "garda.ie",
      homepage: HOMEPAGE_URL,
      updated: new Date().toISOString(),
      categories,
      recent,
      emergency: {
        urgent: "999/112",
        confidential: "1800 666 111",
        contactsUrl: "https://www.garda.ie/en/contact-us/useful-contact-numbers/"
      }
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=600"
      }
    }
  );
}
