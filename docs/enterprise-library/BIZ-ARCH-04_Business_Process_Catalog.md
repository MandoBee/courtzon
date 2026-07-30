---
document_id: "BIZ-ARCH-04"
document_name: "Business Process Catalog"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["product", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Product Manager"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Draft"
---

# Business Process Catalog (BIZ-ARCH-04)

## 1. Player-Facing Processes

| Process | Module | Key States | Routes |
|---------|--------|-----------|--------|
| **Player Onboarding** | Auth | Registered → Verified → Active | POST /auth/register, /auth/verify |
| **Court Booking** | Booking, Scheduling | Pending → Confirmed → Checked-in → Completed | 18 booking routes |
| **Matchmaking** | Match | Open → Full → In Progress → Completed | 9 match routes |
| **Academy Enrollment** | Academy | Applied → Enrolled → Active → Graduated | Program, group, enrollment routes |
| **Marketplace Order** | Marketplace | Pending → Confirmed → Processing → Shipped → Delivered | 6 order routes |
| **Tournament Registration** | Tournaments | Open → Registering → In Progress → Completed | 25+ tournament routes |
| **League Participation** | Leagues | Registration → Season → Fixtures → Standings → Completed | 20+ league routes |
| **Wallet Top-Up** | Wallet, Payment | Initiated → Processing → Completed | POST /wallet/deposit |
| **Withdrawal Request** | Financial, Wallet | Pending → Approved → Completed | 5 admin withdrawal routes |
| **Membership Purchase** | Membership | Assigned → Active → (Freeze/Resume) → Expired/Cancelled | 14 membership routes |

## 2. Organisation-Facing Processes

| Process | Module | Key States | Routes |
|---------|--------|-----------|--------|
| **Org Onboarding** | Organisations | Created → Verified → Active | Org CRUD routes |
| **Resource Management** | Booking | Created → Active → Maintenance → Inactive | Resource CRUD routes |
| **Staff Management** | HR | Hired → Active → On Leave → Terminated | 20+ HR routes |
| **Payroll Processing** | HR, Accounting | Draft → Approved → Paid → Recorded | Payroll routes |
| **Inventory Procurement** | Marketplace/Inventory | PO Draft → Submitted → Approved → Received | 8 PO routes |
| **Stock Transfer** | Marketplace/Inventory | Pending → Completed | 3 transfer routes |
| **Settlement Request** | Settlement | Requested → Pending Approval → Approved → Paid → Completed | 9 settlement routes |
| **Coach Scheduling** | Scheduling | Search → Book → Confirm → Complete | 3 scheduling routes |
| **Pricing Configuration** | Pricing | Create Rule → Assign → Preview → Activate | 9 pricing routes |

## 3. Admin Processes

| Process | Module | Description |
|---------|--------|-------------|
| **Permission Management** | RBAC | Create roles, assign permissions, scope to orgs |
| **UI Permission Gating** | Permissions | Register elements, sync registry, assign to roles |
| **Report Generation** | Reports | 30 report types across 9 categories |
| **Audit Review** | Audit Log | Query activity, revert actions |
| **Mobile App Management** | Mobile | Version control, forced upgrades, remote config |
| **API Key Management** | Integration | Create (one-time), list, revoke |
| **Coupon Campaigns** | Coupon | Create, assign, publish |
| **Content Publishing** | CMS | Pages, blogs, sections, blocks, media |
| **Translation Management** | Translations | Keys, locale packs, sync, export |
| **Notification Templates** | Notifications | Templates, digests, broadcasts, channels |
