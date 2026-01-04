export default async (req) => {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || "";
    if (!q.trim()) {
      return new Response(JSON.stringify({ error: "Missing q" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GOOGLE_MAPS_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    const endpoint =
      "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(q) +
      "&key=" +
      encodeURIComponent(key);

    const r = await fetch(endpoint);
    const data = await r.json();

    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Geocode HTTP " + r.status, details: data }), {
        status: 502,
        headers: { "content-type": "application/json" }
      });
    }

    if (data.status !== "OK" || !data.results || !data.results.length) {
      return new Response(JSON.stringify({ ok: false, status: data.status, results: data.results || [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const loc = data.results[0].geometry.location;
    return new Response(JSON.stringify({
      ok: true,
      lat: loc.lat,
      lng: loc.lng,
      formatted_address: data.results[0].formatted_address
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
};
