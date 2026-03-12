/**
 * netlify/functions/garda-feed.js
 * Fast Garda & Safety feed for dashboard.
 * Returns a curated list of official Garda pages only.
 */

const HOMEPAGE_URL = "https://www.garda.ie/en/";

const categories = [
  {
    id: "fraud",
    label: "Fraud / Economic Crime",
    category: "Fraud / Economic Crime",
    title: "Fraud",
    url: "https://www.garda.ie/en/crime/fraud/",
    snippet: "Practical advice on avoiding scams, spotting fraud attempts, and reporting economic crime."
  },
  {
    id: "cyber",
    label: "Cyber Crime",
    category: "Cyber Crime",
    title: "Cyber Crime",
    url: "https://www.garda.ie/en/crime/cyber-crime/",
    snippet: "Guidance on staying safe online, common cyber threats, and how to report incidents."
  },
  {
    id: "cyber-awareness",
    label: "Cyber Crime",
    category: "Cyber Crime",
    title: "Cyber Crime Awareness",
    url: "https://www.garda.ie/en/crime/cyber-crime/cyber-crime-awareness.html",
    snippet: "Tips and campaigns to help residents recognise phishing, hacking and online fraud."
  },
  {
    id: "burglary-theft",
    label: "Burglary & Theft",
    category: "Burglary & Theft",
    title: "Burglary & Theft",
    url: "https://www.garda.ie/en/crime/burglary-theft/",
    snippet: "Information and guidance related to burglary and theft, including prevention and reporting."
  },
  {
    id: "drugs",
    label: "Drugs",
    category: "Drugs",
    title: "Drugs",
    url: "https://www.garda.ie/en/crime/drugs/",
    snippet: "Official Garda information on drug-related crime and community safety."
  },
  {
    id: "domestic-abuse",
    label: "Domestic Abuse",
    category: "Domestic Abuse",
    title: "Domestic Abuse",
    url: "https://www.garda.ie/en/crime/domestic-abuse/domestic-abuse.html",
    snippet: "Support and reporting information for domestic abuse, including emergency contacts."
  },
  {
    id: "roads-policing",
    label: "Traffic Matters",
    category: "Traffic Matters",
    title: "Roads Policing",
    url: "https://www.garda.ie/en/roads-policing/",
    snippet: "Road safety information and roads policing resources from An Garda Síochána."
  },
  {
    id: "traffic-matters",
    label: "Traffic Matters",
    category: "Traffic Matters",
    title: "Traffic Matters",
    url: "https://www.garda.ie/en/crime/traffic-matters/",
    snippet: "Traffic offences, dangerous driving guidance and reporting information."
  },
  {
    id: "community-policing",
    label: "Community Policing",
    category: "Community Policing",
    title: "Community Policing",
    url: "https://www.garda.ie/en/crime-prevention/community-policing/community-policing.html",
    snippet: "How Garda community policing works and how residents can engage locally."
  },
  {
    id: "neighbourhood-watch",
    label: "Community Policing",
    category: "Community Policing",
    title: "Neighbourhood Watch",
    url: "https://www.garda.ie/en/crime-prevention/community-engagement/neighbourhood-watch.html",
    snippet: "Official Garda information on Neighbourhood Watch and how communities can set up a local scheme."
  },
  {
    id: "community-alert",
    label: "Community Policing",
    category: "Community Policing",
    title: "Community Alert",
    url: "https://www.garda.ie/en/crime-prevention/community-engagement/community-alert.html",
    snippet: "Official Garda information on Community Alert and local community-safety partnership work."
  },
  {
    id: "contacts",
    label: "Other",
    category: "Other",
    title: "Useful contact numbers",
    url: "https://www.garda.ie/en/contact-us/useful-contact-numbers/",
    snippet: "Emergency and useful Garda contact numbers. In an emergency, residents should call 999/112."
  },
  {
    id: "station-directory",
    label: "Other",
    category: "Other",
    title: "Station directory",
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
    if (/view all/i.test(title) || title.length < 8) continue;

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

  return dedupeByUrl(items).slice(0, 6);
}

async function fetchHomepageUpdates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);

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
  let recent = [];

  try {
    recent = await fetchHomepageUpdates();
  } catch (err) {
    console.warn("garda-feed: homepage fetch skipped", err?.message || err);
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
}
