---
document_id: "TECH-MOD-45"
document_name: "Geo Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 10
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-42", "TECH-MOD-43"]
  related: []
---

# Geo Module (TECH-MOD-45)

**Source:** `backend/src/modules/geo/` (3 entries: presentation/, application/)

## 1. Purpose

IP-based geolocation and currency detection. Determines the user's likely currency from multiple signals: explicit country parameter, Cloudflare CF-IPCountry header, IP geolocation (via ipapi.co), or platform default.

## 2. Routes (1)

Defined in `geo.routes.ts:4-5`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/public/geo/currency` | — | Detect currency from request |

## 3. Services

`geo.service.ts` provides:

- `detectCurrency(options)` — Main entry point. Detection cascade: (1) explicit `countryCode` param → `resolveCurrencyByCountryIso`, (2) `cfCountry` header → resolve, (3) `clientIp` → `detectCurrencyFromIp`, (4) fallback to `getPlatformDefaultCurrency`
- `resolveCurrencyByCountryIso(isoCode)` — Looks up country's `default_currency` from countries table, returns currency code, symbol, decimal places
- `detectCurrencyFromIp(ip)` — Validates public IP, calls ipapi.co API (4s timeout), caches result for 1 hour, then resolves currency from the detected country
- `getPlatformDefaultCurrency()` — Returns configured default from `system_settings.platform.default_currency`, fallback to EGP/EG

## 4. Key Concepts

- **Detection Cascade:** country param → Cloudflare header → IP geolocation → platform default
- **IP Cache:** In-memory cache with 1-hour TTL for IP geolocation results
- **Source Tracking:** Each result includes `source` field: `'cf-header' | 'country' | 'geo-ip' | 'default'`
- **External Dependency:** Uses `ipapi.co` for IP-to-country lookup. Graceful fallback on failure
