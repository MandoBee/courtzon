# 122 — Tournament Creation Wizard ← Authoritative Bracket Capabilities

**Step 5B** of the Tournament Architecture/Navigation Cleanup.
Commit: `6923c371` · Branch: `master` · Date: 2026-10-08

---

## 1. Problem

The Final Tournament Architecture & UX Audit flagged a **P2 architecture/alignment issue**:
the Creation Wizard derived its format cards from (a) the **active-only** bracket-types
list and (b) **duplicated local format logic** (`executable()/planned()` helpers, a
hard-coded GSK card), while the Bracket Types Management screen already exposed the
**authoritative enriched capability/creation contract** (`engine_capability`,
`creation_available`, GSK engine-registry entry). Two sources of truth → drift risk.

## 2. Previous Wizard source of truth

Before this step the wizard (`TournamentCreatePage.tsx`) built its five format cards from:

- `GET /org/:orgId/tournaments/bracket-types` — **active-only raw rows** (no capability
  fields), consumed via `orgTournamentApi.getBracketTypes`.
- Local inline logic in the page:
  - `executable('single-elimination' | 'round-robin')` — treated any *active* row as
    engine-executable (false equivalence: `is_active === true` ≠ engine ready).
  - `planned('double-elimination' | 'swiss', …)` — hard-coded "planned" assumptions.
  - A hard-coded GSK card deriving availability from an active SE row alone.

## 3. Authoritative source

The **backend** is the single authority for engine capability and creation availability:

- `bracketSlugCapability(slug)` → `'ready' | 'planned' | 'unsupported'`
- `bracketTypeCreationAvailable(slug, isActive)` → boolean creation predicate
- GSK is a **composite** capability with **no DB row** — represented via the
  engine-registry entry (`source: 'engine_registry'`), substrate `single-elimination`.

Verified actual engine state (from the backend registry — not assumed):

| Format | Capability | Creation available |
|--------|-----------|--------------------|
| Single Elimination | `ready` | yes |
| Round Robin | `ready` | yes |
| Group Stage + Knockout (GSK) | `ready` (composite) | yes (when SE substrate active) |
| Double Elimination | `planned` | no |
| Swiss | `planned` | no |

The wizard now consumes this contract and **no longer re-implements** any capability
predicate. Presentation (names, descriptions, help text) remains local by design.

## 4. Exact files changed

Backend (additive — exposes already-existing authoritative data; requires one small
shared-service method so both active endpoints return the same contract):

- `backend/src/modules/tournaments/application/tournament.service.ts`
  — **new** `listBracketTypeOptions()`: returns `{ data: activeRows }` enriched with
  `engine_capability` + `creation_available` (+ boolean `is_active`), plus
  `{ registry: [GSK composite entry] }`, using the SAME helpers the management list
  already uses.
- `backend/src/modules/tournaments/presentation/tournament.controller.ts`
  — `listActiveBracketTypesHandler` (`/bracket-types`) → `listBracketTypeOptions()`.
- `backend/src/modules/tournaments/presentation/org-tournament.controller.ts`
  — `listActiveBracketTypesHandler` (`/org/:orgId/tournaments/bracket-types`) →
  `listBracketTypeOptions()` (the endpoint the wizard actually calls in both contexts).

Backend tests:

- `backend/src/modules/tournaments/__tests__/tournament-config.spec.ts`
  — new `1b` (authoritative contract incl. DE planned / GSK registry) + `1c` (GSK
  registry `creation_available` tracks the SE substrate).
- `backend/src/modules/tournaments/__tests__/org-tournament.controller.spec.ts`
  — bracket-types org read now mocks `listBracketTypeOptions` and asserts the
  enriched rows + GSK registry are forwarded.

Frontend:

- `frontend/src/services/tournament.ts`
  — `getBracketTypes` typed as `Promise<BracketTypeAdminListResponse>`
  (reuses `BracketTypeRow` capability fields + `BracketTypeRegistryEntry`).
- `frontend/src/pages/tournaments/TournamentCreatePage.tsx`
  — format cards built ONLY from the authoritative option contract:
  - executable SE/RR cards from rows where `engine_capability==='ready' && creation_available`
  - planned cards from rows where `engine_capability==='planned'`
  - GSK card from the registry entry (availability = registry
    `creation_available === true && SE row present`)
  - removed the local `BracketTypeOption` interface and the `executable()/planned()`
    helpers; a `useQuery` loading/error state + fail-safe UI added to the Format step.
  - all other wizard steps, GSK configuration UI, and submission mapping unchanged.
- `frontend/src/pages/tournaments/__tests__/TournamentCreatePage.spec.tsx`
  — fixture now carries the authoritative contract; **11 new Step 5B tests** added
  (capability-driven availability, planned non-executable, GSK-from-registry, unknown
  registry-entry fail-safe, source-guard "no hard-coded engine logic", API-error
  fail-safe, loading state).
- `frontend/src/i18n/translation-keys.registry.ts`
  — +2 keys: `tournaments.create.bracket_loading`, `tournaments.create.bracket_error`
  (EN defaults; AR overrides remain DB-driven via the Translations admin).

## 5. Format capability behavior

- **Single Elimination / Round Robin** → card offered as *Available* (selectable) only
  when the backend row says `engine_capability: 'ready'` **and** `creation_available: true`.
  `is_active` alone no longer implies availability.
- A `ready` row with `creation_available: false` → **no card** (never offered as
  executable, never shown as planned either).
- **Double Elimination / Swiss** → card always shown with `Engine preparation` badge,
  click reveals the explainer panel, **never selectable / never submitted**
  (`engine_capability: 'planned'` comes from the backend row).

## 6. GSK behavior

- GSK remains **executable** and its card remains selectable when the registry entry
  (or equivalent backend data) reports `creation_available: true` **and** the
  single-elimination substrate row is present.
- Selecting GSK continues to submit the EXACT existing contract:
  `format: 'group_stage_knockout'` + `gsk_config: { groupStage: {groupCount,
  participantsPerGroup}, progression: {progressionFormat, topPerGroup,
  bestThirdPlaces}, ... , knockout: {startingRound}, seeding, separateGroupWinners,
  preventSameGroupRematch, allowByes, playInRounds }` — **nothing removed, nothing
  simplified**.
- `bracket_type_id` continues to carry the SE substrate bracket id; the backend GSK
  engine behavior is untouched.

## 7. Unsupported format behavior

- **Loading** → "Loading available formats…" (`bracket-formats-loading`); no cards are
  selectable until data arrives.
- **API error** → "Unable to load available formats…" (`bracket-formats-error`),
  **no** format becomes executable (fail-safe, never assumes ready).
- **Empty registry** → nothing executable is invented; Continue is blocked by the
  existing `bracketTypeId` required validation.
- **Unknown registry entry** (e.g., format not `group_stage_knockout` or
  `engine_capability: 'unsupported'`) → GSK card is present-but-not-executable; it
  reveals the explainer if clicked and cannot be submitted.
- **Unavailable format** → never silently selectable.

## 8. Tests

- Frontend Create Wizard: `frontend/src/pages/tournaments/__tests__/TournamentCreatePage.spec.tsx`
  — **31 tests pass** (20 existing + 11 new Step 5B).
- Frontend tournament suites (`src/pages/tournaments` + `src/components/tournaments`):
  **19 files / 250 tests pass** — no regressions (MatchesManager 43,
  TournamentDetailPage 31, GskPlayerPublic 21, etc.). Realtime wasn't touched by 5B.
- Backend focused: `org-tournament.controller.spec.ts` (17), `tournament-config.spec.ts`
  (26 incl. new 1b/1c), `tournament-bracket-capability.spec.ts` (20) — **63 pass**.
- Source-guard (deterministic): tests assert the page reads `orgTournamentApi.getBracketTypes`,
  uses `engine_capability`/`creation_available`/registry, and contains **no**
  `bracketOptions = [`, no `executable('single-elimination')`, no `planned('double-elimination'`,
  no `isEngineSupported`.

## 9. Build

- `backend`: `npm run build` (tsc + translation artifact) ✅
- `frontend`: `npx tsc --noEmit` ✅ and `npm run build` (tsc -b + vite + PWA) ✅

## 10. Docker

- `docker compose build backend frontend` ✅ (both images rebuilt from the new code)
- `docker compose up -d` ✅ (backend + frontend recreated; mysql + redis healthy)

## 11. Health

- `GET /health` → `status: ok` (database ok 2ms, redis ok 1ms, memory 30.9%)
- `GET /health/database` → connected, **330 tables**
- `GET /health/redis` → connected
- SPA `GET /` → HTTP **200**

## 12. Database confirmation

- **No schema/migration/seed changes.** `database/baseline/001_courtzon_v3.sql` and the
  seed chain are untouched. The `listBracketTypeOptions()` contract reuses existing
  domain helpers against the existing `tournament_bracket_types` table.

## 13. Git commit

- Feature: `6923c371` — `refactor(tournaments): align wizard with authoritative bracket capabilities`
- This handover doc: separate commit with real hash (see git log).

## 14. Git push

- Pushed to `origin/master` (auto-deploys to Hostinger via existing CI/CD if enabled).

## 15. Remaining limitations

- The legacy screens (`TournamentMatchesPage`, `TournamentSchedulePage`, consumer
  `/tournaments/:id`, `/admin/tournaments`) remain in transition; deprecation is a
  separate step.
- `tournaments.enter_scores` key stays registered (unused) — pre-existing cleanup item.
- A `ready` format that is not `creation_available` disappears from the wizard entirely
  (never offered) by design — the management screen remains the place to see it.
- The unavailable GSK card renders via the same explainer panel styling as planned
  formats; the "Unavailable for this organisation" text distinguishes it. Enhancement
  (distinct GSK-unavailable copy) is possible later without touching engine logic.
- `node scripts/ci-validate.js` still reports **220 pre-existing** architectural flags
  (e.g., `pool.execute` outside repositories in accounting/auth/booking/cms/geo/
  leagues/marketplace modules; `eventBus not imported in booking.service.ts`). **Zero**
  of them reference the tournaments module or any file touched by this step.