#!/bin/sh
set -e

echo "Waiting for MySQL..."
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  sleep 1
done
echo "MySQL is ready."

echo "Running database migrations..."
node scripts/migrate.js || echo "Migration warning (non-fatal)"

# Auto-seed if the database is fresh (no app_settings data)
echo "Checking if seed data is needed..."
TABLE_EXISTS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='app_settings';" 2>/dev/null || echo "0")
if [ "$TABLE_EXISTS" = "1" ]; then
  ROW_COUNT=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "SELECT COUNT(*) FROM app_settings;" 2>/dev/null || echo "0")
  if [ "$ROW_COUNT" = "0" ]; then
    echo "app_settings is empty — running seed..."
    node scripts/migrate.js --seed || echo "Seed warning (non-fatal)"
  else
    echo "Seed data already present."
  fi
else
  echo "app_settings table not found after migrations — schema may be incomplete."
fi

# Start a background watcher for database changes (dev only) - migration only, no seed
if [ "$NODE_ENV" = "development" ]; then
  echo "Starting database file watcher for auto-migration..."
  (
    while true; do
      inotifywait -r -e modify,create,delete,move /app/database/schema/ 2>/dev/null
      echo "Database change detected. Running migrations..."
      node /app/scripts/migrate.js 2>&1 || true
    done
  ) &
fi

# Bootstrap super admin from env vars (first deployment only)
echo "Checking super admin bootstrap..."
node scripts/bootstrap-admin.js || echo "Admin bootstrap skipped."

echo "Starting backend..."
exec "$@"
