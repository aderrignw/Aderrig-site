import { getStore } from "@netlify/blobs";

/**
 * Scheduled backup: snapshots incidents data from Blobs into another key.
 * Runs every 6 hours (see netlify.toml).
 */
export default async () => {
  try {
    const store = getStore({ name: "aderrig-nw", consistency: "strong" });

    const incidentsRaw = await store.get("anw_incidents");
    const incidents = incidentsRaw ? JSON.parse(incidentsRaw) : [];

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupKey = `backup_incidents_${ts}`;

    await store.set(backupKey, JSON.stringify({ ts, count: incidents.length, incidents }));

    return new Response(JSON.stringify({ ok: true, backupKey, count: incidents.length }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
