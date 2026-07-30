---
document_id: "QUAL-TEST-04"
document_name: "E2E Test Reference"
family: "QUAL-TEST"
document_type: "TEST"
status: "Draft"
version: "0.1"
audience: ["qa", "developer"]
difficulty: "intermediate"
reading_time: 15
business_owner: "QA Manager"
technical_owner: "Lead Developer"
documentation_owner: "QA"
reviewer: "Architect"
approver: "QA Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-DEV-09", "TECH-UX-04"]
  related: ["TECH-MOD-03", "TECH-MOD-01"]
---

# E2E Test Reference (QUAL-TEST-04)

## Framework: Playwright

End-to-end tests use **Playwright** with the **Page Object Model** pattern. Tests live in `e2e/` at the project root.

## Page Object Model

```
e2e/
├── pages/
│   ├── login.page.ts          — Login page interactions
│   ├── booking.page.ts        — Booking flow interactions
│   ├── tournament.page.ts     — Tournament management
│   ├── dashboard.page.ts      — Player dashboard
│   ├── admin/
│   │   ├── users.page.ts      — Admin user management
│   │   ├── settings.page.ts   — System settings
│   │   └── permissions.page.ts — Permission management
│   └── profile.page.ts        — User profile
├── fixtures/
│   └── test-data.ts           — Reusable test data
├── helpers/
│   ├── auth.helper.ts         — Login/session helpers
│   └── db.helper.ts           — Database seed helpers
└── specs/
    ├── auth.spec.ts           — Registration/login flows
    ├── booking.spec.ts        — Booking creation/cancel
    ├── tournament.spec.ts     — Tournament lifecycle
    └── admin.spec.ts          — Admin operations
```

## Critical User Journeys

### JC-AUTH-001: User Registration & Login

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/register` | Registration form displayed |
| 2 | Fill in name, email, phone, password | Fields accepted |
| 3 | Submit registration | User created, redirected to login |
| 4 | Login with credentials | Authenticated, redirected to dashboard |
| 5 | Logout | Session cleared, redirected to login |

### JC-BOOK-001: Full Booking Flow

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Browse facilities `/facilities` | List of orgs displayed |
| 2 | Select branch | Branch detail with resources shown |
| 3 | Select date + resource | Available slots displayed |
| 4 | Select time slot | Booking form with pricing shown |
| 5 | Choose payment (wallet) | Payment processed |
| 6 | Confirm booking | Booking created, confirmation QR shown |
| 7 | View My Bookings | New booking appears in list |
| 8 | Cancel booking | Booking cancelled, refund processed |

### JC-BOOK-002: Tournament Participation

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Browse tournaments | Tournament list displayed |
| 2 | Register for open tournament | Registration confirmed |
| 3 | View my tournaments | Registration shown |
| 4 | (As admin) Generate bracket | Bracket generated, matches created |
| 5 | Enter match score | Score recorded, next round advanced |

### JC-ADMIN-001: Admin User Management

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login as super admin | Admin dashboard displayed |
| 2 | Navigate to Users | User list with filters shown |
| 3 | Search user by name | Filtered results |
| 4 | Edit user role | Role updated, audit logged |
| 5 | View user activity | Activity log displayed |

### JC-NOTIFICATION-001: Notification Delivery

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Perform an action triggering notification (e.g., booking) | Notification created |
| 2 | Navigate to notification center | Notification appears in list |
| 3 | Click notification | Navigated to relevant page |
| 4 | Mark as read | Notification read status updated |

## Test Configuration

Playwright config (`playwright.config.ts`):

```typescript
export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  ],
});
```

## Database Seeding for E2E

Before each E2E run, the test DB is seeded with:
- Reference data (countries, currencies, languages)
- Sample organisations with branches and resources
- Test users (player, coach, org admin, super admin)
- Sample tournaments and academies
- Operating hours and pricing configurations

Seeding script: `node e2e/helpers/seed-e2e.js`
