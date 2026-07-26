# End-to-End Testing Platform

## Architecture

CourtZon's E2E testing platform uses Playwright with TypeScript, Page Object Model (POM), and Playwright Projects to create a scalable, maintainable testing architecture.

```
e2e/
├── playwright.config.ts        # Playwright configuration with projects
├── fixtures/                   # Reusable test fixtures
│   ├── auth.fixture.ts         # Authenticated player/admin fixtures
│   ├── booking.fixture.ts      # Draft/confirmed booking fixtures
│   ├── organisation.fixture.ts # Org/branch/resource fixtures
│   └── payment.fixture.ts      # Payment method/paid booking fixtures
├── pages/                      # Page Object Models
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   ├── BookingPage.ts
│   ├── NotificationPage.ts
│   ├── WalletPage.ts
│   ├── PaymentPage.ts
│   └── MatchPage.ts
├── helpers/                    # Test utilities
│   ├── api.ts                  # Backend REST client
│   ├── database.ts             # Direct DB access for setup/teardown
│   ├── time.ts                 # Date/time utilities
│   └── assertions.ts           # Custom test assertions
├── data/                       # Test data factories
│   ├── users.ts                # User generation
│   └── courts.ts               # Court/resource generation
└── scenarios/                  # Test files grouped by project
    ├── smoke/
    │   ├── health.spec.ts
    │   └── login.spec.ts
    ├── booking/
    │   ├── create-booking.spec.ts
    │   └── cancel-booking.spec.ts
    ├── payments/
    │   └── payment-flow.spec.ts
    ├── realtime/
    ├── notifications/
    │   └── notification-deeplink.spec.ts
    ├── wallet/
    │   └── wallet-topup.spec.ts
    ├── match/
    │   └── public-match.spec.ts
    ├── tournaments/
    ├── academy/
    └── admin/
        └── admin-dashboard.spec.ts
```

## Playwright Projects

| Project | Test Pattern | Dependencies | Timeout | Runs On |
|---------|-------------|--------------|---------|---------|
| `smoke` | `smoke/*.spec.ts` | None | 2 min | Every commit |
| `critical` | `booking/*`, `payments/*`, `notifications/*`, `match/*`, `wallet/*` | smoke | 10 min | Every PR |
| `realtime` | `realtime/*.spec.ts` | smoke | 5 min | Daily |
| `admin` | `admin/*.spec.ts` | smoke | 5 min | Every PR |
| `all` | All `*.spec.ts` | smoke | 20 min | Before release |

## Running Tests

```bash
# Install dependencies
npm install
npx playwright install chromium

# Run smoke tests (fast, runs on every commit)
npx playwright test --project=smoke

# Run critical journeys (runs on every PR)
npx playwright test --project=critical

# Run all E2E tests (before release)
npx playwright test --project=all

# Run a single test file
npx playwright test e2e/scenarios/booking/create-booking.spec.ts

# Run with UI mode (debugging)
npx playwright test --ui

# Run with trace viewer (after failure)
npx playwright show-report test-results/e2e/html
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:3000` | Backend API URL |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL |
| `DB_HOST` | `127.0.0.1` | MySQL host |
| `DB_PORT` | `3307` | MySQL port |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | `courtzon2026` | MySQL password |
| `DB_NAME` | `courtzon_v3` | MySQL database |
| `ADMIN_PASSWORD` | – | Admin account password |
| `CI` | – | Set to `true` in CI |

## Writing Tests

### Best Practices

1. **Every test creates its own data** — never depend on existing database state
2. **No hardcoded sleeps** — use Playwright's built-in waiting mechanisms
3. **Use Page Objects** — never write selectors directly in tests
4. **Stable locators** — prefer `data-testid` attributes, then `aria-label`, then text
5. **Independent tests** — each test can run in isolation
6. **Deterministic** — the same test always produces the same result

### Example Test

```typescript
import { test, expect } from '../../fixtures/auth.fixture';
import { BookingPage } from '../../pages/BookingPage';
import { LoginPage } from '../../pages/LoginPage';

test.describe('Booking creation', () => {
  test('creates a booking successfully', async ({ authenticatedPlayer }) => {
    const { page } = authenticatedPlayer;
    const bookingPage = new BookingPage(page);

    await bookingPage.goto();
    await bookingPage.selectResource(1);
    await bookingPage.selectDate('2026-08-15');
    await bookingPage.selectTimeSlot('10:00');
    await bookingPage.clickBookNow();

    await expect(page).toHaveURL(/\/bookings\/\d+/);
  });
});
```

### Fixtures

Fixtures provide pre-configured test context:

```typescript
// Use the authenticated fixture
test('my test', async ({ authenticatedPlayer }) => {
  const { page, user } = authenticatedPlayer;
  // page is already logged in as 'user'
});

// Use the booking fixture
test('my test', async ({ confirmedBooking }) => {
  const { page, bookingId } = confirmedBooking;
  // page is logged in with a confirmed booking
});
```

### Adding a new scenario

1. Create a new file in the appropriate `scenarios/<category>/` directory
2. Import fixtures from `../../fixtures/`
3. Import page objects from `../../pages/`
4. Import helpers from `../../helpers/`
5. Use `test.describe` to group related tests
6. Each test creates its own data

## Debugging

### Playwright Trace Viewer

When a test fails, Playwright automatically captures a trace (on first retry):

```bash
# View the trace
npx playwright show-trace test-results/e2e/trace/***.zip
```

### Video on Failure

Videos are captured on first retry and stored in `test-results/e2e/video/`.

### Screenshots on Failure

Screenshots are captured on every failure and stored in `test-results/e2e/screenshot/`.

### Interactive Debugging

```bash
# Open Playwright Inspector
npx playwright test --debug

# Run with UI mode
npx playwright test --ui
```

## CI Integration

The E2E test suite is part of the CI pipeline:

```
TypeScript compilation
    ↓
Unit tests (vitest)
    ↓
Integration tests
    ↓
Architecture validators
    ↓
E2E Smoke (2 min, every commit)
    ↓
E2E Critical (10 min, every PR)
    ↓
Architecture health metrics
    ↓
Launch Gate
    ↓
Docker build
    ↓
Deploy
```

Deployment is blocked if any Critical E2E test fails.

### GitHub Actions CI

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: courtzon2026
          MYSQL_DATABASE: courtzon_v3
        ports:
          - 3307:3306
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Build backend
        run: cd backend && npm ci && npm run build

      - name: Start backend
        run: node backend/dist/server.js &
        env:
          DB_HOST: 127.0.0.1
          DB_PORT: 3307

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Run E2E Smoke
        run: npx playwright test --project=smoke
        env:
          BACKEND_URL: http://localhost:3000
          FRONTEND_URL: http://localhost:5173

      - name: Run E2E Critical
        run: npx playwright test --project=critical
        env:
          BACKEND_URL: http://localhost:3000
          FRONTEND_URL: http://localhost:5173

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results
          path: test-results/e2e/
```

## Reporting

| Report Type | Format | Location |
|-------------|--------|----------|
| HTML Report | HTML | `test-results/e2e/html/` |
| JUnit XML | XML | `test-results/e2e/junit.xml` |
| JSON | JSON | `test-results/e2e/results.json` |
| Trace | ZIP | `test-results/e2e/trace/` |
| Video | WebM | `test-results/e2e/video/` |
| Screenshot | PNG | `test-results/e2e/screenshot/` |

## Required User Journeys

- [x] User Login
- [x] Register Player
- [x] Create Booking
- [x] Cancel Booking
- [x] Public Match
- [x] Receive Notification
- [x] Open Notification / Verify Deep Link
- [x] Wallet Top-up
- [x] Card Payment
- [x] Admin Dashboard

## Quality Rules

- [ ] No hardcoded sleeps (`page.waitForTimeout`)
- [ ] All element waits use Playwright's auto-waiting
- [ ] Every interaction goes through a Page Object method
- [ ] No duplicated selectors across test files
- [ ] All locators use `data-testid` or `aria-label` as primary strategy
- [ ] Every test creates its own data
- [ ] Tests are independent (can run in any order)
- [ ] Tests are deterministic (same result every run)
- [ ] CI blocks deployment on critical test failure
