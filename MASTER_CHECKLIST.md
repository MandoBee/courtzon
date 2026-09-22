# CourtZon Master Checklist (Living)

> This is the living project checklist. Each Group records its scope, status,
> and any explicitly deferred capabilities. Groups are NOT complete until the
> delivery checklist (commit, push, build, Docker health, tests) is satisfied.

---

## Tournament Delivery Groups — Current Numbering (G1 → G12)

### G1 — Tournament Rules Generation/Snapshot ✅ DONE
- Server-derived human-readable Rules snapshot; never client text.

### G1A — Organisation Type, Authoritative Currency, Bracket ✅ DONE
- Org tournaments forced `community`; authoritative branch→org currency; bracket
  type integration (config-driven, engine-supported guard).

### G1B — Player/Admin/Org API Contract ✅ DONE
### G1C — Admin Navigation & RBAC Reachability ✅ DONE
### G2 — Structured Tournament Prizes ✅ DONE
- `tournament_prizes` (cash/non-cash, placements, authoritative currency).
  Migration: `169_tournament_prizes.sql`.

### G3 — Registration Payment Methods ✅ DONE
- Cash / Card / Both allowlist via the SHARED Payment capability.
  Migration: `170_tournament_registration_payment_methods.sql`.

### G3A — Payment → Accounting Isolation Regression ✅ DONE
- `tournament` referenceType guarded in the accounting listener; regression spec.

### G4 — Registration Deadline + Venue + Daily Playing Window + Notifications ✅ DONE
- Deadline enforcement (`registration_closes`); venue via `branch_id` (org/branch
  model) + map link from real data; daily window (`daily_start_time`/`daily_end_time`,
  branch-hours validated, overnight-aware); sport-targeted idempotent
  `tournament:registration-open` notifications; `tournament:schedule-updated`
  realtime. Migration: `171_tournament_schedule_config.sql`.

### G5 — Draw & Seeding Foundation (granular) ✅ CORE FOUNDATION DONE — UI deferred
Architecture decision (from the G5 audit, approved): separate the three concepts
that must never be conflated — GLOBAL RATING (rating module, never mutated from
seeding), TOURNAMENT SEED (tournament-scoped, source rating|manual, authoritative,
preserved across re-draws), DRAW POSITION (placement per draw attempt; may change
without touching the seed). Participant identity is a first-class entity; the draw
is NOT built on user IDs. Migration: `172_tournament_participant_seed_draw.sql`
(4 new tables: tournament_participants, tournament_seeds, tournament_draws,
tournament_draw_entries).

- **G5A Participant Identity Foundation** ✅ — `tournament_participants`
  (type individual|pair|team, status, member_user_ids roster, registration link).
  Existing individual registrations map 1:1 (compatibility, historical data intact).
- **G5B Tournament Seed Foundation** ✅ — `tournament_seeds` with
  UNIQUE(tournament_id, seed_number) + UNIQUE(participant_id); one authoritative
  seed per participant; seed survives Auto Re-Draw; never recalculated by a draw.
- **G5C Manual Seed / Rating Snapshot** ✅ — `source enum('rating','manual')`;
  manual needs NO rating (assigned_by required); rating seeds freeze
  `rating_snapshot`/`rating_matches_played` (never live); manual seed never
  touches the global rating.
- **G5D Draw Generation State** ✅ — `tournament_draws` (attempt_number,
  draw_seed, status draft|approved|locked, validation_status, is_current) +
  `tournament_draw_entries` (position, placement_source auto|manual, overridden).
- **G5E Re-Draw / Seed Preservation** ✅ — generateDraw appends attempts
  (placement only); seeds preserved; deterministic per (participants, seeds,
  draw_seed); unseeded reshuffle on re-draw; seeded participants hold protected
  top positions.
- **G5F Manual Placement Foundation** ✅ — moveParticipant (swap) with
  `placement_source='manual'`; structured validation result for the future UI.
- **G5G Seed Violation Validation** ✅ — `evaluateSeedingRule` returns
  `{ valid, reason:'SEEDING_RULE_VIOLATION', seed, message }`; explicit
  `override` commits the move, keeps the seed, marks overridden + audit.
- **G5H Draw Approval / Lock Foundation** ✅ — approveDraw (requires valid) +
  lockDraw (requires approved); audit + realtime events.
- **DEFERRED (not this group)**: full Drag & Drop draw UI, waitlist, withdrawal
  workflow, pair/team member management, player-replacement workflow, court
  reservation (needs the match schedule), match progression, accounting.

### G6 — Participant Lifecycle (granular) ✅ FOUNDATION DONE
Real participant lifecycle on the G5 participant model (never the user-id-only
model). Migration: `173_tournament_lifecycle_waitlist.sql` (participant status
+ `withdrawn_after_start`, participant `waiting_order`, registration status
+ `waiting`, `tournaments.waitlist_enabled` default 0 = existing capacity error).

- **G6A Withdrawal Before Start** ✅ — active → `withdrawn`; registration →
  `withdrawn` (history preserved); seed/draw history preserved; draw entry
  removed (draft) or flagged (approved/locked never silently mutated).
- **G6B Post-Start Withdrawal Foundation** ✅ — active → `withdrawn_after_start`
  (DISTINCT state; normal waitlist replacement BLOCKED); match/result
  consequences deferred to rule-driven groups.
- **G6C Waitlist Model** ✅ — real `waiting` state on registration + participant;
  `waiting_order` (monotonic, unique, stable, never renumbered); `register()`
  waitlists when full + `waitlist_enabled`, else existing capacity error.
- **G6D FIFO Promotion** ✅ — earliest waiting participant (MIN waiting_order);
  atomic (tournament row locked FOR UPDATE — no double promotion); skip on
  ineligible; waiting_order of others never renumbered.
- **G6E Waitlist Payment Flow** ✅ — WAITING = no entitlement; promotion follows
  Group 3 (cash → paid offline row; card → shared PaymentService); wallet
  unavailable; promotion may leave pending/unpaid.
- **G6F Pre-Start Replacement** ✅ — withdrawn participant replaced by a
  waitlisted participant; NEW participant identity (A's ID never reused); A's
  registration/seed/draw history preserved; eligibility + duplicate checks.
- **G6G Draw Impact Validation** ✅ — structured `{ drawAffected, drawId, status,
  requiresRedraw, seedAffected }`; locked draw never silently mutated.
- **G6H Lifecycle Audit** ✅ — `recordAudit` for PARTICIPANT_WITHDRAWN /
  WITHDRAWN_AFTER_START / WAITLIST_JOINED / WAITLIST_PROMOTED /
  PARTICIPANT_REPLACED.
- **G6I Lifecycle Realtime** ✅ — `tournament:participant-updated`,
  `tournament:waitlist-updated`, `tournament:participant-replaced` via
  EventBusV2 → SocketPublisher → Socket.IO → frontend invalidation.
- **G6J Lifecycle Notifications** ✅ — `tournament:waitlist-promoted` template +
  engine registration; shared Notifications capability, no duplicate dispatcher.
- **DEFERRED (not this group)**: walkover/forfeit post-start consequences,
  replacement-request workflow UI, pair/team member replacement (G7).

### G7 — Doubles / Team Management 🔜 NOT STARTED

### G7 — Doubles / Team Management 🔜 NOT STARTED
- pair/team participant model + members; player replacement request; eligibility;
  approval/rejection; draw impact.

### G8 — Match Generation + Court Reservation 🔜 NOT STARTED
- consume the shared booking/slot reservation source of truth once the match
  schedule exists; no Tournament-specific reservation mechanism.

### G9 — Match Progression 🔜 NOT STARTED
### G10 — Tournament Realtime 🔜 NOT STARTED
### G11 — Tournament Accounting/Settlement 🔜 NOT STARTED
- intentionally unimplemented; accounting listener guards `tournament` referenceType.
### G12 — Full Tournament Manual UAT 🔜 NOT STARTED

---

## Historical Tournament Delivery Groups (earlier engine work — retained for audit)

### Group 5A — Tournament Engine Foundation ✅ DONE
- `matches.tournament_id` link, `tournaments.match_format_id` / `rule_set_id` / `draw_seed`.
- `tournament_stages` (mixed formats), `tournament_matches.match_id` link.
- Deterministic seeded draws, format/rule-set pairing validation.
- Migrations: `167_tournament_engine_foundation.sql`.

### Group 5B — Tournament Progression Engine ✅ DONE
- `tournament_matches.stage_id`, `progression_state`, `progression_meta`.
- Draw/progression engine: knockout bracket resolution, round-robin standings
  ingestion, bye/draw resolution, stage completion, idempotent result delivery.
- Migration: `168_tournament_progression.sql`.

### Group 5B-SR — Tournament Configuration & Creation Foundation ✅ DONE
- **Bracket types** are configuration-driven from `tournament_bracket_types`
  (single source of truth). No hardcoded bracket options in React.
- **Super Admin management screen**: Super Admin → Tournaments → Bracket Types
  (`/admin/tournament/bracket-types`) — name, slug, active/inactive,
  configuration summary (config_schema), reference count, activate/deactivate.
  Referenced types are NEVER destructively deleted (deactivation preferred).
- **Commission is subscription-derived and locked**: the create form displays
  the organisation's active-subscription tournament commission read-only; the
  backend derives `commission_rate` server-side and rejects/ignores any
  client-supplied value. `commission_rate` is a historical snapshot and is
  immutable after creation.
- **Sport → Match Format → Rule Set cascade** on the create form, backed by
  `sport_formats` / `sport_rule_sets`. `match_format_id` and `rule_set_id` are
  now persisted on `tournaments` and validated (format belongs to sport; rule
  set belongs to format). Generated Matches freeze format + rule snapshots.
- **Rules text** (free-text) is kept separate from the Match Rule Set.
- Org create remains tenant-scoped; org admins only manage their own org.

### Deferred Tournament Capabilities (NOT complete)
- **Double Elimination engine** — `tournament_bracket_types` row is active and
  configuration-visible, but the progression engine cannot generate it yet;
  creation with a deferred bracket type is rejected server-side.
- **Swiss System engine** — same deferred status (slug `swiss`).
- **Automatic registration-close draw generation** — registration close does
  not yet auto-generate the bracket/Matches; a manual
  `generate-bracket` / `generate-fixtures` step is required. Documented as a
  dedicated engine/lifecycle subgroup.
- **Complete Round Robin qualification/standings policy** — basic round-robin
  standings ingestion exists; full qualification policy is not finalized.
- **Mixed-stage qualification policy** — mixed-stage generation exists; the
  complete qualification policy across stages is not finalized.
- **Team/Pair abstraction** — participants are currently individual users;
  team/pair abstractions are not implemented (G7).

### NOT STARTED (explicitly out of scope)
- Tournament Payment / Entitlement / Accounting — not started (G11).
- Tournament rating integration — not started.