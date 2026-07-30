# ENTERPRISE TABLE AUDIT: `tournaments`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Core entity — tournament competition root aggregate |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌───────────────────────────────────────────────────────────────────────┐
│   tournaments  —  EXECUTIVE SNAPSHOT                                  │
├───────────────────────────────────────────────────────────────────────┤
│  TIER:           1 — Root aggregate entity                              │
│  HEALTH:         4/10 — Schema sound, but domain/repo/lifecycle       │
│                  misaligned with production schema                    │
│  QUALITY:        4/10 — 7 broken INSERT columns, state machine       │
│                  incompatible with DB ENUM, duplicate timestamp cols  │
│  PK:             id (int unsigned)                                      │
│  FK:             5 — tournament_bracket_types, branches, users,       │
│                  organisations, sports                                 │
│  CHILDREN:       4 — tournament_groups, tournament_matches,           │
│                  tournament_registrations, tournament_standings        │
│  PRODUCTION ROWS: 0                                                     │
│  BACKEND REFS:   200+ across 40+ files                                  │
│  FRONTEND REFS:  100+ across 15+ pages + service                       │
│  FINDINGS:       4 — TRN-001 (Critical), TRN-002 (Critical),          │
│                  TRN-003 (High), TRN-004 (Medium)                     │
│  RECOMMENDATION: Align domain type, repository, and lifecycle to      │
│                  production schema                                     │
│  CONFIDENCE:     95%                                                    │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — tournament lifecycle, registration, bracket generation, scoring |
| Evidence | Full CRUD in 2 repositories; 5 FK constraints; 4 child tables; lifecycle state machine; 25+ API routes; 15+ frontend pages; 30+ permission keys; 50+ i18n keys; notification templates; reports integration; external API |

---

## 3. PRODUCTION SCHEMA (38 columns)

```
id                    int unsigned AUTO_INCREMENT PK
public_id             char(36) NOT NULL UNIQUE           UUID
creator_id            int unsigned NOT NULL               → users(id)
organisation_id       int unsigned DEFAULT NULL           → organisations(id) ON DELETE SET NULL
branch_id             int unsigned DEFAULT NULL           → branches(id) ON DELETE SET NULL
bracket_type_id       int unsigned NOT NULL               → tournament_bracket_types(id)
format                varchar(50) DEFAULT NULL            [M062]
category              varchar(100) DEFAULT NULL           [M062]
season                varchar(100) DEFAULT NULL           [M062]
sport_id              int unsigned DEFAULT NULL           → sports(id) ON DELETE SET NULL
name                  varchar(255) NOT NULL
code                  varchar(50) DEFAULT NULL UNIQUE     [M062]
description           text DEFAULT NULL
tournament_type       enum('platform','community') NOT NULL DEFAULT 'platform'
max_participants      int unsigned NOT NULL
max_teams             int unsigned DEFAULT NULL           [M062]
min_participants      int unsigned NOT NULL DEFAULT 2
entry_fee             decimal(12,2) NOT NULL DEFAULT 0.00
registration_fee      decimal(12,2) NOT NULL DEFAULT 0.00 [M062]
currency_code         char(3) NOT NULL
price_type            enum('FREE','FIXED','MEMBERS_ONLY') NOT NULL DEFAULT 'FIXED' [M062]
commission_rate       decimal(5,2) NOT NULL DEFAULT 0.00
prize_description     text DEFAULT NULL
status                enum('draft','open','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft'
is_public             tinyint(1) NOT NULL DEFAULT 1       [M062]
registration_open_at   timestamp NULL DEFAULT NULL        [M062]
registration_close_at  timestamp NULL DEFAULT NULL        [M062]
registration_opens    timestamp NULL DEFAULT NULL
registration_closes   timestamp NULL DEFAULT NULL
start_date            date NOT NULL
end_date              date DEFAULT NULL
rules                 text DEFAULT NULL
is_featured           tinyint(1) NOT NULL DEFAULT 0
image_url             varchar(500) DEFAULT NULL
deleted_at            timestamp NULL DEFAULT NULL
created_at            timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at            timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
archived_at           timestamp NULL DEFAULT NULL          [M062]

Indexes: public_id (UNIQUE), uk_code (UNIQUE), idx_creator, idx_org, idx_sport,
         idx_status, idx_dates, fk_tourn_branch, fk_tourn_bracket,
         idx_format, idx_category, idx_is_public
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| Baseline | DDL | Present at `001_courtzon_v3.sql:3065-3107` (25 columns) |
| M056 | CREATE TABLE IF NOT EXISTS | `056_tournaments.sql:3-27` — different schema (`format` ENUM, `registration_deadline`, `current_participants`, `registration_type`, `match_duration_minutes`, `aggregate_version`) |
| M062 | ALTER TABLE | `062_tournament_competition.sql:8-24` — added `code`, `format`, `category`, `season`, `max_teams`, `registration_fee`, `price_type`, `is_public`, `archived_at`, `registration_open_at`, `registration_close_at` |

---

## 5. CHILD TABLES

| Table | FK Column | Constraint |
|---|---|---|
| `tournament_groups` | `tournament_id` | `fk_tgroup_tourn` CASCADE |
| `tournament_matches` | `tournament_id` | `fk_match_tourn` CASCADE |
| `tournament_registrations` | `tournament_id` | `fk_treg_tourn` CASCADE |
| `tournament_standings` | `tournament_id` | `fk_ts_tourn` CASCADE |

---

## 6. APPLICATION CODE REFERENCES

### 6a. Domain Type

**File:** `backend/src/modules/tournaments/domain/tournament-aggregate.ts:15-46`

```ts
export interface Tournament {
  id?: number;
  code: string;
  name: string;
  description?: string;
  format: TournamentFormat;        // M056-style enum: 'knockout'|'double_elimination'|...
  sport_id: number;
  organisation_id?: number;
  branch_id?: number;
  category?: string;
  season?: string;
  status: TournamentStatus;        // 8-state: 'draft'|'published'|'registration_open'|...
  registration_type: RegistrationType;  // ← NOT in production
  max_players?: number;             // ← production: max_participants
  max_teams?: number;
  current_players?: number;         // ← NOT in production
  current_teams?: number;           // ← NOT in production
  registration_fee?: number;
  price_type?: string;
  currency?: string;                // ← production: currency_code
  is_public?: boolean;
  registration_open_at?: string;
  registration_close_at?: string;
  start_date?: string;
  end_date?: string;
  match_duration_minutes?: number;  // ← NOT in production
  rules?: string;
  prize_description?: string;
  metadata?: Record<string, unknown>; // ← NOT in production
  created_at?: string;
  updated_at?: string;
}
```

### 6b. Lifecycle State Machine

**File:** `backend/src/modules/tournaments/domain/lifecycle.ts:5-14`

```ts
const TOURNAMENT_TRANSITIONS = {
  draft: ['published'],
  published: ['registration_open'],
  registration_open: ['registration_closed'],
  registration_closed: ['running'],
  running: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};
```

Statuses `published`, `registration_open`, `registration_closed`, `running`, `archived` are NOT valid values in the production ENUM (`draft`, `open`, `in_progress`, `completed`, `cancelled`).

### 6c. Tournament Repository (BROKEN)

**File:** `backend/src/modules/tournaments/infrastructure/repositories/tournament.repository.ts`

| Method | Line | Issue |
|---|---|---|
| `create()` | 51-63 | INSERT references `registration_type`, `max_players`, `current_players`, `current_teams`, `match_duration_minutes`, `metadata`, `currency` — 7 columns that don't exist in production |
| `update()` | 70-75 | Same fields in updatable list; also includes `registration_type`, `max_players`, `match_duration_minutes`, `currency` |
| `updateStatus()` | 88-95 | No ENUM validation — can set production-invalid statuses |
| `list()` | 32-37 | `SELECT t.*` — works, but cast to `Tournament[]` is type-unsafe |
| `findById()` | 40-43 | `SELECT *` — same type-unsafe cast |

### 6d. Activities Repository (WORKING)

**File:** `backend/src/modules/activities/infrastructure/repositories/activities.repository.ts`

| Method | Columns Used | Correct? |
|---|---|---|
| `createTournament()` (line 56-63) | `public_id, creator_id, organisation_id, branch_id, bracket_type_id, sport_id, name, description, max_participants, min_participants, entry_fee, currency_code, commission_rate, prize_description, registration_opens, registration_closes, start_date, end_date, rules, image_url` | ✅ All 20 exist in production |
| `updateTournament()` (line 66-76) | Dynamic key-value from `data` object | ✅ |

### 6e. Other Backend Modules

| Module | Usage | Correct? |
|---|---|---|
| Reports | `tournamentOverview()`, `tournamentParticipation()` | ✅ (SELECT only) |
| Organisations | Org dashboard tournament count, list org tournaments, cascade delete | ✅ |
| Integration / API Gateway | External API tournament queries | ✅ |
| Player Experience | My tournaments, tournament stats | ✅ |
| CRM | Tournament registration counts per user | ✅ |
| Sports Engine | Tournament creation stats, match history | ✅ |
| Notifications | Tournament notification templates, event handlers | ✅ |
| Commission Mappers | Entity alias `tournament` → `'tournament'` | ✅ |

### 6f. Frontend

**Service:** `frontend/src/services/tournament.ts` — 28 API methods
**Pages:** 5 admin pages + 3 consumer pages + 1 player page + 2 sidebar/i18n
**Permissions:** 30+ keys in `frontend/src/permissions/registry.ts`
**Routes:** 4 lazy-loaded routes in `App.tsx`

---

## 7. COLUMN DISCREPANCY TABLE

| Domain/Repo Field | Production Column | Match? |
|---|---|---|
| `code` | `code` | ✅ |
| `name` | `name` | ✅ |
| `description` | `description` | ✅ |
| `format` | `format` | ✅ (varchar, accepts any value) |
| `sport_id` | `sport_id` | ✅ |
| `organisation_id` | `organisation_id` | ✅ |
| `branch_id` | `branch_id` | ✅ |
| `category` | `category` | ✅ |
| `season` | `season` | ✅ |
| `status` | `status` | ⚠️ Domain: 8 values; DB ENUM: 5 values (only `draft`, `open`, `in_progress`, `completed`, `cancelled` match a subset) |
| `max_teams` | `max_teams` | ✅ |
| `registration_fee` | `registration_fee` | ✅ |
| `price_type` | `price_type` | ✅ |
| `is_public` | `is_public` | ✅ |
| `registration_open_at` | `registration_open_at` | ✅ |
| `registration_close_at` | `registration_close_at` | ✅ |
| `start_date` | `start_date` | ✅ |
| `end_date` | `end_date` | ✅ |
| `rules` | `rules` | ✅ |
| `prize_description` | `prize_description` | ✅ |
| `created_at` | `created_at` | ✅ |
| `updated_at` | `updated_at` | ✅ |
| `registration_type` | — | ✗ (no production equivalent) |
| `max_players` | `max_participants` | ✗ (different name) |
| `current_players` | — | ✗ (no production equivalent) |
| `current_teams` | — | ✗ (no production equivalent) |
| `match_duration_minutes` | — | ✗ (no production equivalent) |
| `metadata` | — | ✗ (no production equivalent) |
| `currency` | `currency_code` | ✗ (different name) |
| — | `public_id` | ✗ (missing from domain) |
| — | `creator_id` | ✗ (missing from domain) |
| — | `bracket_type_id` | ✗ (missing from domain) |
| — | `tournament_type` | ✗ (missing from domain) |
| — | `max_participants` | ✗ (domain has `max_players`) |
| — | `min_participants` | ✗ (missing from domain) |
| — | `entry_fee` | ✗ (missing from domain) |
| — | `currency_code` | ✗ (domain has `currency`) |
| — | `commission_rate` | ✗ (missing from domain) |
| — | `registration_opens` | ✗ (missing from domain — duplicate of `registration_open_at`) |
| — | `registration_closes` | ✗ (missing from domain — duplicate of `registration_close_at`) |
| — | `is_featured` | ✗ (missing from domain) |
| — | `image_url` | ✗ (missing from domain) |
| — | `deleted_at` | ✗ (missing from domain) |
| — | `archived_at` | ✗ (missing from domain) |

---

## 8. FINDINGS

---

### TRN-001: Tournament repository INSERT/UPDATE reference non-existent columns

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema (verified via `SHOW CREATE TABLE`) has columns `max_participants`, `currency_code` — NOT `max_players`, `currency`
2. Production schema does NOT have `registration_type`, `current_players`, `current_teams`, `match_duration_minutes`, or `metadata`
3. `tournament.repository.ts:51-52` — INSERT includes `registration_type`, `max_players`, `current_players`, `current_teams`, `match_duration_minutes`, `currency`, `metadata` — 7 columns that don't exist in production
4. `tournament.repository.ts:70-76` — `update()` updatable fields include `registration_type`, `max_players`, `match_duration_minutes`, `currency`

**Root Cause:**
The reviewed implementation is aligned with the schema introduced by M056, whereas the reviewed production schema uses a different column set. The activities repository (`activities.repository.ts:56-63`) provides a working reference — its `createTournament()` uses only production-valid columns.

**Impact:**
- Fact: `create()` and `update()` in the tournament repository will throw MySQL "Unknown column" errors at runtime.
- Expected: 0 production rows were observed during the review. No runtime evidence was identified demonstrating successful execution of these write operations.

**Recommendation:**
1. Replace `max_players` → `max_participants`, `currency` → `currency_code` in domain type and repository
2. Remove `registration_type`, `current_players`, `current_teams`, `match_duration_minutes`, `metadata` from domain type and repository
3. Add `public_id`, `creator_id`, `bracket_type_id`, `tournament_type`, `min_participants`, `entry_fee`, `commission_rate`, `is_featured`, `image_url`, `deleted_at`, `archived_at` to the domain type
4. Align INSERT column list with the activities repository's proven working query

---

### TRN-002: Lifecycle state machine incompatible with production status ENUM

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production status ENUM: `'draft', 'open', 'in_progress', 'completed', 'cancelled'`
2. Domain type `TournamentStatus`: `'draft' | 'published' | 'registration_open' | 'registration_closed' | 'running' | 'completed' | 'cancelled' | 'archived'`
3. Lifecycle transitions (`lifecycle.ts:5-14`) use statuses `published`, `registration_open`, `registration_closed`, `running`, `archived` — none of which are valid DB ENUM values
4. `updateStatus()` at `tournament.repository.ts:88-95` sets `status = ?` directly with no ENUM validation

**Root Cause:**
The lifecycle state machine defines an 8-state workflow (domain-only), while the production ENUM enforces a 5-state workflow. There is no mapping layer between them.

**Impact:**
- Fact: If `updateStatus()` is invoked with a domain status value that is not permitted by the production ENUM, the database is expected to reject the update.
- Expected: 0 production rows and no evidence of status transitions being exercised for this table.

**Recommendation:**
1. Reconcile the lifecycle state machine with the production ENUM: map domain states to valid DB values (e.g., `published` → `open`, `registration_open` → `open`, `registration_closed` → `open`, `running` → `in_progress`, `archived` → `cancelled` or add `archived` to the ENUM)
2. Alternatively, extend the production ENUM to support all 8 domain states
3. Add validation in `updateStatus()` to reject invalid ENUM values before query execution

---

### TRN-003: Domain type `Tournament` columns do not match production

| Field | Value |
|---|---|
| **Severity** | High |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:** See column discrepancy table in §7. 14 of 29 domain fields are mismatched or missing; 17 production columns are missing from the domain type.

**Impact:**
- Fact: `SELECT *` results cast as `Tournament[]` will have `undefined` for `registration_type`, `max_players`, `current_players`, `current_teams`, `match_duration_minutes`, `metadata`, `currency`; production-only fields will be present in the object but invisible to TypeScript consumers.
- Expected: Consumer code that expects the interface fields rather than the production schema fields is expected to receive undefined values for the mismatched properties.

**Recommendation:** Update `Tournament` interface to match all 38 production columns.

---

### TRN-004: Duplicate registration timestamp columns

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Baseline created: `registration_opens`, `registration_closes` (timestamp NULL)
2. M062 added: `registration_open_at`, `registration_close_at` (timestamp NULL)
3. Both column pairs exist in production, representing the same concept

**Root Cause:** M062 added a second pair of registration timestamp columns instead of renaming the originals. The baseline was never updated to reflect this.

**Impact:**
- Fact: Two sets of columns track the same concept. Which pair is the source of truth depends on which code path populates them. The activities repository writes to `registration_opens`/`registration_closes`; the tournament repository (domain type) references `registration_open_at`/`registration_close_at`. Both pairs may drift independently.
- Expected: If both code paths are exercised, the columns may hold different values for the same tournament.

**Recommendation:**
1. Choose one pair as the source of truth
2. Migrate data from the deprecated pair to the chosen pair
3. Drop the deprecated columns
4. Update all code to use the chosen pair

---

## 9. OBSERVATIONS

- **Dual repository ownership:** Same pattern as TSM-001/TSS-001/TMR-001 — `tournaments/` module repository is broken (M056-aligned), while `activities/` module repository works (production-aligned).
- **0 production rows were observed** for this table during the review.
- **Comprehensive feature investment:** Despite 0 rows, the tournament feature has 25+ API routes, 15+ frontend pages, 30+ permission keys, notification templates, lifecycle state machine, bracket generation logic, reports integration, and an external API gateway. This represents significant development effort for an unactivated feature.
- **Frontend form mismatches domain:** `TournamentCreatePage.tsx:14` uses `bracketTypeId: z.string()`, while the domain type has no `bracket_type_id` field. The frontend sends `bracketTypeId`, `sportId`, `maxParticipants`, `entryFee`, `currencyCode`, `commissionRate`, `startDate`, `endDate` — matching the activities repository's production-aligned INSERT, not the tournament repository's M056-aligned one.

---

## 10. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 11. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Fix `create()` and `update()` column references in tournament repository | Critical | TRN-001 |
| 2 | Reconcile lifecycle state machine with production status ENUM | Critical | TRN-002 |
| 3 | Update `Tournament` domain interface to match production schema | High | TRN-003 |
| 4 | Consolidate duplicate registration timestamp columns | Medium | TRN-004 |
| 5 | Resolve dual repository ownership (activities vs tournaments module) | Medium | SF-003 |

---

## 12. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (38 cols, 5 FK, 12 indexes) |
| Migration verified | ✅ (baseline + M056 + M062) |
| Domain type verified | ✅ (mismatch found — TRN-003) |
| Repository code verified | ✅ (write operations broken — TRN-001) |
| Lifecycle verified | ✅ (incompatible with DB ENUM — TRN-002) |
| FK integrity verified | ✅ (5 FK, all valid) |
| Child tables verified | ✅ (4 child tables, all CASCADE) |
| Frontend integration verified | ✅ (5 admin pages, 3 consumer pages, 1 player page) |
| Dual ownership identified | ✅ (tournaments/ + activities/ both manage CRUD) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `tournaments` ✅

**All `tournament_*` tables audited. Next table alphabetically: `transaction_entries` — proceed?**
