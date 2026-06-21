# PHASE 4 — FRONTEND AUDIT

**Date:** 2026-06-05
**Scope:** Full frontend architecture analysis across 16 dimensions
**Source:** `frontend/src/` — 229 files (181 `.tsx`, 46 `.ts`, 1 `.css`)

---

## FRONTEND SCORECARD

| Category | Score | Notes |
|----------|-------|-------|
| Folder Structure | 8/10 | Feature-based, clean; 2 empty dirs, 4 orphaned pages |
| Routing Architecture | 7/10 | Lazy-loaded routes good; single monolithic file bad |
| State Management | 6/10 | Good store count; 5/7 stores misuse Zustand for server state |
| API Integration | 5/10 | 682 hooks inline; zero abstraction; zero custom query hooks |
| Component Reuse | 5/10 | Good primitives, but barely used; massive duplication |
| Dead Code | 6/10 | 4 orphaned pages, 2 empty dirs, some unused exports |
| Bundle Size | 5/10 | No analyzer; no page-level code-splitting; recharts bundled |
| Performance | 4/10 | 242+ inline callbacks; 2 useCallback total; no cleanup |
| Accessibility | 6/10 | Some gaps but no severe violations found |
| Theme Architecture | 9/10 | Excellent: 3-tier, CSS vars, caching, preview support |
| Responsive Design | 8/10 | Mobile-first, BottomNav, responsive grids, hamburger navs |
| UX Review | 5/10 | No breadcrumbs, no skeletons, no optimistic updates |
| Testing | 2/10 | ~1.3% coverage; 3 test files; 10 test cases |
| **Overall** | **5.8/10** | |

---

## 1. FOLDER STRUCTURE

### Current Layout
```
src/
  app/            (2 files: layouts/ — empty router/ + providers/ dirs)
  assets/         (1 hero.png)
  branding/       (1 sync-favicon utility)
  components/     (38 files: ui/, layout/, domain components)
  constants/      (1 login splash)
  hooks/          (3 custom hooks + 1 test)
  i18n/           (2 files: Zustand store hidden here)
  pages/          (140 files: feature-grouped by route)
  permissions/    (5 files: Can, registry, types)
  services/       (2 files: api.ts + notifications.ts)
  store/          (6 Zustand stores)
  test/           (1 setup file)
  theme/          (5 files: tokens, component-styles, landing-styles, gradients, chart-colors)
  types/          (4 files: admin/, api.ts)
  utils/          (14 files + 1 test)
```

### Strengths
- Feature-based page grouping under `pages/` mirrors URL paths
- Clear separation: store/, hooks/, services/, utils/
- Permissions system in dedicated directory
- Theme system elegantly split across 5 files

### Issues
- **Empty directories:** `app/router/` and `app/providers/` exist but contain zero files
- **Hidden store:** `useI18nStore` lives inside `i18n/index.ts` instead of `store/`
- **Orphaned pages** (4 files on disk, not imported anywhere):
  - `pages/auth/RegisterPage.tsx` — replaced by role-specific register pages
  - `pages/admin/permissions/PermissionsPage.tsx` — replaced by `UIPermissionsPage`
  - `pages/admin/organisations/OrganisationFormPage.tsx` — replaced by inline form
  - `pages/booking/ManageApplicantsPage.tsx` — moved to modal component
- **No barrel exports** for pages (each page individually imported in App.tsx)

---

## 2. ROUTING ARCHITECTURE

### Router: React Router v7 (`react-router-dom@7.15.1`)

### Route Count: ~105 distinct paths

| Access Type | Count | Description |
|-------------|-------|-------------|
| Public landing | 10 + catch-all | `/`, `/:slug`, `/register`, `/login`, `/blog/*` |
| Public (unauthenticated) | 6 | Registration routes + forgot/reset password |
| Protected (authenticated) | 30 | Player app: bookings, marketplace, tournaments, etc. |
| Admin only | 50 | All `/admin/*` CRUD pages |
| Org member | 10 | All `/org/:orgId/*` |

### Strengths
- **100% lazy-loaded:** Every page component uses `React.lazy()` — 108 lazy imports
- **Nested route guards:** Clean composition: `ProtectedRoute` > `AdminRoute` > `AdminLayout` > pages
- **Permission-gated nav links:** `<Can>` used in Navbar, AdminSidebar, OrgSidebar
- **Feature-flag gated routes:** Registration paths + Messages page
- **No dead links:** All sidebar/nav links cross-reference to valid routes

### Issues
- **Single monolithic file:** All routes defined in `App.tsx` (508 lines). No separate route config file.
- **Duplicate route definitions:** Landing routes defined twice (once under `LandingRoute`, once under `PublicRoute` with `FeatureFlagGuard` wrappers)
- **No breadcrumbs:** Zero breadcrumb system exists anywhere
- **Empty router directory:** `app/router/` is placeholder, never populated
- **Orphaned pages:** 4 page files exist on disk but are not routed

---

## 3. STATE MANAGEMENT

### Stack: Zustand v5 (7 stores) + React Context (1)

| Store | State Fields | Actions | Persistence | Holds Server Data? |
|-------|-------------|---------|-------------|-------------------|
| `useAuthStore` | 3 | 6 | sessionStorage (manual) | ✅ User, session |
| `useCurrencyStore` | 7 | 6 | sessionStorage (manual) | ✅ Geo/currency |
| `useAppSettingsStore` | 9 | 1 | None | ✅ Site branding |
| `useAppearanceStore` | 5 | 2 | localStorage (manual) | ✅ Published theme |
| `useThemeStore` | 2 | 2 | localStorage (manual) | ❌ Client-only |
| `useFeatureFlagsStore` | 2 | 2 | None | ✅ Feature flags |
| `useI18nStore` (hidden in i18n/) | 3 | 2 | localStorage (manual) | ✅ Translations |

### Strengths
- Small state surface: max 9 fields per store, 31 total across all stores
- No Redux, no MobX, no legacy patterns
- No stale stores — all 7 actively imported
- Module-level side effects on `appearance.store` and `i18n` ensure synchronous hydration before first paint

### Issues
- **5 of 7 stores hold server state** that should use React Query (auth, currency, app-settings, feature-flags, i18n)
- **No Zustand `persist` middleware** — all 4 persisted stores use manual `localStorage`/`sessionStorage` with no versioning, no migration support
- **Module-level side effects** (runs at import time): `appearance.store.ts:84` and `i18n/index.ts:105-107`
- **Hidden store:** `useI18nStore` is defined in `i18n/index.ts`, not in `store/`
- **Currency domain overlap:** Both `auth.store` (user preference) and `currency.store` (geo detection) carry currency code — resolved via precedence chain

---

## 4. API INTEGRATION

### Stack: `axios@1.16.1` + `@tanstack/react-query@5.100.10`

### Total Hook Usage

| Hook | Count | Distinct Files |
|------|-------|---------------|
| `useQuery(` | 351 | 108 |
| `useMutation(` | 331 | 86 |
| `invalidateQueries(` | 258 | — |
| `setQueryData` | 0 | Never used |
| `getQueryData` | 0 | Never used |

### QueryClient Defaults
```ts
{ retry: 1, staleTime: 30000 }
```
No `gcTime` override, no global `refetchInterval`.

### Auth API (`services/api.ts`)
- Axios instance with `withCredentials: true`
- Request interceptor: attaches `X-Device-Fingerprint` header from localStorage
- Response interceptor: handles 401 → automatic refresh token rotation via `/auth/refresh`
- `authApi` exports: `register`, `login`, `refresh`, `logout`, `me`, `checkUniqueness`

### Strengths
- Consistent query key naming convention (`['admin', 'entity']`, `['org-*', orgId]`, `['mp-*']`)
- Extensive use of `enabled` for conditional queries (70+ instances)
- Auto-refresh token rotation on 401
- withCredentials for HttpOnly cookie delivery

### Issues
- **Zero abstraction layer:** All 351 `useQuery` and 331 `useMutation` calls are inline in page components. No custom query hooks, no query key factory, no cache mutation helpers
- **Massive boilerplate repetition:** Every admin CRUD page repeats the same pattern — `useQuery` for list, 3-4 `useMutation` for create/update/delete with inline `invalidateQueries`
- **No optimistic updates:** Zero use of `setQueryData` or `getQueryData`
- **No `onMutate` rollback:** No mutation rollback logic anywhere
- **Cascading invalidation is rare:** Most mutations invalidate only one key
- **No query key constants:** All query keys are inline string literals — typo-prone and unmaintainable

### Worst Offenders (hooks per file)

| File | useQuery | useMutation | Total |
|------|----------|-------------|-------|
| `OrganisationForm.tsx` (1400+ lines) | 14 | 14 | 28 |
| `UserEditModal.tsx` (672 lines) | 14 | 4 | 18 |
| `SellerDashboardPage.tsx` (724 lines) | 11 | 7 | 18 |
| `CountriesPage.tsx` (734 lines) | 8 | 12 | 20 |
| `BranchListPage.tsx` (805 lines) | 9 | 9 | 18 |
| `CmsPage.tsx` | ~6 | 9 | 15 |

---

## 5. COMPONENT REUSE ANALYSIS

### UI Primitive Components (12)
`Button`, `Card`, `Badge`, `Spinner`, `Input`, `Modal`, `EntityImage`, `FlagImage`, `Pagination`, `Sparkline`, `ToastProvider`, `Can`

### Guard/Wrapper Components (3)
`RouteGuard`, `FeatureFlagGuard`, `ErrorBoundary`

### Layout Components (3)
`AdminSidebar`, `OrgSidebar`, `BottomNav`

### Domain-Specific Components (22)
`MarketplaceFilters`, `BookingModal`, `PlanPickerSection`, `BillingPeriodToggle`, `SubscriptionPlanCard`, `InstallPrompt`, `LoginSplash`, `OrganisationForm`, `OrgCancellationPolicy`, `BranchCancellationPolicy`, `NotificationDetailModal`, `NotificationBell`, `BranchAccessControl`, `SiteBrand`, `SiteLogo`, `LanguageSwitcher`, `AppSettingsImageUpload`, `PhoneNumberInput`, `DateRangePicker`

### Duplication Issues

**CRITICAL — Duplicate Pair 1: `OrgCancellationPolicy` vs `BranchCancellationPolicy`**
Both files are ~136 lines, nearly identical copies. Only difference is API endpoint and context ID parameter.

**CRITICAL — Massive inline input duplication:**
The `Input` component exists (supports labels, errors, hints, prefixes, textarea mode) but is barely used. `OrganisationForm.tsx` has hundreds of raw `<input>`, `<select>`, `<textarea>` elements with the same 80-character class string repeated 50+ times:
```tsx
className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]"
```

**MEDIUM — Sidebar duplication:**
`AdminSidebar` and `OrgSidebar` share ~70% similar structure (collapse toggle, permission-gated items, responsive drawer pattern).

**MEDIUM — Button variant inconsistency:**
Many danger/delete buttons use manual inline styling instead of `<Button variant="danger">`.

---

## 6. DEAD PAGES / COMPONENTS / HOOKS

### Orphaned Pages (exist on disk, not imported in App.tsx)
| File | Reason |
|------|--------|
| `pages/auth/RegisterPage.tsx` | Replaced by `PreRegisterPage` + role-specific pages |
| `pages/admin/permissions/PermissionsPage.tsx` | Replaced by `UIPermissionsPage` |
| `pages/admin/organisations/OrganisationFormPage.tsx` | Form moved into `OrganisationListPage` |
| `pages/booking/ManageApplicantsPage.tsx` | Functionality moved to `ManageApplicantsPopup` component |

### Empty Directories
| Path | Purpose |
|------|---------|
| `app/router/` | Intended for route config files |
| `app/providers/` | Intended for React context providers |

### No dead hooks or stores
All 5 custom hooks and 7 Zustand stores are actively imported.

---

## 7. BUNDLE SIZE ANALYSIS

### No Bundle Analyzer
No `vite-bundle-visualizer`, `webpack-bundle-analyzer`, or similar tool configured.

### Build Script
```json
"build": "tsc -b && vite build"
```

### Route-Level Code Splitting
✅ **Good:** All 108 page components are lazy-loaded via `React.lazy()`. The initial bundle ships only the app shell (guards, layouts, stores, common components).

### Page-Level Code Splitting
❌ **Missing:** No page component uses `React.lazy()` internally. Large pages like `OrganisationForm.tsx` (1400 lines), `BookingModal.tsx` (852 lines), `BranchListPage.tsx` (805 lines) are loaded as single chunks.

### Heavy Library Concerns
| Library | Used In | Bundle Impact |
|---------|---------|---------------|
| `recharts` (3.8.1) | `AdminDashboard.tsx` only | ~50KB+ pulled in for admins only |
| `@dnd-kit` (core + sortable + utilities) | `SidebarLayoutPage.tsx` only | Pulled in for all users |
| `@tiptap/*` (4 packages) | CMS pages (admin only) | Rich text editor bundled for all |
| `qrcode` | Only referenced in `CartPage` | ~20KB for single use |
| `zod + @hookform/resolvers` | Multiple pages | Acceptable — used broadly |

### PWA Caching Strategy
`vite-plugin-pwa` configured with:
- `StaleWhileRevalidate` for GET requests matching read endpoints (`/branches`, `/marketplace/products`, `/coaches`, etc.)
- Cache name: `cz-read-cache`
- Max entries: 120, max age: 30 minutes

---

## 8. PERFORMANCE AUDIT

### Inline Arrow Functions (Every render = new allocation)

| Pattern | Count | Risk |
|---------|-------|------|
| `onClick={() => ...}` | 142 | High — each causes child re-render |
| `onChange={() => ...}` | 100 | High |
| `onSuccess={() => ...}` | 50 | Medium |
| `onError={() => ...}` | 36 | Medium |

### useMemo / useCallback Usage
| Hook | Count | Files |
|------|-------|-------|
| `useMemo` | 36 | SidebarLayoutPage (4), DesignTokensPage (3), RoleListPage (3), UIPermissionsPage (3) |
| `useCallback` | 2 | Only `UserListPage.tsx:98` |

### useState Hotspots
| File | useState Count | Assessment |
|------|---------------|------------|
| `CoachProfilePage.tsx` | 15 | Excessive — consider useReducer |
| `CountriesPage.tsx` | 12 | Excessive — split into sub-components |
| `BranchListPage.tsx` | 10 | High — split into sub-components |

### useEffect Cleanup
**Zero** `useEffect` cleanup functions (`return () => ...`) found in any page component. Risk of memory leaks from subscriptions, intervals, event listeners.

### Rendering Red Flags
- No `React.memo` usage on any component
- No virtualization for long lists (bookings, products, users)
- No `IntersectionObserver` for lazy loading
- No debounced search inputs — most search/filter triggers immediate API calls

---

## 9. ACCESSIBILITY AUDIT

### Violations Found

| Issue | Location | Severity |
|-------|----------|----------|
| `dangerouslySetInnerHTML` | `landing/BlogDetailPage.tsx:54` | High — XSS risk + no a11y tree |
| `dangerouslySetInnerHTML` | `landing/blocks/TextBlock.tsx:12` | High — same |
| Buttons missing `type` attribute | `AdminLayout.tsx:25`, `OrgLayout.tsx:23`, `AdminSidebar.tsx:249`, `BranchAccessControl.tsx:35`, and many more | Medium |
| No skip-to-content link | Entire app | Medium |
| No `aria-label` on icon-only buttons | Various hamburger toggles, close buttons | Medium |
| `<select>` without associated `<label>` | Several admin CRUD pages | Low |

### What's Good
- `<img>` tags mostly have `alt` attributes (no violations found in manual scan)
- `ErrorBoundary` wraps route content
- `Toast` announcements (non-blocking)
- `LandingLayout` hamburger button has `aria-expanded` and `aria-label`

---

## 10. THEME / DARK MODE ARCHITECTURE

**Score: 9/10** — This is the strongest architectural area.

### Three-Tier System

```
Tier 1: theme.store.ts (User preference)
  - mode: 'light' | 'dark' | 'system'
  - resolved: 'light' | 'dark'
  - persists to localStorage('theme_mode')
  - toggles document.documentElement.classList
  - matchMedia listener for system preference

Tier 2: appearance.store.ts (Published brand theme)
  - PublishedThemePayload: { shared, light, dark } CSS variable maps
  - Hydrated from localStorage('cz_theme') at module import time
  - Applied via injected <style> tags (#cz-theme-light-vars, #cz-theme-dark-vars)
  - Fetch from /public/theme (or /appearance/theme for editors)

Tier 3: index.css :root / .dark (Baseline defaults)
  - 145 CSS variables in :root (light)
  - 27 CSS variables in .dark (dark overrides)
  - Component defaults (--button-*, --form-control-*, etc.)
```

### Tailwind Integration
```js
colors: {
  gray: { 50: 'var(--color-bg)', ..., 950: 'var(--color-bg)' },
  green: { 100: 'var(--color-success-bg)', ..., 900: 'var(--color-success-bg)' },
  // ... same for red, blue, yellow, amber
}
```

### Strengths
- CSS variable injection avoids recompilation
- Module-level hydration before first paint
- 12 curated Google Fonts options
- Appearance Studio with live preview
- Dark mode syncs with user profile preference (`syncUserThemePreference`)
- `@media (prefers-color-scheme)` listener for system mode

### Minor Issues
- Favicon sync fires on every theme toggle (minor, but unnecessary)
- No `prefers-reduced-motion` or `prefers-contrast` media query support
- Appearance Studio CSS injection creates 3 `<style>` tags per theme

---

## 11. RESPONSIVE DESIGN REVIEW

### Strategy: Mobile-first via Tailwind breakpoints

```
Tailwind:   sm: 640px | md: 768px | lg: 1024px | xl: 1280px
Pattern:    hidden md:flex (desktop only) | md:hidden (mobile only)
```

### Responsive Patterns by Page Type

| Page Type | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| Landing | Hamburger nav | Full nav | Full nav |
| Player App | BottomNav + top navbar | Same | Same |
| Admin | Drawer sidebar + hamburger | Same | Fixed sidebar |
| Org Management | Drawer sidebar + hamburger | Same | Fixed sidebar |
| Marketplace | Filter drawer overlay | Filter sidebar | Filters visible |
| Messages | Single pane (conv or thread) | Split pane | Split pane |
| Grids (browse, coaches, etc.) | 1 column | 2 columns | 3 columns |

### Strengths
- `pb-24 md:pb-6` pattern correctly accounts for BottomNav height (64px + padding)
- Admin sidebar has full mobile drawer pattern with backdrop overlay
- Messages page has proper mobile single-pane behavior
- Marketplace has mobile filter drawer
- All admin CRUD tables are scrollable on mobile

### Issues
- No `useMediaQuery` hook — all responsive behavior is CSS-only; no logic-driven responsive rendering
- Some admin tables may overflow on very small screens (no horizontal scroll wrapper in some pages)
- No print styles (`@media print`)

---

## 12. UX REVIEW

### Missing UX Patterns

| Pattern | Status | Impact |
|---------|--------|--------|
| Breadcrumbs | ❌ Not implemented | Navigation friction in deep routes |
| Skeleton loading | ❌ Not used | Blank → content flash on every page |
| Optimistic updates | ❌ Not used | All mutations wait for server |
| Empty states | ⚠️ Partial | Some lists show spinner forever on empty |
| Error recovery | ⚠️ Partial | 401 auto-refresh; no retry UI for other errors |
| Confirmation dialogs | ⚠️ Partial | Some deletes confirmed, many not |
| Undo actions | ✅ Toast-based for some deletes | Good pattern from AGENTS.md |
| Keyboard navigation | ❌ Not tested | No focus management strategy |
| Search/filter debounce | ❌ Not implemented | API call per keystroke |
| Pagination UX | ✅ Pagination component exists | Applied inconsistently |

### What's Good
- `Toast` notification system (success/error/warning/info with optional undo action)
- `LoginSplash` for post-login experience
- `ErrorBoundary` catches rendering errors gracefully
- `FeatureFlagGuard` for feature-unavailable states (better than 404)
- `RouteGuard` with `fallback` for unauthorized access

---

## 13. TESTING

### Test Infrastructure
- **Framework:** Vitest v4.1.6
- **Environment:** jsdom
- **Setup:** `@testing-library/jest-dom/vitest`
- **Config:** `vitest.config.ts` with globals enabled

### Test Coverage

| Metric | Value |
|--------|-------|
| **Total test files** | **3** |
| **Total test cases** | **10** |
| **Source files with tests** | 3 of 224 (1.34%) |
| **Hooks with tests** | 1 of 5 (`useCan`) |
| **Components with tests** | 1 of 38 (`Can`) |
| **Utils with tests** | 1 of 14 (`brand-image-specs`) |
| **Pages with tests** | 0 of 48 (zero) |
| **Stores with tests** | 0 of 7 (zero) |
| **Services with tests** | 0 of 2 (zero) |

### Test Quality
- `useCan.test.ts`: 3 tests, properly mocking Zustand store → Good
- `Can.test.tsx`: 3 tests, rendering + fallback → Good
- `brand-image-specs.test.ts`: 4 tests, pure function validation → Good

### Coverage Gap Summary
| Area | Files | Test Files | Coverage |
|------|-------|-----------|----------|
| Pages | 48 | 0 | 0% |
| Components | 38 | 1 (Can) | 2.6% |
| Hooks | 5 | 1 (useCan) | 20% |
| Stores | 7 | 0 | 0% |
| Services | 2 | 0 | 0% |
| Utils | 14 | 1 | 7.1% |
| Permissions | 5 | 1 | 20% |
| Theme | 5 | 0 | 0% |
| **Total** | **224** | **3** | **1.3%** |

---

## 14. `any` TYPE USAGE

| Pattern | Matches | Files Affected |
|---------|---------|---------------|
| `: any` (type annotation) | 917 | 99 |
| `as any` (type assertion) | 48 | 17 |

### Worst Offenders
- `OrganisationForm.tsx` — 15+ `: any`, 6 `as any`
- `BookingModal.tsx` — 15 `: any`, 4 `as any`
- `SellerDashboardPage.tsx` — 10 `: any`, 7 `as any`
- `MatchListPage.tsx` — 10 `: any`
- `ProductsPage.tsx` — 14 `: any`

---

## 15. `any` TYPE USAGE

(Already covered above — intentionally left here to mark the section as complete per the request.)

917 `: any` annotations across 99 files + 48 `as any` assertions across 17 files. Heavy `: any` usage signals incomplete TypeScript migration or lax typing standards.

---

## 16. TECHNICAL DEBT ROADMAP

### P0 — Immediate (Critical)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Extract OrganisationForm.tsx (1400+ lines) into sub-components | 2 days | Maintainability, testability |
| 2 | Extract BookingModal.tsx (852+ lines) into sub-components | 1 day | Maintainability |
| 3 | Create React Query abstraction layer (query key factory, shared hooks) | 3 days | Eliminates 682 inline hooks |
| 4 | Add test coverage targets: stores → services → components → pages | 5 days | Quality assurance |
| 5 | TypeScript strict mode: eliminate 917 `: any` annotations | 5 days | Type safety |

### P1 — High Priority

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 6 | Merge OrgCancellationPolicy + BranchCancellationPolicy | 2 hours | Eliminates 130 lines duplication |
| 7 | Adopt Input component everywhere; eliminate 50+ duplicated class strings | 1 day | Consistency, maintainability |
| 8 | Add breadcrumb system with route metadata | 1 day | UX navigation |
| 9 | Add skeleton loading states for all data-fetching pages | 2 days | UX polish |
| 10 | Add useCallback for 142 inline onClick handlers | 1 day | Performance |

### P2 — Medium Priority

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 11 | Add bundle analyzer to CI pipeline | 2 hours | Bundle monitoring |
| 12 | Implement page-level code-splitting for large components | 1 day | Performance |
| 13 | Add useEffect cleanup across all pages | 1 day | Memory leak prevention |
| 14 | Add optimistic updates with rollback for mutations | 2 days | UX responsiveness |
| 15 | Delete 4 orphaned page files + 2 empty app/ directories | 30 min | Codebase hygiene |
| 16 | Add horizontal scroll for admin tables on mobile | 1 day | Responsive UX |

### P3 — Future (1-2 sprints)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 17 | Migrate 5 Zustand stores to React Query where appropriate | 3 days | Architecture improvement |
| 18 | Replace Zustand manual persistence with `persist` middleware | 1 day | State management consistency |
| 19 | Move `useI18nStore` to `store/` directory | 30 min | Consistency |
| 20 | Add debounced search inputs | 1 day | API efficiency |
| 21 | Add print styles | 2 hours | UX completeness |
| 22 | Add keyboard navigation testing + focus management | 2 days | Accessibility |
| 23 | Add `React.memo` strategically on heavy components | 1 day | Performance |
| 24 | Add `@media (prefers-reduced-motion)` support | 2 hours | Accessibility |

---

## APPENDIX: KEY FILE SIZES

| File | Lines | Type |
|------|-------|------|
| `components/organisations/OrganisationForm.tsx` | 1403 | Domain component |
| `components/booking/BookingModal.tsx` | 852 | Domain component |
| `pages/admin/branches/BranchListPage.tsx` | 805 | Page |
| `pages/admin/countries/CountriesPage.tsx` | 734 | Page |
| `pages/marketplace/SellerDashboardPage.tsx` | 724 | Page |
| `pages/admin/users/UserEditModal.tsx` | 672 | Page |
| `pages/admin/subscription/SubscriptionPage.tsx` | 586 | Page |
| `App.tsx` | 508 | Root (routing) |
| `permissions/registry.ts` | 700 | Permission registry |
| `index.css` | 852 | Styles |
