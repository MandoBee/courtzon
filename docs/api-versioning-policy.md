# CourtZon Coach Platform — API Versioning Policy

> **Status:** APPROVED — Mandatory for all new endpoints
> **Standard:** URL-based versioning (`/api/v1/...`)

---

## Rule

Every API endpoint uses URL-based versioning from the first release.

```
/api/v1/bookings
/api/v1/coaches
/api/v1/org/pricing
```

Not:

```
/api/bookings
/api/coaches
```

---

## Version Format

```
/api/v{MAJOR}/...
```

- **Major version** changes when: breaking changes are introduced (field removal, response structure change, authentication change)
- **Minor version** changes when: new fields are added (backward-compatible)
- No minor version in URL — backward-compatible additions don't break existing clients

---

## When to Bump Major Version

| Change | Version Bump Required |
|--------|----------------------|
| Remove field from response | Yes |
| Rename field in response | Yes |
| Change field type | Yes |
| Change authentication method | Yes |
| Change permission model | Yes |
| Add new field to response | No |
| Add new endpoint | No |
| Add new optional parameter | No |
| Deprecate field (still returned) | No |

---

## Deprecation Process

When a field or endpoint is deprecated:

1. Add `X-Deprecated: true` header to response
2. Add `Sunset: {date}` header with deprecation date
3. Return old field alongside new field (dual support)
4. After sunset date, remove old field in next major version

---

## Current Versions

| Version | Status | Notes |
|---------|--------|-------|
| `/api/v1/` | Active | Current and only version |

---

*Every new endpoint starts at `/api/v1/`. No exceptions.*
