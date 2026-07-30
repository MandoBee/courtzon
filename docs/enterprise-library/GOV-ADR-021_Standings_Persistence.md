---
document_id: "GOV-ADR-021"
document_name: "Standings Persistence — Pre-Computed Rankings in Database"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 4
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-20", "TECH-ARCH-21", "TECH-MOD-26"]
  related: []
---

# ADR-021: Standings Persistence — Pre-Computed Rankings in Database

## Status

Accepted

## Context

The sports engine powers leagues and tournaments with standings (rankings, points, Elo ratings). Standings must be queryable at high frequency (leaderboard pages, match previews, player profiles). Two architectural approaches exist:

1. **Compute on-the-fly** — standings calculated from match results each time; always current; no storage; but slow for large datasets
2. **Persist standings, recalculate on result** — standings stored in DB; recalculated after every confirmed match result; fast reads; requires write synchronization
3. **Persist with periodic batch recalculation** — standings stored in DB; recalculated on a schedule (e.g., every 5 minutes); simple but stale between recalculations

## Decision

**Standings are persisted in the database and recalculated immediately after every confirmed match result.** The `elo_ratings` table stores per-user, per-sport ratings with `matches_played`, `rating`, `k_factor`, and `last_match_at`. On match confirmation, the `calculateElo()` method updates the table in real-time.

### Architecture

```
Match Confirmed
  → rankingService.calculateElo(matchId, winnerId, loserId, sportId)
    → Get current ratings (insert default 1200 if new player)
    → Calculate expected scores (Elo formula)
    → Compute new ratings
    → UPDATE elo_ratings SET rating = newRating, matches_played + 1
    → Return { winnerNewRating, loserNewRating }

Standings Query
  → SELECT user_id, rating, matches_played, ROW_NUMBER() OVER (ORDER BY rating DESC)
    FROM elo_ratings WHERE sport_id = ?
    → Fast, no computation at read time
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Elo calculation | `calculateElo()` — standard Elo formula with K=32 | `ranking.service.ts:38-57` |
| Default rating | 1200 for new players | `ranking.service.ts:6` |
| K-factor | 32 (standard for most sports) | `ranking.service.ts:7` |
| Rankings query | `getRankings()` — pre-computed, sorted by rating DESC | `ranking.service.ts:10-36` |
| Auto-insert | New players auto-inserted into `elo_ratings` with default 1200 | `ranking.service.ts:43` |
| Last match tracking | `last_match_at` updated each match | `ranking.service.ts:54` |
| Row-level locking | `UPDATE` only affects the two players involved | `ranking.service.ts:54-55` |

### Why Not On-the-Fly Computation

| Factor | On-the-Fly | Persisted (Chosen) |
|--------|-----------|-------------------|
| Read latency | O(n) scan of all matches | O(1) lookup from elo_ratings |
| Write overhead | None | O(1) update per match result |
| Data staleness | None | None (immediate update) |
| Complexity | Simple query logic | Slightly more complex (recalculation triggers) |
| Scalability | Degrades with match count | Constant regardless of match history |

**Evidence:** `ranking.service.ts:38-57` — `calculateElo()` updates `elo_ratings` immediately.

## Consequences

### Positive

- **Fast reads**: Leaderboard queries are simple `SELECT ... ORDER BY rating DESC` — no computation at read time
- **Immediate updates**: Standings refresh as soon as a match result is confirmed
- **Simple query model**: No complex aggregate queries for ranking computation
- **Player history tracking**: `matches_played` and `last_match_at` provide snapshot of player activity
- **Sport isolation**: Per-sport ratings (separate `sport_id` rows per user)

### Negative

- **Write overhead**: Every confirmed match triggers two `UPDATE` statements
- **Recalculation gaps**: If match confirmation fails or is rolled back, ratings may diverge from actual results (mitigated by transaction atomicity)
- **No historical rating snapshots**: Only current rating stored; historical rating trends require a separate `rating_history` table (not yet implemented)

## Evidence

- `ranking.service.ts:1-60` — `getRankings()`, `calculateElo()`, Elo formula implementation
- `sports-engine.types.ts` — `PlayerRanking` type definition
- `sports-engine.routes.ts` — REST endpoints for ranking queries
- `database/baseline/001_courtzon_v3.sql` — `elo_ratings` table definition
