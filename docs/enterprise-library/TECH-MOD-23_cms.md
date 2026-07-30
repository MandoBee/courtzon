---
document_id: "TECH-MOD-23"
document_name: "Content Management Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: []
---

# CMS Module (TECH-MOD-23)

**Source:** `backend/src/modules/cms/` (3 directories: presentation/, application/, infrastructure/)

## 1. Purpose

Content management for published pages, blogs, contact form submissions, media library, and public-facing data endpoints. 45+ endpoints split into public (unauthenticated) and protected admin routes.

## 2. Routes

Defined in `cms.routes.ts:8-59`:

**Public endpoints (11):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/public/published-pages` | Get published slugs |
| 2 | GET | `/public/pages/:slug` | Get published page |
| 3 | GET | `/public/blogs` | List published blogs |
| 4 | GET | `/public/blogs/:slug` | Get blog post |
| 5 | GET | `/public/contact/options` | Contact form options |
| 6 | POST | `/public/contact` | Submit contact form |
| 7 | GET | `/public/payment-methods` | Payment methods |
| 8 | GET | `/public/subscription-plans` | Public plans |
| 9 | GET | `/public/organisation-types` | Org types |
| 10 | GET | `/public/countries` | Countries |
| 11 | GET | `/public/currency-symbols` | Currency symbols |

**Admin Pages (8):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 12 | GET | `/cms/pages` | List pages |
| 13 | PUT | `/cms/pages/reorder` | Reorder pages |
| 14 | GET | `/cms/pages/:id` | Get page |
| 15 | POST | `/cms/pages` | Create page |
| 16 | PUT | `/cms/pages/:id` | Update page |
| 17 | DELETE | `/cms/pages/:id` | Delete page |
| 18 | PATCH | `/cms/pages/:id/publish` | Toggle publish |

**Blocks (6):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 19 | GET | `/cms/pages/:pageId/blocks` | List blocks |
| 20 | PUT | `/cms/pages/:pageId/blocks/reorder` | Reorder blocks |
| 21 | POST | `/cms/blocks` | Create block |
| 22 | PUT | `/cms/blocks/:id` | Update block |
| 23 | DELETE | `/cms/blocks/:id` | Delete block |

**Blogs (6):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 24 | GET | `/cms/blogs` | List blogs |
| 25 | GET | `/cms/blogs/:id` | Get blog |
| 26 | POST | `/cms/blogs` | Create blog |
| 27 | PUT | `/cms/blogs/:id` | Update blog |
| 28 | DELETE | `/cms/blogs/:id` | Delete blog |
| 29 | PATCH | `/cms/blogs/:id/publish` | Toggle publish |

**Sections (3):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 30 | POST | `/cms/sections` | Create section |
| 31 | PUT | `/cms/sections/:id` | Update section |
| 32 | DELETE | `/cms/sections/:id` | Delete section |

**Media (3):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 33 | GET | `/cms/media` | List media |
| 34 | POST | `/cms/media/upload` | Upload media |
| 35 | DELETE | `/cms/media/:id` | Delete media |

**Contact/Admin (2):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 36 | GET | `/cms/contacts` | List submissions |
| 37 | PATCH | `/cms/contacts/:id/read` | Mark as read |

## 3. Services

- `cms.service.ts` — Pages, blogs, sections, blocks CRUD
- `contact-submission.service.ts` — Contact form handling

## 4. Permissions

All admin routes gated by `adminGuard` (super_admin/super-admin role check). No granular permission keys — uses role-based guard.

## 5. Events

- Contact form submissions trigger notifications (via `eventBusV2`)
