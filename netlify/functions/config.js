export default async () => {
  // Expose ONLY the browser key (used by Maps JavaScript API in the frontend).
  // Never expose server keys or admin tokens here.
  const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY || "";

  return new Response(
    JSON.stringify({
      googleMapsApiKey: browserKey
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
};
