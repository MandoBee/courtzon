# PROFILE COMPLETENESS AUDIT: Player Self-Profile vs Super Admin Field Access

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Field-by-field comparison — Player self-profile vs Super Admin user access |
| **Super Admin surface** | (A) shared `ProfilePage.tsx` (super_admin holds every permission → all `<Can>` gates pass), (B) admin user screens: `UserListPage.tsx`, `UserEditModal.tsx`, coach approve/reject + role endpoints |
| **Player surface** | (A) shared `ProfilePage.tsx` (role `player`), (B) self-edit `PATCH /auth/profile`, (C) `/auth/me` payload |
| **Authoritative sources** | `users` (26 cols), `player_profiles` (18 cols), `player_emergency_contacts` (NEW), `auth.dto.ts:45-73`, `auth.service.ts:673-724`, `rbac.repository.ts:527-605`, `UserEditModal.tsx`, `role-permission-templates.mjs:452-462` |
| **Overall Confidence** | 93% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PLAYER vs SUPER ADMIN — EXECUTIVE SNAPSHOT                             │
├─────────────────────────────────────────────────────────────────────────┤
│  SHARED SCREEN PARITY:  ~95% (one role-specific UI element differs)     │
│  DATA-MODEL GAP:        9 fields exist for the admin but are invisible  │
│                         to the player on every screen                   │
│  EDITABLE BY BOTH:      21 fields (name, email, avatar, gender, DOB,    │
│                         sport/level, interested sports, playing hand,   │
│                         bio, emergency contacts, language, timezone,    │
│                         theme, visibility, privacy, notifications)      │
│  ADMIN-EXCLUSIVE:       10 fields + 9 admin actions                     │
│  SHOULD BE PLAYER-ADDED: account_status (read), coach_rejected_reason,  │
│                         country (read), is_email_verified,              │
│                         is_phone_verified, phone self-service change    │
│  IMPLEMENTED THIS CYCLE: emergencyContacts[] multi-entry + child table  │
│  FINDINGS:              3 (PRF-001 stale column comment, PRF-002 no     │
│                         phone self-service, PRF-003 hidden rejection    │
│                         reason / account status)                        │
└─────────────────────────────────────────────────────────────────────────┘
```

**Why a difference exists at all (evidence):** `role-permission-templates.mjs:453` grants `super_admin` → `true` for **every** permission key; `:455-462` grants the `player` role only keys matching `PLAYER_PATTERNS`/`PLAYER_EXPLICIT_KEYS` and excludes `ADMIN_ONLY_PREFIXES` (`users.`, `roles.`, `audit.`, `appearance.`, `coaches.assign`, etc.). Additionally, the admin routes `PUT /admin/users/:id`, `PUT /admin/users/:id/password`, `PATCH /admin/users/:id/coach/{approve,reject}` are guarded by `superAdminGuard` (`rbac.routes.ts:28,36,40-41`). Therefore the Super Admin has a **second**, admin-only surface (user management) the Player can never reach — this is where the real field gap lives.

---

## 2. THE TWO COMPARISON SURFACES

### 2.1 Shared screen `ProfilePage.tsx` (both roles, permission-gated)

| Block | Permission gate | Player role | Super Admin |
|---|---|---|---|
| Player tab (view + edit form) | `profile.*` / `player.profile.*` | ✅ (player gets `profile.*`, `coaches.*`, `player.profile.*` patterns) | ✅ (all) |
| Appearance customize banner | `appearance.role-customize` | ❌ (admin-only prefix `appearance.`) | ✅ |
| Settings tab (language/theme/visibility/privacy/notifications) | `profile.settings.*`, `player.profile.privacy` | ✅ | ✅ |
| Coach apply / reapply / status | `coaches.apply` | ✅ | ✅ |
| Free Selling status/activation | `marketplace.sell` | ✅ | ✅ |

**Screen-level verdict:** The only role-specific difference on the shared screen is the *Appearance Studio banner* (super admin only). All profile *fields* are identical between roles here.

### 2.2 Admin user-management surface (super admin only)

- `UserListPage.tsx` (columns: User/avatar, Country, Phone, Roles, Status, Selling badge, Joined, Edit/Delete)
- `UserEditModal.tsx` (Profile tab: full name, email, gender, account status, country, language, main sport, level, assign-as-coach; Change Password; Roles & Orgs tab; Branch Access / Bookings / Academies / Orders / Activity Log tabs)
- Coach approval endpoints: approve/reject with rejection reason
- `GET /admin/users/:id` returns `u.*` = **all** `users` columns + `player_profiles` + coach columns (`rbac.repository.ts:527-544`)

---

## 3. FIELD-BY-FIELD COMPARISON TABLE

Legend: **BOTH** = present/editable for both Player & Super Admin · **MISSING** = exists for admin, absent for player · **ADMIN-ONLY** = should stay exclusive · **N/A** = internal/system (admin-internal, no player value)

### 3.1 `users` table (26 columns)

| # | Field (column) | Super Admin surface | Player surface | Verdict |
|---|---|---|---|---|
| 1 | `id` | list + detail | ✗ never exposed | ADMIN-ONLY (internal PK) |
| 2 | `public_id` | detail (`u.*`) | ✗ | ADMIN-ONLY (internal UUID) |
| 3 | `country_id` → country | **editable** in UserEditModal + list column | ✗ not editable, ✗ not displayed anywhere | **MISSING** |
| 4 | `phone_number` / `full_phone` | **editable** (`phoneNumber` accepted by `PUT /admin/users/:id`, map in `rbac.repository.ts:559`) + list column | read-only in profile header (`fullPhone`) | **MISSING (self-service edit)** |
| 5 | `email` | editable (admin + shared form) | **editable** (shared form) | BOTH |
| 6 | `password_hash` | force-reset (`users.change-password`) | own flow `/auth/reset-password` (not on profile) | ADMIN-ONLY force-reset; player owns reset |
| 7 | `full_name` | editable (admin + shared form) | **editable** | BOTH |
| 8 | `avatar_url` | editable (shared form) | **editable** (upload) | BOTH |
| 9 | `gender` | editable (admin + shared form) | **editable** | BOTH |
| 10 | `birth_date` | editable (admin + shared form) | **editable** | BOTH |
| 11 | `language_id` | editable (admin + shared form) | **editable** (settings tab) | BOTH |
| 12 | `timezone` | editable (admin + shared form) | **editable** | BOTH |
| 13 | `dark_mode` | editable (admin + shared form) | **editable** (settings tab) | BOTH |
| 14 | `account_status` | **editable** (`users.edit.status`; active/suspended/banned) + badge on list/detail | ✗ not exposed in `/auth/me`, not on any player screen | **MISSING (read-only)** / transitions ADMIN-ONLY |
| 15 | `last_login_at` | detail (`u.*`) | ✗ | ADMIN-ONLY (security/audit) |
| 16 | `last_login_ip` | detail + Activity Log (IP column) | ✗ | ADMIN-ONLY (security) |
| 17 | `is_phone_verified` | detail (`u.*`) | ✗ | **MISSING (read-only badge)** |
| 18 | `is_email_verified` | detail (`u.*`) | ✗ | **MISSING (read-only badge)** |
| 19 | `is_public` | shared visibility master switch | **editable** (settings tab) | BOTH |
| 20 | `has_seen_welcome` | detail (`u.*`) | ✗ | N/A (internal onboarding flag) |
| 21 | `has_activated_selling` | list badge "Selling" | ✓ shown as Free Selling status (from `/marketplace/player/status`) | BOTH (status state) |
| 22 | `version` | detail (`u.*`) | ✗ | N/A (optimistic-lock counter) |
| 23 | `deleted_at` | detail (`u.*`) + soft delete (`users.delete`) | ✗ | ADMIN-ONLY (moderation) |
| 24 | `created_at` | list "Joined" | ✗ | ADMIN-ONLY (optional "member since" for player) |
| 25 | `updated_at` | detail (`u.*`) | ✗ | N/A (system timestamp) |
| 26 | `password_hash` | never shown (hash) | ✗ | N/A (auth-only) |

### 3.2 `player_profiles` table (18 columns)

| # | Field (column) | Super Admin surface | Player surface | Verdict |
|---|---|---|---|---|
| 27 | `main_sport_id` | editable (admin + shared form) | **editable** | BOTH |
| 28 | `main_level_id` | editable (admin + shared form) | **editable** (⚠ PRF-001: DB comment says non-editable) | BOTH |
| 29 | `playing_hand` | shared form (all perms) | **editable** (`player.profile.edit.playing-hand`) | BOTH |
| 30 | `is_coach` / `coach_status` | assign-as-coach toggle (`coaches.assign`), approve/reject (`superAdminGuard`) + badge | **viewable** status (approved/pending/rejected) + apply/reapply (`coaches.apply`) | BOTH (view); transitions ADMIN-ONLY |
| 31 | `coach_rejected_reason` | detail (`u.*`) | ✗ not referenced anywhere in frontend | **MISSING** |
| 32 | `is_seller` | detail (`u.*`) | ✓ Free Selling status + self-activate (`marketplace.sell`) | BOTH (state) |
| 33 | `bio` | shared form | **editable** | BOTH |
| 34 | `emergency_contact_name/phone/relation` (legacy) | shared form | **editable** (legacy mirror) | BOTH |
| 35 | `privacy_show_profile/stats/activity` | shared settings | **editable** (child switches) | BOTH |

### 3.3 `player_emergency_contacts` (NEW this cycle)

| Field | Super Admin surface | Player surface | Verdict |
|---|---|---|---|
| `emergencyContacts[]` (id, user_id, name, phone, relation) | shared form (all perms) | **editable** (multi-entry add/remove) | BOTH |

### 3.4 Admin-only screen data (role/relationship data, no player equivalent)

| Data | Super Admin surface | Player | Verdict |
|---|---|---|---|
| Role assignments (assign/remove, scopes) | Roles & Orgs tab (`users.assign-role`, `users.edit.role`) | sees own role names only | ADMIN-ONLY (RBAC governance) |
| Permissions / permission keys | role-driven, admin UI Permissions screens | ✗ | ADMIN-ONLY |
| Bookings of any user | Bookings tab (`users.view-bookings`) | own `/bookings` only | BOTH (own data) |
| Orders of any user | Orders tab (`users.view-orders`) | own orders only | BOTH (own data) |
| Academy enrollments of any user | Academies tab | own enrollments | BOTH (own data) |
| Activity log + IP addresses | Activity tab (`users.view-activity`) | ✗ no activity screen | ADMIN-ONLY (security) |
| Branch access requests | Branch Access tab | own access status | BOTH (own data) |
| User deletion | `users.delete` | ✗ | ADMIN-ONLY |

### 3.5 Shared-screen role-specific difference

| Element | Super Admin | Player | Note |
|---|---|---|---|
| Appearance Studio banner | ✅ shown | ❌ hidden (`appearance.role-customize` is admin-only) | Not a data field; UI element. Only shared-screen divergence. |

---

## 4. ANSWER TO THE SIX REQUIRED QUESTIONS

### 1. Fields present in BOTH (21 + status states)

`full_name`, `email`, `avatar_url`, `gender`, `birth_date`, `language_id`, `timezone`, `dark_mode`, `is_public`, `main_sport_id`, `main_level_id`, `playing_hand`, `bio`, `emergencyContacts[]` (new), legacy `emergency_contact_*` (mirror), `privacy_show_profile`, `privacy_show_stats`, `privacy_show_activity`, plus state/status views: `is_coach`/`coach_status`, `is_seller` (Free Selling), own roles, own bookings/orders/academy enrollments/branch access. All editable by both roles through the same shared form/settings.

### 2. Fields missing from the Player Profile (9)

| # | Field | Evidence of admin-only existence |
|---|---|---|
| M1 | `account_status` | editable in `UserEditModal.tsx:300-319` (`users.edit.status`); badge `:230-235`; list `:188`; returned by admin detail (`u.*`) but absent from `mapUserResponse` (`auth.service.ts:689-723`) |
| M2 | `coach_rejected_reason` | returned by `rbac.repository.ts:534`; zero frontend references outside admin detail |
| M3 | `country_id` | editable in `UserEditModal.tsx:321-330`; list column `:178-183`; absent from player profile UI |
| M4 | `phone_number` self-service edit | editable by admin (`rbac.repository.ts:559` map `phoneNumber`); player sees read-only `fullPhone` |
| M5 | `is_phone_verified` | admin detail `u.*`; absent from player UI |
| M6 | `is_email_verified` | admin detail `u.*`; absent from player UI |
| M7 | `last_login_at` | admin detail `u.*`; absent from player UI |
| M8 | `last_login_ip` | admin detail + Activity Log IP column (`UserEditModal.tsx:703`) |
| M9 | `created_at` | list "Joined" (`UserListPage.tsx:194`) |

### 3. Which missing fields SHOULD also be available to Players

| Field | Recommended exposure | Justification |
|---|---|---|
| `account_status` | **Read-only** badge on profile | A player must know if their account is suspended/banned; hidden status causes support confusion. **Transitions stay admin-only.** |
| `coach_rejected_reason` | Read-only text next to "Rejected" coach status | Currently a rejected coach sees only "Rejected" with no actionable reason (`ProfilePage.tsx:587-593`). Rejection feedback is the player's own data. |
| `country` | Read-only display on profile (self-service edit deferred) | Player sees country nowhere; it is their own registration data. Edit needs verification/geo logic → defer. |
| `is_email_verified` / `is_phone_verified` | Read-only badges | Standard UX ("verify email" CTA). Low effort; improves trust. |
| `phone_number` self-service change | New guarded flow | Players are locked out of their own phone; uniqueness (E.164 unique) requires an OTP-reverify flow — recommended but a separate feature. |
| `last_login_at` | Optional read-only ("Last active") | Non-sensitive; nice-to-have. |

### 4. Fields/actions that MUST remain exclusive to administrators, and why

| Field / Action | Why admin-only |
|---|---|
| `account_status` **transitions** (active/suspended/banned) | Moderation/authority decision; must be audited (`recordAudit USER.*`), protected by `users.edit.status` + `superAdminGuard` |
| `last_login_ip`, Activity Log IPs | Security/forensic data; exposes device/location info — never self-service |
| Role assignment / permission grants | RBAC governance — a user must not modify their own access |
| Password force-reset (`users.change-password`) | Account-recovery admin action; prevents self-lockout abuse |
| Coach approve/reject | Trust/verification process owned by admins (`superAdminGuard`) |
| User delete / soft-delete (`deleted_at`) | Moderation; destructive and audited |
| `public_id`, `id`, `version`, `deleted_at`, `updated_at`, `has_seen_welcome`, `password_hash` | Internal identifiers, optimistic-lock counters, system flags, auth material — no user-facing meaning |

### 5. Additional fields implemented this cycle (explicit list)

Player-facing additions (no admin-side change):
- `player_emergency_contacts` child table (`database/migrations/089_player_emergency_contacts.sql`): `id`, `user_id` (FK CASCADE), `name`, `phone`, `relation`, `created_at`, `updated_at`
- `emergencyContacts[]` array added to `UpdateProfileSchema` (`auth.dto.ts:63-69`) and to the `/auth/me` + login payloads via `mapUserResponse` (`auth.service.ts:678-688,715`)
- Repository methods `getEmergencyContacts` / `replaceEmergencyContacts` (DELETE + batch INSERT, first contact mirrored to legacy `player_profiles.emergency_contact_*`)
- `PROFILE.UPDATE` audit record on self-save
- Translation keys: `profile.emergency_contact_add`, `profile.emergency_contacts_empty`, `profile.visibility_hidden_desc`

### 6. No-differences? — N/A, differences exist (evidence)

The two roles are **not** equivalent, contrary to the prior report's implication. Although they share ~95% of the shared screen, the Super Admin's admin-user-management surface exposes 9 fields and 9 actions the Player can never reach (Section 3). Evidence chain: `superAdminGuard` on admin write routes (`rbac.routes.ts:28,36,40-41`) → `GET /admin/users/:id` returns `u.*` (`rbac.repository.ts:528-540`) → `updateUser` map includes `accountStatus`, `phoneNumber`, `countryId` (`rbac.repository.ts:557-562`) → none of `account_status`, `is_phone_verified`, `is_email_verified`, `last_login_*`, `country`, or `coach_rejected_reason` appear in `mapUserResponse` (`auth.service.ts:689-723`) nor in any non-admin page (verified by grep: `account_status` and `coach_rejected_reason` appear only under `pages/admin/`).

---

## 5. FINDINGS

| ID | Severity | Finding | Recommendation |
|----|----------|---------|----------------|
| PRF-001 | Low | `player_profiles.main_level_id` DB comment says "non-editable by player" yet the profile form exposes an editable Skill Level select (`ProfilePage.tsx:756-766`) | Confirm intent; update the column comment or gate the field |
| PRF-002 | Low | No self-service phone change; E.164 unique key makes it registration-locked | Add OTP-reverified change-phone flow (separate feature) |
| PRF-003 | Medium | `account_status` and `coach_rejected_reason` invisible to the player | Add read-only account-status badge + show rejection reason in coach status (Section 4.3) |

---

## 6. CONCLUSIONS

1. **Shared screen parity is near-total** — one element (Appearance banner) differs, purely due to the admin-only `appearance.role-customize` permission.
2. **The real gap is the admin user-management surface**: 9 fields (`account_status`, `coach_rejected_reason`, `country`, `phone edit`, `is_phone_verified`, `is_email_verified`, `last_login_at`, `last_login_ip`, `created_at`) and 9 actions are admin-exclusive by design and absent from every player screen.
3. **Recommended player additions** (Section 4.3): `account_status` (read), `coach_rejected_reason`, country (read), verification badges, and a self-service phone change — all permission-gated per RBAC-by-Default if implemented.
4. **Correctly exclusive** (Section 4.4): status transitions, login/IP audit data, role/permission grants, password force-reset, coach approvals, deletion, and internal columns.
5. **Implemented this cycle**: multi-entry emergency contacts (child table + `emergencyContacts[]` API) — a player-side addition with full backward compatibility.
6. **No schema change is required** to close the parity gap — the missing fields already exist in `users`/`player_profiles` and only need read-only exposure + permission keys on the player side.
