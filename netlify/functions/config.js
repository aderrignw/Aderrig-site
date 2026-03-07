export default async () => {
  // Expose ONLY a browser-safe key (used by Maps JavaScript API in the frontend).
  // Never expose admin tokens here.
  // Accept common env var names to avoid mismatches between local/prod.
  const browserKey =
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    "";

  return new Response(
    JSON.stringify({
      googleMapsApiKey: browserKey,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
};
