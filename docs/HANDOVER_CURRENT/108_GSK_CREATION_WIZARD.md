# HANDOVER 108 — GSK Creation Wizard Integration (Step 4A)

**Date:** 2026-10-07
**Scope:** Step 4A only — frontend Tournament Creation Wizard GSK configuration. No backend/DB/engine changes; no Hub/Player/Public GSK views.

---

## 1. Objective
Turn the wizard's "Group Stage + Knockout" card from an "Engine preparation" concept into a fully functional GSK configuration UI that collects the backend-supported `gsk_config` and submits it through the existing creation API.

## 2. Wizard Changes
- `TournamentFormatSelector` (`frontend/src/components/tournaments/wizard/TournamentFormatSelector.tsx`): GSK card is now **Available/selectable** (executable) when a single-elimination bracket substrate exists; added `onSelectGsk(bracketId)`. DE/Swiss remain "Engine preparation" (not selectable/submittable); the old GSK "future" preview panel was removed.
- `TournamentCreatePage` (`frontend/src/pages/tournaments/TournamentCreatePage.tsx`): form state gains `format` + `gsk_config`; selecting GSK writes the single-elimination bracket substrate, sets `format='group_stage_knockout'`, and initializes the default config; switching to knockout/round-robin sets the matching `format` and clears `gsk_config`; Format step renders `GskConfiguration` and blocks Continue on an invalid config; Review's Format section shows the GSK summary; the create payload adds `format` (always) and `gsk_config` only for GSK.
- i18n: `tournaments.wizard.gskui.*` + `gsk.invalid.*` registered with EN defaults.
- Tests: `TournamentCreatePage.spec.tsx` updated/added (GSK selectable + config visible + valid default + Continue; invalid groupCount blocks; GSK submit payload `format`+`gsk_config`; non-GSK payload omits `gsk_config`).

## 3. GSK Configuration Fields (`GskConfiguration.tsx`)
Group Stage: Number of Groups (≥1), Participants per Group (≥2), Group Format (fixed `round_robin`, disabled/read-only). Qualification: Top per Group (≥1, ≤ per group), Best Third Places (≥0, ≤ groups), Ordering (`seed|points|rank`). Knockout: Starting Round (`round_of_16|quarterfinals|semifinals|final|first_valid_round`), Seeding (`automatic|manual`), Separate Group Winners, Prevent Same-Group Rematch, Allow Byes. **Play-in rounds are NOT exposed** (hint text only; submitted value stays absent/0).

## 4. Validation Rules
Structure guard mirrors the backend schema (`groupCount≥1`, `participantsPerGroup≥2`, `1≤topPerGroup≤participantsPerGroup`, `0≤bestThirdPlaces≤groupCount`, `qualified≥2`). Knockout compatibility: qualified count must fit the selected round (or be bye-eligible when `allowByes` and > half the bracket); incompatible counts show a clear error and block Continue. The frontend **never silently changes** values; the backend remains authoritative.

## 5. Default Configuration
`DEFAULT_GSK_CONFIG` = 8 groups × 4 participants, top 2 per group, 0 best thirds, ordering `rank`; knockout `round_of_16`, automatic seeding, separate group winners, prevent same-group rematch, no byes. (Chosen as an internally consistent, valid configuration: 8×4 top2 = 16 → Round of 16.)

## 6. Payload Shape
GSK: `{ format: 'group_stage_knockout', gsk_config: {...} }`. Knockout: `{ format: 'knockout' }`. Round Robin: `{ format: 'round_robin' }`. `gsk_config` is never sent for non-GSK. Uses the existing creation endpoint (`POST /org/:orgId/tournaments`).

## 7. Review Step
The Format review section renders the actual GSK values (groups × per-group, top per group + best thirds, starting round · seeding · winner separation · rematch prevention) when GSK is selected; otherwise the bracket/sport/format/rule-set summary. No duplicated config logic — reads the shared form values.

## 8. Mobile / Accessibility
Cards and fields stack; inputs use ≥44px touch targets; preview summary is a plain definition list; controls have associated `<label htmlFor>`; checkboxes are labelled; validation errors use `role="alert"` and text (not colour-only); existing CSS/reduced-motion conventions reused; no horizontal overflow (containers wrap/stack).

## 9. Tests
- `TournamentCreatePage.spec.tsx`: **21 passed** (incl. GSK selectable/config/validation/payload + non-GSK omission).
- Frontend tournament-related suites: **27 files / 241 passed**.
- `npm run build` (tsc + Vite): **PASS**.

## 10. Build / Docker
`npm run build` → PASS. Frontend Docker: `docker compose build frontend` + `up -d frontend` → healthy on :5173 (200); backend unchanged and healthy (`/health` 200). (Recorded after the run.)

## 11. Commit
Hash/push recorded after verification — message: **`feat(tournaments): integrate GSK creation wizard`**.

## 12. Known Limitations
No Tournament Hub / Player / Public GSK views (next steps); DE/Swiss remain unselectable; play-ins unsupported (no control); manual seeding selection exists in config but the per-participant manual seed UI is not part of creation (handled elsewhere); `playInRounds` is omitted from the payload (backend defaults to 0).

## 13. Exact Next Recommended Step
**Step 4B — Tournament Hub GSK views**: Groups tab (groups + members), Qualification panel, and Knockout bracket consumption on the organizer/admin Hub, reusing the existing bracket/standings components.