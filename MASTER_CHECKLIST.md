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

### G5 — Draw & Seeding Foundation 🔶 AUDIT COMPLETE — ARCHITECTURE REVIEW PENDING
- **Audit outcome**: participant identity is user-id-only (`tournament_matches.player1_id/2`
  FK → `users`); no pair/team participant entity; seed stored (`seed_rank`) but was
  NOT consumed by the draw (dead) — now fixed; `draw_seed` was dropped by
  `create()` — now persisted; no draw-attempt history; no manual placement; no
  waitlist (`waiting` status missing); no seed-violation model. Commit `d80dcfdb`.
- ✅ Fixed (minimal, backward-compatible, no schema change):
  - participant model — seed mapping (`seed_rank → seed`) so the draw honours seeds;
  - seed model — `draw_seed` persisted at create (deterministic draws);
  - auto re-draw — **NOT implemented** (draw is idempotent-guarded; re-draw is part
    of the pending architecture review);
  - seed preservation — seeds are read-only from the draw path (regression-tested);
  - manual drag/drop — **NOT implemented** (domain not ready);
  - seed violation warning — **NOT implemented** (no seeding-rules model);
  - draw approval/lock — **NOT implemented**.
- **REVIEW REQUIRED (OUTCOME B)**: participant identity / team-pair structure /
  draw-representation decision before building the draw UI.

### G6 — Participant Lifecycle 🔜 NOT STARTED
- withdrawal before start; waitlist (real `waiting` status + FIFO promotion);
  replacement; post-start withdrawal rules (walkover/forfeit per sport config).

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