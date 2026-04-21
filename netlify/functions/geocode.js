import { withSecurity, jsonResponse } from "./aderrig-security-layer.mjs";

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

export default withSecurity(
  {
    methods: ["GET"],
    maxBodyBytes: 128 * 1024,
  },
  async (_ctx, req) => {
    try {
      if (!allow(req)) {
        return jsonResponse({ error: "Rate limit" }, 429);
      }

      const url = new URL(req.url);
      const q = String(url.searchParams.get("q") || "").trim();
      if (!q) {
        return jsonResponse({ error: "Missing q" }, 400);
      }

      const key = String(
        process.env.GOOGLE_MAPS_SERVER_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_BROWSER_KEY ||
        ""
      ).trim();

      if (!key) {
        // Fallback (no Google key): use OpenStreetMap Nominatim to resolve the query.
        // This keeps local/tests working even before API keys are configured.
        const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
        const r = await fetch(osmUrl, {
          headers: {
            "accept": "application/json",
            "user-agent": "AderrigNW/1.0 (Netlify Function; contact: admin@aderrig.ie)"
          }
        });

        if (!r.ok) {
          return jsonResponse({ error: "Geocode fallback failed", status: r.status }, 502);
        }

        const data = await r.json();
        const first = Array.isArray(data) && data.length ? data[0] : null;
        if (!first) {
          return jsonResponse({ results: [] }, 200);
        }

        const lat = Number(first.lat);
        const lng = Number(first.lon);

        return jsonResponse({
          results: [{
            formatted_address: first.display_name,
            geometry: { location: { lat, lng } }
          }]
        }, 200);
      }

      const endpoint = "https://maps.googleapis.com/maps/api/geocode/json";
      const res = await fetch(
        `${endpoint}?address=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`,
        { headers: { "accept": "application/json" } }
      );
      const data = await res.json().catch(() => null);

      if (!data || data.status !== "OK" || !data.results?.length) {
        return jsonResponse(
          { error: "No results", status: data?.status || "UNKNOWN" },
          404
        );
      }

      const loc = data.results[0].geometry.location;
      return jsonResponse({
        lat: loc.lat,
        lng: loc.lng,
        formatted_address: data.results[0].formatted_address
      }, 200);
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }
);
