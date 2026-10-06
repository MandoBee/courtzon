# 85_TOURNAMENT_TEST_SUITE_CLEANUP_RESULT.md

**Date:** 2026-10-06
**Type:** Test-only maintenance (tournament suite)
**Overall verdict:** PASS — tournament suite is green (0 failed).

---

## 1. Starting HEAD

- `3b50e680` (`docs: add tournament drawer accessibility result`)
- Working tree at start: clean; origin/master aligned.
- Baseline: `186 passed / 9 failed` in the relevant tournament suite.

## 2. Root causes

### Phase 1 — `TournamentBracket.universal.spec.tsx` (8 failures)

The 8 failures had **four distinct test-quality causes**, all in the test file (no production bug):

1. **Broken i18n mock.** `t: (key, defaultValue) => defaultValue ?? key` returned the **params object** whenever a component called `t(key, { ...params })` (e.g. `t('tournamentBracket.round', { round })`). React then threw *"Objects are not valid as a React child"*. This crashed most bracket tests. It also meant registry keys without an inline default rendered as raw keys, so a couple of assertions expecting real English text could never match.
2. **Missing Router in the harness.** The admin/org page tests render `AdminOrgTournamentDetailPage`, which calls `useNavigate()`. The `wrap()` helper provided only `QueryClientProvider`, so those tests threw *"useNavigate() may be used only in the context of a `<Router>`"*.
3. **Ambiguous query.** One test used `findByText('Current Player')` while the bracket + drawer render that name multiple times → *"Found multiple elements"*.
4. **Stale assertion.** The admin test clicked the **Matches** tab but asserted `Record Result`, which only ever exists in the **bracket** footer (and, in the fixtures, requires a `match_id` that the fixtures do not set). That assertion was never valid; it was masked by the i18n crash.

### Phase 2 — `TournamentCreatePage.spec.tsx` (1 failure)

- Test: *"hides the venue/daily section when the prize permission is absent"* expected `tournaments.create.venue` to be hidden without `tournaments.create.prize`.
- **Production reality:** in commit `b1960317` (G11.18 competition scoping) the **Venue / Courts** block was intentionally restructured as an ungated block; only the **daily playing window** remains inside `<Can permission="tournaments.create.prize">`. There is **no `tournaments.create.venue` permission** in the RBAC registry.
- **Verdict: stale test expectation.** Production behavior is correct/expected per the existing RBAC architecture (no dedicated venue permission exists, so the block is not permission-gated). No production change made.

## 3. Exact fixes (test-only)

**`TournamentBracket.universal.spec.tsx`**
- Replaced the i18n mock with a faithful, minimal one that resolves the registry English defaults (`getRegistryDefaultsMap`) — the same fallback production uses — and interpolates `{param}` placeholders. It always returns a renderable string and never returns the params object:
  ```ts
  const t = (key, second, third) => {
    const defaultValue = typeof second === 'string' ? second : undefined;
    const params = (second && typeof second === 'object' ? second : third);
    let value = defaults[key] ?? defaultValue ?? key;
    if (params) for (const [n, r] of Object.entries(params)) value = value.replace(`{${n}}`, String(r));
    return value;
  };
  ```
- Wrapped the test harness in `<MemoryRouter>` (required by the admin/org pages' `useNavigate`).
- Changed the ambiguous `findByText('Current Player')` to `findAllByText(...)` with a length assertion.
- Corrected the admin test to assert the **administrative matches table** by its real row data (player names) instead of the non-existent `Record Result`, while keeping the shared-bracket assertions intact.

**`TournamentCreatePage.spec.tsx`**
- Rewrote the stale test to assert the correct behavior: the prize-gated **daily window is hidden** without `tournaments.create.prize`, and the ungated **venue selector remains available**.

No assertions were replaced with generic existence checks; the admin fix and TournamentCreatePage fix assert concrete, meaningful behavior.

## 4. Production changes

**None.** `git status` after the fix shows only the two test files changed. No backend, DB, migration, API, RBAC, navigation, MatchCard, MatchDetailsDrawer, animation, or print change.

## 5. Final test counts

```
npx vitest run src/components/tournaments src/pages/tournaments src/pages/admin/tournament src/pages/referee
Test Files  23 passed (23)
Tests       195 passed (195)
```

- `TournamentBracket.universal.spec.tsx` → **10 passed**.
- `TournamentCreatePage.spec.tsx` → **18 passed**.
- Baseline was `186 passed / 9 failed`; now **0 failed**, with the same 195 total.

## 6. TypeScript / build results

- `npx tsc --noEmit` → **clean (exit 0)**.
- `npm run build` → **PASS** (exit 0).

## 7. Docker verification

- `docker compose build frontend` → rebuilt (test-only change; the production `dist` is byte-identical, so the runner `COPY dist` layer was cached).
- `docker compose up -d` → services healthy (frontend image unchanged → not recreated).
- Health:
  - `courtzon-frontend` — `Up (healthy)`, `GET http://localhost:5173` → **200**
  - `courtzon-backend` — `Up (healthy)`, `GET http://localhost:3000/health` → **200** (`status: ok`)
  - `courtzon-mysql` / `courtzon-redis` — `Up (healthy)`

## 8. Commits

- Test: `feac6df1` — `test(tournaments): fix tournament ux test suite`
- Docs: the `docs: add tournament test suite cleanup result` commit (the one that adds this file)

## 9. Final Git status

- Working tree: clean.
- `HEAD == origin/master` after both commits are pushed to `master`.

## 10. Remaining failures

**None** in the relevant tournament suite.

Minor non-blocking observation (not a failure, left unchanged to keep this task scoped): `TournamentBracket.universal.spec.tsx` has a structural quirk where one `it('shows the empty state…')` sits outside its `describe` block due to a stray `});`. It runs and passes; it was not touched to avoid unrelated churn.
