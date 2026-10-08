# 129 — Database Residue Audit (F-04 + F-05)

**Step:** 5I-5 (read-only audit)
**Date:** 2026-10-09
**Scope:** `F-04` database permission residue · `F-05` stale AR locale rows
**Status:** Audit complete — **no database, source, seed, migration, Docker, or permission changes made.** This document is the only new artifact.
**Baseline HEAD (unchanged):** `1a56e8fc284cfead261dcea7279bc3cf7b55857e` — working tree clean, `HEAD == origin/master`.

---

## 1. Executive Summary

The step examined whether F-04 (dead permission rows) and F-05 (stale Arabic translation rows) are
genuinely actionable database issues or harmless historical/seed residue.

**Conclusion: both are B — seed-level residue with no runtime, security, or performance impact.
No database change is justified.** Stale rows remain in the live Docker DB (`courtzon_v3`) purely
because the runtime no longer references them and the seeds were never refreshed; they are inert.

| Finding | Live DB rows | Runtime consumers | Security risk | DB change justified? | Action |
|---------|--------------|-------------------|---------------|----------------------|--------|
| `sidebar.tournament-matches` (perm id 22004) | row + 4 role grants | **none** | none | No | Seed cleanup later (B) |
| `tournaments.enter_scores` (perm id 518) | row + 2 role grants | **none** (registered, dormant) | none | No | Seed + registry cleanup later (B) |
| `admin-tournaments.view` / `tournaments.edit` / `tournaments.delete` | rows + grants | **live** (page gates, list actions, role templates) | none | No — must be **kept** | Sync component_path later |
| 7 stale AR translation rows (F-05) | 8 rows in `translations` + 2 deprecated `translation_keys` rows | **none** | none | No | Seed cleanup later (B) |

---

## 2. Current Database State

Environment queried: Docker MySQL container `courtzon-mysql` (port 3307), database `courtzon_v3`
(read-only `SELECT`/`SHOW` only).

| Object | Count | Notes |
|--------|-------|-------|
| `permissions` | 965 | `permission_key` UNIQUE; `is_system` soft-protect; FK → `permission_modules` (CASCADE) |
| `role_permissions` | 13,043 | UNIQUE(`role_id`,`permission_id`); FK → `permissions` and `roles`, both ON DELETE CASCADE |
| `translations` | 726 | 697×`ar` + 29×`en`; UNIQUE(`locale`,`key`) |
| `translation_keys` | 2,682 | 18 marked `is_deprecated = TRUE`; UNIQUE(`key`) |

Relevant schema facts used by this audit:

- `permissions`: `id`, `module_id`, `permission_key`, `description`, `is_system`, `created_at`,
  `element_type`, `element_label`, `is_ui_element`, `component_path`.
- `role_permissions` cascades deletes from both sides → deleting a `permissions` row automatically
  removes every role grant for it (no orphan grants possible).
- `translations` has no active/status column and no FK to `translation_keys` (loose key string).
- `translation_keys.is_deprecated` exists but the public bundle builder **does not filter on it**
  (see §8).

---

## 3. F-04 Permission Residue Audit

### 3.1 Live DB rows (`courtzon_v3.permissions`)

```sql
SELECT id, module_id, permission_key, is_system, element_type, element_label,
       is_ui_element, component_path
FROM permissions
WHERE permission_key IN ('sidebar.tournament-matches','tournaments.enter_scores',
                         'admin-tournaments.view','tournaments.edit','tournaments.delete')
ORDER BY permission_key;
```

| id | module_id | key | is_system | element_type | element_label | is_ui_element | component_path |
|----|-----------|-----|-----------|--------------|---------------|---------------|----------------|
| 12220 | 10 | `admin-tournaments.view` | 0 | page | Tournaments Admin Page | 1 | `pages/admin/tournaments/TournamentAdminPage.tsx` ⚠️ **stale path** |
| 12221 | 10 | `tournaments.edit` | 0 | button | Edit Tournament | 1 | `pages/admin/tournaments/TournamentAdminPage.tsx` ⚠️ **stale path** |
| 12222 | 10 | `tournaments.delete` | 0 | button | Delete Tournament | 1 | `pages/admin/tournaments/TournamentAdminPage.tsx` ⚠️ **stale path** |
| 518 | 10 | `tournaments.enter_scores` | 0 | action | Enter Match Scores | 1 | NULL |
| 22004 | 48 | `sidebar.tournament-matches` | 0 | tab | Sidebar: Tournament Matches | 1 | `components/layout/AdminSidebar.tsx` |

**Observation — live trio metadata drift.** The three live keys (`admin-tournaments.view`,
`tournaments.edit`, `tournaments.delete`) still carry the **deleted** component path
`pages/admin/tournaments/TournamentAdminPage.tsx` (deleted in Step 5I-1). The frontend registry was
retargeted to `pages/admin/tournament/TournamentListPage.tsx`, but `sync-ui-registry.js` was **not
re-run afterwards**, so the DB (and seed 001, which mirrors it) still show the old path.
`component_path` is display-only metadata for the Admin → UI Permissions screen; it plays no role in
permission evaluation. **Not a runtime issue** — it is resolved by re-running the sync script in the
future F-04 cleanup step (the script has an `UPDATE permissions SET ... component_path = ?` branch).

### 3.2 Repository occurrence classification

**`sidebar.tournament-matches` (28 matches):**

| Class | Files |
|-------|-------|
| Seed | `database/seeds/001_baseline.sql` (row 22004) |
| Live DB | `courtzon_v3.permissions` id 22004 + 4 role grants |
| Runtime application | **none** (removed from `registry.ts`, `admin.registry.ts`, sidebar, routes) |
| Migration | **none** |
| Test / parity fixture | **none** |
| Documentation | `docs/HANDOVER_CURRENT/110…128*.md`, `docs/navigation/phase1-parity-report.md`, `docs/enterprise-library/TECH-UX-03_Navigation_Architecture.md` (still lists it as a nav key) |
| Generated artifact | `docs/enterprise-library/exports/*.json` (permissions_index, permissions, knowledge graph, AI corpus) |
| Historical/archive | prior step docs (110–128), step-removal docs (125/126/127) |

**`tournaments.enter_scores` (60 matches):**

| Class | Files |
|-------|-------|
| Seed | `database/seeds/001_baseline.sql` (row 518) + `database/seed/003_baseline_snapshot.sql` (row 518, historical snapshot) |
| Live DB | `courtzon_v3.permissions` id 518 + 2 role grants |
| Runtime application | **none** — no `<Can>`/`can()` consumer; never a backend guard |
| Registry (dormant) | `frontend/src/permissions/registry.ts:732` — still registered as `action`, no consumer |
| Migration | **none** |
| Test | `frontend/src/pages/tournaments/__tests__/TournamentDetailPage.spec.tsx:484-487` — **guard test asserting no consumer remains** |
| Documentation | audits 110–128, enterprise-library `BIZ-PROD-02`, `TECH-MOD-35`, `api_catalog` |
| Generated artifact | `docs/enterprise-library/exports/*.json` (incl. a stale `api_catalog.json` line listing it as the guard for `POST /matches/:matchId/score`, which actually requires `matches.result.submit`) |
| Historical/archive | prior step docs (112–122, 127) |

**Live trio (25 frontend + 13 backend matches):**

| Class | Files |
|-------|-------|
| Runtime application | `TournamentListPage.tsx:70-71` (admin gate trio), `TournamentDashboardPage.tsx:45` (`<Can permission="admin-tournaments.view">`), `TournamentDetailPage.tsx:98` |
| Registry | `frontend/src/permissions/registry.ts:453-455` (retargeted to `TournamentListPage.tsx`) |
| Role templates | `backend/src/modules/rbac/application/role-permission-templates.ts:169,181-182` and `backend/scripts/role-permission-templates.mjs:181,201-202` |
| Tests | `TournamentListPage.spec.tsx`, `TournamentHub.spec.tsx`, `TournamentAdminPageRemoval.spec.ts` (5I-1 guard), `parity.test.ts` (fixture), `template-parity.spec.ts` |
| Seed | `database/seeds/001_baseline.sql` (rows 12220/12221/12222 — **note: same stale component_path as live DB**) |
| Live DB | rows + 4/3/3 role grants |
| Migration | **none** |

**Backend route guards:** zero occurrences of `sidebar.tournament-matches` or
`tournaments.enter_scores` anywhere in `backend/src` (routes, middleware, templates, services).
Neither key can gate any endpoint.

---

## 4. Permission Runtime Consumer Matrix

| Key | Frontend runtime | Backend runtime | Registry.ts | Role templates (src+scripts) | Tests | Parity fixture | Seed 001 | Migration | Verdict |
|-----|------------------|-----------------|-------------|------------------------------|-------|----------------|----------|-----------|---------|
| `sidebar.tournament-matches` | — | — | — | — | — | — | ✅ row 22004 | — | **Orphaned — seed+DB residue** |
| `tournaments.enter_scores` | — | — | ✅ dormant (732) | — | ✅ absence-guard only | — | ✅ row 518 | — | **Orphaned — registry+seed residue** |
| `admin-tournaments.view` | ✅ | — | ✅ (453) | ✅ | ✅ | ✅ fixture | ✅ 12220 | — | **LIVE — keep** |
| `tournaments.edit` | ✅ | — | ✅ (454) | ✅ | ✅ | ✅ fixture | ✅ 12221 | — | **LIVE — keep** |
| `tournaments.delete` | ✅ | — | ✅ (455) | ✅ | ✅ | ✅ fixture | ✅ 12222 | — | **LIVE — keep** |

---

## 5. Role Grant Analysis

Live grants (`role_permissions`) as of audit time:

| Permission | Roles granted | Role ids |
|------------|---------------|----------|
| `admin-tournaments.view` | Super Admin, Master Admin, Read Only Admin, Auditor | 1, 12, 26, 25 |
| `sidebar.tournament-matches` | Super Admin, Master Admin, Read Only Admin, Auditor | 1, 12, 26, 25 |
| `tournaments.edit` | Super Admin, Master Admin, Tournament Mgr | 1, 12, 19 |
| `tournaments.delete` | Super Admin, Master Admin, Tournament Mgr | 1, 12, 19 |
| `tournaments.enter_scores` | Super Admin, Tournament Mgr | 1, 19 |

Notes:

- **Administrative roles only.** No player/org/customer-facing role holds any of the five keys.
- **Seed ⇄ DB drift:** `database/seeds/001_baseline.sql` carries role grants only for Super Admin
  (`role_id=1`) for ids 518/12220/12221/12222, and **none** for `sidebar.tournament-matches`
  (22004). The non-Super-Admin grants in the live DB originate from historical
  `sync-role-permissions` template runs (when `sidebar.tournament-matches` was still in
  `TOURNAMENT_WORKBENCH_KEYS`, removed in Step 126/127) and from later UI toggling. Fresh installs
  from the current seed therefore reproduce **only** the Super Admin grants.
- `permissions.is_system = 0` for all five → none are system-locked; all are deletable via the
  Admin UI Permissions screen, which cascades to `role_permissions` automatically
  (FK ON DELETE CASCADE).
- Removing the dead keys would **not change any effective authorization**: no middleware, route
  guard, `<Can>`, `can()` or template references them, so no role loses or gains capability.

---

## 6. Seed / Migration / Snapshot Analysis

| Artifact | Contains dead keys? | Part of active deploy workflow? | Classification |
|----------|---------------------|--------------------------------|----------------|
| `database/seeds/001_baseline.sql` | ✅ rows 518, 22004 (+ trio with stale `component_path`) | Yes — required, applied first | Active seed |
| `database/seeds/007_tournament_translations.sql` | ✅ 7 stale AR rows (F-05) | Optional supplemental (`--seed-file`), not in the required 001–006 list | Active seed |
| `database/seed/003_baseline_snapshot.sql` | ✅ row 518 (`tournaments.enter_scores`) | No — referenced only by audit/forensics docs | Historical archive snapshot |
| `archive/database/courtzon_v2_05062026.sql` | ✅ (V2 dump) | No — archive | Historical/archive |
| `database/migrations/*.sql` | **none** (0 hits for any of the five keys) | — | — |
| `database/baseline/001_courtzon_v3.sql` | mirrors seed 001 (regenerated from seed migrations) | Yes (startup-validator checks it exists) | Baseline |

Key facts:

1. **No migration ever created, modified, or removed any of the five permission rows.** They are
   pure seed/manual-DB artifacts. There is therefore **no migration-history coupling** that a
   cleanup could break.
2. **Removing the rows from the seed only affects future fresh installs.** Existing databases
   (local Docker `courtzon_v3`, Hostinger production) keep the rows until a migration or manual
   SQL removes them.
3. **Deleting a `permissions` row cascades its grants** (FK) — cleanup is atomic.
4. `translations` rows are **not FK-linked** to `translation_keys`; deleting stale `translations`
   rows is independent of `translation_keys` cleanup.

---

## 7. F-05 Translation Residue Audit

### 7.1 Schema

- `translations`: `id`, `key`, `locale`, `value`, `is_auto`, timestamps. UNIQUE(`locale`,`key`).
  No status/active column, no FK to `translation_keys`. (726 rows: 697 `ar`, 29 `en`.)
- `translation_keys`: `id`, `key`, `default_value`, `module_slug`, `element_type`,
  `element_label`, `component_path`, `is_deprecated`, timestamps. UNIQUE(`key`). (2,682 rows; 18
  deprecated.)

### 7.2 Live DB rows

```sql
SELECT `key`, locale, value, is_auto FROM translations
WHERE `key` IN ('tournaments.admin.title','admin.tournament.matches','tournaments.matches.title',
                'tournaments.select_tournament','tournaments.select_tournament_hint',
                'tournaments.match.player1','tournaments.match.player2','tournaments.match.score');
```

| key | locale | value | is_auto |
|-----|--------|-------|---------|
| `tournaments.admin.title` | ar | إدارة البطولات | 0 |
| `tournaments.matches.title` | ar | مباريات البطولة | 0 |
| `tournaments.select_tournament` | ar | اختر البطولة | 0 |
| `tournaments.select_tournament_hint` | ar | اختر بطولة لعرض مبارياتها | 0 |
| `tournaments.match.player1` | ar | اللاعب 1 | 0 |
| `tournaments.match.player2` | ar | اللاعب 2 | 0 |
| `tournaments.match.score` | ar | النتيجة | 0 |
| `tournaments.tab.matches` | ar | المباريات | 0 |

- `admin.tournament.matches` has **no** `translations` row (it was EN-only in the registry; its
  EN default comes from `translation_keys` — id 6704, `is_deprecated=1`).

```sql
SELECT id, `key`, is_deprecated FROM translation_keys
WHERE `key` IN (/* same 8 keys */) ORDER BY `key`;
```

| id | key | is_deprecated |
|----|-----|---------------|
| 6704 | `admin.tournament.matches` | **1** |
| 112129 | `tournaments.admin.title` | **1** |
| 112168 | `tournaments.matches.title` | **1** |
| 112169 | `tournaments.select_tournament` | **1** |
| 112170 | `tournaments.select_tournament_hint` | **1** |
| 112180 | `tournaments.match.player1` | **1** |
| 112181 | `tournaments.match.player2` | **1** |
| 112185 | `tournaments.match.score` | **1** |
| 112192 | `tournaments.tab.matches` | **0** — out of scope (still registered/live) |

The 5I-2 registry removal already flowed into the backend key index: `tournaments.admin.title` and
`admin.tournament.matches` are flagged `is_deprecated=1` in `translation_keys` (and the other 5G
keys likewise). Only `tournaments.tab.matches` is not deprecated — consistent with audit 128, which
explicitly keeps `tournaments.tab.matches` and `tournaments.dashboard.*_matches` **out of scope**
("remain live").

### 7.3 Seed source

`database/seeds/007_tournament_translations.sql` (supplemental seed, applied via
`seed.js --seed-file`) contains the exact stale rows:

| Key | Seed 007 line |
|-----|---------------|
| `tournaments.admin.title` | 8 |
| `tournaments.matches.title` | 47 |
| `tournaments.select_tournament` | 48 |
| `tournaments.select_tournament_hint` | 49 |
| `tournaments.match.player1` | 59 |
| `tournaments.match.player2` | 60 |
| `tournaments.match.score` | 64 |

(`tournaments.tab.matches` at line 77 is **out of scope** — live. The rest of 007, e.g.
`tournaments.assign_court`, `tournaments.match.*`, `tournaments.tab.overview/groups/standings`,
hub and create-flow keys, is live and must stay.)

### 7.4 Occurrence classification (repo-wide)

| Key | Frontend runtime | Backend runtime | i18n registry | Seed | DB | Test | Docs/artifacts |
|-----|------------------|-----------------|---------------|------|----|------|----------------|
| `tournaments.admin.title` | — | — | — (removed 5I-2) | 007:8 | ✅ ar row + deprecated key row | `translation-residue.spec.ts` (absence guard) | audit 128 |
| `admin.tournament.matches` | — | — | — (removed 5I-2) | — | deprecated key row 6704 (no translations row) | `translation-residue.spec.ts` | audit 128 |
| `tournaments.matches.title` | — | — | — | 007:47 | ✅ | absence guard | audit 128 |
| `tournaments.select_tournament` | — | — | — | 007:48 | ✅ | absence guard | audit 128 |
| `tournaments.select_tournament_hint` | — | — | — | 007:49 | ✅ | absence guard | audit 128 |
| `tournaments.match.player1` | — | — | — | 007:59 | ✅ | absence guard | audit 128 |
| `tournaments.match.player2` | — | — | — | 007:60 | ✅ | absence guard | audit 128 |
| `tournaments.match.score` | — | — | — | 007:64 | ✅ | absence guard | audit 128 |
| `tournaments.tab.matches` | — | — | ✅ registered (registry.ts:1909) | 007:77 | ✅ | — | audit 128 (live) |

---

## 8. Translation Runtime Resolution Analysis

### 8.1 How the frontend loads translations

1. `frontend/src/i18n/index.ts` — `useI18nStore.loadTranslations(locale)` →
   `GET /public/translations/{locale}`; the server bundle replaces the local registry defaults.
2. Defaults fallback: on store init the bundle starts as `{ ...registryDefaults }` (from
   `translation-keys.registry.ts`); if the fetch fails, it falls back to those defaults.
3. Resolution order (`resolveTranslation`): **server bundle → registry defaults → inline
   default → raw key**. A key present in the bundle is only ever displayed when some component
   actually calls `t('key')`/`useTranslation()` with that key.

### 8.2 How the backend builds the bundle

`translations.service.getPublicBundle(locale)` (backend):
- `defaults = translationKeysRepository.getDefaultsMap()` → `SELECT key, default_value FROM
  translation_keys` — **no `is_deprecated` filter** → deprecated keys still contribute defaults.
- For `en`: returns defaults directly (EN values are the registry defaults).
- For other locales: merges `translations.getValuesByLocale(locale)` (all rows for the locale)
  over the defaults, skipping empty values.
- Result cached in-memory (BUNDLE_CACHE_TTL).

### 8.3 What the live endpoint actually serves (verified)

`GET http://localhost:3000/public/translations/ar` (14 KB → the live Docker backend):
- ✅ Contains `tournaments.admin.title`, `tournaments.matches.title`,
  `tournaments.select_tournament`, `tournaments.match.player1`, `tournaments.match.score`,
  `tournaments.tab.matches`.
- ✅ Contains `admin.tournament.matches` (the EN default via deprecated `translation_keys` row
  6704 — no AR row exists).

### 8.4 Orphaned-row behavior

- **No live runtime consumer requests any of the 8 keys** (verified: zero component references).
- The keys are present in the bundle but **unreachable by the UI** — the deleted screens that used
  them no longer exist, so no `t('...')` call can surface them.
- Consequences: **no user-visible text, no error, no crash, no security impact.** Payload
  overhead is negligible (7 of 2,682 keys ≈ 0.26 % of the bundle).
- The deprecation machinery already flagged the 8 keys in `translation_keys`
  (`is_deprecated=1`, except `tournaments.tab.matches` which is out of scope).
- Backend admin translation screens already filter deprecated rows (`WHERE is_deprecated =
  FALSE` at repository line 113 is used by sync flows), so the residue is invisible in the admin
  translation UI.

---

## 9. Current DB Translation Row Analysis

| Row | DB row | Served in AR bundle? | Runtime consumer? | User-visible? |
|-----|--------|----------------------|-------------------|---------------|
| `tournaments.admin.title` (ar) | ✅ translations | ✅ | none | no |
| `admin.tournament.matches` | deprecated key row 6704 only (no ar translation) | ✅ (EN default) | none | no |
| `tournaments.matches.title` (ar) | ✅ | ✅ | none | no |
| `tournaments.select_tournament` (ar) | ✅ | ✅ | none | no |
| `tournaments.select_tournament_hint` (ar) | ✅ | ✅ | none | no |
| `tournaments.match.player1` (ar) | ✅ | ✅ | none | no |
| `tournaments.match.player2` (ar) | ✅ | ✅ | none | no |
| `tournaments.match.score` (ar) | ✅ | ✅ | none | no |
| `tournaments.tab.matches` (ar) | ✅ (live, out of scope) | ✅ | none found (registered) | no |

---

## 10. Risk Assessment

| Risk | F-04 dead permissions | F-05 stale AR rows |
|------|-----------------------|--------------------|
| Authorization bypass | **None.** Neither dead key is (or was) a backend guard; grants are administrative-only and carry no capability. | n/a |
| Unintended UI exposure | **None.** No `<Can>`/`can()` resolves the dead keys in any shipped component. | n/a |
| Data integrity | **None.** No migration/FK coupling. | **None.** Loose key strings; no FK. |
| Performance | **Negligible.** 2 extra permission rows + 13,043-row join on unique FKs. | **Negligible.** 7 extra rows of 2,682 (≈0.26 %). |
| Admin screen confusion | Minor/UX: `component_path` of the live trio points at a deleted file; Admin → UI Permissions shows orphan tabs/actions. Resolved by re-running `sync-ui-registry.js`. | Minor/UX: none (deprecation flag hides them from admin sync UI). |
| Fresh-install drift | New installs grant dead keys to Super Admin only (seed). Harmless but untidy. | New installs re-insert stale AR rows from seed 007. Harmless but untidy. |

**No P0/P1 issue exists in either finding.**

---

## 11. Security Assessment

- The two dead permissions are **not security-sensitive**: they are UI-visibility keys
  (`element_type=tab`/`action`, `is_ui_element=1`), never route guards. They cannot grant or
  revoke any API capability.
- Holding `sidebar.tournament-matches` or `tournaments.enter_scores` gives a role **nothing** —
  no navigation entry, no button, no backend access (all consumers were deleted or retargeted in
  Steps 5G/5I-1, 121, 126, 127).
- No third-party or end-user role holds any of the five keys; grants are confined to
  administrative roles (Super Admin, Master Admin, Read Only Admin, Auditor, Tournament Mgr).
- **Conclusion: no security remediation is warranted; no immediate DB cleanup is required.**

---

## 12. Fresh-Install Impact

A fresh environment built from `database/baseline/001_courtzon_v3.sql` + the required seeds
(001–006) + optional 007 reproduces:

- **F-04:** the five permission rows (including the dead two) with `component_path` pointing at
  the deleted `TournamentAdminPage.tsx` for the trio, and Super Admin grants for ids
  518/12220/12221/12222 (no seed grant for 22004). This is cosmetic residue only.
- **F-05:** the 7 stale AR rows from seed 007, plus deprecated `translation_keys` rows for 8 keys
  (the sync-keys flow marks them deprecated when the registry removed them).

Updating `database/seeds/001_baseline.sql` and `007_tournament_translations.sql` (and the baseline
export) will fully fix fresh installs. No migration is needed for fresh installs.

---

## 13. Production/Existing-DB Impact

- Local Docker `courtzon_v3`, `courtzon_v3_baseline`, `courtzon_v3_restore_verify` and Hostinger
  production all contain the same residue rows (they were created by the same seed/history).
- Leaving them in place is harmless (evidence above).
- Removing them from *existing* databases requires either:
  - the Admin → UI Permissions screen (delete row — grants cascade via FK), or
  - a `COURTZON_MIGRATION_ENV: PRODUCTION_SAFE` migration, or
  - manual SQL.
  Seed edits alone do **not** clean existing databases.

---

## 14. Recommended Action for F-04

**B — Seed cleanup recommended later; no current DB change.**

In the future F-04 cleanup step (not this audit):

1. Remove `sidebar.tournament-matches` (id 22004) and `tournaments.enter_scores` (id 518) from
   `frontend/src/permissions/registry.ts` (`tournaments.enter_scores`: line 732).
2. Remove both rows from `database/seeds/001_baseline.sql` (and regenerate the baseline export).
3. Run `node backend/scripts/sync-ui-registry.js` — this refreshes the live trio's
   `component_path` metadata to `TournamentListPage.tsx` (fixes the stale-path drift found in §3.1);
   note sync is **add/update-only** (no DELETE), so it will **not** remove the dead DB rows — that
   must be done via UI delete or a production-safe migration if existing DBs are to be cleaned too.
4. Optional (only if cleaning existing DBs is desired): a `PRODUCTION_SAFE` migration deleting
   ids 22004/518 from `permissions` (grants cascade). This is **optional**, not required — the
   project rule disallows DB changes absent a genuine problem.

---

## 15. Recommended Action for F-05

**B — Seed cleanup recommended later; no current DB change.**

In the future F-05 cleanup step (not this audit):

1. Remove the 7 stale AR rows from `database/seeds/007_tournament_translations.sql`
   (lines 8, 47, 48, 49, 59, 60, 64): `tournaments.admin.title`, `tournaments.matches.title`,
   `tournaments.select_tournament`, `tournaments.select_tournament_hint`,
   `tournaments.match.player1`, `tournaments.match.player2`, `tournaments.match.score`.
   **Keep** `tournaments.tab.matches` (line 77) and `tournaments.dashboard.*_matches` — they are
   live per audit 128 and `is_deprecated=0`.
2. Existing DBs: the 8 stale `translation_keys` rows are already `is_deprecated=1` (good hygiene)
   and the 7 stale `translations` rows are inert; cleaning them is optional (admin UI or a
   production-safe migration), **not required**.
3. No registry change needed — the F-03 keys were already removed in Step 5I-2, and
   `translation-residue.spec.ts` guards their absence.

---

## 16. Whether Any DB Change Is Justified

**No.**

Per the project rule — *"a stale row by itself is NOT sufficient justification for a database
change"*:

- F-04 dead permission rows: no runtime consumer, no backend guard, no security exposure, no
  relationship/migration coupling, negligible footprint → residue only.
- F-05 stale AR rows: already flagged deprecated at the key-index level, inert in the bundle, no
  consumer, negligible footprint → residue only.
- The only actionable items are **seed/registry/sync-script hygiene** for future fresh installs
  (verdict B), all of which are code/seed-file edits, not database changes.

---

## 17. Explicit Answers

| Question | Answer |
|----------|--------|
| Are `sidebar.tournament-matches` and `tournaments.enter_scores` genuinely orphaned? | **Yes.** Zero runtime, backend, navigation, template, or test-fixture consumers. `sidebar.tournament-matches` is absent from all code; `tournaments.enter_scores` remains only as a dormant registry registration with no consumer. |
| Do they create runtime/security risk? | **No.** They are UI-visibility keys, never route guards; grants are administrative-only and confer no capability. |
| Do they require a migration? | **No** for correctness. Cleaning *existing* DBs would need a (optional) production-safe migration or manual delete; fresh installs are fixed by seed edits alone. |
| Are they only seed residue? | Mostly. Seed 001 + live DB rows; `tournaments.enter_scores` also remains in `registry.ts` as dormant registration (a code/registry cleanup touching that file is part of the future F-04 step). |
| Are stale AR translation rows runtime-relevant? | **No.** They are served in the AR bundle but no runtime consumer requests them; they are unreachable by the UI. |
| Do they create user-visible problems? | **No** — no displayed text, no error, no crash. |
| Is a DB change justified under the project rule? | **No.** Both findings are harmless residue; seed (and registry) cleanup later is sufficient. |

---

## 18. Final Verdict

### F-04 — **B** (Seed cleanup recommended later; no current DB change)
Dead keys `sidebar.tournament-matches` (22004) and `tournaments.enter_scores` (518) are genuinely
orphaned seed+DB residue with zero runtime/security impact. The live trio
(`admin-tournaments.view`, `tournaments.edit`, `tournaments.delete`) **must be retained**; their
only defect is stale display-only `component_path`, fixed by re-running `sync-ui-registry.js`.

### F-05 — **B** (Seed cleanup recommended later; no current DB change)
7 stale AR seed rows are inert residue; 2 registry keys are already removed and guarded; the 8
`translation_keys` entries are already flagged deprecated. `tournaments.tab.matches` and
`tournaments.dashboard.*_matches` remain live and must not be touched.

### Overall
- **Verdict: B / B** — no database action justified now; seed-level cleanup recommended in the
  dedicated F-04/F-05 steps.
- **P0/P1 issues:** none.
- **DB change justified:** no.

---

## Appendix — Evidence Collected (read-only)

| # | Evidence |
|---|----------|
| 1 | `SHOW CREATE TABLE` × 4 (`permissions`, `role_permissions`, `translations`, `translation_keys`) |
| 2 | Live permission rows + role grants for the 5 keys (role ids 1/12/19/25/26) |
| 3 | Live translation rows for the 8 stale keys; `translation_keys.is_deprecated` flags |
| 4 | `GET /public/translations/ar` bundle membership check (8 stale keys present) |
| 5 | `translations.service.getPublicBundle` (no deprecated filter) + `getDefaultsMap` SQL |
| 6 | `sync-ui-registry.js` — UPDATE + INSERT branches (no DELETE); parses `registry.ts` |
| 7 | Repo-wide classification greps for all 5 permission keys + 9 translation keys |
| 8 | Seed 001 exact rows (ids 518/22004/12220–12222) + role-permission tuples (Super Admin only) |
| 9 | Seed 007 stale rows (lines 8, 47, 48, 49, 59, 60, 64; line 77 out of scope) |
| 10 | Migrations: 0 references; `database/seed/003_baseline_snapshot.sql`: historical archive |
| 11 | Role templates (backend/src + backend/scripts): trio present, dead keys absent |
| 12 | Runtime consumers: TournamentListPage/DashboardPage/TournamentDetailPage + tests |
| 13 | Git state: HEAD `1a56e8fc284cfead261dcea7279bc3cf7b55857e`, tree clean |

---

## Final Report

- **Audit file:** `docs/HANDOVER_CURRENT/129_DATABASE_RESIDUE_AUDIT.md`
- **F-04 verdict:** B — seed cleanup recommended later; no current DB change
- **F-05 verdict:** B — seed cleanup recommended later; no current DB change
- **P0/P1 issues:** none
- **DB change justified:** no
- **Current git HEAD:** `1a56e8fc284cfead261dcea7279bc3cf7b55857e`
- **Changes made:** none to source, database, seeds, migrations, permissions, translations,
  Docker, or runtime behavior. The audit document is the **only** new artifact. Working tree clean.