# CourtZon V2 — Production Deployment Checklist

## Pre-Deployment

- [ ] Database backup completed (existing data preserved)
- [ ] Environment variables verified (.env file)
- [ ] `METRICS_TOKEN` set for production Prometheus access
- [ ] `JWT_SECRET` changed from default
- [ ] `SESSION_SECRET` changed from default (min 32 chars)
- [ ] `NODE_ENV=production` set
- [ ] `CORS_ORIGINS` configured with production domain
- [ ] `PAYMOB_*` credentials configured for production gateway
- [ ] `MAIL_*` SMTP credentials configured
- [ ] `STORAGE_PROVIDER` configured (local/s3/r2)
- [ ] SSL certificates installed and valid

## Database

- [ ] Baseline schema imported (`001_courtzon_v3.sql`)
- [ ] All migrations applied (`node dist/scripts/migrate.js --status`)
- [ ] Seed data imported (`database/seeds/001_baseline.sql`)
- [ ] `BOOKING_V2_*` feature flags enabled (all default true)
- [ ] UI permissions synced (`node dist/scripts/sync-ui-registry.js`)

## Application Health

- [ ] Backend health endpoint: `GET /health` → `{"status":"ok"}`
- [ ] Database check: latency < 10ms
- [ ] Redis check: connected
- [ ] Storage check: writable
- [ ] Socket.IO check: operational
- [ ] Frontend reachable: HTTP 200 on production URL

## Monitoring

- [ ] Prometheus scrape target configured: `http://backend:3000/metrics`
- [ ] Grafana datasource configured
- [ ] Alert rules active (6 rules)
- [ ] `METRICS_TOKEN` configured for production scrape

## Third-Party Services

- [ ] Payment gateway configured (Paymob)
- [ ] Email server configured (SMTP)
- [ ] Storage provider configured (local/S3/R2)

## Security

- [ ] HTTPS enforced
- [ ] HSTS preload ready (max-age=31536000)
- [ ] CSP headers verified
- [ ] Rate limiting active (100 req/min)
- [ ] Brute force protection active (Redis)
- [ ] Admin routes accessible only to authorized roles

## Smoke Tests

- [ ] User registration flow works
- [ ] Login / logout flow works
- [ ] Password reset flow works
- [ ] Court booking flow works (browse → book → pay → confirm)
- [ ] Wallet deposit and withdrawal works
- [ ] Marketplace product listing and purchase works
- [ ] Tournament creation and bracket generation works
- [ ] Academy enrollment works
- [ ] Coach session booking works
- [ ] Notification delivery works (in-app + email)
- [ ] Real-time updates work across all dashboards
- [ ] Admin CRUD operations work
- [ ] Global search (Ctrl+K) works
- [ ] Export (CSV/JSON/Print) works

## Post-Deployment

- [ ] Monitor error logs for first 24 hours
- [ ] Verify Prometheus metrics are being collected
- [ ] Verify Grafana dashboards are populated
- [ ] Verify no dead-letter queue entries accumulating
- [ ] Confirm backup schedule is active
