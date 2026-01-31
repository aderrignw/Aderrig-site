# Restore (Emergency)

This site stores data in Netlify Blobs via serverless functions. Deploying HTML/CSS/JS does **not** delete data.

If you ever need to restore data from a backup snapshot:

## Requirements
- Set the environment variable `ANW_ADMIN_TOKEN` in Netlify (Site settings -> Environment variables).
- Use the same token as you already use for backup functions.

## 1) List backups
GET: `/.netlify/functions/backup-list`

## 2) Dry-run restore plan (safe)
GET: `/.netlify/functions/restore?id=<BACKUP_ID>&dry=1`

## 3) Execute restore
GET: `/.netlify/functions/restore?id=<BACKUP_ID>`

## Notes
- Restore writes only the keys included in the snapshot.
- A restore event is recorded in `anw_restore_log`.
