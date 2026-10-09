# 130 — CourtZon Tournament UX Comprehensive Audit (UX-1)

- **Date:** 2026-10-09
- **Repo HEAD audited:** `481865e481ba39a72c30c25a80f3f9ef4997b477` (origin/master identical; working tree clean)
- **Method:** READ-ONLY source inspection (React + Tailwind + CSS-token analysis). **Visual browser verification was NOT available** — no desktop browser was connected to this session (Docker frontend/backend verified up via HTTP: `GET http://localhost:5173` → 200, `GET http://localhost:3000/health` → `status: ok`, DB+Redis OK). Per the evidence rules, **no finding below is claimed as visually verified**; all are source-inspection findings. See *Visual evidence vs source-only evidence* and *Coverage limitations*.
- **Scope covered:** Tournament list (admin/org/player), Dashboard, creation wizard, admin/org Hub (Overview, Participants, Competition, Matches, Standings, Finances, Settings, Schedule, Draw, Awards, Bracket Types), player/reference public tournament views, GSK panels, shared bracket/match components — across desktop (1440/1280/1024), mobile (390/360/320), LTR/RTL, all executable formats (Single Elimination, Round Robin, GSK) plus planned/unsupported formats.
- **Verdict:** **B — Minor non-blocking discrepancies.** No P0. Two P1 (status-badge visibility bug; fetch-failure-as-empty-state across 8 queries). No database changes proposed. All defects are frontend-only and fixable within the existing components/tokens.

---

## 1. Methodology & evidence key

- **(S)** = verified by source inspection (exact `file:line` cited).
- **(X)** = would require visual verification — flagged where relevant; not claimed.
- Pixel math for breakpoints uses the project's own utilities: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, `min-w-[220px]`, `min-w-[720px]`, `min-w-[900px]`, `overflow-x-auto`, etc. (Tailwind defaults: `sm=640, md=768, lg=1024`).
- Reference (gold-standard) implementations used as the comparison baseline:
  - `TournamentBracketTypesPage.tsx` — labeled 44px inputs, `isError`+Retry, differentiated empty states, `a11yDialog` on every modal, no native confirms.
  - `MatchesManager.tsx` — 44px segment buttons, skeleton loading, error+Retry, honest per-segment empty states.
  - `TournamentTabs.tsx` — accessible roving-tab navigation with arrow keys.

---

## 2. Findings by severity

### P0 — Critical blockers

**None.** No data-loss, security, or full-screen-unusable defect was confirmed from source.

### P1 — High impact (fix first; both are small, deterministic fixes)

#### F-01 — "Draft" / "scheduled" status pills are invisible (badge text = badge background)
- **Severity:** P1 (contrast/visibility bug • all viewports • all layouts)
- **Screens:** Admin/org Tournament list; Player tournament detail; Match cards (bracket, schedule, results).
- **Affected viewport:** every width; LTR and RTL.
- **Evidence:**
  - `frontend/tailwind.config.js:13` — `gray: { 100: 'var(--color-border)' }`
  - `frontend/tailwind.config.js:20` — `gray: { 700: 'var(--color-border)' }` (same token as `100`!)
  - `frontend/src/pages/admin/tournament/TournamentListPage.tsx:13` — `draft: 'bg-gray-100 text-gray-700'`
  - `frontend/src/pages/tournaments/TournamentDetailPage.tsx:31` — `draft: 'bg-gray-100 text-gray-700'` (rendered at :218)
  - `frontend/src/components/tournaments/MatchCard.tsx:17` — `scheduled: 'bg-gray-100 text-gray-700'`
  - `frontend/src/pages/tournaments/TournamentDetailPage.tsx:36` — `completed: 'bg-gray-100 text-gray-600'` (readable — `gray-600` maps to `--color-text`)
- **Impact:** `bg-gray-100`/`text-gray-700` are the **same CSS custom property**, so "Draft" and "Scheduled" pills render text-on-same-color → effectively blank. Users cannot tell a tournament/match state. A related near-miss pair (`bg-gray-100 text-gray-500` → `--color-text-muted`) gives very low contrast.
- **Fix:** map `gray-700 → var(--color-text)` (as `gray-600` already is) or, preferably, render status via the tokenised `Badge` tones (`default`, `warning`, `success`, `danger`) used by `BracketTypesPage`/`MatchesManager`. Add a unit check asserting no status pair resolves to identical tokens.

#### F-02 — Failed data fetches render as "empty / not found" (no `isError` + Retry) on 8 tournament queries
- **Severity:** P1 (misleading states, no recovery path • all viewports)
- **Screens:** Player tournament list; Player/detail header query + participants; Admin participants; Admin draw; Admin awards (3 queries); Admin tournament list; Schedule list.
- **Evidence:** the following queries destructure only `{ data, isLoading }` — `isError`/`refetch` are not consumed anywhere in the file, so a network/500 failure falls through to the empty-state branch (verified absence via grep of `isError|refetch`):
  - `frontend/src/pages/tournaments/TournamentListPage.tsx:20-23` (→ "No tournaments yet", line 34-35)
  - `frontend/src/pages/tournaments/TournamentDetailPage.tsx:76-79` (main tournament query → "not found" dead-end, no retry), `:96-99` (participants)
  - `frontend/src/pages/admin/tournament/TournamentListPage.tsx` (grep: no `isError`)
  - `frontend/src/pages/admin/tournament/TournamentParticipantsPage.tsx:56,62,79,89,97` (participants/draw/waitlist/competitions/replacements → empty tables)
  - `frontend/src/pages/admin/tournament/TournamentDrawPage.tsx:49,55,61` (tournament/participants/draw → empty board + empty sidebar)
  - `frontend/src/pages/admin/tournaments/TournamentAwardsPage.tsx:67,73,80,87` (tournament/awards/prizes/participants)
  - `frontend/src/pages/admin/tournament/TournamentSchedulePage.tsx` (sub-agent verified: `error` not destructured)
- **Positive contrast:** the same codebase already implements the correct pattern — `TournamentBracketTypesPage.tsx:164,278,396-405,594` (error panel + Retry) and Hub `TournamentDetailPage.tsx:184,697` (`matchesError` + `onRetry`), `MatchesManager.tsx:350-357`.
- **Impact:** during a backend outage or flaky network, tournament screens silently lie ("no tournaments", "no participants", "no matches"), blocks a Free Registration workflow owner from even seeing the failure, and offers no retry.
- **Fix:** standardise: destructure `isError`/`error`/`refetch`; when `isError`, show the `--color-error` panel with a Retry button (copy from `MatchesManager`/`BracketTypesPage`).

### P2 — Should fix (UX, a11y, consistency, small-viewport)

#### F-03 — Admin Participants action bar overflows 320px (no `flex-wrap`)
- **Screens:** Admin/org Participants (`/admin/tournament/list/:id/participants`, `/org/:orgId/tournaments/:id/participants`).
- **Evidence:** `TournamentParticipantsPage.tsx:224` `flex items-center justify-between` → `:226` inner `flex gap-2` (no wrap) containing **7 buttons** ("Draw", "Matches & Schedule", "Add Pair", "Add Team", "Generate Draw/Re-Draw", "Approve", "Lock") at `:228-255` → ~630px+ of controls for a 320px viewport → horizontal page scroll / clipped controls. Sibling screens do it right: `TournamentSchedulePage.tsx:123` `flex gap-2 flex-wrap`; `TournamentDrawPage.tsx:211` `flex gap-2 flex-wrap`.
- **Fix:** add `flex-wrap` + `justify-end`; consider a compact "…" overflow menu at <sm (matches the Hub's secondary `details` menu pattern in `TournamentHero.tsx:135-156`).

#### F-04 — Native `window.confirm` dialogs bypass the design system (8 in tournament surfaces)
- **Evidence (tournament surfaces):** `TournamentListPage.tsx:213` (archive), `TournamentDetailPage.tsx:497` (cancel registration), `TournamentSchedulePage.tsx:188` (release court), `TournamentParticipantsPage.tsx:298,332,404,408`, `frontend/src/pages/player/TournamentsPage.tsx:51` (unregister).
- **Impact:** OS-native un-themed prompts appear mid-flow in the premium navy/green UI; unlocalisable styling, block the render thread, and differ across platforms. BracketTypes (`:536-569`) already demonstrates the styled, `a11yDialog` alternative.
- **Fix:** shared `ConfirmDialog` (Modal with `a11yDialog`, danger primary, reason text) — align with the toast "Undo" pattern from `AGENTS.md`.

#### F-05 — Hand-rolled overlays in Participants lack dialog semantics (role, focus trap, ESC, labels)
- **Evidence:** `TournamentParticipantsPage.tsx:529-547` (Replace), `:549-569` (Assign Seed), `:572-596` (Add Pair/Team — up to 6 numbered inputs), `:599-612` (Add Member), `:615-640` (Request Replacement). All use raw `fixed inset-0 z-[70]` divs with NO `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, or Escape handling. The tall Add-Team form has no `max-h`/scroll on the panel → risk of off-screen submit at 320×568 while the soft keyboard is open.
- **Fix:** replace with the existing `<Modal a11yDialog variant="sheet">` used by Bracket Types; keeps `z-[70]` and gains focus management + ESC.

#### F-06 — Draw board is drag-only — no keyboard/keyboard-equivalent path to place participants
- **Screens:** Admin/org Draw (`.../draw`).
- **Evidence:** `TournamentDrawPage.tsx:47` uses only `PointerSensor` (`{ activationConstraint: { distance: 6 } }`); `useDraggable`/`useDroppable` cards at `:343-389` attach pointer listeners only — no `KeyboardSensor`, no "move to position" fallback, no instructions text. dnd-kit supports `KeyboardSensor` (space/enter + arrows) that this screen does not enable.
- **Impact:** keyboard, switch-access, and some screen-reader users cannot perform the screen's core action; touch users get no affordance hints.
- **Fix:** add `KeyboardSensor` to `useSensors`, set `aria-label`/`aria-describedby` on slots, and surface a non-drag "Assign to position" menu as a fallback.

#### F-07 — Horizontal scroll regions are keyboard-inaccessible (no `role="region"` + `tabIndex={0}`)
- **Screen evidence (all widths ≥ 1024 for brackets/tables):**
  - `TournamentBracket.tsx:51` knockout columns `overflow-x-auto` (`min-w-[220px]` per round → a 5-round 32-player draw ≈ 1,164px, a 6-round 64-player draw ≈ 1,456px — scrolls even at 1440).
  - `TournamentHero.tsx:166` phase progress, `:202` KPI strip (`md:grid md:grid-cols-4` OK at ≥768, but it is scrollable below).
  - `GskCompetitionViews.tsx:45` groups table; `TournamentDrawPage.tsx:277,305` boards (`min-w-[720px]`/`min-w-[640px]`); `BracketTypesPage.tsx:374` table (`min-w-[900px]`).
  - None carry `role="region"`, `tabIndex={0}`, or a descriptive `aria-label` (grep confirmed).
- **Fix:** wrap scroll containers in the standard `role="region"` + `tabIndex={0}` + `aria-label` pattern so keyboard users can focus+arrow-scroll them.

#### F-08 — Internal participant IDs shown to users instead of names
- **Evidence:** `GskCompetitionViews.tsx:165` `#{q.qualificationRank} · {q.participantId}` and read-only panel `:276` same; `TournamentAwardsPage.tsx:225` `User ${a.winner_user_id}` fallback; `MatchesManager.tsx:404-405` `'Player'` (no `_name`) placeholders; `TournamentParticipantsPage.tsx:291,386-388,539` `Player #N`/`Participant #N` fallbacks.
- **Impact:** organizer screens read like debugging output whenever the display-name field is missing; confusing in approvals/waivers.
- **Fix:** resolve from the already-loaded participants map, or show a neutral "Unnamed participant" — never raw IDs.

#### F-09 — GSK qualification results are never shown to players (also not restored for organizers until re-run)
- **Evidence:** `TournamentDetailPage.tsx:423` passes only `{ groupStage, groupMatches }` to `GskQualificationPanel` — the `qualified` prop (`GskCompetitionViews.tsx:237-239`) is never supplied → players always see "will be published by the organiser" (`:282-285`). Admin `GskQualificationView` renders qualifiers only from the **mutation result** in memory (`:124-125`, `result = mutation.data`), not from a server read-back → refresh clears the published list.
- **Fix:** read the persisted qualified list via the existing endpoint (or pass through from group data) for both admin and player panels.

#### F-10 — Touch targets below the WCAG 2.2 AA minimum (24×24) on core actions
- **Evidence (effective heights):**
  - `text-[10px] px-2 py-1` ≈ **22px**: `TournamentListPage.tsx:201,208,221,224`.
  - `text-xs ... hover:underline` text links ≈ **18px**: `TournamentParticipantsPage.tsx:316,322,326,333,347`.
  - `px-3 py-1.5 text-xs` ≈ **28px** header buttons (pass 24px but below the 44px recommendation): Participants :228-255; Draw :213-231; Schedule :126-134.
  - `Button size="sm"` ≈ **26-28px** (`index.css:274-277` `cz-btn-sm`): `MatchesManager.tsx:465-482` (Details/Accept/Schedule), drawer Previous/Next.
  - `text-[10px]` Enter Score/Withdraw links: `TournamentDetailPage.tsx:375,393`; `MatchesManager.tsx:24` winner chip `text-[9px]`.
- **Positive:** `min-h-[44px]` is the established standard (TournamentHero:129,136; TournamentTabs:60; MatchesManager:288-315; BracketTypesPage:147; wizard Back/Continue `TournamentCreatePage.tsx:1033,1042`).
- **Fix:** actions inside tables/drawer should honour `min-h-[44px]` hit areas (or at least a 24×24 padded hit box); keep small text for labels only.

#### F-11 — Off-palette Tailwind color steps bypass the theme system (light-out-of-dark-navy; theme-immune)
- **Evidence:** the theme maps only `gray/green/red/blue/yellow/amber` at specific steps (`tailwind.config.js:7-66`). Un-mapped steps fall back to hardcoded defaults that **cannot follow the published theme or dark mode**:
  - `purple-100/700` — walkover/forfeit badges `MatchCard.tsx:23-24`; `running` status in `TournamentListPage.tsx:17` and player `STATUS_BADGE :35`.
  - `teal-100/700` — `completed` in `TournamentListPage.tsx:19`.
  - `amber-50/200/800` — Draw warnings panel `TournamentDrawPage.tsx:236-238` (a fixed light-yellow box that will look alien in dark navy).
  - `amber-300`/`green-300` borders — Draw/Participants Lock/Approve buttons (`TournamentDrawPage.tsx:218,222`, `TournamentParticipantsPage.tsx:249,253`).
  - Full mapped warning set exists (`amber-100/400/500/600/700/900` and `dark:` variants) — these steps just weren't used.
- **Fix:** convert all status/alert color usage to mapped steps or token vars (`--color-warning-bg`, etc.); add the missing steps to `tailwind.config.js` if genuinely needed. This also folds F-12 in.

#### F-12 — "Live/In-progress" rendered in three different colors across surfaces
- **Evidence:** MatchCard badges use blue for `in_progress` (`MatchCard.tsx:20`); MatchesManager "Live" label uses warning amber text (`MatchesManager.tsx:457`); admin list `running` uses purple (`TournamentListPage.tsx:17`).
- **Fix:** one semantic mapping (proposal: `in_progress/live → green` per the green-status design direction; keep amber strictly for warnings like pending), applied via shared tokenised badge tones after F-01.

#### F-13 — Permission-gated actions silently disappear (no reason, no fallback CTA)
- **Evidence:**
  - Creation wizard: submit button gated `org.tournaments.create` (`TournamentCreatePage.tsx:1047-1056`) while the form's field keys are `tournaments.create.*` (e.g. registry `:148-151`; parity test `tournament-org-permissions.test.ts:24-53`) → a user who may build the whole form but lacks the button key reaches Review with **no submit control and no explanation**.
  - GSK organizer actions: `'__none__'` sentinel key when `!canManage` (`GskCompetitionViews.tsx:138,201`) hides "Run Qualification"/"Generate Knockout" with no messaging.
  - Player "Enter Score" path (`TournamentDetailPage.tsx:375,393`) and register CTA (`:256-261`) hidden silently.
- **Fix:** replace silent hiding with disabled+reason (`title`/inline note "Contact an administrator to submit") — defense-in-depth message per the RBAC standard, without exposing keys.

#### F-14 — Player Standings/Participants tables cramp severely at 320–390px (no scroll, no min-width)
- **Evidence:** `TournamentDetailPage.tsx:449-475` (Standings: 7 columns `w-full text-sm` inside `overflow-hidden`) and `:480-497` (Participants) — no `overflow-x-auto`/`min-w`. Long names wrap into multi-line cells; seeded values misalign. The admin Hub tables already solve this with `overflow-x-auto` (`TournamentDetailPage.tsx:466,711`).
- **Fix:** append `overflow-x-auto` to these two wrappers (and mirror any other table surfaces using the same pattern).

#### F-15 — Player tab strip is a partial, inconsistent tab implementation
- **Evidence:** `TournamentDetailPage.tsx:285-292` buttons carry `role="tab"` + `aria-selected` but no `role="tablist"`, no `aria-controls`/panel id links, no arrow-key/Home/End navigation — unlike the fully accessible `TournamentTabs` (roving tabindex + arrows) used by the Hub. Chips are `px-3 py-1.5 text-xs` (~28px, see F-10).
- **Fix:** reuse `TournamentTabs` (passes `ariaLabel`, handles keyboard); keeps horizontal scroll on mobile.

#### F-16 — Admin Dashboard KPI cards are a visual dead-end (no drill-down)
- **Screens:** `/admin/tournament/dashboard`.
- **Evidence:** `TournamentDashboardPage.tsx:48-55` renders stat cards only — no navigation targets; the only way onward is the sidebar Tournaments link. KPI numbers without a click-through reduce the dashboard to a poster.
- **Fix:** wrap each KPI stat in a link to the filtered list (e.g. by status) as a small enhancement.

### P3 — Polish / consistency

- **F-17 — Placeholder-only & unassociated form fields.** Admin list search (`TournamentListPage.tsx`, placeholder + no sibling label/`aria-label`); Participants dialogs labels without `htmlFor` (`:534,554-562,577-580,603,620,628,631`); Awards selects without `htmlFor` (`:163-193`); schedule modal labels via proximity only (`SchedulePage.tsx:223-240`). BracketTypes is the reference (`labelCls` + `htmlFor` + `inputCls`). Fix: associated labels / `aria-label`.
- **F-18 — Loading-state inconsistency.** Player list uses `<Spinner />` (`TournamentListPage.tsx:32-33`) while every other tournament surface uses `SkeletonRow`. Fix: standardise on skeletons.
- **F-19 — RTL mirroring is partial.** Document `dir="rtl"` + `text-align:right` exist (`index.css:202-204`, `i18n/index.ts:18-19`), but tournament components use physical utilities that won't mirror: back/forward glyphs `←`/`→` (`TournamentDetailPage.tsx:201`, `TournamentHero.tsx:99`, DrawPage `:229`, wizard `:1044`), `text-right` value rows (`MatchDetailsDrawer.tsx:54`), `right-0` menu (`TournamentHero.tsx:140`), `space-x-2` (`ParticipantsPage:313,396`), `ml-2` (`BracketTypesPage:652`), `text-left` headers (`:377,469`), slide-in keyframe `translateX(100%)` (`index.css:206`). Fix: logical utilities (`ms/me/ps/pe/start/end`), dir-aware arrows (`scaleX(-1)`), RTL-safe slide direction.
- **F-20 — Entry-fee discrepancy risk (multi-competition).** Player header uses `tournament.entry_fee` (`TournamentDetailPage.tsx:229`) while the register modal uses the computed `displayFee`/competition fee (`:525`). With several competitions these can disagree. Fix: use one authoritative `displayFee` in both places.
- **F-21 — Micro-text density (`text-[9px]`/`[10px]`)** on non-interactive labels (winner chips, placed/unplaced marks, KPI captions, status chips) is a global pattern (100+ occurrences in `pages/`), below comfortable legibility on high-density dark-navy surfaces. Fix when touching each screen: raise essential statuses to 11–12px.
- **F-22 — Finances loading is plain text** (`TournamentDetailPage.tsx`, "Loading finances…") vs Skeletons elsewhere. Minor.
- **F-23 — `'__none__'` fake permission key** (`GskCompetitionViews.tsx:138,201`) is an RBAC anti-pattern — `Can` already denies unknown keys. Replace with the real key and a `can()` check.
- **F-24 — "Request Refund" not disabled when the draw is locked** (`TournamentDetailPage.tsx:263-278`); only a hint text. Fix: disable + tooltip when `draw.locked`.
- **F-25 — Awards amounts hardcode two decimals** `Number(a.amount).toFixed(2)` (`TournamentAwardsPage.tsx:226,175`) regardless of currency sig-digits. Use the shared currency formatter.
- **F-26 — Schedule modal uses `grid-cols-2`** (`SchedulePage.tsx:226`) — on a 320px sheet the date/time cells are ~150px; acceptable but tight. Consider `grid-cols-1 sm:grid-cols-2`.

---

## 3. Format capability UX (Single Elimination / Round Robin / GSK / planned)

- **Executable formats are honestly surfaced.** Bracket Types reads capability from the backend (`engine_capability`, `creation_available`, `referenced_count`) and never re-derives it (`BracketTypesPage.tsx:18-27`); Ready/Planned/Unsupported badges (`:36-40,436-451`), "Engine not available yet" explanatory text (`:446-448`), and composite GSK row with engine contract details (`:646-675`). No fabricated bracket for unsupported formats: Draw page shows an explicit "Unsupported bracket type" panel (`TournamentDrawPage.tsx:269-274`); `TournamentBracket` renders match columns only for knockout.
- **GSK flow:** groups → qualification (organizer runs; player sees read-only pending/published states, F-09) → knockout, with honest "not generated yet" placeholders (`GskCompetitionViews.tsx:120,195-213,241-247,304-310`). Real-time: `tournament:group-stage-generated`/`tournament:knockout-generated` are allowed in the socket publisher (`backend/src/modules/realtime/application/socket-publisher.ts:122`) with cache invalidation — verified earlier (per prior handover evidence at HEAD `481865e4`).
- **GSK configuration in the wizard** renders with 44px controls/labels (verified earlier for `GskConfiguration`), matching the field-permission standard.

---

## 4. Top 10 improvements (ranked by impact ÷ effort)

| # | Finding | Effort | Why first |
|---|---------|--------|-----------|
| 1 | **F-01** Invisible draft/scheduled badges | S | Deterministic 3-file token fix that restores status readability everywhere |
| 2 | **F-02** Error-as-empty + Retry on 8 queries | M | Trust/state correctness; template already exists (BracketTypes/MatchesManager) |
| 3 | **F-10** Touch targets < 24px (list + participants) | S–M | Directly violates the UAT mobile bar (AGENTS.md) |
| 4 | **F-05** Modal a11y on 5 hand-rolled overlays | M | Convert to existing `Modal a11yDialog` — one component |
| 5 | **F-04** Native `window.confirm` (8 sites) | M | Consistent themed confirmations; unblocks localization |
| 6 | **F-11/F-12** Unify status colors on the token system | M | Kills off-palette purples/teals + live-color ambiguity in one sweep |
| 7 | **F-07** Keyboard-scrollable regions | S | Small wrapper pattern across 5 components |
| 8 | **F-06** Keyboard alternative for the Draw board | L | Add KeyboardSensor; largest a11y guarantee in the module |
| 9 | **F-13** Explain permission-denied actions | S–M | Prevents "broken wizard" confusion at Review step |
| 10 | **F-08/F-09** Name resolution + GSK qualifier read-back for players | M | Data quality on the GSK funnel |

---

## 5. Top 3 UX problems

1. **Users can't trust the state language.** Status pills are invisible (F-01) and fetch failures masquerade as "no data" (F-02) — the two most common ways tournament screens communicate state are both broken. No P0 data-loss issue, but this is the biggest correctness gap.
2. **Small-viewport friction is real and inconsistent.** At 320px several action bars/tables/touch targets fail the platform's own 44px bar (F-03, F-10, F-14) while sibling screens already do it right — a consistency failure, not a missing foundation.
3. **Accessibility of core interactions is partial.** The draw board is keyboard-locked (drag-only), scroll regions aren't reachable by keyboard, and 5 hand-rolled dialogs lack dialog semantics (F-05, F-06, F-07, F-15).

---

## 6. Visual evidence vs source-only evidence

- **Source-inspection evidence (S):** all findings above. Each cites exact `file:line` and verbatim classNames; the colour-token conclusions (F-01, F-11) are derivable deterministically from `tailwind.config.js` + `index.css` tokens.
- **Visual evidence (X):** none. No desktop browser was attached to this session, and I did not claim rendered verification for pixel-perfect layout, actual contrast measurements, scroll behaviour, drag interactions, RTL flipped rendering, or keyboard walk-throughs. Items marked "(X)" in the checklist below are **pending UAT**, not verified.

---

## 7. Recommended first fix and why

**F-01 — restore readable status pills** (`bg-gray-100 text-gray-700` → a distinct, token-mapped foreground such as `text-gray-600`/`--color-text`, or route through `Badge` tones) in `MatchCard.tsx`, `TournamentListPage.tsx`, and player `TournamentDetailPage.tsx`.

Why: it is the smallest, most deterministic defect (three 1-line changes anywhere), it is a **true bug** (text and background resolve to the same CSS variable), it affects the most-travelled surfaces (any list or bracket), and it sets the table for F-11/F-12 by centralising status rendering. Low risk, zero data/token changes, immediately testable.

---

## 8. Practical manual browser checklist (UAT — not executed this session)

**Setup:** run the Docker stack (frontend 5173 / backend 3000); log in as (a) super_admin, (b) org admin, (c) player; enable AR locale for the RTL pass. Use responsive device emulation at 1440 / 1280 / 1024 / 390 / 360 / 320.

| # | Screen | Check | Widths |
|---|--------|-------|--------|
| 1 | Admin list (`/admin/tournament/list`) | Draft + Archived + all status pills readable (F-01); action row tap targets ≥24px (F-10); kill the backend (or use DevTools offline) → error+Retry not empty (F-02); table scrolls horizontally | all |
| 2 | Player list (`/tournaments`) | Card title truncation at 320 (F-14 class); spinner vs skeleton; offline → error state | 320/390/1024 |
| 3 | Creation wizard (`/tournaments/create`) | Steps 1–7: label association (F-17), 44px Back/Continue, GSK config for `group_stage_knockout`; at Review with only `tournaments.create.*` perms (no `org.tournaments.create`) check an explanatory message appears in place of a missing submit (F-13) | 320/1024 |
| 4 | Admin Hub (`/admin/tournament/list/:id`) | Hero phases scroll + keyboard (F-07), KPI strip at <768, lifecycle actions via `…` menu (touch), tabs arrow-key nav | 320/1024/1440 |
| 5 | Participants (`.../participants`) | 7-button bar wraps/overflows at 320 (F-03); Replace/Seed/Add Team dialogs: ESC, focus trap, tab order (F-05); no native confirm on Withdraw/Reject (F-04) | 320/390 |
| 6 | Draw (`.../draw`) | Drag slot → position (touch at 390/360/320); try keyboard-only placement (F-06); wide board scrolls with focus-scroll (F-07); "Unsupported bracket type" panel for swiss/double elim | 320/1280 |
| 7 | Schedule (`.../schedule`) | Modal fields at 320 (F-26); generate/auto-schedule toasts; native confirm removal (F-04) | 320/1024 |
| 8 | Player detail (`/tournaments/:id`) | Standings 7-col table scrolls/cramps (F-14); tab strip arrow keys (F-15); register modal focus trap; refund disabled when draw locked (F-24) | 320/1024 |
| 9 | GSK (create GSK tournament → groups → qualify → knockout) | Player qualification shows published names (F-08/F-09); organizer Run Qualification persists after refresh (F-09); knockout bracket scroll+keyboard at 1024 (F-07) | 320/1024/1440 |
| 10 | Bracket Types (`/admin/tournament/bracket-types`) | Reference screen — verify no regressions; view/edit/delete `a11yDialog` focus; Ready/Planned/Unsupported badges | all |
| 11 | RTL pass (AR locale) | Re-run #1–#10 with `dir=rtl`: arrows `←/→`, `text-right` rows, `right-0` menus, `space-x` gaps mirror correctly (F-19) | 390/1024 |
| 12 | Reduced motion (OS setting) | Bracket/hub/sheet animations stop (existing `prefers-reduced-motion` in `index.css:1182-1194`); no layout jump | all |

---

## 9. Coverage limitations

1. **No visual verification** — no browser was attached (see §6). Pixel-perfect claims, live contrast meters, actual overflow, RTL rendering, and real drag/keyboard behaviour are unverified.
2. **Read-only scope** — no runtime changes were made; the app was only probed via `curl` health checks.
3. **Not exhaustive per-line** — the audit prioritized the required screen list; deep table-density details in Hub mini-tables and print view (`TournamentPrintView`) were not re-audited beyond earlier handover verification.
4. **Tests not re-run** — prior evidence (parity 91 pass/7 pre-existing failures, redirect suite 7/7, tournament admin suites 108 pass, tsc+Vite build at `1a56e8fc`) was not re-executed in this read-only pass.
5. **DB untouched** — no schema/seed/migration changes were made; none are proposed (F-01…F-26 are all frontend-token/component fixes).

---

## 10. Delivery confirmation

1. **Report path:** `docs/HANDOVER_CURRENT/130_TOURNAMENT_UX_COMPREHENSIVE_AUDIT.md` (this file — the only file created).
2. **Findings grouped by severity:** P0 = none; **P1 = 2** (F-01 invisible badges, F-02 error-as-empty ×8 queries); **P2 = 14** (F-03…F-16); **P3 = 10** (F-17…F-26).
3. **Top 3 UX problems:** (1) broken/untrustworthy status language (F-01 + F-02); (2) inconsistent small-viewport/touch behaviour at 320px (F-03, F-10, F-14); (3) partial keyboard/dialog accessibility on core interactions (F-05, F-06, F-07, F-15).
4. **Visual vs source evidence:** source-inspection only; zero visual claims (no browser available). See §6.
5. **Recommended first fix:** F-01 — restore readable `draft`/`scheduled` status pills via token-mapped foreground/Badge tones (smallest deterministic bug, highest surface coverage).
6. **Actual HEAD & Git status:** `481865e481ba39a72c30c25a80f3f9ef4997b477`; `origin/master` identical; working tree contains exactly one new untracked file (`docs/HANDOVER_CURRENT/130_TOURNAMENT_UX_COMPREHENSIVE_AUDIT.md`) — everything else clean.
7. **No source, test, database, Docker, or Git changes were made.** Only the single audit report above was created. It was not committed (read-only task) and will appear as untracked until the user decides to commit it.