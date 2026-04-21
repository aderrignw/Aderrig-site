import backupScheduled from "./backup-scheduled.js";

export default async (req, context) => {
  return backupScheduled(req, context);
};
