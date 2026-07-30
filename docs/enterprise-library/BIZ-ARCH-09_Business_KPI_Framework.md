---
document_id: "BIZ-ARCH-09"
document_name: "Business KPI Framework"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["executive", "product", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "CEO"
technical_owner: "Data Team Lead"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Draft"
---

# Business KPI Framework (BIZ-ARCH-09)

## 1. KPIs by Domain

### Booking & Utilization
| KPI | Calculation | Data Source | Report Endpoint |
|-----|-----------|-------------|-----------------|
| **Court Occupancy Rate** | booked_slots / available_slots × 100 | `bookings` + `resources` | `/reports/bookings/volume` |
| **Booking Volume** | Count of bookings per period | `bookings` | `/reports/bookings/volume` |
| **Peak Hours** | Bookings grouped by hour | `bookings` | `/reports/bookings/peak-hours` |
| **Cancellation Rate** | cancelled_bookings / total_bookings × 100 | `bookings` | `/reports/bookings/cancellation` |
| **By Sport Breakdown** | Bookings grouped by sport | `bookings` + `resources` | `/reports/bookings/by-sport` |
| **By Type Breakdown** | Bookings grouped by type | `bookings` | `/reports/bookings/by-type` |

### Financial
| KPI | Calculation | Data Source | Report Endpoint |
|-----|-----------|-------------|-----------------|
| **Total Revenue** | Sum of platform revenue | `ledger_entries` | `/reports/financial/summary` |
| **Revenue by Source** | Grouped by source_type | `ledger_entries` | `/reports/financial/by-source` |
| **Revenue Timeline** | Revenue over time (daily/weekly/monthly) | `ledger_entries` | `/reports/financial/timeline` |
| **Payment Method Mix** | Revenue by payment method | `transactions` | `/reports/financial/payment-methods` |
| **Settlement Volume** | Total settled amount | `settlements` | `/reports/financial/settlements` |

### Marketplace
| KPI | Calculation | Data Source | Report Endpoint |
|-----|-----------|-------------|-----------------|
| **GMV** | Total order value | `orders` | `/reports/marketplace/overview` |
| **Top Products** | Products by revenue | `order_items` | `/reports/marketplace/top-products` |
| **Order Status Dist** | Orders by status | `orders` | `/reports/marketplace/orders` |

### User & Membership
| KPI | Calculation | Data Source | Report Endpoint |
|-----|-----------|-------------|-----------------|
| **User Registrations** | New users per period | `users` | `/reports/users/registrations` |
| **Active Users** | Users with activity in period | `users` + `bookings` | `/reports/users/active` |
| **Demographics** | Age/gender distribution | `users` | `/reports/users/demographics` |
| **Role Distribution** | Users by role | `user_roles` | `/reports/users/roles` |
| **Member Retention** | % members renewing | `user_memberships` | (BI module) |

### Tournaments
| KPI | Calculation | Data Source | Report Endpoint |
|-----|-----------|-------------|-----------------|
| **Tournament Count** | Tournaments per period | `tournaments` | `/reports/tournaments/overview` |
| **Participation Rate** | Players per tournament | `tournament_registrations` | `/reports/tournaments/participation` |

### Coaching
| KPI | Calculation | Data Source | Report Endpoint |
|-----|-----------|-------------|-----------------|
| **Coach Utilization** | Booked hours / available hours | `coach_sessions` | `/reports/coaches/performance` |

### Ads
| KPI | Calculation | Data Source | Report Endpoint |
|-----|-----------|-------------|-----------------|
| **Ad Performance** | Impressions/clicks/CTR | `ad_campaigns` | `/reports/ads/performance` |
| **Daily Spend** | Ad spend per day | `ad_campaigns` | `/reports/ads/daily-spend` |

### Audit
| KPI | Calculation | Data Source | Report Endpoint |
|-----|-----------|-------------|-----------------|
| **Activity Volume** | Audit log entries per period | `audit_logs` | `/reports/audit/activity` |
| **Top Entities** | Most-audited entity types | `audit_logs` | `/reports/audit/top-entities` |

## 2. KPI Sources

**Evidence:** Reports module (`reports/presentation/reports.routes.ts:48-91`) exposes all these endpoints. Each endpoint calls corresponding method in `reports/application/reports.service.ts`.

## 3. Mobile KPIs

| KPI | Source | Dashboard Endpoint |
|-----|--------|-------------------|
| Total Push Tokens | `push_tokens` | `/admin/mobile/dashboard` |
| Platform Breakdown | `push_tokens GROUP BY platform` | Same |
| Push Delivery Rate | `push_log` sent/delivered/failed | Same |
| App Version Distribution | `app_versions` | Same |
