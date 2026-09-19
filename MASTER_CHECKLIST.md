# CourtZon Master Checklist (Living)

> This is the living project checklist. Each Group records its scope, status,
> and any explicitly deferred capabilities. Groups are NOT complete until the
> delivery checklist (commit, push, build, Docker health, tests) is satisfied.

---

## Tournament Delivery Groups

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
  team/pair abstractions are not implemented.

### NOT STARTED (explicitly out of scope)
- **Group 5C** — not started.
- Tournament Payment / Entitlement / Accounting — not started.
- Tournament rating integration — not started.