---
document_id: "TECH-MOD-33"
document_name: "Upload Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: ["TECH-MOD-23"]
---

# Upload Module (TECH-MOD-33)

**Source:** `backend/src/modules/upload/` (5 directories: domain/, application/, commands/, infrastructure/, presentation/)

## 1. Purpose

Secure file upload system with Sharp image processing, MIME validation, magic byte verification, path traversal protection, and audit logging. Supports images (JPEG, PNG, WebP, GIF, HEIC, HEIF, AVIF) and PDFs. Max file size 20MB.

## 2. Architecture

```
application/
  upload.service.ts     — 216 lines: validate, process, store, audit
domain/
  (domain types)
infrastructure/
  sharp-processor.ts    — Image resizing/compression via Sharp
  storage.factory.ts    — Storage provider factory
  storage-provider.interface.ts
  upload.repository.ts
presentation/
  upload.routes.ts      — 14 endpoints
  upload.controller.ts
  upload.dto.ts
commands/
  (upload commands)
```

**Evidence:** `upload.service.ts:1-216`, `upload.routes.ts:89-159`.

## 3. Security Controls

### MIME Validation
`ALLOWED_MIME_TYPES` (`upload.service.ts:10-13`):
`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`, `image/heif`, `image/avif`, `application/pdf`

### Blocked Extensions
`BLOCKED_EXTENSIONS` (`upload.service.ts:15-24`):
`.svg`, `.html`, `.js`, `.php`, `.exe`, `.dll`, `.sh`, `.py`, `.jar`, `.msi`, etc. (30+ dangerous extensions)

### Magic Byte Verification
`validateMagicBytes()` (`upload.service.ts:58-95`) checks file headers:
- JPEG: `FF D8 FF` followed by valid marker
- PNG: `89 50 4E 47`
- WebP: `52 49 46 46` + `WEBP`
- GIF: `47 49 46 38`
- HEIC/HEIF: `ftyp` box with `heic`/`heix`/`heim`/`heis`/`mif1`
- AVIF: `ftyp` + `avif`/`avis`
- PDF: `25 50 44 46`

**Evidence:** `upload.service.ts:58-95`.

### Path Traversal Protection
Files are stored with UUID-based filenames: `${randomUUID()}.${ext}` at path `${entityType}/${fileCategory}/${filename}` (`:141-143`).

### File Size Limit
`MAX_FILE_SIZE = 20MB` (`:26`).

## 4. Image Processing

`SharpProcessor` processes images with configurable options:
- `maxWidth` / `maxHeight` (default 1920)
- `quality` (default 80)
- `fit` (cover/contain/fill)

**Evidence:** `upload.service.ts:117-126`.

## 5. Routes (14)

Defined in `upload.routes.ts:89-158`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | POST | `/upload/:entityType/:entityId/:fileCategory` | auth | Generic upload |
| 2 | POST | `/organisations/:orgId/logo` | auth + orgAccess | Org logo |
| 3 | POST | `/organisations/:orgId/cover` | auth + orgAccess | Org cover |
| 4 | POST | `/organisations/:orgId/documents` | auth + orgAccess | Org document |
| 5 | POST | `/branches/:branchId/images` | auth + branchAccess | Branch image |
| 6 | POST | `/resources/:resourceId/images` | auth + resourceAccess | Resource image |
| 7 | POST | `/upload/avatar` | auth | Avatar |
| 8 | POST | `/upload/sport-icon` | auth | Sport icon |
| 9 | POST | `/sports/:sportId/icon` | auth | Sport icon (replaces) |
| 10 | POST | `/upload/coach-cert` | auth | Coach cert |
| 11 | GET | `/uploads` | auth | Get by entity |
| 12 | DELETE | `/uploads/:id` | auth | Delete upload |

## 6. Upload Service Methods

- `upload()` — Validate, process, store, create record, audit (`:97-173`)
- `getByEntity()` — Query uploads by entity type/id (`:175-177`)
- `delete()` — Delete from storage + DB + audit (`:179-194`)
- `replaceEntityFile()` — Delete existing + upload new (`:196-213`)

## 7. Audit Events

- `UPLOAD.CREATE` — On every upload with entity type, category, mime type, file size
- `UPLOAD.DELETE` — On delete with file path
