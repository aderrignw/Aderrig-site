import { withSecurity, jsonResponse } from "./aderrig-security-layer.mjs";

export default withSecurity(
  {
    methods: ["GET"],
    maxBodyBytes: 64 * 1024,
  },
  async () => {
    // Expose ONLY a browser-safe key intended for frontend Maps usage.
    // Never fall back to server/admin keys here.
    const browserKey = String(process.env.GOOGLE_MAPS_BROWSER_KEY || "").trim();

    return jsonResponse(
      {
        googleMapsApiKey: browserKey,
      },
      200
    );
  }
);
