export default async () => {
  return new Response(
    JSON.stringify({
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};
