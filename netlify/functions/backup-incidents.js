// netlify/functions/backup-incidents.js
// Backwards-compat wrapper. Prefer using backup-scheduled (full snapshot).
import backupScheduled from "./backup-scheduled.js";

export default async (req, context) => {
  return backupScheduled(req, context);
};
