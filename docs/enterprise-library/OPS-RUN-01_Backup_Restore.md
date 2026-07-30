---
document_id: "OPS-RUN-01"
document_name: "Backup and Restore"
family: "OPS-RUN"
document_type: "OPS"
status: "Draft"
version: "0.1"
audience: ["devops", "developer"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "DevOps Lead"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Engineering Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["OPS-DEPLOY-01"]
  related: ["OPS-RUN-02"]
---

# Backup and Restore (OPS-RUN-01)

## 1. Overview

CourtZon provides automated backup scripts for MySQL databases, upload file synchronization, and Redis persistence. Backups are designed for point-in-time recovery with a pre-restore safety backup.

## 2. MySQL Backup

### 2.1 Manual Backup Script

**Source:** `scripts/backup.sh` (220 lines)

**Usage:**
```bash
./scripts/backup.sh [--db <database>] [--output <dir>] [--compress|--no-compress] [--retention-days <n>]
```

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--db` | `courtzon_v3` | Database name |
| `--output` | `<project>/backups/` | Output directory |
| `--compress` | on | Enable gzip compression |
| `--no-compress` | off | Disable compression |
| `--retention-days` | 30 | Auto-rotate older backups (0 = never) |

**Backup user:** `courtzon_backup` with privileges:
- `SELECT`, `LOCK TABLES`, `SHOW VIEW`, `EVENT`, `TRIGGER`, `PROCESS`, `REPLICATION CLIENT`

**Dump options:**
- `--single-transaction` — Consistent read without table locks
- `--routines` — Include stored procedures
- `--triggers` — Include triggers
- `--events` — Include events

**Post-processing:**
- Strips auto-increment values from `roles` table (`sed` replacement)
- Verifies backup file exists and is non-empty
- Auto-rotates backups older than `RETENTION_DAYS`
- Optional S3/R2 upload (commented out by default)

**Output filename:** `courtzon_<dbname>_YYYYMMDD_HHMMSS.sql.gz`

### 2.2 Automated Cron Backup

**Source:** `scripts/backup-cron.sh` (63 lines)

**Crontab entry (daily at 1 AM):**
```cron
0 1 * * * /opt/courtzon/scripts/backup-cron.sh >> /var/log/courtzon-backup.log 2>&1
```

The cron script performs:
1. MySQL database dump (compressed)
2. Uploads sync to S3/R2 via `aws s3 sync`
3. Alternative uploads sync via `rclone` to Cloudflare R2
4. Cleanup of local backups older than 30 days

**Environment:** Loads from `/opt/courtzon/.env`

### 2.3 Docker Volume Backup

Backups are stored in the `backend_backups` Docker volume (mounted at `/app/backups`). To access backups from the host:

```bash
# Copy backup from container
docker cp courtzon-backend:/app/backups/courtzon_courtzon_v3_20250101_000000.sql.gz .

# Or mount a host directory instead:
# docker-compose.yml: volumes: - /host/backups:/app/backups
```

## 3. Restore Procedure

### 3.1 Restore Script

**Source:** `scripts/restore.sh` (231 lines)

**Usage:**
```bash
./scripts/restore.sh --file <backup-file> [--db <database>]
```

**Options:**
| Flag | Required | Description |
|------|----------|-------------|
| `--file` | Yes | Path to backup file (.sql or .sql.gz) |
| `--db` | No | Target database (default: from .env) |

**Safety features:**
1. **Pre-restore backup:** Always creates a backup of the current database before restoring
   - Filename: `pre_restore_<dbname>_YYYYMMDD_HHMMSS.sql.gz`
   - Stored in `<project>/backups/`
2. **Confirmation prompt:** Requires typing "RESTORE" (all caps) to proceed
3. **Integrity check:** Verifies the backup file can be read (peeks header)
4. **Error recovery:** If restore fails, the pre-restore backup path is printed

**Restore process:**
1. Validates `--file` exists and is readable
2. Checks `gzip`/`zcat` availability for compressed files
3. Creates pre-restore backup (aborts if this fails)
4. Prompts for confirmation
5. Restores via `mysql < backup.sql` or `zcat backup.gz | mysql`
6. On failure: prints pre-restore backup path for recovery

### 3.2 Step-by-Step Restore

```bash
# 1. SSH into the server
ssh user@hostinger-vps

# 2. Navigate to project
cd /opt/courtzon

# 3. Run restore
./scripts/restore.sh --file backups/courtzon_courtzon_v3_20250101_000000.sql.gz

# 4. Follow prompts:
#    - Enter "RESTORE" when prompted
#    - Wait for completion

# 5. Verify: Check the application works
curl -s http://localhost:3000/health
```

If restore fails:
```bash
# Restore the pre-restore backup
./scripts/restore.sh --file backups/pre_restore_courtzon_v3_20250101_010101.sql.gz
```

## 4. Upload Files Backup

### 4.1 Local Backups

Uploads directory: `/app/uploads` (bind-mounted to `./backend/uploads/`)

The cron script syncs uploads to S3/R2:
```bash
# AWS S3
aws s3 sync /opt/courtzon/backend/uploads/ s3://<bucket>/uploads/

# Cloudflare R2 via rclone
rclone sync /opt/courtzon/backend/uploads/ r2:courtzon-uploads/uploads/
```

### 4.2 Manual Uploads Restore

```bash
# From S3 backup
aws s3 sync s3://<bucket>/uploads/ /opt/courtzon/backend/uploads/

# From rclone backup
rclone sync r2:courtzon-uploads/uploads/ /opt/courtzon/backend/uploads/
```

## 5. Redis Persistence

### 5.1 Configuration

Redis is configured with:
- **RDB snapshots** (automatic, configured via defaults)
- **AOF (Append-Only File):** `--appendonly yes --appendfsync everysec`

Data directory: `/data` (mounted as `redis_data` Docker volume)

### 5.2 Backup Redis

```bash
# Trigger RDB save
docker exec courtzon-redis redis-cli SAVE

# Copy the dump
docker cp courtzon-redis:/data/dump.rdb ./redis-backup.rdb

# Copy AOF
docker cp courtzon-redis:/data/appendonly.aof ./redis-backup.aof
```

### 5.3 Restore Redis

```bash
# Stop Redis
docker compose stop redis

# Copy backup files
docker cp ./redis-backup.rdb courtzon-redis:/data/dump.rdb
docker cp ./redis-backup.aof courtzon-redis:/data/appendonly.aof

# Start Redis
docker compose start redis

# Verify
docker exec courtzon-redis redis-cli ping
# Should respond: PONG
```

**Note:** Redis data is ephemeral and can be regenerated. The primary concern is session data and cache warmth.

## 6. Recovery Testing

### 6.1 Monthly Recovery Test Procedure

1. **Prepare test environment:**
   ```bash
   # Spin up a test Docker stack
   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d
   ```

2. **Restore latest backup:**
   ```bash
   ./scripts/restore.sh --file backups/courtzon_courtzon_v3_latest.sql.gz
   ```

3. **Verify application:**
   ```bash
   # Check health
   curl -s http://localhost:3000/health | jq .status
   # Should be "ok"

   # Check data integrity
   curl -s http://localhost:3000/health/database | jq '.tables'
   # Should match expected count (> 100)

   # Verify a known record exists
   curl -s http://localhost:3000/organisations | jq '.data | length'
   ```

4. **Document results:**
   - Record RTO (Recovery Time Objective)
   - Record RPO (Recovery Point Objective — backup age)
   - Note any issues

### 6.2 Backup Verification

```bash
# Quick backup integrity
gzip -t backups/courtzon_courtzon_v3_20250101_000000.sql.gz && echo "OK"

# Check file size
ls -lh backups/courtzon_courtzon_v3_20250101_000000.sql.gz

# Sample restore (dry-run): restore to a test database
./scripts/restore.sh --file backups/courtzon_courtzon_v3_20250101_000000.sql.gz --db courtzon_test_verify
```

## 7. Backup Strategy Summary

| What | How Often | Method | Retention | Location |
|------|-----------|--------|-----------|----------|
| MySQL full | Daily (cron) | mysqldump + gzip | 30 days | Local + S3/R2 |
| Uploads | Daily (cron) | rsync/s3 sync | As needed | S3/R2 + local |
| Redis RDB | Default (every 5 min if > 100 keys changed) | Automatic | As needed | Docker volume |
| Pre-restore | On every restore | mysqldump | Until next backup | Local |

**Evidence:** All source verified against `scripts/backup.sh:1-220`, `scripts/backup-cron.sh:1-63`, `scripts/restore.sh:1-231`, `docker-compose.yml:33-54` (Redis config), `:84-85` (backend_backups volume).
