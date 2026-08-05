# PROFILE COMPLETENESS AUDIT: Player Self-Profile vs Data Model

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Comparison audit — self-profile screen vs persisted data model |
| **Scope** | `users`, `player_profiles`, `player_emergency_contacts` |
| **Frontend** | `frontend/src/pages/profile/ProfilePage.tsx` (shared by `/profile` and `/admin/profile`) |
| **Backend** | `PATCH /auth/profile` → `updateProfile`; `mapUserResponse` (auth.service.ts:673) |
| **Overall Confidence** | 92% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PROFILE COMPLETENESS — EXECUTIVE SNAPSHOT                              │
├─────────────────────────────────────────────────────────────────────────┤
│  SHARED SCREEN:   ProfilePage.tsx used by both Player and Super Admin   │
│  SUPER ADMIN:     NO dedicated profile screen (/admin/profile reuses     │
│                   the same consumer screen)                              │
│  DATA SOURCES:    users (26 cols) + player_profiles (18 cols) +          │
│                   player_emergency_contacts (NEW, 6 cols)                │
│  EDITABLE (player): fullName, email, avatarUrl, gender, birthDate,       │
│                   mainSportId, mainLevelId, interestedSportIds,          │
│                   playing_hand, bio, emergencyContacts (multi),          │
│                   languageId, darkMode, isPublic, privacy_show_*         │
│  NEW THIS CYCLE:  multi-entry emergency contacts (child table)           │
│  FINDINGS:        2 (main_level_id editability inconsistency;            │
│                   phone/country not editable on profile)                 │
│  RECOMMENDATION:  Document intent; no schema change required             │
│  CONFIDENCE:      92%                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. PROFILE DATA MODEL (authoritative)

### 2.1 `users` — 26 columns

```
id, public_id, country_id, phone_number, full_phone, email, password_hash,
full_name, avatar_url, gender, birth_date, language_id, timezone, dark_mode,
account_status, last_login_at, last_login_ip, is_phone_verified,
is_email_verified, is_public, has_seen_welcome, has_activated_selling,
version, deleted_at, created_at, updated_at
```

### 2.2 `player_profiles` — 18 columns

```
id, user_id, main_sport_id, main_level_id (COMMENT: "Set at registration;
non-editable by player"), playing_hand, is_coach, coach_status,
coach_rejected_reason, is_seller, bio, emergency_contact_name,
emergency_contact_phone, emergency_contact_relation, privacy_show_profile,
privacy_show_stats, privacy_show_activity, created_at, updated_at
```

### 2.3 `player_emergency_contacts` — NEW (this cycle)

```
id, user_id (FK → users, ON DELETE CASCADE), name varchar(200) NOT NULL,
phone varchar(50) NOT NULL, relation varchar(100) NULL, created_at, updated_at
```

Migration: `database/migrations/089_player_emergency_contacts.sql` (creates table + backfills from legacy `player_profiles.emergency_contact_*`). Legacy single-contact columns are retained for backward compatibility; the first contact is mirrored to them on every save.

---

## 3. PLAYER SELF-PROFILE — WHAT THE UI EXPOSES

`ProfilePage.tsx` (routes `/profile` and `/admin/profile`) — payload hydrated by `mapUserResponse`.

### 3.1 Player tab — view mode

| Field | Source column | Permission gate |
|---|---|---|
| fullName / fullPhone / email | users | none (read) |
| avatarUrl | users | none (read) |
| mainSportId / sportName | player_profiles.main_sport_id | none |
| mainLevelId / levelName | player_profiles.main_level_id | none |
| gender | users | none |
| birthDate | users | none |
| timezone | users | none |
| playing_hand | player_profiles.playing_hand | `player.profile.edit.playing-hand` |
| languageId → native_name | users | none |
| darkMode | users | none |
| isCoach / coachStatus | player_profiles.is_coach / coach_status | `coaches.apply` |
| isSeller / sellerStatus | player_profiles.is_seller | `marketplace.sell` |
| interestedSportIds chips | join table | none |
| bio | player_profiles.bio | `player.profile.edit.bio` |
| emergencyContacts (multi) | player_emergency_contacts | `player.profile.view.emergency-contact` |

### 3.2 Player tab — edit mode (PATCH /auth/profile)

| Field | Schema key | Permission gate |
|---|---|---|
| fullName | `fullName` | `profile.edit.first-name` |
| email | `email` | `profile.edit.email` |
| avatarUrl (upload only — URL textbox removed this cycle) | `avatarUrl` | `profile.edit.avatar` |
| gender | `gender` | none |
| birthDate | `birthDate` | `profile.edit.birth-date` |
| mainSportId | `mainSportId` | none |
| mainLevelId | `mainLevelId` | none |
| interestedSportIds | `interestedSportIds` | none |
| playing_hand | `playing_hand` | `player.profile.edit.playing-hand` |
| bio | `bio` | `player.profile.edit.bio` |
| emergencyContacts (multi-entry, add/remove) | `emergencyContacts[]` | `player.profile.view.emergency-contact` |
| Save / Cancel | — | none |

### 3.3 Settings tab

| Field | Source | Permission gate |
|---|---|---|
| languageId | users | `profile.settings.language` |
| darkMode | users | `profile.settings.theme` |
| isPublic (master visibility switch) | users.is_public | `profile.settings.visibility` |
| privacy_show_profile / stats / activity (children, disabled+dimmed when isPublic off) | player_profiles | `player.profile.privacy` |
| notification preferences | notification_preferences | `profile.settings.notifications` |

---

## 4. SUPER ADMIN PROFILE — COMPARISON

**Finding:** Super Admin has **no dedicated profile screen**. The admin route `/admin/profile` (App.tsx:657, inside AdminLayout, guarded by `profile.edit` in adminRoutePermissions.ts:36) renders the **same** `ProfilePage.tsx` as the consumer route. Therefore:

- Player and Super Admin edit **identical fields** through the identical UI.
- There is **no field drift** between the two roles at the profile-screen level.
- Super Admin additionally manages other users' accounts via `/admin/users` (`UserListPage`) — but that is a user-administration screen, not a profile screen.

Result: **profile screen parity is 100%** by construction. The "completeness" question therefore reduces to *what the shared screen exposes vs what the data model holds*, not to a role difference.

---

## 5. COMPLETENESS GAP ANALYSIS (shared screen vs model)

### 5.1 Exposed and editable — complete

Every user-authored field in `users` + `player_profiles` is exposed: name, email, avatar, gender, birth date, language, timezone, theme, playing hand, bio, main sport/level, interested sports, emergency contacts (now multi), privacy toggles, visibility master switch.

### 5.2 Intentionally NOT exposed (correct — should stay hidden)

| Field | Why omitted |
|---|---|
| password_hash | Never exposed; auth-only |
| account_status | System-managed (active/suspended/banned/deleted); admin-managed |
| last_login_at / last_login_ip | Security/audit data; not user-editable |
| is_phone_verified / is_email_verified | System flags; separate verification flows |
| country_id / phone_number / full_phone | Set at registration (E.164, unique); no self-edit flow exists by design |
| has_seen_welcome / has_activated_selling | Internal onboarding/activation flags |
| version | Optimistic-locking counter; internal |
| deleted_at / created_at / updated_at | System timestamps / soft-delete |
| is_coach / coach_status / coach_rejected_reason / is_seller | Application/approval state — surfaced read-only as Coach/Selling status; not directly editable (rejection reason is admin-only) |
| defaultCurrency / defaultCurrencySymbol | Exposed in payload, managed via wallet/checkout; not a profile field |

### 5.3 FINDINGS

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| PRF-001 | Low | `player_profiles.main_level_id` has DB comment "Set at registration; non-editable by player", but the profile edit form exposes an editable Skill Level select (ProfilePage.tsx:756). Either the column comment is stale (level is player-editable by design) or the field should be read-only in edit mode. | Open — recommend confirming product intent and updating the column comment; no code change proposed |
| PRF-002 | Low | Phone number and country are not editable anywhere on the profile (registration-only). Players have no self-service path to change their phone (E.164 unique key) beyond a separate verification flow. | Open — by design; document if a change-phone flow is ever needed |

### 5.4 Changes made this cycle (closing the emergency-contact gap)

| Item | Before | After |
|------|--------|-------|
| Emergency contact | Single Name/Phone/Relation row stored in 3 legacy columns on `player_profiles` | Multi-entry list stored in new child table `player_emergency_contacts`; add/remove UI; validation via `z.array(EmergencyContactSchema)`; first contact mirrored to legacy columns for backward compat |
| Save path | Legacy 3-field sync | `updateProfile` → `userRepository.replaceEmergencyContacts` (DELETE + batch INSERT); legacy path retained when array absent |
| Load path | Legacy columns only | `getEmergencyContacts` (ORDER BY id) → `emergencyContacts` array on `/me` + login responses; falls back to legacy columns when empty |
| Audit | none | `recordAudit(PROFILE.UPDATE)` with changed field keys |
| API contract | 3 legacy fields | Array added (`emergencyContacts[]`); legacy fields still returned (null) — no breaking change |

---

## 6. RECOMMENDATIONS

1. **PRF-001:** Confirm whether skill level should be player-editable; if yes, update the `player_profiles.main_level_id` column comment to remove "non-editable by player"; if no, gate the edit field behind a permission or remove it.
2. **PRF-002:** Document the registration-only phone policy; add a self-service change-phone flow only if product requires it.
3. Keep the child table as the source of truth and drop the legacy single-contact mirror in a future migration once all consumers read `emergencyContacts`.
4. No schema changes required for parity — the shared-screen design already guarantees Player ↔ Super Admin profile parity.
