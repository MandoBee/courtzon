# Database Backup & Recovery

## Overview

CourtZon's backup implementation supports **scheduled, encrypted full database backups** with configurable retention. Backups are taken via `mysqldump --single-transaction` to avoid locking production tables, then streamed through gzip and AES-256-GCM into `.sql.gz.enc2` artifacts with a SHA-256 sidecar.

> **This describes the architecture, not verified operational status.** Production backups become possible only after `BACKUP_ENCRYPTION_KEY` and a dedicated `DB_BACKUP_USER`/`DB_BACKUP_PASSWORD` pair are provisioned and the backup directory is writable by the container's runtime user. At the time of the last audit those credentials were **not** provisioned on the production host, and no recent backup artifact existed. Backup code or a configured schedule does not prove that backups are currently succeeding — verify with a dated local artifact (see *Monitoring Backup Success/Failure*).

---

## Backup Strategy

The primary backup path is the **in-process backup job** (`backend/src/infrastructure/backup/backup.service.ts`), registered as the BullMQ `database_backup` handler and scheduled daily at **00:00** (`0 0 * * *`) by `backend/src/server.ts`. The shell scripts under `scripts/` remain available for manual runs.

| Aspect              | Detail                                                     |
| ------------------- | ---------------------------------------------------------- |
| **Frequency**       | Daily full backup (`database_backup` worker, `0 0 * * *`)  |
| **Tool**            | `mysqldump --single-transaction --routines --triggers --events` |
| **Compression**     | gzip, streamed (never buffered in memory)                   |
| **Encryption**      | AES-256-GCM (`CZBAK2` format), extension `.sql.gz.enc2`     |
| **Integrity file**  | `<backup>.sha256` sidecar (`sha256sum -c` compatible)       |
| **Retention**       | Newest `BACKUP_RETENTION_COUNT` (30) kept; optional `BACKUP_RETENTION_DAYS` age rule |
| **Backup user**     | `DB_BACKUP_USER` + `DB_BACKUP_PASSWORD`; required in production, no fallback |
| **Output**          | `BACKUP_DIR` — `/app/backups` in Docker                     |
| **Remote**          | Optional S3/R2 upload (`S3_*`); off unless configured       |
| **Verification**    | Streaming size limit, GCM tag write, SHA-256 sidecar; no restore is performed |

### Retention

The job keeps the newest backup unconditionally and prunes older **GCM** artifacts (`.sql.gz.enc2` and their sidecars) once `BACKUP_RETENTION_COUNT` (default `30`) is exceeded. `BACKUP_RETENTION_DAYS` (default `0`) additionally spares anything younger than that many days; `0` disables the age rule. Legacy plaintext/CBC files are never pruned by this job.

### Storage location and permissions

| Item | Value |
| ---- | ----- |
| Backup directory | `/app/backups` (`BACKUP_DIR`) |
| Directory ownership | `appuser:appgroup` |
| Directory permissions | `750` |
| Backup file and sidecar permissions | `600` (created by the job; never widened) |
| Volume | `backend_backups` (named Docker volume) |

The backend entrypoint runs as root **before dropping privileges** and initializes the backup volume:

1. creates `/app/backups` if it is missing;
2. sets ownership to `appuser:appgroup` and directory mode `750`;
3. leaves existing contents untouched — **no recursive `chown`/`chmod`**, so previously written `600` artifacts keep their owner and mode;
4. then switches to `appuser` via `su-exec`.

This step is **fail-closed**: if directory creation, `chown`, or `chmod` fails, the entrypoint writes an error to stderr and exits non-zero, so the container does **not** start with an unusable backup directory.

### Encryption key handling

`BACKUP_ENCRYPTION_KEY` must be exactly 64 hex characters (32 bytes) and is **required** — the job fails closed without it. **Escrow the key securely outside the production server.** Losing it makes every encrypted backup unrecoverable; the key is not stored in the backups and cannot be derived from them.

### Status

A backup job that writes a local artifact is **not** proof that the data can be restored. Restorability must be demonstrated by an actual restore drill (see *Testing Backups Regularly*). The following restore blockers remain unresolved and are documented in their own sections below: DEFINER metadata (fail-closed), TLS enforcement for the restore client, and event-scheduler behavior on the restore target.


### Required MySQL Privileges (illustrative)

A dedicated backup account needs enough visibility to dump tables, views, routines, triggers, and events. The statement below is an **illustrative** grant for the production schema `courtzon_v3`:

```sql
GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, PROCESS, REPLICATION CLIENT
  ON courtzon_v3.* TO 'courtzon_backup'@'%';
FLUSH PRIVILEGES;
```

> **Not applied.** No backup account existed in the audited production state. Provisioning the account and these grants requires explicit approval; this document does not claim they have been created. Restrict the host part to the deployment's actual client network where possible, and note that MySQL 8.0.20+ may additionally require the global `SHOW_ROUTINE` privilege (or `SELECT` on `mysql.proc` in older versions) for `mysqldump --routines` to succeed.

---

## Running Manual Backups

### Basic backup

```bash
./scripts/backup.sh
```

Output: `backups/courtzon_courtzon_v2_20260624_010000.sql.gz`

### Options

```bash
# Specify a different database
./scripts/backup.sh --db couritzon_v2_staging

# Custom output directory
./scripts/backup.sh --output /mnt/nfs/backups

# Disable compression
./scripts/backup.sh --no-compress

# Override retention (7 days)
./scripts/backup.sh --retention-days 7
```

### Logs

All backup operations are logged to `backups/backup.log`.

### Exit codes

| Code | Meaning  |
| ---- | -------- |
| `0`  | Success  |
| `1`  | Failure  |

---

## Restoring from Backup

### Entry points

There is **one** restore implementation: `backend/scripts/restore.js`.

| Entry point | Notes |
| --- | --- |
| `npm run db:restore -- …` (from `backend/`) | Runs the Node engine directly |
| `./scripts/restore.sh …` (repo root) | Compatibility wrapper; forwards all arguments to the Node engine and exits with its code |
| `node backend/scripts/restore.js …` | Direct invocation |

The shell wrapper contains no restore logic, does not default to
`courtzon_v3`, and never pipes backup data into `mysql` itself.

### Supported formats

| Format | Extension | Verification |
| --- | --- | --- |
| AES-256-GCM | `.sql.gz.enc2` | `CZBAK2` magic + 12-byte nonce + full GCM authentication before SQL |
| Legacy AES-256-CBC | `.sql.gz.enc` | IV + ciphertext; not authenticated (gzip CRC only) |
| Legacy plain gzip | `.sql.gz` | gzip CRC |
| Legacy plain SQL | `.sql` | No compression; no cryptographic integrity check |

### Required restore credentials

Restore requires an **explicit** `DB_USER` and `DB_PASSWORD`; there is no
implicit `root` fallback and the mysql client is never started without them.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DB_USER` | Yes | Restore account with schema-object DDL + DML privileges |
| `DB_PASSWORD` | Yes | Passed through `MYSQL_PWD`; never on the command line |
| `DB_HOST` / `DB_PORT` | No | Default `localhost` / `3306` |
| `BACKUP_ENCRYPTION_KEY` | For `.enc2`/`.enc` | Exactly 64 hex characters |

`backend/scripts/restore.js` reads `process.env` directly. It does **not**
source `.env`/`.env.local`; export the variables in the shell (or via your
process manager) before invoking the restore.

Use `courtzon_migration` or an equivalent account. Per
`backend/scripts/setup-db-users.sql` it has `SELECT, INSERT, UPDATE, DELETE,
CREATE, DROP, ALTER, INDEX, REFERENCES, LOCK TABLES` on `courtzon_v3.*`.
`courtzon_app` has only DML and `courtzon_backup` is read-only; neither can
restore a full dump that contains `DROP TABLE`/`CREATE TABLE`.

> **WARNING:** the restore account must be authorized to create/drop/alter the
> target schema objects. Verify the target database and take a current backup
> before restoring anything important.

### Safe target and destructive confirmation

The default target is **`courtzon_restore_test`**. Any other target requires
the exact destructive confirmation flag, whose value must equal `--db`:

```bash
# Safe default target
DB_USER=courtzon_migration DB_PASSWORD='…' \
  ./scripts/restore.sh --file backups/example.sql.gz.enc2

# Any other target (exact confirmation required)
DB_USER=courtzon_migration DB_PASSWORD='…' BACKUP_ENCRYPTION_KEY='…' \
  ./scripts/restore.sh --file backups/example.sql.gz.enc2 \
    --db courtzon_v3 --confirm-destructive=courtzon_v3
```

`DB_NAME` is **not** used to select the restore target; use `--db`. Examples
elsewhere in this document that omit `--db` now restore into the safe default
`courtzon_restore_test`; add `--db <name> --confirm-destructive=<name>` for any
other database.

### Manual restore

```bash
# From backend/ — encrypted backup into the designated test database
DB_USER=courtzon_migration DB_PASSWORD='…' \
  BACKUP_ENCRYPTION_KEY='<64 hex characters>' \
  npm run db:restore -- --file backups/courtzon_….sql.gz.enc2
```

Take a fresh backup before overwriting an important database. The Node restore
engine does **not** create an automatic pre-restore backup; run
`scripts/backup.sh` (or the scheduled backup) first.

### Dry-run (plan only)

`--dry-run` is a planning aid. It validates arguments, configuration, target
selection and file accessibility, but it does **not** decrypt or authenticate
the backup, does **not** verify the GCM tag or gzip CRC, does **not** prove that
the backup can be restored, and does **not** execute SQL.

```bash
DB_USER=courtzon_migration DB_PASSWORD='…' BACKUP_ENCRYPTION_KEY='…' \
  npm run db:restore -- --file backups/example.sql.gz.enc2 --dry-run
```

### Generated columns

Before rewriting any `roles` INSERT, the restore engine validates the dump's own
`CREATE TABLE \`roles\`` definition: it must declare exactly 11 columns, with
`org_id_normalized` last and declared `GENERATED`. A missing, malformed or
incompatible definition — or a tuple that does not have exactly 11 values —
fails before the mysql client starts.

### DEFINER metadata (fail closed)

The restore engine **rejects** backups that contain executable `DEFINER`
metadata in `CREATE TRIGGER`, `CREATE VIEW`, `CREATE PROCEDURE`,
`CREATE FUNCTION`, or `CREATE EVENT` statements. Detection runs only after
GCM authentication and gzip CRC verification, and before the `mysql` client is
started. It is SQL-aware: harmless occurrences inside string literals,
comments, column names and ordinary `INSERT` data are ignored, while executable
`DEFINER` clauses (including those inside MySQL version comments) abort the
restore.

- No `SUPER` or `SET_USER_ID` privilege is granted as a workaround, and this
  phase does not transform or strip `DEFINER` clauses.
- The repository baseline contains no `DEFINER` clauses, but production
  backups remain unverified until safely inspected; expect a rejection if the
  live schema contains triggers, views, routines or events with `DEFINER`
  metadata.
- A future parser-aware `DEFINER` transformation (for example, assigning the
  restore account) requires separate security review and tests.
- Do **not** manually remove `DEFINER` text with broad search/replace; that can
  corrupt SQL or change security semantics.
- `--dry-run` remains plan-only and does not inspect or verify `DEFINER`
  metadata.

### Post-restore verification

```bash
# Quick row count sanity check
mysql -e "USE couritzon_v2; SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM bookings;"

# Check recent data
mysql -e "USE couritzon_v2; SELECT MAX(created_at) FROM users;"
```

### Pre-restore safety backup

The Node restore engine does **not** create an automatic pre-restore backup.
Create one explicitly with `scripts/backup.sh` before restoring. Pre-restore
files produced by older shell restores (`backups/pre_restore_*.sql.gz`) remain
restorable through the same engine.

---

## Point-in-Time Recovery (PITR)

If binary logging (`log_bin`) is enabled on the MySQL server, you can recover to any point in time between backups.

### Prerequisites

```sql
-- Check if binary logs are enabled
SHOW VARIABLES LIKE 'log_bin';
-- List available binary logs
SHOW BINARY LOGS;
```

### Recovery steps

```bash
# 1. Restore the most recent full backup
./scripts/restore.sh --file backups/courtzon_courtzon_v2_20260624_010000.sql.gz

# 2. Apply binary logs from the backup time to the target time
mysqlbinlog --start-datetime="2026-06-24 01:00:00" \
            --stop-datetime="2026-06-24 14:30:00" \
            /var/lib/mysql/mysql-bin.000001 \
            /var/lib/mysql/mysql-bin.000002 \
  | mysql -u couritzon_backup -p couritzon_v2
```

### Finding the right binary log position

```bash
# Extract the GTID or position from the backup file header
head -n 50 couritzon_courtzon_v2_20260624_010000.sql | grep -i "GTID\|CHANGE MASTER\|POSITION"
```

---

## Disaster Recovery Procedure

### Scenario: Complete data loss

```bash
# 1. Ensure MySQL is running and the target database exists
mysql -e "CREATE DATABASE IF NOT EXISTS couritzon_v2"

# 2. Find the latest backup
LATEST=$(ls -t backups/courtzon_courtzon_v2_*.sql.gz | head -1)
echo "Restoring from: $LATEST"

# 3. Restore (explicit production target + destructive confirmation)
DB_USER=courtzon_migration DB_PASSWORD='…' \
  ./scripts/restore.sh --file "$LATEST" \
    --db couritzon_v2 --confirm-destructive=couritzon_v2

# 4. Apply any remaining binary logs (if available)
# See Point-in-Time Recovery section above

# 5. Verify application connectivity
curl -f http://localhost:3000/health
```

### Scenario: Corrupted backup

If the latest backup is corrupted, try the previous one:

```bash
ls -t backups/courtzon_courtzon_v2_*.sql.gz
# Pick the second-most-recent
./scripts/restore.sh --file backups/courtzon_courtzon_v2_20260623_010000.sql.gz
```

### Scenario: S3 remote backup needed

```bash
# Download the encrypted artifact and its checksum sidecar (key prefix: backups/)
aws s3 cp s3://<bucket>/backups/courtzon_2026-06-24T01-00-00-000Z_a1b2c3.sql.gz.enc2 ./backups/
aws s3 cp s3://<bucket>/backups/courtzon_2026-06-24T01-00-00-000Z_a1b2c3.sql.gz.enc2.sha256 ./backups/

# Verify the file against its sidecar before restoring
cd backups && sha256sum -c courtzon_2026-06-24T01-00-00-000Z_a1b2c3.sql.gz.enc2.sha256 && cd ..

# Restore (the engine authenticates GCM before executing any SQL)
DB_USER=courtzon_migration DB_PASSWORD='…' \
  ./scripts/restore.sh --file backups/courtzon_2026-06-24T01-00-00-000Z_a1b2c3.sql.gz.enc2
```

A matching sidecar proves file integrity only — it does not prove GCM authentication, gzip integrity, or a successful restore. The restore engine verifies GCM and gzip before it spawns MySQL.

---

## Testing Backups Regularly

Backups are only as good as their last successful restore test. Follow this schedule:

### Monthly restore drill

1. **Spin up a staging database** (or use a Docker MySQL container):

   ```bash
   docker run -d --name couritzon_staging \
     -e MYSQL_ROOT_PASSWORD=test \
     -e MYSQL_DATABASE=courtzon_v2_staging \
     -p 3308:3306 mysql:8
   ```

2. **Restore the latest backup** into staging:

   ```bash
   DB_HOST=localhost DB_PORT=3308 \
     DB_USER=courtzon_migration DB_PASSWORD='…' \
     ./scripts/restore.sh --file backups/courtzon_courtzon_v2_latest.sql.gz \
       --db couritzon_v2_staging --confirm-destructive=couritzon_v2_staging
   ```

3. **Run integrity checks**:

   ```bash
   # Check for expected tables
   DB_PORT=3308 mysql -u root -ptest couritzon_v2_staging -e "SHOW TABLES"

   # Validate row counts against known baselines
   DB_PORT=3308 mysql -u root -ptest couritzon_v2_staging -e "
     SELECT 'users' AS tbl, COUNT(*) FROM users
     UNION SELECT 'bookings', COUNT(*) FROM bookings
     UNION SELECT 'courts', COUNT(*) FROM courts"
   ```

4. **Clean up**:

   ```bash
   docker stop couritzon_staging && docker rm couritzon_staging
   ```

### Automated integrity check

The backup script already verifies file size. For deeper verification, extend the backup cron with:

```bash
# Test restore to a temporary database
mysql -e "CREATE DATABASE IF NOT EXISTS couritzon_v2_backup_test"
zcat backups/courtzon_courtzon_v2_20260624_010000.sql.gz \
  | mysql couritzon_v2_backup_test
mysql -e "DROP DATABASE couritzon_v2_backup_test"
```

---

## Monitoring Backup Success/Failure

### Logs

All backup results are written to `backups/backup.log`:

```
[2026-06-24 01:00:01] [INFO] Starting backup of database 'courtzon_v2' on localhost:3306
[2026-06-24 01:00:45] [INFO] Backup completed successfully: /opt/courtzon/backups/courtzon_courtzon_v2_20260624_010000.sql.gz (234.56 MB)
[2026-06-24 01:00:46] [INFO] Auto-rotation: removed 2 backup(s) older than 30 days
```

### Cron health check

The cron entry at `scripts/backup-cron.sh` runs daily at 01:00. To verify it's active:

```bash
crontab -l | grep backup
```

Configure email alerting on cron failure by adding `MAILTO` to the crontab:

```
MAILTO=admin@courtzon.com
0 1 * * * /opt/courtzon/scripts/backup-cron.sh
```

### Alerting (optional)

For production monitoring, check the backup age via a health endpoint or external monitoring (e.g., UptimeRobot, Grafana):

```bash
# Warn if the latest backup is older than 26 hours
LATEST=$(ls -t /opt/courtzon/backups/courtzon_courtzon_v2_*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ] || [ $(($(date +%s) - $(stat -c %Y "$LATEST"))) -gt 93600 ]; then
  echo "ALERT: No recent database backup found"
  exit 2
fi
```

### Prometheus / Grafana (optional)

If the `node_exporter` or a custom exporter is deployed, expose backup metrics:

- `courtzon_backup_success_timestamp_seconds` — last successful backup Unix timestamp
- `courtzon_backup_size_bytes` — last backup file size
- `courtzon_backup_age_seconds` — seconds since last backup

---

## Environment Variables

| Variable                  | Default          | Description                            |
| ------------------------- | ---------------- | -------------------------------------- |
| `DB_HOST`                 | `localhost`      | MySQL host (backup and restore)        |
| `DB_PORT`                 | `3306`           | MySQL port                             |
| `DB_NAME`                 | `courtzon_v3`    | Backup source database; **restore ignores it** (use `--db`) |
| `BACKUP_DIR`              | `cwd/backups` (`/app/backups` in Docker) | Directory for `.enc2` artifacts and sidecars |
| `DB_BACKUP_USER`          | production: **required**; non-production: `DB_USER`, then `courtzon_app` | Backup/dump user (read-only; **not** a restore credential). No default in production and no fallback to the application credentials |
| `DB_BACKUP_PASSWORD`      | *(empty)*        | Backup/dump password. Must be set together with `DB_BACKUP_USER` |
| `DB_USER`                 | *(required)*     | Restore account (no implicit `root`; use `courtzon_migration` or equivalent) |
| `DB_PASSWORD`             | *(required)*     | Restore password, passed via `MYSQL_PWD` only |
| `BACKUP_ENCRYPTION_KEY`   | *(empty)*        | **Required.** Exactly 64 hex characters; escrow it offline — losing it makes `.enc2` backups unrecoverable |
| `BACKUP_ENCRYPTION_FORMAT`| `gcm`            | Only `gcm` is supported; any other value fails closed |
| `BACKUP_RETENTION_COUNT`  | `30`             | Number of newest GCM backups kept (newest always preserved) |
| `BACKUP_RETENTION_DAYS`   | `0`              | Spare artifacts younger than D days; `0` disables the age rule |
| `BACKUP_MAX_BYTES`        | `68719476736` (64 GiB) | Streaming size ceiling |
| `S3_BUCKET`               | *(empty)*        | Offsite bucket. All four `S3_*` credentials/endpoint must be set together |
| `S3_ACCESS_KEY`           | *(empty)*        | S3 access key                          |
| `S3_SECRET_KEY`           | *(empty)*        | S3 secret key                          |
| `S3_ENDPOINT`             | *(empty)*        | S3-compatible endpoint (e.g. R2)       |
| `S3_REGION`               | `auto`           | S3 region                              |
| `S3_REQUIRED`             | *(off)*          | `"1"` = a skipped/failed upload fails the job; `"0"` = local-only success |

> Offsite upload is **optional** unless `S3_REQUIRED=1`. Without `S3_*` configuration the job writes a local artifact only. The upload key prefix is `backups/<filename>`.


---

## Files

| File                      | Purpose                           |
| ------------------------- | --------------------------------- |
| `scripts/backup.sh`       | Manual / cron database backup     |
| `scripts/backup-cron.sh`  | Production cron wrapper (Hostinger)|
| `scripts/restore.sh`      | Compatibility wrapper → `backend/scripts/restore.js` |
| `backend/scripts/restore.js` | The single restore engine (GCM, legacy CBC, plaintext) |
| `backups/`                | Local backup storage directory     |
| `backups/backup.log`      | Backup operation logs              |
| `backups/restore.log`     | Logs from older shell restore versions (no longer written by the Node engine) |
