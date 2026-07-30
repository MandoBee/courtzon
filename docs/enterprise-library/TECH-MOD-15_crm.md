---
document_id: "TECH-MOD-15"
document_name: "CRM Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Marketing Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-14"]
  related: ["TECH-MOD-13", "TECH-MOD-22"]
---

# CRM Module (TECH-MOD-15)

**Source:** `backend/src/modules/crm/` (3 files: index.ts, presentation/crm.controller.ts, presentation/crm.routes.ts)

## 1. Purpose

Customer Relationship Management: Customer 360 (aggregated profile from all modules), customer timeline (chronological event feed), rule-based segments, lead management, marketing campaigns, communication log. 18 routes.

## 2. Architecture

```
presentation/
  crm.routes.ts       — 18 endpoints (39 lines)
  crm.controller.ts   — Request handlers
index.ts              — Barrel export
```

**Evidence:** `crm.routes.ts` (39 lines) defines all 18 routes.

## 3. Routes (18)

Defined in `crm.routes.ts:9-39`:

**Customer 360 (3):**
- `GET /admin/crm/customers` — List customers (`crm.customers.view`)
- `GET /admin/crm/customers/:id` — Get customer profile (`crm.customers.view`)
- `GET /admin/crm/customers/:id/timeline` — Customer timeline (`crm.customers.view`)

**Segments (5):**
- `GET /admin/crm/segments` — List (`crm.segments.view`)
- `POST /admin/crm/segments` — Create (`crm.segments.manage`)
- `PUT /admin/crm/segments/:id` — Update (`crm.segments.manage`)
- `POST /admin/crm/segments/:id/refresh` — Refresh members (`crm.segments.manage`)
- `DELETE /admin/crm/segments/:id` — Delete (`crm.segments.manage`)

**Leads (4):**
- `GET /admin/crm/leads` — List (`crm.leads.view`)
- `POST /admin/crm/leads` — Create (`crm.leads.manage`)
- `PUT /admin/crm/leads/:id` — Update (`crm.leads.manage`)
- `POST /admin/crm/leads/:id/convert` — Convert to customer (`crm.leads.manage`)

**Campaigns (5):**
- `GET /admin/crm/campaigns` — List (`crm.campaigns.view`)
- `POST /admin/crm/campaigns` — Create (`crm.campaigns.manage`)
- `PUT /admin/crm/campaigns/:id` — Update (`crm.campaigns.manage`)
- `POST /admin/crm/campaigns/:id/launch` — Launch (`crm.campaigns.manage`)
- `POST /admin/crm/campaigns/:id/pause` — Pause (`crm.campaigns.manage`)
- `POST /admin/crm/campaigns/:id/complete` — Complete (`crm.campaigns.manage`)

**Communications (1):**
- `GET /admin/crm/communications` — List communication log (`crm.communications.view`)

**Dashboard (1):**
- `GET /admin/crm/dashboard` — CRM dashboard (`crm.dashboard.view`)

## 4. Permissions

`crm.customers.view`, `crm.segments.view`, `crm.segments.manage`, `crm.leads.view`, `crm.leads.manage`, `crm.campaigns.view`, `crm.campaigns.manage`, `crm.communications.view`, `crm.dashboard.view`

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Customer | `users` (aggregated) | Aggregated from users, bookings, orders, etc. |
| Segment | `crm_segments` | `id, name, rules (JSON), member_count, last_refreshed_at` |
| Lead | `crm_leads` | `id, name, email, phone, source, status, assigned_to` |
| Campaign | `crm_campaigns` | `id, name, type, status, segment_ids, scheduled_at, launched_at` |
| Communication | `crm_communications` | `id, customer_id, type, channel, subject, body, sent_at` |
| Timeline Event | `crm_timeline_events` | `id, customer_id, event_type, event_data, created_at` |

## 6. Lead Lifecycle

```
new → qualified → converted → lost
```

- `new`: Fresh lead captured
- `qualified`: Meets criteria, assigned to sales
- `converted`: Became a customer (user registered)
- `lost`: Disqualified or declined

**Evidence:** `crm.routes.ts:24` has convert endpoint.

## 7. Campaign Lifecycle

```
draft → active → paused → completed → cancelled
```

- `draft`: Being designed, not yet live
- `active`: Running, sending communications
- `paused`: Temporarily stopped
- `completed`: Campaign finished
- `cancelled`: Aborted

**Evidence:** `crm.routes.ts:30-33` has launch, pause, complete endpoints.

## 8. Events

- `crm:lead_created` / `crm:lead_converted`
- `crm:campaign_launched` / `crm:campaign_completed`
- `crm:segment_refreshed`
- `crm:communication_sent`
