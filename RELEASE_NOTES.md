# CourtZon v1.0.0 — Release Notes

## Overview

CourtZon v1.0.0 is the production release following a 6-phase remediation program addressing critical issues in transaction integrity, booking concurrency, performance, security, testing, and infrastructure.

## Remediation Summary

| Phase | Area | Key Changes |
|---|---|---|
| 1 | Transaction & Financial Integrity | Wallet deposits/withdrawals fully atomic; FOR UPDATE locks held; settlement markPaid transactional; webhook idempotency |
| 2 | Booking Concurrency | RedisLock integration; DB UNIQUE constraint; availability check inside transaction; transactional cancellation |
| 3 | Performance | N+1 elimination in checkout (6N→7 queries); batch product/variant/stats lookups; payment history index |
| 4 | Security | Global auth middleware; zero console.log; token leak fix; CSP hardening; FlagCDN removed |
| 5 | Testing | 128 tests (128 pass); coverage thresholds; payment + wallet + booking + pagination tests |
| 6 | Infrastructure | Docker resource limits; Prometheus + Grafana monitoring stack |

## Test Results

- **128/128 tests pass** (0 failures, 0 skipped)
- 11 test files across: wallet, booking, payment, pagination, auth, app-settings, token, password, errors

## Deployed Services

| Service | Port | Health |
|---|---|---|
| MySQL 8.0 | 3307 | ✅ |
| Redis 7 | 6379 | ✅ |
| Backend (Fastify) | 3000 | ✅ |
| Frontend (Nginx) | 5173 | ✅ |

## Quick Start

```bash
# Clone and start
git clone https://github.com/MandoBee/courtzon.git
cd CourtZon-V2
cp .env.example .env  # configure secrets
docker compose up -d

# Apply migrations (automatic on first boot)
# Activate monitoring (optional)
docker compose --profile monitoring up -d
```

## Verification

```bash
# Health check
curl http://localhost:3000/health

# Test suite
cd backend && npm test

# Coverage report
cd backend && npm run test:coverage
```
