---
document_id: "TECH-MOD-39"
document_name: "App Settings Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-33"]
  related: ["TECH-MOD-36"]
---

# App Settings Module (TECH-MOD-39)

**Source:** `backend/src/modules/app-settings/` (6 entries: presentation/, application/, domain/, infrastructure/)

## 1. Purpose

Branding configuration for the platform: site name, logo, favicon, PWA icons, tagline, meta description, support email, domain name, maintenance mode. Includes image upload with Sharp validation and processing.

## 2. Routes (5)

Defined in `app-settings.routes.ts:5-33`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/admin/app-settings` | adminGuard + `app-settings.view` | List all settings |
| 2 | GET | `/public/app-settings` | — | Get public settings |
| 3 | PUT | `/admin/app-settings` | adminGuard + `app-settings.edit` | Update settings |
| 4 | GET | `/admin/app-settings/image-specs/:assetType` | adminGuard + `app-settings.view` | Get brand image spec |
| 5 | POST | `/admin/app-settings/upload/:assetType` | adminGuard + `app-settings.edit` | Upload brand image |

## 3. Services

`app-settings.service.ts` provides:

- `listAll()` — All settings for admin
- `listPublic()` — Public-facing settings
- `updateMany(settings, updatedBy)` — Bulk upsert with history tracking
- `uploadBrandImage(assetType, buffer, mimeType, originalName, updatedBy)` — Validates image via Sharp, uploads via upload service, updates setting
- `getBrandImageSpec(assetType)` — Returns validation spec for frontend

## 4. Domain Model

### Brand Image Specs (`brand-image.ts`)

Six asset types with validation rules:

| Asset Type | Setting Key | Max Size | Min Dims | Max Dims | Output |
|-----------|-------------|----------|----------|----------|--------|
| `favicon` | `favicon_url` | 512 KB | 32×32 | 512×512 | 128×128 PNG |
| `favicon-dark` | `favicon_dark_url` | 512 KB | 32×32 | 512×512 | 128×128 PNG |
| `site-logo` | `site_logo_url` | 2 MB | 120×40 | 2400×1200 | 800×400 WebP |
| `site-logo-dark` | `site_logo_dark_url` | 2 MB | 120×40 | 2400×1200 | 800×400 WebP |
| `pwa-192` | `pwa_icon_192` | 1 MB | 192×192 | 4096×4096 | 192×192 PNG |
| `pwa-512` | `pwa_icon_512` | 2 MB | 512×512 | 4096×4096 | 512×512 PNG |

### Allowed Setting Keys

- `site_name`, `support_email`, `favicon_url`, `favicon_dark_url`, `site_logo_url`, `site_logo_dark_url`
- `pwa_icon_192`, `pwa_icon_512`, `domain_name`, `site_tagline`, `meta_description`, `maintenance_mode`

## 5. Key Concepts

- **Sharp Validation:** Images validated for mime type, file size, dimensions, aspect ratio, square tolerance before processing
- **Upload Processing:** Images resized to spec via Sharp processor and stored via `uploadService.replaceEntityFile`
- **Public Settings:** Exposed at `/public/app-settings` without auth for client-side branding
