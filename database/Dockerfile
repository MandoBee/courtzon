FROM mysql:8.0

COPY baseline/001_courtzon_v3.sql /docker-entrypoint-initdb.d/001_schema.sql
COPY seeds/001_baseline.sql /docker-entrypoint-initdb.d/002_seed.sql
