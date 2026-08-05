# REVERSE PROFILE COMPLETENESS AUDIT: Player Profile → Super Admin User Details

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Direction** | Player self-profile (`ProfilePage.tsx`) vs Super Admin User Details (`UserEditModal.tsx` + `GET /admin/users/:id`) |
| **Purpose** | Identify every Player-specific field NOT visible to the Super Admin; recommend exposure |
| **Super Admin surface** | `UserEditModal.tsx` (7 tabs: Profile / Roles & Orgs / Branch Access / Bookings / Academies / Orders / Activity Log) fed by `rbac.repository.ts:527-544` (`getUserById`) |
| **Player surface** | `ProfilePage.tsx` 3 tabs (Player / Coach / Settings) fed by `/auth/me` (`auth.service.ts:673-724` `mapUserResponse`), `/coaches/profile/me`, `/coaches/availability/me`, `/coaches/agreements`, `/marketplace/player/status`, `/notification-preferences` |
| **Authoritative sources** | `ProfilePage.tsx` (full 1132 lines), `UserEditModal.tsx` (716 lines), `rbac.repository.ts:527-605`, `auth.service.ts:673-724`, baseline tables `player_profiles` / `player_emergency_contacts` / `player_sport_interests` / `coach_profiles` / `professional_profiles` / `professional_services` / `coach_availability` / `coach_org_agreements` |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PLAYER PROFILE → ADMIN USER DETAILS — EXECUTIVE SNAPSHOT               │
├─────────────────────────────────────────────────────────────────────────┤
│  FIELDS VISIBLE ON BOTH:        8                                        │
│  PLAYER FIELDS MISSING FROM     18 total:                               │
│    ADMIN SURFACE:               · 8 returned by API but NOT rendered     │
│                                 · 10 not in admin API at all             │
│  MOST CRITICAL GAP:             Coach application content (bio, rate,    │
│                                 certs, availability) is INVISIBLE to the │
│                                 admin who approves/rejects it            │
│  FINDINGS:                      4 (AUS-001 coach approval blind spot,    │
│                                 AUS-002 multi-entry emergency contacts   │
│                                 not exposed, AUS-003 interests missing,   │
│                                 AUS-004 no read-only profile detail view)│
└─────────────────────────────────────────────────────────────────────────┘
```

**Why the gap exists (evidence):** `getUserById` (`rbac.repository.ts:527-544`) selects `u.*` + a **fixed** subset of `player_profiles` (`main_sport_id, is_seller, main_level_id, playing_hand, bio, emergency_contact_* , privacy_show_*`) + only `coach_profiles.status` and `cp.rejected_reason`. It does **NOT** join `player_sport_interests`, `player_emergency_contacts`, `professional_profiles`, `professional_services`, `coach_availability`, or `coach_org_agreements`. The `UserEditModal` renders only `fullName, email, phoneNumber, accountStatus, gender, countryId, languageId, mainSportId, mainLevelId` + a coach-status badge — the other returned columns (`birth_date, timezone, dark_mode, playing_hand, bio, is_public, privacy_show_*`, legacy emergency contacts) are **never rendered**.

---

## 2. THE TWO SURFACES AT A GLANCE

### 2.1 Player Profile (`ProfilePage.tsx`)

| Tab | Content |
|---|---|
| **Player** | Header (avatar, name, fullPhone, email, main sport–level chip); cards: gender, birthDate, timezone, playing hand, language, theme, coach status (+ apply/reapply), free selling (+ activate); interested sports chips; bio; multi-entry emergency contacts; edit form (name, email, avatar upload, gender, birth date, main sport, level, interested sports, playing hand, bio, emergency contacts) |
| **Coach** (approved only) | Bio, experience years, hourly rate + currency, sports, verified/available status, session durations, certifications, weekly availability, org agreements (split % / status) |
| **Settings** | Language, theme (light/dark/system), profile visibility switch (`isPublic`), privacy toggles (show profile/stats/activity), notification preferences per category |

### 2.2 Admin User Details (`UserEditModal.tsx`)

| Tab | Content |
|---|---|
| **Profile** | Avatar (small), name, email, gender, account status (active/suspended/banned), country, language, main sport, level, "Assign as Coach" toggle + status badge, Save, Change Password |
| **Roles & Orgs** | Current roles, organisations, assign/remove role |
| **Branch Access / Bookings / Academies / Orders / Activity Log** | Administrative histories + audit trail (type, description, IP, date) |

---

## 3. FIELD-BY-FIELD COMPARISON TABLE

Legend: **BOTH** = visible on both screens · **API-ONLY** = returned by `GET /admin/users/:id` but never rendered · **MISSING** = absent from the admin API entirely · **N/A** = not applicable (not a profile field)

### 3.1 Fields visible on BOTH screens (8)

| # | Field | Player screen | Admin screen | Admin editable? |
|---|---|---|---|---|
| 1 | `full_name` | header + edit form | Profile tab | ✅ `users.edit.first-name` |
| 2 | `email` | header + edit form | Profile tab | ✅ `users.edit.email` |
| 3 | `gender` | card + edit form | Profile tab | ✅ |
| 4 | `language_id` | card + settings tab | Profile tab | ✅ |
| 5 | `main_sport_id` | chip + edit form | Profile tab | ✅ |
| 6 | `main_level_id` | chip + edit form | Profile tab | ✅ |
| 7 | `phone_number` | header (`fullPhone`) | Profile tab (`phone_number`) | ✅ |
| 8 | coach status + free-selling badge | player cards / admin header badge | ✅ (state, not fields) | ⚠ status via `coaches.assign` |

### 3.2 Player fields MISSING from the Admin UI — returned by API but never rendered (8)

| # | Field | Source (API) | Admin UI today | ① Should admin view? | ② Read-only? | ③ Recommend implementing? |
|---|---|---|---|---|---|---|
| M1 | `birth_date` | `u.birth_date` (`u.*`) | not rendered | **Yes** — age-eligibility/verification context | **Read-only** (player owns self-edit) | **Yes** — add DOB display row on Profile tab |
| M2 | `timezone` | `u.timezone` (`u.*`) | not rendered | **Yes** (low value) — booking/availability context | **Read-only** | **Yes** (cheap) |
| M3 | `dark_mode` (theme) | `u.dark_mode` (`u.*`) | not rendered | **Yes** (low) — support/debug | **Read-only** | **Optional** — low value for admin |
| M4 | `playing_hand` | `pp.playing_hand` | not rendered | **Yes** — scouting/matchmaking context | **Read-only** | **Yes** |
| M5 | `bio` | `pp.bio` | not rendered | **Yes** — profile review | **Read-only** | **Yes** |
| M6 | `is_public` (visibility) | `u.is_public` (`u.*`) | not rendered | **Yes** (low) — understand discoverability | **Read-only** | **Optional** |
| M7 | `privacy_show_profile` / `stats` / `activity` | `pp.privacy_show_*` | not rendered | **Yes** (low) | **Read-only** | **Optional** |
| M8 | legacy `emergency_contact_name/phone/relation` | `pp.emergency_contact_*` | not rendered | **Yes — HIGH (safety/emergency context)** | **Read-only** (player-owned PII) | **Yes** |

### 3.3 Player fields MISSING from the admin API entirely (10)

| # | Field | Player source | Admin today | ① Should admin view? | ② Read-only? | ③ Recommend implementing? |
|---|---|---|---|---|---|---|
| M9 | `interestedSportIds` (sports interests) | `player_sport_interests` (via `mapUserResponse`) | **not joined** in `getUserById` | **Yes** — matching/recommendations context | **Read-only** | **Yes** — LEFT JOIN + aggregate array |
| M10 | `emergencyContacts[]` (multi-entry) | `player_emergency_contacts` (NEW) | **not joined**; admin only sees legacy single contact | **Yes — HIGH** (this is now the authoritative emergency data; admin sees stale legacy mirror only) | **Read-only** | **Yes** — LEFT JOIN + `JSON_ARRAYAGG` |
| M11 | Notification preferences (per-category on/off) | `/notification-preferences` | **no access** | **Yes** (medium) — support/debug, quiet-hours understanding | **Read-only** | **Yes** (medium) — read-only summary endpoint or joined payload |
| M12 | Coach `bio` (`professional_bio`) | `professional_profiles` | **not joined** | **Yes — HIGH** (approval decision content) | **Read-only** | **Yes** |
| M13 | Coach `experience_years` | `professional_profiles` | **not joined** | **Yes — HIGH** | **Read-only** | **Yes** |
| M14 | Coach `hourly_rate` + `currency_code` | `professional_services.price` / `currency_code` | **not joined** | **Yes — HIGH** (approval + settlement) | **Read-only** | **Yes** |
| M15 | Coach `sports` (officiated/coached IDs) | `professional_profiles.sports` (JSON) | **not joined** | **Yes — HIGH** | **Read-only** | **Yes** |
| M16 | Coach `certifications` (name+url) | `professional_profiles.certifications` (JSON) | **not joined** | **Yes — HIGH** (verification evidence) | **Read-only** | **Yes** |
| M17 | Coach `is_verified`, `is_available` | `coach_profiles.is_verified` / `professional_profiles.is_available` | **not joined** (only `status`) | **Yes** — verify/availability context | **Read-only** | **Yes** |
| M18 | Coach session durations + weekly availability | `professional_services.session_durations` + `coach_availability` | **not joined** | **Yes** (medium) — scheduling context | **Read-only** | **Yes** (medium) |
| M19 | Coach org agreements (split % / status) | `coach_org_agreements` | **not joined** | **Yes** (medium) — settlement/review context | **Read-only** | **Yes** (medium) |

---

## 4. ANALYSIS PER MISSING GROUP

### 4.1 M1–M7: Expose-but-render (API already has the data)

- **Recommendation for all:** render read-only rows on the admin Profile tab; no backend change required (data already in `getUserById` payload). Group into a "Player Details (read-only)" section under the existing profile form.
- **Priorities:** `bio` (M5) and `playing_hand` (M4) most valuable; `dark_mode`/`is_public`/`privacy_*` optional; `timezone`/`birth_date` cheap additions.
- **Why read-only:** these are self-managed player attributes; admin editing them is not needed and risks overwriting user preference. Admin edit of `main_sport_id`/`main_level_id` already exists — the read-only list covers the remainder.

### 4.2 M8, M10: Emergency contacts — HIGH priority, safety-critical

- Legacy single contact (M8) already reaches the API but is not rendered — **must** be added to the admin UI.
- Multi-entry `emergencyContacts[]` (M10, `player_emergency_contacts`) is the **new authoritative source** (migration 089). Admin currently sees only the stale legacy mirror (first contact copied at save time). Any rescue/safety workflow run by admins operates on incomplete data.
- **Recommendation:** add `LEFT JOIN` + `JSON_ARRAYAGG` to `getUserById` returning `emergency_contacts`, **read-only**, rendered in a dedicated "Emergency Contacts" card on the Profile tab. Do **not** allow admin edits (player-owned PII).

### 4.3 M9: Sports interests — matching context

- `player_sport_interests` drives recommendations/matching but is invisible to admin. **Recommend:** `LEFT JOIN` + aggregated array, **read-only**.

### 4.4 M12–M19: Coach application content — the biggest blind spot (AUS-001)

- Admins approve/reject coach applications from the User Details screen (`coaches.assign`, superAdminGuard approve/reject) but can see **only** `coach_status` + `coach_rejected_reason` — **not** the submitted bio, experience, hourly rate, certifications, or availability that the decision should be based on. The player's Coach tab is the only place this content exists.
- **Recommendation:** extend `getUserById` (or add an admin coach-detail join) to return coach profile, services, availability, and agreements — **read-only** (the player owns the data via `/coaches/profile`). Render as a read-only "Coach Profile" section on the Profile tab when `coach_status != 'none'`.

### 4.5 M11: Notification preferences — support/debug

- Per-category toggles are user-owned. **Recommend:** read-only summary for admins (medium priority); do not allow admin edits (user preference).

---

## 5. FINDINGS

| ID | Severity | Finding | Recommendation |
|----|----------|---------|----------------|
| AUS-001 | **High** | Admins approve/reject coaches without seeing the application content (bio, rate, certs, availability) — decision blind spot | Add read-only coach profile + services + availability + agreements to `getUserById` and render on Profile tab |
| AUS-002 | **High** | New multi-entry `player_emergency_contacts` is invisible to admin; only stale legacy mirror is exposed | LEFT JOIN + `JSON_ARRAYAGG` in `getUserById`; render read-only card |
| AUS-003 | Medium | Sports interests (`player_sport_interests`) not exposed to admin | LEFT JOIN aggregate; render read-only chips |
| AUS-004 | Medium | No read-only "Player Details" view: 8 fields already in the API payload are never rendered | Render M1–M8 as read-only rows on Profile tab (zero backend change for M1–M7) |

---

## 6. CONCLUSIONS

1. **8 fields are visible to both** (name, email, gender, language, main sport, level, phone, coach-status/free-selling badges).
2. **18 player-specific fields are invisible to the Super Admin** — 8 returned by the API but unrendered (M1–M8), 10 absent from the API entirely (M9–M19).
3. **Two high-severity gaps:** coach application content (AUS-001) and multi-entry emergency contacts (AUS-002) — both are data admins should legitimately see for approval and safety workflows.
4. **All 18 missing fields should be viewable and read-only** — none are sensitive enough to hide from a Super Admin, and none need admin editing (player self-management is the ownership model).
5. **No schema changes required** — the fix is: (a) render M1–M8 read-only in `UserEditModal`, (b) extend `getUserById` joins for M9–M19 (interests, emergency contacts, coach profile/services/availability/agreements, notification prefs summary). All exposed fields are read-only per the player-ownership model; permission keys (`users.view.*` / a new `users.view.profile-details`) per RBAC-by-Default would gate the new sections.
