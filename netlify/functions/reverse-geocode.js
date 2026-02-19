const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
// Best-effort in-memory limiter (resets on cold starts)
const _hits = new Map();

function getClientIp(req){
  return req.headers.get("x-nf-client-connection-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function allow(req){
  const ip = getClientIp(req);
  const now = Date.now();
  const arr = _hits.get(ip) || [];
  const recent = arr.filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  _hits.set(ip, recent);
  return recent.length <= RATE_MAX;
}

function sameOriginOnly(req, context){
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser or same-origin without origin
  const allowed = new Set([
    context?.site?.url,
    context?.site?.site_url,
    context?.site?.name ? `https://${context.site.name}.netlify.app` : null,
  ].filter(Boolean));
  return allowed.has(origin);
}

export default async (req, context) => {
  try {
    if (!sameOriginOnly(req, context)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    if (!allow(req)) {
      return new Response(JSON.stringify({ error: "Rate limit" }), {
        status: 429,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(JSON.stringify({ error: "Missing/invalid lat,lng" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing Google Maps API key (set GOOGLE_MAPS_BROWSER_KEY or GOOGLE_MAPS_API_KEY)" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const endpoint = "https://maps.googleapis.com/maps/api/geocode/json";
    const res = await fetch(`${endpoint}?latlng=${encodeURIComponent(lat + ',' + lng)}&key=${encodeURIComponent(key)}`, {
      headers: { "accept": "application/json" }
    });
    const data = await res.json();

    if (!data || data.status !== "OK" || !data.results?.length) {
      return new Response(JSON.stringify({ error: "No results", status: data?.status || "UNKNOWN" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    return new Response(JSON.stringify({
      formatted_address: data.results[0].formatted_address
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control":"no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};
