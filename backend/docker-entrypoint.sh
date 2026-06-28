#!/bin/sh
set -e

echo "Waiting for MySQL..."
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  sleep 1
done
echo "MySQL is ready."

echo "Waiting for Redis..."
until nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; do
  sleep 1
done
echo "Redis is ready."

echo "Checking database state..."
_PASS="${DB_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
_MYSQL="mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$_PASS --skip-ssl"
_TABLE_COUNT=$($_MYSQL -N -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME'" 2>/dev/null)

if [ "$_TABLE_COUNT" = "0" ] || [ -z "$_TABLE_COUNT" ]; then
  echo "Empty database detected. Importing baseline schema..."
  $_MYSQL "$DB_NAME" < /app/database/baseline/001_courtzon_v3.sql
  echo "Baseline schema imported."

  echo "Importing seed data..."
  $_MYSQL "$DB_NAME" < /app/database/seeds/001_baseline.sql
  echo "Seed data imported."
else
  echo "Database has $_TABLE_COUNT tables — initialization skipped."
fi

echo "Starting backend..."
exec "$@"
