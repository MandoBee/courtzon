# 16 — FRONTEND AUDIT

**Audit:** 2026-10-04 · Sources: `frontend/src/App.tsx`, stores, services, registry, i18n, PWA, tests (100 files).

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Routing (verified in App.tsx)

- Layouts: LandingLayout (public) / PublicRoute / ProtectedRoute→AppLayout / CoachLayout / RefereeLayout / AdminLayout / OrgLayout.
- Special: `/payments/return` + `/tournaments/public*` outside the auth guards (intentional).
- Legacies: `/academies` → `/academy` redirect; `/wallet/withdraw`; org portal path helper.
- Code-split: all pages lazy-loaded.

## 2. State management

- ✅ Zustand: auth (`auth.store.ts`), theme, workspace (role switching), currency, appearance, feature-flags, app-settings.
- ✅ Server state: TanStack Query (`lib/queryClient.ts`), per-domain hooks.
- ✅ Realtime cache invalidation (`RealtimeCacheUpdater`).
- ⚠️ `auth.store.checkAuth` + proactive refresh every N ms (permissions refresh) — until refresh, newly-granted permissions may gate visibility late.

## 3. API layer (verified `services/api.ts`)

- axios `withCredentials`; baseURL resolution (same-origin under nginx; `http://127.0.0.1:3000` on https-localhost); `X-Device-Fingerprint`; FormData content-type handling.
- 401 interceptor → single-flight `/auth/refresh` → retry original; on INVALID_REFRESH_TOKEN/SESSION_EXPIRED → dispatch `auth:logout`.
- ⚠️ Interceptor does **not** hard-reload on `/auth/me` 401 (documented) — any stale `/auth/me` consumer should rely on store.

## 4. Auth state & RBAC

- ✅ user object carries `roles[]`, `permissions[]`, `organisations[]`.
- ✅ `<Can>` + `useCan` + FeatureFlagGuard.
- ❌ `ProtectedRoute`/`AdminRoute` route guards use hardcoded role list (`super-admin|super_admin|admin|master-admin|accountant`) → admin shell visible to accountant; any org-user with those role names would get admin too. **Recommended: permission-based home resolution.**

## 5. Forms & validation

- ✅ react-hook-form + zod; per-form schemas (huge form surface): org forms, user edit modal, booking form, membership forms, marketplace forms.
- ⚠️ Field-level permissions (`users.edit.first-name`, etc.) implemented in registry (201 field keys per status July) — verify per screen coverage during UAT.
- ❓ Every input masked by `elementType:'field'`? Not all form fields globally audited — flagged as TODO in UAT checklist.

## 6. Errors / loading / empty states

- ✅ Toast system (`components/ui/Toast.tsx` — success/error/warning/info + undo action).
- ✅ `ErrorBoundary`, `PageLoader`, `SplashScreen`, `OfflineBanner`, `ConnectionStatus`.
- 🟡 Empty states inconsistent across 100s of pages (some show text, some nothing). Enumerate in UAT.

## 7. Realtime

- ✅ ConnectionStatus, socket context, cache updater, useResourceRoom.
- 🟡 Room join coverage varies per page — see 15.

## 8. PWA / Offline

- ✅ vite-plugin-pwa, manifest, service worker; InstallPrompt/IOSInstallSheet/PWAUpdatePrompt/PushSubscriptionManager.
- 🟡 Offline = shell only; data requires network (no offline queue). Handle network-sim tests → stale.

## 9. Responsive

- ✅ BottomNav mobile + `cz-pb-safe` safe-area + `md:` breakpoints + AppLayout main constraints.
- ✅ Modal `mb-16 md:mb-0` clearance.

## 10. Findings

| # | Issue | Severity |
|---|---|---|
| F1 | Hardcoded role gates in guards (`App.tsx`) | MED |
| F2 | `auth.store` proactive refresh interval — non-deterministic permission freshness | LOW |
| F3 | i18n keys live in generated `translation-keys.registry.ts` — hand-edits clobbered by boot sync | LOW |
| F4 | No global empty-state component | LOW |
| F5 | A handful of screens rely on manual refresh (match/queue pages) — confirm | 🟡 |
| F6 | snake_case vs camelCase: backend responses camelCased; some raw JSON passthrough exists in admin tables (e.g. orders render `payment_status` camel) — consistent overall | LOW |
| F7 | Form field RBAC coverage unverified per-screen | 🟡 |
| F8 | PWA offline behavior not network-tested | 🟡 |

## 11. Recommended frontend work

1. Convert route guards to `can('admin.dashboard.view')` style.
2. Add global `EmptyState`/`ErrorState`.
3. UAT matrix for form-field permissions on all edit screens.
4. Network-sim (offline/back/reload) tests.
5. Map pages → rooms (join coverage) in realtime audit.