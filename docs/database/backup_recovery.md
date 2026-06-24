# Database Backup & Recovery

## Overview

CourtZon uses **daily full database backups** with configurable retention. Backups are taken via `mysqldump` with `--single-transaction` to avoid locking production tables. The backup user `courtzon_backup` has minimal required privileges.

---

## Backup Strategy

| Aspect              | Detail                                                     |
| ------------------- | ---------------------------------------------------------- |
| **Frequency**       | Daily full backup (via cron at 01:00)                      |
| **Tool**            | `mysqldump --single-transaction --routines --triggers --events` |
| **Compression**     | gzip (default on)                                          |
| **Retention**       | 30 days local (configurable via `BACKUP_RETENTION_DAYS`)   |
| **Backup user**     | `courtzon_backup`                                          |
| **Output**          | `backups/` directory, timestamped filenames                |
| **Remote**          | S3/R2 upload supported (commented out, configurable)       |
| **Verification**    | File existence + non-zero size check after each backup     |

### Retention

Old backups are automatically removed after `BACKUP_RETENTION_DAYS` (default: 30). Set to `0` to disable auto-rotation. For longer archival, enable S3 upload.

### Required MySQL Privileges

The `courtzon_backup` user needs:

```sql
GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, PROCESS, REPLICATION CLIENT
  ON couritzon_v2.* TO 'courtzon_backup'@'localhost';
FLUSH PRIVILEGES;
```

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

### Safety

The restore script **always**:
1. Prompts for confirmation (type `RESTORE` in all caps)
2. Creates a pre-restore backup of the current database before overwriting
3. Validates the backup file before proceeding

### Manual restore

```bash
# Restore with confirmation prompt
./scripts/restore.sh --file backups/courtzon_courtzon_v2_20260624_010000.sql.gz

# Restore to a different database
./scripts/restore.sh --file backups/courtzon_courtzon_v2_20260624_010000.sql.gz --db couritzon_v2_restore
```

Supports both `.sql` and `.sql.gz` files. The script auto-detects compression.

### Post-restore verification

```bash
# Quick row count sanity check
mysql -e "USE couritzon_v2; SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM bookings;"

# Check recent data
mysql -e "USE couritzon_v2; SELECT MAX(created_at) FROM users;"
```

### Pre-restore backup location

The automatic pre-restore backup is saved to `backups/pre_restore_<db>_<timestamp>.sql.gz`. Use it to revert if the restore produced unexpected results:

```bash
./scripts/restore.sh --file backups/pre_restore_courtzon_v2_20260624_010500.sql.gz
```

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

# 3. Restore
./scripts/restore.sh --file "$LATEST"

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
# Download from S3
aws s3 cp s3://courtzon-backups/database/courtzon_courtzon_v2_20260624_010000.sql.gz ./backups/

# Restore
./scripts/restore.sh --file backups/courtzon_courtzon_v2_20260624_010000.sql.gz
```

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
     DB_USER=root DB_PASSWORD=test \
     DB_NAME=courtzon_v2_staging \
     ./scripts/restore.sh --file backups/courtzon_courtzon_v2_latest.sql.gz
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
| `DB_HOST`                 | `localhost`      | MySQL host                             |
| `DB_PORT`                 | `3306`           | MySQL port                             |
| `DB_NAME`                 | `courtzon_v2`    | Database name                          |
| `DB_BACKUP_USER`          | `courtzon_backup`| Backup MySQL user                      |
| `DB_BACKUP_PASSWORD`      | *(empty)*        | Backup MySQL password                  |
| `BACKUP_RETENTION_DAYS`   | `30`             | Local backup retention in days         |
| `BACKUP_S3_ENABLED`       | `false`          | Enable S3 upload (requires aws-cli)    |
| `BACKUP_S3_BUCKET`        | `courtzon-backups`| S3 bucket name                        |
| `BACKUP_S3_ENDPOINT`      | *(empty)*        | S3-compatible endpoint (e.g., R2)      |
| `BACKUP_S3_ACCESS_KEY`    | *(empty)*        | S3 access key                          |
| `BACKUP_S3_SECRET_KEY`    | *(empty)*        | S3 secret key                          |
| `BACKUP_S3_REGION`        | `auto`           | S3 region                              |
| `BACKUP_S3_PATH_PREFIX`   | `database/`      | Prefix for S3 keys                     |

---

## Files

| File                      | Purpose                           |
| ------------------------- | --------------------------------- |
| `scripts/backup.sh`       | Manual / cron database backup     |
| `scripts/backup-cron.sh`  | Production cron wrapper (Hostinger)|
| `scripts/restore.sh`      | Database restore with safety       |
| `backups/`                | Local backup storage directory     |
| `backups/backup.log`      | Backup operation logs              |
| `backups/restore.log`     | Restore operation logs             |
