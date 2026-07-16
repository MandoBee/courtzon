# CourtZon Coach Platform — Slice 0: Foundation (Refined)

> **Version:** 2.0
> **Status:** APPROVED — Implementation may begin
> **Rule:** Infrastructure only. No business features.

---

## 1. Scope

### Included (Infrastructure Only)

| Category | Components |
|----------|------------|
| **Authentication** | Login, Register, Password Reset, Email Verification |
| **Authorization** | Role-based access, Permission framework, `<Can>` component |
| **Session Management** | Access/Refresh tokens, Remember Me, Session expiration, Logout, Multi-device |
| **App Shell** | Layout container, Route structure, Error boundaries |
| **Navigation** | BottomNav (Player, Coach), Sidebar (Org), Route guards |
| **Design System** | Design Tokens, Component primitives (Button, Input, Card, Modal, etc.) |
| **Permission Framework** | Role definitions, Permission matrix, API middleware |
| **API Client** | HTTP client, Auth interceptor, Error handling, Retry logic |
| **State Management** | React Query setup, Cache configuration, Optimistic updates |
| **Localization** | i18n setup, Translation structure, RTL support |
| **Theme** | Light/Dark mode, CSS variables, Theme provider |
| **Date/Time Standards** | Format constants, Locale configuration |
| **Feature Flags** | Flag system (2 levels), Flag provider, Flag hooks |

### Not Included (Moved to Later Slices)

| Component | Moved To |
|-----------|----------|
| Help Center | Slice 2 (Player) / Slice 5 (Coach) |
| Notification Center | Slice 1 (Player Booking) — notifications needed for booking flow |
| Profile Features | Slice 2 (Player Profile) / Slice 3 (Coach Profile) |
| Settings Features | Slice 2 (Player Settings) / Slice 3 (Coach Settings) |
| Onboarding Flows | Slice 3 (Coach Onboarding) / Slice 6 (Resident Onboarding) |
| Database-backed Feature Flags | Future (when real business need exists) |

### Architectural Guardrails

**See:** `docs/architectural-guardrails.md` — mandatory rules for all implementation.

---

## 2. Workspace Model

### Architecture: Decoupled from Roles

```
User
    │
    ├── Roles (what they are)
    │   ├── player
    │   ├── independent_coach
    │   ├── resident_coach
    │   ├── org_admin
    │   ├── branch_manager
    │   └── platform_admin
    │
    ├── Accessible Workspaces (what they can access)
    │   ├── Player Workspace
    │   ├── Coach Workspace
    │   ├── Resident Coach Workspace
    │   └── Organization Workspace
    │
    └── Active Workspace (what they're using now)
        └── Single active workspace at a time
```

**Key principle:** Roles grant access to workspaces. Workspaces are not tied to specific roles. This allows future roles (Referee, Physio, Vendor, Tournament Director) without redesign.

### Can a Single User Be Multiple Roles?

**Yes.** A single user can hold multiple roles simultaneously:

| Combination | Example | Frequency |
|-------------|---------|-----------|
| Player + Independent Coach | Coach who also books other coaches | Common |
| Player + Resident Coach | Employee who also uses the platform as player | Common |
| Player + Org Admin | Organization owner who also books sessions | Rare |
| Independent Coach + Org Admin | Coach who also runs their own organization | Rare |
| Resident Coach + Org Admin | Not possible (employee cannot be employer) | Never |

### Workspace Definitions

Each workspace has its own navigation, screens, and permissions:

| Workspace | Navigation | Primary Screen | Bottom Nav / Sidebar |
|-----------|------------|----------------|---------------------|
| Player | Bottom Nav | Home (P-01) | Home \| Bookings \| More |
| Coach | Bottom Nav | Dashboard (IC-04) | Dashboard \| Calendar \| Bookings \| More |
| Resident Coach | Bottom Nav | Home (RC-03) | Home \| Calendar \| Bookings \| More |
| Organization | Sidebar | Dashboard (OG-01) | Dashboard \| Coaches \| Branches \| Pricing \| Reports \| Settings |

### Role → Workspace Mapping

```typescript
// Configuration — not hardcoded logic
const roleWorkspaceMap: Record<UserRole, Workspace[]> = {
  player: ['player'],
  independent_coach: ['player', 'coach'],  // Can also be player
  resident_coach: ['resident_coach'],
  org_admin: ['organization'],
  branch_manager: ['organization'],
  platform_admin: ['platform'],
};

// Future roles just add entries
// referee: ['referee'],
// physio: ['physio'],
// vendor: ['vendor'],
```

### Role Switching UX

#### Entry Point

Role switching is accessible from:
1. **Mobile:** Header → Profile/Avatar → "Switch Role" button
2. **Desktop:** Sidebar → Profile section → "Switch Role" button

#### Switching Flow

```
User taps "Switch Role"
    │
    ├── Show role picker (bottom sheet on mobile, dropdown on desktop)
    │   ├── Current role highlighted
    │   ├── Available roles listed with icons
    │   └── "Switch" button per role
    │
    ├── User selects target role
    │   ├── Loading spinner (brief)
    │   ├── Workspace changes (navigation, screens, permissions)
    │   └── User lands on target workspace home screen
    │
    └── Session maintains all roles
        ├── No re-authentication required
        ├── No data loss
        └── Previous workspace state preserved
```

#### Role Picker UI

```
┌─────────────────────────────────────┐
│  Switch Role                        │
│                                     │
│  ● Player (current)                 │
│    Home • Bookings • More           │
│                                     │
│  ○ Independent Coach                │
│    Dashboard • Calendar • Bookings  │
│                                     │
│  ○ Organization Admin               │
│    Maadi Sports Club                │
│    Dashboard • Coaches • Reports    │
│                                     │
│  [Switch]                           │
└─────────────────────────────────────┘
```

#### Technical Implementation

```typescript
// Auth context maintains all user roles and workspace mapping
interface AuthUser {
  id: string;
  email: string;
  roles: UserRole[];           // ['player', 'independent_coach']
  accessibleWorkspaces: Workspace[];  // ['player', 'coach']
  activeWorkspace: Workspace;  // Currently active workspace
  orgId?: string;              // If org_admin or resident_coach
  branchId?: string;           // If branch_manager
}

// Workspace access check
const canAccessWorkspace = (user: AuthUser, workspace: Workspace): boolean => {
  return user.accessibleWorkspaces.includes(workspace);
};

// Switching workspaces
const switchWorkspace = (targetWorkspace: Workspace) => {
  if (!canAccessWorkspace(currentUser, targetWorkspace)) {
    throw new Error('Access denied');
  }
  setActiveWorkspace(targetWorkspace);
  navigateToWorkspaceHome(targetWorkspace);
  refreshPermissions(targetWorkspace);
};
```

#### Permission Scaping

When a user switches workspaces, permissions are scoped to the active workspace:

| Active Workspace | Permission Scope |
|-----------------|-----------------|
| Player | Own bookings, own wallet, own profile |
| Coach | Own availability, own bookings, own earnings |
| Resident Coach | Org-assigned schedule, org-managed earnings |
| Organization | All org data, all coaches, all branches |

**Cross-workspace visibility:** A user who is both Player and Coach can see their own bookings from both perspectives by switching workspaces. They cannot see other players' or coaches' data.

---

## 3. Session Management

### Configuration

All session values are configurable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_ACCESS_TOKEN_EXPIRY` | `15m` | Access token lifetime |
| `SESSION_REFRESH_TOKEN_EXPIRY` | `30d` | Refresh token lifetime (Remember Me) |
| `SESSION_REFRESH_TOKEN_SESSION_EXPIRY` | `session` | Refresh token lifetime (no Remember Me) |
| `SESSION_REMEMBER_ME_ENABLED` | `true` | Allow "Remember Me" option |
| `SESSION_MAX_DEVICES` | `5` | Maximum concurrent sessions per user |
| `SESSION_IDLE_TIMEOUT` | `30m` | Idle timeout before forced logout |
| `SESSION_ABSOLUTE_TIMEOUT` | `7d` | Maximum session duration regardless of activity |

### Token Model

```
Access Token (short-lived, configurable)
├── Duration: Configurable (default: 15 minutes)
├── Contains: user_id, roles, accessible_workspaces, active_workspace, org_id
├── Used for: API authentication (every request)
└── Cannot be refreshed (stateless)

Refresh Token (long-lived, configurable)
├── Duration: Configurable (default: 30 days with Remember Me, session-only without)
├── Contains: session_id, device_id, user_id
├── Used for: Obtaining new access tokens
└── Stored in: HttpOnly secure cookie (production) / localStorage (development)
```

### Authentication Flow

```
User logs in
    │
    ├── Credentials valid?
    │       ├── YES → Issue access token + refresh token
    │       │         ├── Store refresh token (cookie)
    │       │         ├── Return access token (response body)
    │       │         └── Redirect to workspace home
    │       │
    │       └── NO → Show error "Invalid email or password"
    │
    └── "Remember Me" checked?
            ├── YES → Refresh token: configurable (default: 30 days)
            └── NO → Refresh token: session-only (browser close = logout)
```

### Token Refresh

```
API request with access token
    │
    ├── Access token valid?
    │       ├── YES → Process request
    │       └── NO (401 Unauthorized)
    │               │
    │               ├── Refresh token valid?
    │               │       ├── YES → Issue new access token → Retry request
    │               │       └── NO → Redirect to login
    │               │
    │               └── Refresh token expired
    │                       └── "Session expired. Please log in again."
    │
    └── Concurrent request handling
            ├── Queue requests during refresh
            ├── Only one refresh request at a time
            └── All queued requests use new token
```

### Session Expiration

| Event | Behavior |
|-------|----------|
| Access token expires | Auto-refresh (silent) |
| Refresh token expires | Redirect to login with message |
| Idle timeout | Configurable (default: 30m) — show warning before expiry |
| Absolute timeout | Configurable (default: 7d) — force logout |
| Password changed | All other sessions invalidated |
| Account locked | All sessions invalidated |
| Suspicious activity | Session terminated, email notification |

### Logout

#### Logout Current Device

```
User taps "Logout"
    │
    ├── Confirm dialog: "Log out from this device?"
    │       ├── YES → Invalidate current refresh token
    │       │         ├── Clear access token
    │       │         ├── Clear refresh token cookie
    │       │         └── Redirect to login
    │       │
    │       └── NO → Cancel
    │
    └── Other devices remain logged in
```

#### Logout All Devices

```
User taps "Logout All Devices"
    │
    ├── Confirm dialog: "Log out from ALL devices?"
    │       ├── YES → Invalidate ALL refresh tokens for this user
    │       │         ├── Clear current tokens
    │       │         ├── Email notification: "You were logged out from all devices"
    │       │         └── Redirect to login
    │       │
    │       └── NO → Cancel
    │
    └── All other devices forced to login
```

### Multi-Device Support

| Feature | Behavior |
|---------|----------|
| Simultaneous logins | Allowed (configurable, default: 5 devices) |
| Session limit exceeded | Oldest device logged out with notification |
| Device identification | Device name + OS + browser |
| Device management | Settings → Security → Active Sessions |

### Active Sessions UI

```
Settings → Security → Active Sessions

Current Device (this one)          ● Active
├── iPhone 15 Pro — Safari
├── Last active: Just now
└── [Logout]

Other Device                       ○ Active
├── Chrome — Windows
├── Last active: 2 hours ago
└── [Logout This Device]

Mobile Device                      ○ Active
├── Android — Chrome
├── Last active: 1 day ago
└── [Logout This Device]

[Logout All Devices]
```

---

## 4. Feature Flags

### Simple Implementation (YAGNI)

Feature flags are simple JSON/environment variables. No database-backed system until there is a real business need.

### Storage by Environment

| Environment | Storage | Example |
|-------------|---------|---------|
| Development | `.env` file | `VITE_FEATURE_BOOKING_ENABLED=true` |
| Staging | `.env` file or environment variables | `FEATURE_BOOKING_ENABLED=true` |
| Production | Environment variables | `FEATURE_BOOKING_ENABLED=true` |

### Naming Convention

```
VITE_FEATURE_{DOMAIN}_{FEATURE}_ENABLED

Examples:
VITE_FEATURE_COACHING_BOOKING_ENABLED          # Slice flag
VITE_FEATURE_COACHING_PROMO_CODES_ENABLED      # Feature flag
VITE_FEATURE_COACHING_ONBOARDING_ENABLED       # Slice flag
VITE_FEATURE_COACHING_VIDEO_INTRO_ENABLED      # Feature flag
```

### Two-Level System

```
Level 1: Slice Flags
├── Control entire slice visibility
├── Coarse-grained rollout
└── Example: VITE_FEATURE_COACHING_SLICE1_ENABLED

Level 2: Feature Flags
├── Control features within a slice
├── Fine-grained rollout
└── Example: VITE_FEATURE_COACHING_PROMO_CODES_ENABLED
```

### Implementation

```typescript
// frontend/src/config/feature-flags.ts
export const featureFlags = {
  slice1: import.meta.env.VITE_FEATURE_COACHING_SLICE1_ENABLED === 'true',
  slice2: import.meta.env.VITE_FEATURE_COACHING_SLICE2_ENABLED === 'true',
  promoCodes: import.meta.env.VITE_FEATURE_COACHING_PROMO_CODES_ENABLED === 'true',
  videoIntro: import.meta.env.VITE_FEATURE_COACHING_VIDEO_INTRO_ENABLED === 'true',
} as const;

// Usage in components
if (featureFlags.slice1) {
  // Show booking flow
}

// Usage in React hook
const useFeatureFlag = (flag: keyof typeof featureFlags) => {
  return featureFlags[flag];
};
```

### Flag List (Slice 0 Initial)

| Flag | Level | Default | Purpose |
|------|-------|---------|---------|
| `VITE_FEATURE_COACHING_SLICE0_ENABLED` | L1 | `true` | Foundation slice |
| `VITE_FEATURE_COACHING_SLICE1_ENABLED` | L1 | `false` | Player booking flow |
| `VITE_FEATURE_COACHING_SLICE2_ENABLED` | L1 | `false` | Player booking management |
| `VITE_FEATURE_COACHING_SLICE3_ENABLED` | L1 | `false` | Coach onboarding |
| `VITE_FEATURE_COACHING_SLICE4_ENABLED` | L1 | `false` | Coach availability |
| `VITE_FEATURE_COACHING_SLICE5_ENABLED` | L1 | `false` | Coach earnings |
| `VITE_FEATURE_COACHING_SLICE6_ENABLED` | L1 | `false` | Resident coach flow |
| `VITE_FEATURE_COACHING_SLICE7_ENABLED` | L1 | `false` | Resident earnings |
| `VITE_FEATURE_COACHING_SLICE8_ENABLED` | L1 | `false` | Org coach management |
| `VITE_FEATURE_COACHING_SLICE9_ENABLED` | L1 | `false` | Org pricing & reports |
| `VITE_FEATURE_COACHING_SLICE10_ENABLED` | L1 | `false` | Polish & launch |

### Rollout Strategy

```
Phase 1: Internal
├── Set env var: VITE_FEATURE_COACHING_SLICE1_ENABLED=true
├── Target: Internal team only
└── Duration: 1 week

Phase 2: Beta
├── Set env var: VITE_FEATURE_COACHING_SLICE1_ENABLED=true
├── Target: Beta users (feature flag + user list)
└── Duration: 2 weeks

Phase 3: Gradual
├── Set env var: VITE_FEATURE_COACHING_SLICE1_ENABLED=true
├── Target: All users
└── Duration: 1 week

Phase 4: Permanent
├── Remove flag from code
└── Feature always on
```

### Future: Database-Backed Flags

When there is a real business need (e.g., A/B testing, per-user rollouts, dynamic configuration), upgrade to:

```sql
CREATE TABLE feature_flags (
  id VARCHAR(36) PRIMARY KEY,
  flag_key VARCHAR(100) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INT DEFAULT 0,
  target_audience JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Not needed now. YAGNI applies.**

---

## 5. Design Tokens

### Two-Layer System

```
Layer 1: Primitive Tokens (raw values)
├── Colors, typography, spacing, etc.
└── Used by: Theme configuration, design tools

Layer 2: Semantic Tokens (meaning-based)
├── Surface, Background, Primary Action, Danger, etc.
└── Used by: Components (preferred layer)
```

### Layer 1: Primitive Tokens

#### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#2563EB` | Primary brand color |
| `--color-primary-hover` | `#1D4ED8` | Primary hover |
| `--color-primary-active` | `#1E40AF` | Primary active |
| `--color-primary-light` | `#DBEAFE` | Primary background |
| `--color-primary-dark` | `#1E3A8A` | Primary text |
| `--color-success` | `#16A34A` | Success |
| `--color-warning` | `#D97706` | Warning |
| `--color-error` | `#DC2626` | Error |
| `--color-info` | `#2563EB` | Info |
| `--color-gray-50` | `#F9FAFB` | Gray lightest |
| `--color-gray-100` | `#F3F4F6` | Gray light |
| `--color-gray-200` | `#E5E7EB` | Gray border |
| `--color-gray-300` | `#D1D5DB` | Gray disabled |
| `--color-gray-400` | `#9CA3AF` | Gray placeholder |
| `--color-gray-500` | `#6B7280` | Gray secondary |
| `--color-gray-600` | `#4B5563` | Gray primary |
| `--color-gray-700` | `#374151` | Gray heading |
| `--color-gray-800` | `#1F2937` | Gray dark |
| `--color-gray-900` | `#111827` | Gray darkest |

#### Typography

| Token | Value |
|-------|-------|
| `--font-family-primary` | `'Inter', -apple-system, BlinkMacSystemFont, sans-serif` |
| `--font-family-arabic` | `'Noto Sans Arabic', 'Inter', sans-serif` |
| `--font-size-xs` | `0.75rem` (12px) |
| `--font-size-sm` | `0.875rem` (14px) |
| `--font-size-base` | `1rem` (16px) |
| `--font-size-lg` | `1.125rem` (18px) |
| `--font-size-xl` | `1.25rem` (20px) |
| `--font-size-2xl` | `1.5rem` (24px) |
| `--font-size-3xl` | `1.875rem` (30px) |
| `--font-size-4xl` | `2.25rem` (36px) |
| `--font-weight-normal` | `400` |
| `--font-weight-medium` | `500` |
| `--font-weight-semibold` | `600` |
| `--font-weight-bold` | `700` |
| `--line-height-tight` | `1.25` |
| `--line-height-normal` | `1.5` |
| `--line-height-relaxed` | `1.75` |

#### Spacing

| Token | Value |
|-------|-------|
| `--spacing-0` | `0` |
| `--spacing-1` | `0.25rem` (4px) |
| `--spacing-2` | `0.5rem` (8px) |
| `--spacing-3` | `0.75rem` (12px) |
| `--spacing-4` | `1rem` (16px) |
| `--spacing-5` | `1.25rem` (20px) |
| `--spacing-6` | `1.5rem` (24px) |
| `--spacing-8` | `2rem` (32px) |
| `--spacing-10` | `2.5rem` (40px) |
| `--spacing-12` | `3rem` (48px) |
| `--spacing-16` | `4rem` (64px) |

#### Border Radius

| Token | Value |
|-------|-------|
| `--radius-none` | `0` |
| `--radius-sm` | `0.25rem` (4px) |
| `--radius-md` | `0.5rem` (8px) |
| `--radius-lg` | `0.75rem` (12px) |
| `--radius-xl` | `1rem` (16px) |
| `--radius-full` | `9999px` |

#### Elevation / Shadows

| Token | Value |
|-------|-------|
| `--shadow-none` | `none` |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` |

#### Motion

| Token | Value |
|-------|-------|
| `--duration-fast` | `100ms` |
| `--duration-normal` | `200ms` |
| `--duration-slow` | `300ms` |
| `--duration-slower` | `500ms` |
| `--easing-default` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--easing-in` | `cubic-bezier(0.4, 0, 1, 1)` |
| `--easing-out` | `cubic-bezier(0, 0, 0.2, 1)` |
| `--easing-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |

#### Breakpoints

| Token | Value |
|-------|-------|
| `--breakpoint-sm` | `640px` |
| `--breakpoint-md` | `768px` |
| `--breakpoint-lg` | `1024px` |
| `--breakpoint-xl` | `1280px` |
| `--breakpoint-2xl` | `1536px` |

#### Icon Sizes

| Token | Value |
|-------|-------|
| `--icon-size-xs` | `12px` |
| `--icon-size-sm` | `16px` |
| `--icon-size-md` | `20px` |
| `--icon-size-lg` | `24px` |
| `--icon-size-xl` | `32px` |
| `--icon-size-2xl` | `48px` |

#### Z-Index

| Token | Value |
|-------|-------|
| `--z-dropdown` | `1000` |
| `--z-sticky` | `1020` |
| `--z-modal-backdrop` | `1040` |
| `--z-modal` | `1050` |
| `--z-popover` | `1060` |
| `--z-toast` | `1070` |
| `--z-bottom-nav` | `1080` |

### Layer 2: Semantic Tokens

**Semantic tokens are the preferred layer for components.** They reference primitive tokens and provide meaning-based naming.

#### Surface & Background

| Semantic Token | References | Usage |
|----------------|------------|-------|
| `--surface` | `--color-gray-50` | Page background |
| `--surface-raised` | `--color-white` | Card background, elevated surfaces |
| `--surface sunken` | `--color-gray-100` | Inset sections, wells |
| `--surface-overlay` | `rgba(0,0,0,0.5)` | Modal backdrop, overlays |

#### Text

| Semantic Token | References | Usage |
|----------------|------------|-------|
| `--text-primary` | `--color-gray-900` | Headings, primary text |
| `--text-secondary` | `--color-gray-600` | Body text, descriptions |
| `--text-tertiary` | `--color-gray-400` | Placeholder, captions |
| `--text-inverse` | `--color-white` | Text on dark backgrounds |
| `--text-disabled` | `--color-gray-300` | Disabled text |

#### Interactive

| Semantic Token | References | Usage |
|----------------|------------|-------|
| `--interactive-primary` | `--color-primary` | Primary buttons, links |
| `--interactive-primary-hover` | `--color-primary-hover` | Primary hover state |
| `--interactive-primary-active` | `--color-primary-active` | Primary active/pressed |
| `--interactive-secondary` | `--color-gray-200` | Secondary buttons, borders |
| `--interactive-secondary-hover` | `--color-gray-300` | Secondary hover |
| `--interactive-hover` | `--color-gray-100` | Row hover, card hover |
| `--interactive-active` | `--color-gray-200` | Row active, selected state |

#### Status

| Semantic Token | References | Usage |
|----------------|------------|-------|
| `--status-success` | `--color-success` | Success badges, confirmations |
| `--status-success-bg` | `--color-success` + opacity | Success backgrounds |
| `--status-warning` | `--color-warning` | Warning badges, caution |
| `--status-warning-bg` | `--color-warning` + opacity | Warning backgrounds |
| `--status-error` | `--color-error` | Error badges, destructive |
| `--status-error-bg` | `--color-error` + opacity | Error backgrounds |
| `--status-info` | `--color-info` | Info badges, neutral |
| `--status-info-bg` | `--color-info` + opacity | Info backgrounds |

#### Border & Focus

| Semantic Token | References | Usage |
|----------------|------------|-------|
| `--border` | `--color-gray-200` | Default borders |
| `--border-strong` | `--color-gray-400` | Emphasized borders |
| `--border-focus` | `--color-primary` | Focus ring color |
| `--border-error` | `--color-error` | Error state border |
| `--border-success` | `--color-success` | Success state border |

#### Actions

| Semantic Token | References | Usage |
|----------------|------------|-------|
| `--action-primary` | `--color-primary` | Primary action (Confirm, Submit) |
| `--action-danger` | `--color-error` | Destructive action (Delete, Cancel) |
| `--action-success` | `--color-success` | Positive action (Approve, Confirm) |
| `--action-warning` | `--color-warning` | Caution action (Suspend, Hold) |
| `--action-disabled` | `--color-gray-300` | Disabled action |

### Implementation

```css
/* frontend/src/styles/tokens.css */
:root {
  /* Layer 1: Primitives */
  --color-primary: #2563EB;
  --color-gray-50: #F9FAFB;
  --color-gray-900: #111827;
  /* ... */

  /* Layer 2: Semantic (preferred for components) */
  --surface: var(--color-gray-50);
  --surface-raised: #FFFFFF;
  --text-primary: var(--color-gray-900);
  --text-secondary: var(--color-gray-600);
  --interactive-primary: var(--color-primary);
  --border: var(--color-gray-200);
  --action-primary: var(--color-primary);
  --action-danger: var(--color-error);
  /* ... */
}

/* Dark mode: override semantic tokens */
[data-theme="dark"] {
  --surface: #111827;
  --surface-raised: #1F2937;
  --text-primary: #F9FAFB;
  --text-secondary: #9CA3AF;
  --border: #374151;
  /* ... */
}

/* Components use semantic tokens */
.button-primary {
  background: var(--action-primary);
  color: var(--text-inverse);
  border: 1px solid var(--interactive-primary);
}

.button-danger {
  background: var(--action-danger);
  color: var(--text-inverse);
  border: 1px solid var(--action-danger);
}

.input-error {
  border-color: var(--border-error);
  background: var(--status-error-bg);
}
```

---

## 6. Definition of Ready (DoR)

Implementation of a slice may begin **only** when ALL of the following are true:

### Per-Slice Prerequisites

| # | Requirement | Verified By | Evidence |
|---|-------------|-------------|----------|
| 1 | **Product approved** | Product Owner | Signed slice contract |
| 2 | **UX approved** | UX Designer | Screens documented in UX Blueprint |
| 3 | **Permission Matrix approved** | Tech Lead + QA | Component-level permissions defined |
| 4 | **APIs available** | Backend Lead | API contracts documented or endpoints ready |
| 5 | **Feature Flags defined** | Tech Lead | Flags added to feature flag system |
| 6 | **Acceptance Criteria approved** | QA Lead | All criteria in slice contract |
| 7 | **Test scenarios prepared** | QA Engineer | Test cases written before implementation |
| 8 | **Dependencies resolved** | Tech Lead | Previous slice(s) complete |
| 9 | **Design Tokens applied** | UI Designer | Visual design matches token system |
| 10 | **No open blocking issues** | Tech Lead | All P0/P1 issues resolved |

### DoR Checklist Template

```
Slice [X]: [Name]

[ ] Product approved (signed contract)
[ ] UX approved (screens in UX Blueprint)
[ ] Permission Matrix approved (component-level)
[ ] APIs available (contracts documented)
[ ] Feature Flags defined (flags created)
[ ] Acceptance Criteria approved (all criteria clear)
[ ] Test scenarios prepared (test cases written)
[ ] Dependencies resolved (previous slice complete)
[ ] Design Tokens applied (visual design ready)
[ ] No open blocking issues (all P0/P1 resolved)

Ready to begin: [ ] YES / [ ] NO
```

### DoR vs DoD

| Aspect | Definition of Ready | Definition of Done |
|--------|--------------------|--------------------|
| **When** | Before implementation starts | After implementation completes |
| **Purpose** | Ensure we can start | Ensure we can ship |
| **Focus** | Inputs, readiness | Outputs, quality |
| **Checked by** | Tech Lead | QA Lead |
| **Gate** | Blocks implementation start | Blocks release |

---

## 7. Slice 0 Contract (Updated)

### Included
- **Authentication:** Login, Register, Password Reset, Email Verification
- **Authorization:** Role-based access, Permission framework, `<Can>` component
- **Session Management:** Configurable access/refresh tokens, Remember Me, Session expiration, Logout (current/all devices), Multi-device support
- **App Shell:** Layout container, Route structure, Error boundaries
- **Navigation:** BottomNav (Player, Coach), Sidebar (Org), Route guards
- **Design System:** Design Tokens (Primitive + Semantic layers), Component primitives (Button, Input, Card, Modal, etc.)
- **Permission Framework:** Role definitions (7 roles), Permission matrix, API middleware
- **API Client:** HTTP client, Auth interceptor, Error handling, Retry logic, Concurrent request handling
- **State Management:** React Query setup, Cache configuration, Optimistic updates
- **Localization:** i18n setup, Translation structure, RTL support
- **Theme:** Light/Dark mode, CSS variables, Theme provider
- **Date/Time Standards:** Format constants (DD/MM/YYYY, HH:MM AM/PM), Locale configuration
- **Feature Flags:** Two-level system (JSON/Environment — YAGNI for database), Flag provider, Flag hooks
- **Workspace Model:** Decoupled from roles (User → Roles → Accessible Workspaces → Active Workspace)
- **Role Switching:** Multi-role support, Workspace switching, Permission scoping

### Not Included
- Help Center (moved to Slice 2/5)
- Notification Center (moved to Slice 1)
- Profile Features (moved to Slice 2/3)
- Settings Features (moved to Slice 2/3)
- Onboarding Flows (moved to Slice 3/6)
- Database-backed Feature Flags (YAGNI — use JSON/Environment)
- Shared business components (moved to slices that use them)
- Marketplace (deferred to V2)
- Chat/Messaging (deferred to V2)
- Push notifications
- File upload
- Payment processing
- Real-time updates (WebSocket)
- Analytics events
- Accessibility audit

### Dependencies
- Scheduling Engine (existing, no changes)
- Backend API (existing auth endpoints)
- Database (existing schema)

### Acceptance Criteria
- [ ] User can register with email/password
- [ ] User can login with email/password
- [ ] User can reset password via email
- [ ] User can verify email
- [ ] Session persists with "Remember Me" (configurable duration)
- [ ] Session expires after configurable timeout
- [ ] User can logout (current device)
- [ ] User can logout all devices
- [ ] User can view active sessions
- [ ] User with multiple roles can switch workspaces
- [ ] Workspace switching changes navigation + screens
- [ ] Permissions are scoped to active workspace
- [ ] Primitive design tokens are defined
- [ ] Semantic design tokens are defined and preferred by components
- [ ] Light/dark mode works (semantic tokens override)
- [ ] RTL layout works
- [ ] Feature flags can be toggled (JSON/Environment)
- [ ] API client handles auth errors (401 → refresh → retry)
- [ ] Navigation guards block unauthorized access
- [ ] Error boundaries catch rendering errors
- [ ] Architectural Guardrails are documented and accessible

### Test Strategy
- Unit: All components render, token refresh logic, permission checks, feature flag evaluation
- Integration: Auth flow (register, login, refresh, logout), workspace switching, permission scoping
- E2E: Complete auth flow on mobile and desktop, workspace switching across roles

### Release Strategy
- Internal testing only
- Feature flag: `VITE_FEATURE_COACHING_SLICE0_ENABLED` (default: true)

### Success Metrics
- Auth flow completion rate: > 95%
- Token refresh success rate: > 99%
- Workspace switching success rate: 100%
- Permission check accuracy: 100%
- Zero security vulnerabilities

---

## 8. Final Approval

| Requirement | Approved |
|-------------|----------|
| Slice 0 scope (infrastructure only) | ☐ |
| Role Switching model | ☐ |
| Session Management | ☐ |
| Feature Flags (2 levels) | ☐ |
| Design Tokens | ☐ |
| Definition of Ready | ☐ |
| Slice 0 Contract | ☐ |

**Once approved, implementation begins.**

---

*From this point forward: disciplined execution, small vertical slices, continuous testing, zero scope expansion.*
