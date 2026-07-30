---
document_id: "TECH-UX-01"
document_name: "Design System Overview"
family: "TECH-UX"
document_type: "UX"
status: "Draft"
version: "1.0"
audience: ["developer", "designer"]
difficulty: "beginner"
reading_time: 15
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Design System Overview (TECH-UX-01)

## Design System Principles

1. **CSS Custom Properties First** — All colors, spacing, typography, and component styles use `var(--property-name)` for runtime theming
2. **Permission-Aware** — Every UI element can be gated by permission keys via `<Can permission="key">`
3. **Consistent Component API** — All UI components follow a uniform prop interface (variant, size, className)
4. **Mobile-First with Responsive Breakpoints** — `md:` prefix for tablet/desktop overrides
5. **Dark Mode Ready** — The entire design system supports light/dark via a single `dark` class on `<html>`
6. **Safe Area Aware** — Bottom-positioned elements use `cz-pb-safe` for iOS home indicator

## Component Library

All components live in `frontend/src/components/ui/`.

### Button

| Prop | Values | Default |
|------|--------|---------|
| `variant` | `primary` | `secondary` | `danger` | `ghost` | `primary` |
| `size` | `sm` | `md` | `lg` | `md` |
| `loading` | `boolean` | `false` |

**Source:** `frontend/src/components/ui/Button.tsx`

Style uses CSS custom properties:
- `bg-[var(--color-primary)] text-white` for primary
- `cz-btn-secondary border text-[var(--color-text)]` for secondary
- `bg-[var(--color-error)] text-white` for danger
- `text-[var(--color-text-muted)]` for ghost

### Card

```
<Card>
  {/* children */}
</Card>
```

- Default padding: `var(--card-padding)` (24px)
- Border radius: `var(--card-border-radius)` (16px)
- Shadow: `var(--card-shadow)` (var(--shadow-md))

**Source:** `frontend/src/components/ui/Card.tsx`

### Input

```
<Input
  label="Full Name"
  name="fullName"
  type="text"
  error="This field is required"
/>
```

Form control tokens:
- `--form-control-height`: 42px
- `--form-control-font-size`: 14px
- `--form-control-border-radius`: var(--radius-md)
- `--form-control-focus-ring-color`: var(--color-primary)

**Source:** `frontend/src/components/ui/Input.tsx`

### Select

```
<Select
  label="Country"
  name="countryId"
  options={countries}
/>
```

Uses the same form control tokens as Input.

**Source:** `frontend/src/components/ui/Input.tsx` (shared styles)

### Table

```
<Table>
  <thead>...</thead>
  <tbody>...</tbody>
</Table>
```

Tokens:
- `--table-cell-padding-x`: 12px
- `--table-cell-padding-y`: 10px
- `--table-font-size`: 14px
- `--table-header-font-weight`: 600
- `--table-row-hover-bg`: var(--color-primary-bg)

### Modal

```
<Modal open={open} onClose={handleClose} title="Title" variant="sheet" size="md">
  {/* content */}
</Modal>
```

| Prop | Values |
|------|--------|
| `variant` | `center` | `sheet` |
| `size` | `sm` | `md` | `lg` | `xl` | `full` |
| `title` | string (displayed in header) |

- Border radius: `var(--modal-border-radius)` (16px)
- Overlay opacity: `var(--modal-overlay-opacity)` (0.5)
- Mobile margin-bottom: `mb-16` (clears BottomNav)
- Z-index: `z-[70]`

**Source:** `frontend/src/components/ui/Modal.tsx`

### Badge

```
<Badge variant="success">Active</Badge>
```

| Variant | Color |
|---------|-------|
| `success` | `--color-success-bg` / `--color-success-text` |
| `warning` | `--color-warning-bg` / `--color-warning-text` |
| `error` | `--color-error-bg` / `--color-error-text` |
| `info` | `--color-info-bg` / `--color-info-text` |

- Border radius: `var(--badge-border-radius)` (9999px — pill shape)
- Font size: `var(--badge-font-size)` (12px)

**Source:** `frontend/src/components/ui/Badge.tsx`

### Pagination

```
<Pagination currentPage={page} totalPages={total} onPageChange={setPage} />
```

**Source:** `frontend/src/components/ui/Pagination.tsx`

### Skeleton

```
<Skeleton className="h-4 w-24" />
<Skeleton variant="circular" className="h-10 w-10" />
<Skeleton variant="text" />
```

**Source:** `frontend/src/components/ui/Skeleton.tsx`

### Spinner

```
<Spinner size="md" />
<Spinner size="sm" color="primary" />
```

**Source:** `frontend/src/components/ui/Spinner.tsx`

### Toast

```
import { useToast } from '../../components/ui/Toast';

const { showToast } = useToast();
showToast('Saved successfully!');           // success (4s)
showToast('Error occurred', 'error');        // error (5s)
showToast('Warning!', 'warning');            // warning (4s)
showToast('Info message', 'info');           // info (4s)
showToast('Deleted. Undo?', 'warning', { label: 'Undo', onClick: undoFn });
```

| Type | Default Duration | CSS Class |
|------|-----------------|-----------|
| `success` | 4s | `bg-[var(--color-success-bg)] text-[var(--color-success-text)]` |
| `error` | 5s | `bg-[var(--color-error-bg)] text-[var(--color-error-text)]` |
| `warning` | 4s | `bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]` |
| `info` | 4s | `bg-[var(--color-info-bg)] text-[var(--color-info-text)]` |

**Source:** `frontend/src/components/ui/Toast.tsx`

**Rule:** Every create/update/delete mutation must show success toast in `onSuccess` and error toast in `onError`.

## Theme System

### CSS Custom Properties

All theme values are defined as CSS custom properties on `:root` (light) and `.dark` (dark overrides). The `dark` class on `<html>` swaps the property values.

```
:root {
  --color-bg: #F9FAFB;
  --color-surface: #FFFFFF;
  --color-text: #111827;
  --color-primary: #059669;
  ...
}

.dark {
  --color-bg: #111827;
  --color-surface: #1F2937;
  --color-text: #F9FAFB;
  --color-primary: #10B981;
  ...
}
```

**Source:** `frontend/src/index.css:5-39`

### Change Mechanism

```
document.documentElement.classList.remove('light', 'dark');
document.documentElement.classList.add(resolved);
```

**Source:** `theme.store.ts:23-28` — `applyTheme()` function.

### Theme Store

Zustand store with mode (`light` | `dark` | `system`) and resolved (`light` | `dark`).

```
const { mode, resolved, setMode, init } = useThemeStore();
```

- `system` mode listens to `prefers-color-scheme` media query
- Toggle does NOT clear published appearance studio themes

**Source:** `frontend/src/store/theme.store.ts`

### Appearance Studio

Published themes drive CSS variables via the Appearance Studio (admin UI at `/admin/design-tokens`). The `appearance.store.ts` fetches published theme and applies it as CSS custom properties on `:root`.

**Note:** User light/dark toggle must not clear published schemes (`theme.store.ts`).

## Layout System

### AppLayout

**Purpose:** Main consumer-facing layout for players and general users.

```
<AppLayout>
  <LoginSplash />
  <WelcomeModal />
  <OfflineBanner />
  <Navbar />                          ← sticky top
  <main className="pb-24 md:pb-6 cz-pb-safe">
    <Outlet />
  </main>
  <BottomNav />                       ← fixed bottom, z-[60], md:hidden
</AppLayout>
```

- Routes: 29 consumer routes (dashboard, bookings, marketplace, coaches, etc.)
- Mobile: BottomNav with 5 core tabs + "More" sheet
- Desktop: No BottomNav; standard top navbar
- Z-index: BottomNav is `z-[60]` (above all overlays)

**Source:** `App.tsx:427-441`

### AdminLayout

**Purpose:** Admin management panel.

- Collapsible sidebar (`w-64` expanded, `w-16` collapsed)
- 25+ nav items organized in sections (Organisations, Roles, Marketplace, CRM, HR, etc.)
- No BottomNav
- Sidebar items permission-gated per item

**Source:** `components/layout/AdminSidebar.tsx` / `app/layouts/AdminLayout.tsx`

### OrgLayout

**Purpose:** Organization management (sellers, facility managers).

- Collapsible sidebar with 24 nav items
- Items filtered by `org.sidebar.*` permission keys
- No BottomNav
- Each org has its own URL namespace: `/org/:orgId/`

**Source:** `components/layout/OrgSidebar.tsx`

### CoachLayout

**Purpose:** Coach-specific interface.

```
<CoachLayout>
  <OfflineBanner />
  <main>
    <Outlet />
  </main>
  <CoachBottomNav />    ← 6 items (Dashboard, Sessions, Requests, Players, Availability, Profile)
</CoachLayout>
```

- Bottom nav with 6 items, first 4 shown in bottom bar, all accessible
- Permission-gated nav items
- No hamburger menu

**Source:** `components/layout/CoachLayout.tsx`, `CoachBottomNav.tsx`

### RefereeLayout

**Purpose:** Referee-specific interface.

```
<RefereeLayout>
  <OfflineBanner />
  <main>
    <Outlet />
  </main>
</RefereeLayout>
```

- No BottomNav (referee scope is minimal)
- Simple, focused layout

**Source:** `components/layout/RefereeLayout.tsx`

## Permission-Aware UI Pattern

The `<Can>` component gates UI elements by permission key.

```
import { Can } from '../../permissions/Can';

<Can permission="users.edit">
  <button onClick={handleEdit}>Edit User</button>
</Can>

<Can permission="users.edit.first-name">
  <input name="firstName" />
</Can>
```

```
function Can({ permission, fallback = null, children }) {
  const permissions = useAuthStore(s => s.user?.permissions ?? []);
  if (permissions.includes('*') || permissions.includes(permission)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
```

**Source:** `frontend/src/permissions/Can.tsx:1-19`

### Permission Registry

All UI permission keys are registered in `frontend/src/permissions/registry.ts`. Types include:
- `button`, `tab`, `page`, `section`, `action`, `field`

Admin screen at `/admin/ui-permissions` manages role ↔ permission assignments.

## Source

All UI components: `frontend/src/components/ui/`
All layouts: `frontend/src/components/layout/`
Router: `frontend/src/App.tsx`
Can component: `frontend/src/permissions/Can.tsx`
Permission registry: `frontend/src/permissions/registry.ts`
