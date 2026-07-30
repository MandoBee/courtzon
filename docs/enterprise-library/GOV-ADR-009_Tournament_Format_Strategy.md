---
document_id: "GOV-ADR-009"
document_name: "Tournament Format Strategy"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 10
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-008"]
---

# ADR-009: Dedicated Bracket Generation Functions per Tournament Format

**Status:** Accepted | **Date:** 2025-07-28

## Context

The tournament module supports 7 formats: knockout, double elimination, round robin, swiss, group stage knockout, league, and custom. Each format has a different match generation algorithm but shares the same `TournamentMatch` model for storage. Early designs attempted a single parameterized generator that handled all formats, but became unmaintainable due to divergent logic (byes, seeding, home/away, group stages).

Options considered:

1. **Single parameterized generator** — One function with `format` switch internally. Led to excessive branching.
2. **Strategy pattern with classes** — Polymorphic generators per format. Verbose for simple generation logic.
3. **Dedicated pure functions** — Independent `generateKnockoutBracket()` and `generateRoundRobinMatches()` exported from the domain layer. The service layer selects the correct function via a simple `if/else` on `t.format`.

## Decision

**Use dedicated pure functions for each format's match generation, exported from `domain/tournament-aggregate.ts`.** The service layer (`tournament.service.ts:178-223`) selects the correct function using a conditional branch on the tournament's `format` field. No polymorphic classes or factories.

### Core Functions

```typescript
// Generate knockout bracket with power-of-2 computation and byes
export function generateKnockoutBracket(participantIds: number[]): MatchTemplate[];

// Generate all-vs-all round robin matches
export function generateRoundRobinMatches(participantIds: number[]): MatchTemplate[];
```

### Service Orchestration

```typescript
// tournament.service.ts:178-223
async generateBracket(tournamentId: number): Promise<void> {
  const t = await this.getById(tournamentId);
  const registrations = await tournamentRepository.findRegistrationsByTournament(tournamentId);
  const confirmed = registrations.filter((r) => r.status === 'confirmed');
  const userIds = confirmed.map((r) => r.user_id!).filter(Boolean);

  let matches: any[] = [];

  if (t.format === 'knockout') {
    matches = generateKnockoutBracket(userIds);
  } else if (t.format === 'round_robin') {
    matches = generateRoundRobinMatches(userIds);
  } else if (t.format === 'group_stage_knockout') {
    // Phase 1: round-robin within each pre-generated group
    // Phase 2: knockout bracket of advancing participants
    const groups = await tournamentRepository.findGroups(tournamentId);
    if (groups.length > 0) {
      for (const group of groups) {
        const members = await tournamentRepository.findGroupMembers(group.id!);
        const regIds = members.map((m) => m.registration_id);
        const rr = generateRoundRobinMatches(regIds);
        for (const m of rr) {
          await tournamentRepository.createMatch({ ...m, group_id: group.id, status: 'scheduled' });
        }
      }
      return; // knockout phase handled after group stage completes
    }
    matches = generateKnockoutBracket(userIds); // fallback
  }

  for (const m of matches) {
    await tournamentRepository.createMatch({ ...m, status: 'scheduled' });
  }
}
```

### Format-specific algorithms

| Format | Generator | Algorithm |
|--------|-----------|-----------|
| `knockout` | `generateKnockoutBracket()` | Power-of-2 pairing with byes |
| `round_robin` | `generateRoundRobinMatches()` | All-pairs (n*(n-1)/2 matches) |
| `group_stage_knockout` | Both | Groups first (round-robin), then knockout |
| `double_elimination` | (Stub) | Future: dual bracket with losers bracket |
| `swiss` | (Stub) | Future: pairing by current standings |
| `league` | (Stub) | Future: full season with home/away |
| `custom` | (Stub) | Future: manual match creation |

### Knockout Algorithm Detail

```typescript
export function generateKnockoutBracket(participantIds: number[]): MatchTemplate[] {
  const count = participantIds.length;
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(count)));

  // Round 1: pair adjacent participants; remainder are byes
  const matches = [];
  for (let i = 0; i < nextPowerOf2 / 2; i++) {
    const p1 = participantIds[i * 2];
    const p2 = participantIds[i * 2 + 1];
    matches.push({ round: 1, bracketPosition: i, player1Id: p1, player2Id: p2 || undefined });
  }

  // Subsequent rounds: empty placeholders for winners
  const totalRounds = Math.log2(nextPowerOf2);
  for (let r = 2; r <= totalRounds; r++) {
    const matchesInRound = nextPowerOf2 / Math.pow(2, r);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({ round: r, bracketPosition: i });
    }
  }

  return matches;
}
```

## Consequences

### Positive
- **Each algorithm is independently testable** — Unit tests for `generateKnockoutBracket()` can cover bye scenarios, even/odd counts, and bracket symmetry without tournament setup.
- **No format interference** — A change to round-robin generation won't affect knockout logic.
- **Simple selection logic** — The `if/else` in the service is explicit and easy to trace. Future formats add a new `else if` branch and a new function.

### Negative
- **Code duplication potential** — Common match creation (status, tournament_id assignment) is duplicated across branches. Mitigated by extracting the `createMatch()` loop at the end.
- **Explicit conditional rather than dynamic dispatch** — Adding a new format requires modifying the service selection logic. Acceptable given the bounded set of formats (7 total, 2 fully implemented).
- **Standings calculation is format-agnostic** — `computeStandings()` works for any format since it only reads completed matches with winners. This was an intentional design choice to keep standings separate from generation.

## Standings Calculation (Format-Agnostic)

```typescript
export function computeStandings(matches: TournamentMatch[], participantIds: number[]): TournamentStanding[] {
  // Assigns 3 points per win, sorts by points → GD → GF
  // Works identically for knockout, round-robin, or group stage
}
```

This function is invoked after every `recordMatchResult()` call and recalculates from scratch (no delta updates). For large tournaments, this could be optimized with incremental updates, but the current approach ensures correctness through simplicity.

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| Single `generateMatches(format, ids)` | Excessive branching, hard to test individual formats |
| Strategy pattern (classes) | Over-engineered for 2 implemented algorithms + 5 stubs |
| External bracket service | Unnecessary network hop for in-process logic |

## Related Decisions

- **GOV-ADR-008** — Academy state machine (same lifecycle validation pattern for tournament lifecycle)
- **VOLUME-11** — Entity Lifecycles catalog (tournament lifecycle documented)

**Evidence:** Source implementation at `backend/src/modules/tournaments/domain/tournament-aggregate.ts:137-209`. Service usage at `application/tournament.service.ts:178-223` (generateBracket), `225-247` (recordMatchResult), `261-264` (recalculateStandings).
