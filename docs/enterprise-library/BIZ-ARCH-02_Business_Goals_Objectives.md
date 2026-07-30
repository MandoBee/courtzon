---
document_id: "BIZ-ARCH-02"
document_name: "Business Goals & Objectives"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["executive", "product"]
difficulty: "beginner"
reading_time: 10
business_owner: "CEO"
technical_owner: "CTO"
documentation_owner: "Product Management"
reviewer: "Architect"
approver: "CEO"
lifecycle_status: "Draft"
---

# Business Goals & Objectives (BIZ-ARCH-02)

## 1. Operational Efficiency

| Goal | KPI | Target |
|------|-----|--------|
| Automate court booking | % bookings created online | >90% |
| Reduce no-shows | Cancellation rate | <10% |
| Streamline payroll | Hours saved per cycle | 40+ hrs |
| Digital onboarding | New org time-to-active | <24 hrs |

**Evidence:** Booking module handles 18 routes for full lifecycle automation. HR module for payroll.

## 2. Revenue Growth

| Goal | KPI | Target |
|------|-----|--------|
| Increase court utilization | Court occupancy rate | >75% |
| Drive marketplace GMV | Monthly transaction volume | +20% QoQ |
| Membership recurring revenue | MRR from memberships | 40% of total |
| Coaching revenue | Booked coach hours | +15% QoQ |

**Evidence:** Marketplace module (132 routes), Membership module (14 routes), Pricing engine.

## 3. Member Retention

| Goal | KPI | Target |
|------|-----|--------|
| Improve loyalty | Member churn rate | <5% monthly |
| Increase engagement | Avg bookings per member/month | >4 |
| Reward loyalty | Points redemption rate | >30% |

**Evidence:** Loyalty tiers (bronze→diamond) in `membership-aggregate.ts:90-96`, rewards catalog, campaigns.

## 4. Multi-Org Scalability

| Goal | KPI | Target |
|------|-----|--------|
| Support franchise model | Orgs per platform | Unlimited |
| Cross-org visibility | Central admin dashboards | Real-time |
| Role-based access | Permission configurations | Granular per org |

**Evidence:** Organisation hierarchy, branches, RBAC with scopes. Reports module with 30 endpoints across 9 categories.

## 5. Platform Growth

| Goal | KPI | Target |
|------|-----|--------|
| API ecosystem | External integrations | 50+ partners |
| Mobile adoption | MAU via mobile | >60% |
| Internationalization | Supported locales | 5+ languages |

**Evidence:** Integration module with API gateway, Mobile module with push/versions/config, Translations module.
