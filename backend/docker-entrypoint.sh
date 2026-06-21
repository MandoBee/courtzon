#!/bin/sh
set -e

echo "Waiting for MySQL..."
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  sleep 1
done
echo "MySQL is ready."

echo "Running database migrations..."
node scripts/migrate.js || echo "Migration warning (non-fatal)"

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

echo "Starting backend..."
exec "$@"
