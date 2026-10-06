# HANDOVER 98 — Tournament Creation Wizard (Redesign Step 2)

**Date:** 2026-10-06
**Scope:** Redesign Step 2 — rebuild the flat `TournamentCreatePage` into a premium multi-step Creation Wizard. No engines, no DB changes, no migrations, no payment/accounting changes.
**Baseline:** Step 1 (Tournament Hub) is the current product baseline and is preserved.

---

## 1. Scope

- Friendly 8-step guided Tournament creation replacing the single flat form.
- One coherent form state; progressive validation; final Review & Create.
- Honest format states (only engine-executable formats are submit-ready).
- Group Stage + Knockout **UX foundation** only (no persistence).
- Routes, DTO, permissions, API contract and org-scoped create path unchanged.

## 2. What changed

- `TournamentCreatePage` is now an 8-step wizard (was a single flat form).
- New presentational components: `CreateWizardStepper`, `TournamentFormatSelector`.
- Per-step validation + one shared `react-hook-form` state (no islands).
- Format cards replace the bracket-type `<select>` (planned formats shown, not faked).
- Review screen with per-section summaries, Edit jumps and Create.
- Subtle step transition (`.cz-wizard-panel`) honouring `prefers-reduced-motion`.

## 3. Exact files changed

| File | Change |
| --- | --- |
| `frontend/src/components/tournaments/wizard/CreateWizardStepper.tsx` | **New** — accessible stepper (desktop labelled + mobile compact) |
| `frontend/src/components/tournaments/wizard/TournamentFormatSelector.tsx` | **New** — 5-format cards, engine-state badges, GSK future preview |
| `frontend/src/pages/tournaments/TournamentCreatePage.tsx` | Rebuilt as the 8-step wizard |
| `frontend/src/pages/tournaments/__tests__/TournamentCreatePage.spec.tsx` | Rewritten for the wizard (19 tests) |
| `frontend/src/i18n/translation-keys.registry.ts` | Registered wizard/format/review/validation keys |
| `frontend/src/index.css` | `.cz-wizard-panel` motion + reduced-motion coverage |

## 4. Wizard architecture

- One `useForm` + `zodResolver` instance owns the whole form.
- Step state (`step`, `maxReached`, `failedSteps`) is navigation-only.
- `validateStep(step)` runs field-level `trigger` on required fields plus manual cross-checks, then advances.
- Review runs the full zod schema via `handleSubmit` on Create.
- Submit reuses the exact existing payload transform + `POST /org/:orgId/tournaments`.
- `CreateWizardStepper` allows revisiting reached steps; forward only via validated Continue.

## 5. Step structure

| # | Step | Fields (existing, permission-gated as before) |
| --- | --- | --- |
| 1 | Basics | organisation (org fixed / admin picker), name*, description, category, season |
| 2 | Format | tournament format cards + sport + match format + rule set + generated-rules preview |
| 3 | Participants & Registration | min*, max, registration opens, registration closes |
| 4 | Schedule & Venue | start*, end, venue mode (branches / external map picker), daily window |
| 5 | Rules & Eligibility | `EligibilityFormSection` + read-only generated rules |
| 6 | Payments | entry fee, payment methods (shown when paid), locked commission/currency |
| 7 | Prizes & Sponsors | `PrizeEditor`, `SponsorEditor`, prize description |
| 8 | Review & Create | section summaries + Edit + Create Tournament |

\* required (validated)

## 6. Format selector behavior

- Cards for the five target formats.
- `single-elimination`, `round-robin` → **Available** (selectable; submit-ready).
- `double-elimination`, `swiss`, `group-stage-knockout` → **Engine preparation** (planned). Clicking reveals an explanation panel; they are **never** sent to the backend as executable.
- Executable cards are disabled until the owning organisation's bracket types load.

## 7. Group Stage + Knockout UX foundation

- GSK card shows the planned journey preview (32 → 8 groups × 4 → RR → Top 2 → 16 → R16 → QF → SF → Final) and the intended configurable concepts (groups, per-group participants, qualifiers, best-third, ordering, seeding, KO start round, rematch prevention, group-winner separation).
- **Nothing is persisted.** No bracket id is written, no stages/groups/matches are created.
- **Missing backend contract (documented):** the create DTO accepts `format: 'knockout'|'round_robin'` only (`tournament.dto.ts`), there is no `group-stage-knockout` bracket-type row, and no creation-time qualification payload exists. This must be built with the GSK engine in a later controlled step.

## 8–12. Per-step configuration

- **Participants:** max/min + registration window; competition categories (singles/doubles/teams) are configured post-create in the Hub (unchanged). Waitlist is supported by the create DTO (`waitlist_enabled`) but was never exposed by the old form — unchanged here, documented as limitation.
- **Schedule/Venue:** Organisation Courts (branch) vs External Venue (map picker) — unchanged behavior.
- **Rules/Eligibility:** reuses `EligibilityFormSection`; rules preview is server-derived (read-only).
- **Payments:** free (no methods shown) vs paid (cash/card checkboxes, both-removed guard). Commission and currency remain locked/org-derived.
- **Prizes/Sponsors:** reuse `PrizeEditor`/`SponsorEditor` unchanged.

## 13. Review / Create

- All 7 sections summarised with complete/incomplete markers and Edit jumps.
- Create runs full validation; backend errors display on an inline banner + toast.
- On success navigates to the Hub detail page (existing behavior).

## 14. Permissions

All existing gates preserved: `tournament.create.organisation`, `tournaments.create.name/description/type/sport/match-format/rule-set/max-participants/min-participants/prize/start-date/end-date/registration-dates/rules`, and submit gated by `org.tournaments.create`. Format cards themselves are not permission-gated (organisation-scoped reads back them).

## 15. Responsive / mobile behavior

- Format cards stack 1-col → 2-col → 3-col.
- All field grids stack below `sm`; touch targets ≥ 44px.
- Mobile stepper: "Step N of 8" + progress dots (no page-level overflow).
- No page-level horizontal overflow; select/date/time controls stay within width.

## 16. Animation behavior

- Step content remount replays `.cz-wizard-panel` (200 ms fade, transform/opacity only).
- Included in the `prefers-reduced-motion: reduce` block (verified by test).
- No animation library introduced.

## 17. Accessibility

- `role=tablist`-style accessible stepper (`aria-current`, labelled buttons); mobile dots aria-hidden.
- Labels associated with controls; errors rendered with `role="alert"`.
- Button type semantics kept (`type="button"` for nav, `type="submit"` for Create).
- No hover-only functionality; visible focus states (`focus-visible`).

## 18. Tests

- `TournamentCreatePage.spec.tsx` rewritten — **19 tests** covering: render/shell, step indicator, navigation, back-nav state, required validation, valid advancement, full walk to Review, five formats, executable selection + journey preview, planned formats not submitted, GSK preview + no fake submission, sport→format→rule-set cascade + preview, min>max guard, payment visibility + guard, prizes step, review sections + Edit, org-scoped submit payload, backend error banner, permission-limited Basics, admin org-required gate, reduced-motion CSS.
- Tournament suite: **27 files / 239 tests passed**.
- Frontend production build (`tsc -b` + Vite): **PASS**.

## 19. Build

`npm run build` in `frontend/` → TypeScript + Vite production build succeeds.

## 20. Docker verification

- `docker compose build frontend` → **SUCCESS** (~116 s, exit 0; Vite `✓ built in 7.89s`, PWA `precache 635 entries`, notification SW injected; new image `courtzon-frontend`).
- `docker compose up -d frontend` → container **Recreated → Started** (mysql/redis/backend dependencies healthy; no volumes/images touched; no `docker compose down`).
- Verification:
  - `curl.exe -s -o NUL -w "%{http_code}" http://localhost:5173` → **200**
  - `docker compose ps frontend` → `courtzon-frontend ... Up (healthy)  0.0.0.0:5173->80/tcp`
- Final state: frontend image rebuilt with the Step 2 wizard and the container serves HTTP 200 on `localhost:5173`.

## 21. Git commit

- `ab7379ec` — "feat(tournaments): multi-step Tournament Creation Wizard (step 2)"

## 22. Git push

Pushed to `origin/master` after the HANDOVER commit (see final state below).

## 23. Remaining limitations

- GSK / Double Elimination / Swiss remain non-executable (engine preparation only) — by design in Step 2.
- Create-time waitlist toggle not exposed (DTO supported but never surfaced by the original form — unchanged).
- Registration journey redesign (post-create) is a later step.
- `tournaments.create.*` field gates still control which fields a role can see — the wizard keeps them identical to the old form.

## 24. Next recommended step

Step 3 — the **Group Stage + Knockout engine + configuration**: add the bracket-type/qualification contract the wizard's GSK preview anticipates (requires a controlled DB/engine step), then wire the wizard's Format step to persist it.