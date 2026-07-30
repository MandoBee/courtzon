---
document_id: "BIZ-PROD-06"
document_name: "Pricing Model"
family: "BIZ-PROD"
document_type: "PROD"
status: "Draft"
version: "0.1"
audience: ["product", "executive"]
difficulty: "beginner"
reading_time: 10
business_owner: "Product Director"
technical_owner: "Lead Developer"
documentation_owner: "Product Management"
reviewer: "Architect"
approver: "Executive Team"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-32", "TECH-MOD-30"]
  related: []
---

# Pricing Model (BIZ-PROD-06)

## Subscription Plans

The platform uses a tiered subscription model for organisations. Plans are stored in `subscription_plans` table and scoped per organisation via `organisation_subscriptions`.

### Plan Tiers

| Tier | Plan Type | Billing Cycle | Target |
|------|-----------|---------------|--------|
| **Free** | `free` | N/A | Trial / micro-clubs |
| **Starter** | `starter` | Monthly/Yearly | Small clubs |
| **Professional** | `professional` | Monthly/Yearly | Mid-size clubs |
| **Enterprise** | `enterprise` | Monthly/Yearly | Multi-branch enterprises |
| **Unlimited** | `unlimited` | Custom | Large enterprises |

### Features Per Tier

| Feature | Free | Starter | Professional | Enterprise |
|---------|:----:|:-------:|:------------:|:----------:|
| Branches | 1 | 3 | 10 | Unlimited |
| Resources/Courts | 5 | 20 | 100 | Unlimited |
| Bookings/month | 100 | 1,000 | 10,000 | Unlimited |
| Staff Accounts | 2 | 10 | 50 | Unlimited |
| Tournaments | 0 | 5 | 50 | Unlimited |
| Academies | 0 | 3 | 20 | Unlimited |
| Marketplace | ✗ | ✓ | ✓ | ✓ |
| CRM | ✗ | ✗ | ✓ | ✓ |
| HR/Payroll | ✗ | ✗ | ✓ | ✓ |
| BI/Analytics | ✗ | ✗ | Basic | Advanced |
| API Access | ✗ | Limited | Full | Full |
| White Label | ✗ | ✗ | ✗ | ✓ |
| Priority Support | ✗ | ✗ | ✓ | ✓ |

## Commission Rates

Commission is calculated per transaction type via `commissionService.calculate()`:

| Entity Type | Default Rate | Notes |
|------------|:-----------:|-------|
| `booking` | 5% | Court/venue bookings |
| `tournament` | 8% | Tournament entry fees |
| `coach_session` | 10% | Coach session fees |
| `marketplace` | 3% | Product sales |
| `membership` | 0% | Membership fees |

Commission rates can be overridden per plan via `plan_commission_rates` table.

## Plan Limits Enforcement

Plan limits are enforced via `getPlanNumericLimit(orgId, entityType, defaultLimit)`:
- **Tournaments:** MAX per org
- **Academies:** MAX per org
- **Resources/Courts:** MAX per branch (enforced at org level)
- **Staff Accounts:** MAX users with staff roles

Limits are checked before creation in `activities.service.ts` and respective modules.

## Payment Methods

| Method | Type | Regions |
|--------|------|---------|
| Wallet | Internal | All |
| Fatoora | Payment Gateway | MENA |
| PayPal | Payment Gateway | Global |
| Cash | Offline | All |
| Card (on-site) | POS | All |
