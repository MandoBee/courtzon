/**
 * Minimal env so modules that import config/env.ts can load before the DB-heavy
 * integration specs run. Defaults point at the shared LOCAL Docker MySQL
 * (127.0.0.1:3307 / courtzon_v3 / courtzon2026) — the environment the
 * integration specs exercise. Suites that use an ephemeral Testcontainers DB
 * override these in their own beforeAll.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.PORT = process.env.PORT || '3000';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3307';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'courtzon2026';
process.env.DB_NAME = process.env.DB_NAME || 'courtzon_v3';
process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.REDIS_DB = process.env.REDIS_DB || '0';
