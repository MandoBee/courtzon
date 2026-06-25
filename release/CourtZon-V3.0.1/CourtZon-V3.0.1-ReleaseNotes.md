# CourtZon V3.0.1 — Release Notes

**Release Date:** 2026-06-25
**Status:** Production Certified
**Previous Version:** CourtZon V3.0.0

---

## Changes from V3.0.0

### Critical Fix: UTF-8 Arabic Encoding

The V3.0.0 seed file (`database/seeds/001_baseline.sql`) contained double-encoded UTF-8 mojibake for all Arabic text across translations, countries, and languages tables. This was caused by the V2-to-V3 seed export process using incorrect character encoding.

**Root Cause:** Type A — Source file corruption. The V2 database (XAMPP MariaDB) had clean Arabic, but the export pipeline wrote double-encoded UTF-8 into the seed SQL file.

**Fix:** Re-exported seed data from the clean V2 source database using `mysqldump --default-character-set=utf8mb4`. The seed file now contains 4,032 valid Arabic characters.

**Impact:** All Arabic text in translations (284 keys), country native names, and language names now renders correctly as UTF-8 in MySQL, backend JSON API responses, and frontend UI.

### Additional Fixes Included

- **nginx API proxy**: 48 route prefixes now proxied to backend (was 5) — all pages load without `ERR_INVALID_CHUNKED_ENCODING`
- **nginx CSP header**: Collapsed to single line — multi-line CSP broke HTTP framing in all responses
- **`/public/*` proxy**: Added to nginx for login page country dropdown
- **`RELAX_RATE_LIMIT`**: Added to Docker Compose for local dev HTTPS redirect disable

---

## Artifact Checksums

See `CourtZon-V3.0.1-SHA256SUMS.txt`

---

## Upgrade from V3.0.0

1. Replace `database/seeds/001_baseline.sql` with the new version
2. Drop and recreate `courtzon_v3` database
3. Re-import baseline + seed:
   ```bash
   mysql courtzon_v3 < database/baseline/001_courtzon_v3.sql
   mysql courtzon_v3 < database/seeds/001_baseline.sql
   ```
4. Redeploy backend + frontend Docker images

---

**Full details:** `docs/validation/utf8-validation.md`
