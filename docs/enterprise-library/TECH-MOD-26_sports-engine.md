---
document_id: "TECH-MOD-26"
document_name: "Sports Engine Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-19"]
  related: ["TECH-MOD-05", "TECH-MOD-06", "TECH-MOD-03"]
---

# Sports Engine Module (TECH-MOD-26)

**Source:** `backend/src/modules/sports-engine/` (4 entries: domain/, application/, presentation/, index.ts)

## 1. Purpose

Sports analytics engine: ELO ranking algorithm, player performance analytics, match quality scoring, partner recommendations by skill proximity, coach recommendations by rating, sports trends (booking/tournament/academy activity). 8 routes.

## 2. Architecture

```
domain/
  sports-engine.types.ts    — All type definitions (57 lines)
application/
  ranking.service.ts        — ELO calculation + rankings query (60 lines)
presentation/
  sports-engine.routes.ts   — 8 endpoints (23 lines)
  sports-engine.controller.ts
index.ts                    — Barrel export
```

**Evidence:** `sports-engine.routes.ts` (23 lines), `domain/sports-engine.types.ts` (57 lines), `application/ranking.service.ts` (60 lines).

## 3. Routes (8)

Defined in `sports-engine.routes.ts:9-23`:

| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | GET | `/sports-engine/rankings` | `sports-engine.view` | Get player rankings |
| 2 | POST | `/sports-engine/rankings/calculate` | `sports-engine.manage` | Calculate ELO for a match |
| 3 | GET | `/sports-engine/optimize/schedule` | `sports-engine.view` | Get optimized schedule |
| 4 | GET | `/sports-engine/analytics/player/:id` | `sports-engine.view` | Player performance analytics |
| 5 | GET | `/sports-engine/analytics/match-quality` | `sports-engine.view` | Match quality scoring |
| 6 | GET | `/sports-engine/analytics/trends` | `sports-engine.view` | Sports trends |
| 7 | GET | `/sports-engine/recommend/partners` | `sports-engine.view` | Partner recommendations |
| 8 | GET | `/sports-engine/recommend/coaches` | `sports-engine.view` | Coach recommendations |

## 4. Permissions

- `sports-engine.view` — View rankings, analytics, recommendations
- `sports-engine.manage` — Calculate ELO ratings

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| ELO Rating | `elo_ratings` | `id, user_id, sport_id, rating, matches_played, k_factor, last_match_at` |
| Player Ranking | (computed) | `user_id, full_name, avatar_url, rating, matches_played, wins, losses, win_rate, rank_position, sport_name` |
| Player Performance | (computed) | `user_id, total_matches, wins, losses, win_rate, current_streak, best_streak, recent_form[], sport_breakdown[]` |
| Match Quality | (computed) | `match_id, quality_score, skill_balance, competitiveness, player_count, duration_minutes` |

**Evidence:** `sports-engine.types.ts:1-57` defines `PlayerRanking`, `MatchQualityScore`, `PlayerPerformance`, `ScheduleCandidate`, `PartnerRecommendation`.

## 6. ELO Ranking Algorithm

Implemented in `ranking.service.ts:38-57`:

- **Default rating:** 1200 (`DEFAULT_RATING = 1200`, line 6)
- **K-factor:** 32 (`K_FACTOR = 32`, line 7)
- **Scale:** 400-point scale (`Math.pow(10, (rB - rA) / 400)`, line 49)
- **Expected score formula:** `E_a = 1 / (1 + 10^((rb - ra) / 400))`
- **Rating update:** `new_rating = old_rating + K * (actual_score - expected_score)`
- **Winner gets 1.0**, loser gets 0.0 as actual scores
- Ratings stored per user per sport in `elo_ratings` table

**Evidence:** `ranking.service.ts:6-7` for constants, `:47-51` for ELO formulas, `:53-56` for DB updates.

## 7. Rankings Query

`ranking.service.ts:10-36`:
- Filters by `sportId`, `orgId`
- Orders by rating descending
- Computes `rank_position` via `ROW_NUMBER() OVER (ORDER BY er.rating DESC)`
- Limits to 100 by default
- Joins with `users` and `sports` tables

## 8. Player Performance Analytics

Route `GET /sports-engine/analytics/player/:id` returns:
- Total matches, wins, losses
- Win rate
- Current streak, best streak
- Recent form (last 5 results: W/L)
- Sport breakdown (matches/wins per sport)

**Evidence:** `sports-engine.types.ts:24-35` defines `PlayerPerformance`.

## 9. Match Quality Scoring

Route `GET /sports-engine/analytics/match-quality`:
- Returns match quality scores based on:
  - `skill_balance` — How evenly matched
  - `competitiveness` — How close the score
  - `player_count` — Number of participants
  - `duration_minutes` — Match duration

**Evidence:** `sports-engine.types.ts:15-22` defines `MatchQualityScore`.

## 10. Recommendations

**Partner Recommendations** (`GET /sports-engine/recommend/partners`):
- By skill proximity (similar ELO rating)
- Common sports
- Mutual friends / past matches together
- Returns `compatibility_score`, `skill_gap`, `common_sports[]`

**Coach Recommendations** (`GET /sports-engine/recommend/coaches`):
- By coach rating
- By sport
- By location proximity

**Evidence:** `sports-engine.types.ts:48-57` defines `PartnerRecommendation`.

## 11. Sports Trends

Route `GET /sports-engine/analytics/trends`:
- Aggregated activity metrics across bookings, tournaments, and academy programs
- By sport, by period (daily/weekly/monthly)
- Growth trends and popularity metrics
