/**
 * netlify/functions/garda-feed.js
 * Garda & Safety feed for dashboard.
 *
 * What it does:
 * - Always returns stable official Garda resources/categories.
 * - Tries to fetch the latest official news / press-release cards from Garda.ie home page.
 * - Falls back safely if Garda.ie is slow or unavailable.
 */

const HOMEPAGE_URL = "https://www.garda.ie/en/";

const categories = [
  {
    id: "crime-prevention",
    label: "Crime Prevention",
    url: "https://www.garda.ie/en/crime-prevention/",
    snippet: "Official Garda crime-prevention hub with security advice, local officers and community programmes."
  },
  {
    id: "neighbourhood-watch",
    label: "Community Policing",
    url: "https://www.garda.ie/en/crime-prevention/community-engagement/neighbourhood-watch.html",
    snippet: "Official Garda information on Neighbourhood Watch and how communities can set up a local scheme."
  },
  {
    id: "community-alert",
    label: "Community Policing",
    url: "https://www.garda.ie/en/crime-prevention/community-engagement/community-alert.html",
    snippet: "Official Garda information on Community Alert and local community-safety partnership work."
  },
  {
    id: "fraud",
    label: "Fraud / Economic Crime",
    url: "https://www.garda.ie/en/crime/fraud/",
    snippet: "Advice on scams, fraud attempts and how to report economic crime."
  },
  {
    id: "cyber",
    label: "Cyber Crime",
    url: "https://www.garda.ie/en/crime/cyber-crime/",
    snippet: "Official Garda cyber-crime information and online safety guidance."
  },
  {
    id: "cyber-awareness",
    label: "Cyber Crime",
    url: "https://www.garda.ie/en/crime/cyber-crime/cyber-crime-awareness.html",
    snippet: "Campaigns and practical advice to help residents recognise phishing, hacking and online fraud."
  },
  {
    id: "burglary-theft",
    label: "Burglary & Theft",
    url: "https://www.garda.ie/en/crime/burglary-theft/",
    snippet: "Guidance related to burglary and theft, including prevention and reporting."
  },
  {
    id: "drugs",
    label: "Drugs",
    url: "https://www.garda.ie/en/crime/drugs/",
    snippet: "Official Garda information on drug-related crime and community safety."
  },
  {
    id: "domestic-abuse",
    label: "Domestic Abuse",
    url: "https://www.garda.ie/en/crime/domestic-abuse/domestic-abuse.html",
    snippet: "Support and reporting information for domestic abuse, including emergency contacts."
  },
  {
    id: "roads-policing",
    label: "Traffic Matters",
    url: "https://www.garda.ie/en/roads-policing/",
    snippet: "Roads Policing information and road-safety guidance from An Garda Síochána."
  },
  {
    id: "traffic-matters",
    label: "Traffic Matters",
    url: "https://www.garda.ie/en/crime/traffic-matters/",
    snippet: "Traffic offences, road-safety guidance, dangerous driving reporting information and FAQs."
  },
  {
    id: "community-policing",
    label: "Community Policing",
    url: "https://www.garda.ie/en/crime-prevention/community-policing/community-policing.html",
    snippet: "How Garda community policing works and how residents can engage locally."
  },
  {
    id: "community-engagement",
    label: "Community Policing",
    url: "https://www.garda.ie/en/crime-prevention/community-engagement/",
    snippet: "Community engagement resources including local community Garda links and programmes."
  },
  {
    id: "contacts",
    label: "Other",
    url: "https://www.garda.ie/en/contact-us/useful-contact-numbers/",
    snippet: "Emergency and useful Garda contact numbers. In an emergency, residents should call 999/112."
  },
  {
    id: "station-directory",
    label: "Other",
    url: "https://www.garda.ie/en/contact-us/station-directory/",
    snippet: "Find local Garda station details and contact information."
  }
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
  return `https://www.garda.ie/en/${url.replace(/^\.\//, '')}`;
}

function slugify(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function classifyUpdate(title = "", snippet = "") {
  const t = `${title} ${snippet}`.toLowerCase();
  if (/(traffic|road|collision|camera|roads policing|dangerous driving)/.test(t)) return "Traffic Matters";
  if (/(fraud|scam|cash|economic crime)/.test(t)) return "Fraud / Economic Crime";
  if (/(cyber|phishing|online)/.test(t)) return "Cyber Crime";
  if (/(burglary|theft|robbery)/.test(t)) return "Burglary & Theft";
  if (/(drug|cannabis|cocaine|operation tara)/.test(t)) return "Drugs";
  if (/(domestic abuse|coercive control)/.test(t)) return "Domestic Abuse";
  if (/(community|watch|alert|public safety|victim)/.test(t)) return "Community Policing";
  return "Other";
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

function parseHomepage(html = "") {
  const items = [];
  const text = String(html);

  const re = /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*<\/?h?\d*[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>(?:\s*<\/h\d>)?(?:\s*([^<\n][^\n]{0,220}))?/gis;
  let match;

  while ((match = re.exec(text)) !== null) {
    const date = stripTags(match[1]);
    const url = absoluteUrl(match[2]);
    const title = stripTags(match[3]);
    const snippet = stripTags(match[4] || "");

    if (!title || !url || !/^https:\/\/(www\.)?garda\.ie\//i.test(url)) continue;
    if (/view all/i.test(title)) continue;
    if (title.length < 8) continue;

    items.push({
      id: `update-${slugify(title)}`,
      title,
      url,
      date,
      snippet,
      category: classifyUpdate(title, snippet),
      source: "garda.ie",
      type: "update"
    });
  }

  return dedupeByUrl(items).slice(0, 12);
}

async function fetchHomepageUpdates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(HOMEPAGE_URL, {
      headers: {
        "user-agent": "AderrigNW/1.0 (+Netlify Function)",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`Garda homepage HTTP ${res.status}`);
    const html = await res.text();
    return parseHomepage(html);
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler() {
  try {
    let recent = [];

    try {
      recent = await fetchHomepageUpdates();
    } catch (err) {
      console.warn("garda-feed: homepage fetch failed", err?.message || err);
    }

    return new Response(
      JSON.stringify({
        source: "garda.ie",
        homepage: HOMEPAGE_URL,
        updated: new Date().toISOString(),
        recent,
        categories,
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
          "cache-control": "public, max-age=900"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "garda-feed failed",
        source: "garda.ie",
        updated: new Date().toISOString(),
        recent: [],
        categories
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" }
      }
    );
  }
}
