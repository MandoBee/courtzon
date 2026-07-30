---
document_id: "BIZ-ARCH-03"
document_name: "Business Capability Map"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["executive", "architect", "product"]
difficulty: "beginner"
reading_time: 15
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Draft"
---

# Business Capability Map (BIZ-ARCH-03)

## 1. Capability Overview

```
                        ┌──────────────────────────────────────────┐
                        │            CORE PLATFORM                  │
                        │  Identity · Auth · RBAC · Organisations   │
                        │  Notifications · Security · Audit Log     │
                        └──────────────┬───────────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
          ▼                             ▼                             ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│   SPORTS OPERATIONS  │   │   COMMERCE & FINANCE │   │   ENGAGEMENT & GROWTH│
│                      │   │                      │   │                      │
│ • Booking            │   │ • Marketplace        │   │ • CRM                │
│ • Scheduling         │   │ • Inventory          │   │ • Community          │
│ • Academy            │   │ • Payment Gateway    │   │ • Membership         │
│ • Tournaments        │   │ • Wallet             │   │ • Chat/Messaging     │
│ • Leagues            │   │ • Financial Ledger   │   │ • Follows/Friends    │
│ • Matchmaking        │   │ • Accounting         │   │ • Events/RSVP        │
│ • Coaching           │   │ • Settlements        │   │ • Ads/Campaigns      │
│ • Refereeing         │   │ • Coupons            │   │ • CMS/Content        │
│ • Sports Engine      │   │ • Pricing Engine     │   │ • Translations       │
│ • HR & Payroll       │   │ • Withdrawals        │   │ • Support            │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
                                                            │
                                                            ▼
                                                  ┌─────────────────────┐
                                                  │   INSIGHTS & OPS     │
                                                  │                      │
                                                  │ • Reports (30)       │
                                                  │ • BI / Dashboards    │
                                                  │ • Audit Log          │
                                                  │ • Mobile Dashboard   │
                                                  │ • Client Errors      │
                                                  │ • Web Vitals         │
                                                  └─────────────────────┘
```

## 2. Domain Breakdown

| Capability Domain | Modules | File Count | Routes |
|------------------|---------|-----------|--------|
| **Identity & Access** | auth, rbac, security | ~15 | 20+ |
| **Organisation Mgmt** | organisations, crm | ~20 | 30+ |
| **Booking & Scheduling** | booking, scheduling | ~25 | 21 |
| **Academy** | academy | ~10 | 20+ |
| **Tournaments** | tournaments | ~15 | 25+ |
| **Leagues** | leagues | ~12 | 20+ |
| **Matchmaking** | match | 31 | 9 |
| **Marketplace** | marketplace, inventory | ~20 | 132 |
| **Finance** | financial, payment, wallet, settlement | ~30 | 25+ |
| **Accounting** | accounting | ~8 | 10+ |
| **HR & Payroll** | hr | ~12 | 20+ |
| **Membership** | membership | 11 | 14 |
| **Community** | community | ~5 | 35+ |
| **Content** | cms | ~6 | 37 |
| **Notifications** | notifications | ~10 | 10+ |
| **Support** | support | ~5 | 10+ |
| **Reports & BI** | reports, bi | ~8 | 30+ |
| **Integration** | integration | 5 | 11 |
| **Mobile** | mobile | 3 | 13 |
| **Sports Engine** | sports-engine | ~10 | 5+ |
| **Pricing** | pricing | ~8 | 9 |
| **Coupons** | coupon | ~5 | 6 |
| **Upload** | upload | ~8 | 12 |
| **Translations** | translations | ~5 | 17 |
| **Total** | **28 modules** | **~300 files** | **~600 routes** |

**Evidence:** Counts derived from module directories and route file analysis.
