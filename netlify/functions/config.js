// netlify/functions/config.js
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify({
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
    })
  };
};
