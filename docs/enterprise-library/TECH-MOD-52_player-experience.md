---
document_id: "TECH-MOD-52"
document_name: "Player Experience Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-03", "TECH-MOD-05", "TECH-MOD-04"]
  related: ["TECH-MOD-10", "TECH-MOD-01"]
---

# Player Experience Module (TECH-MOD-52)

**Source:** `backend/src/modules/player-experience/` (7 entries: presentation/, application/, domain/, __tests__/)

## 1. Purpose

Player-facing features: dashboard aggregation, player search, favorite clubs/coaches, device management, achievements, QR profile, rank history, and tournament history.

## 2. Routes (14)

Defined in `player.routes.ts:5-29`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/players/my/dashboard` | `player.dashboard.view` | Player dashboard |
| 2 | GET | `/players/my/upcoming` | `player.dashboard.view` | Upcoming items |
| 3 | GET | `/players/my/statistics` | `player.statistics.view` | Player statistics |
| 4 | GET | `/players/my/qr-profile` | `player.qr.view` | QR profile |
| 5 | GET | `/players/search` | `player.search` | Search players |
| 6 | GET | `/players/:id/profile` | `player.profile.view` | Player profile |
| 7 | GET | `/players/my/favorites/clubs` | `player.favorites.manage` | Favorite clubs |
| 8 | POST | `/players/my/favorites/clubs/:orgId` | `player.favorites.manage` | Add favorite club |
| 9 | DELETE | `/players/my/favorites/clubs/:orgId` | `player.favorites.manage` | Remove favorite club |
| 10 | GET | `/players/my/favorites/coaches` | `player.favorites.manage` | Favorite coaches |
| 11 | GET | `/players/my/devices` | `player.devices.manage` | List devices |
| 12 | DELETE | `/players/my/devices/:id` | `player.devices.manage` | Remove device |
| 13 | GET | `/players/my/achievements` | `player.achievements.view` | Player achievements |
| 14 | GET | `/my/rank-history` | `player.rank.history` | Rank history |

## 3. Services

`player.service.ts` provides:

- **Dashboard:** `getDashboard(userId)` — Aggregates wallet balance, unread notifications, upcoming bookings/matches, active academy/tournament/league counts, recent activity feed (UNION of bookings + tournament matches)
- **Upcoming:** `getUpcoming(userId)` — Next 50 upcoming bookings, matches, and academy sessions
- **Statistics:** `getStatistics(userId)` — Total bookings, matches played, academy sessions, tournaments joined, followers/following, wallet balance
- **QR Profile:** `getQRProfile(userId)` — Player name, avatar, join date, stats card for QR sharing
- **Player Search:** `searchPlayers(query, page, limit, currentUserId?)` — Full-name search with follow status
- **Player Profile:** `getPlayerProfile(playerId, currentUserId?)` — Public profile with follow indicator
- **Favorites:** `getFavoriteClubs`, `addFavoriteClub`, `removeFavoriteClub`, `getFavoriteCoaches` — Uses `user_follows` table with polymorphic following (orgs and users)
- **Devices:** `getDevices`, `removeDevice` — Device tracking from login sessions
- **Achievements:** `getAchievements(userId)` — Reads from `user_targeted_achievements`, falls back to 5 default achievement descriptions
- **Rank History:** via `/my/rank-history` endpoint
- **Tournaments:** via `/my/tournaments` endpoint

## 4. Domain Types

`player.types.ts` defines:
- `PlayerDashboardData` — Wallet, counts, activity feed
- `PlayerActivityItem` — Individual activity entry
- `PlayerStatisticsSummary` — Aggregate stats
- `PlayerSearchResult` — Search result with follow status
- `QRProfileData` — QR shareable profile
- `PlayerFavorite` — Favorited club or coach
- `PlayerDevice` — Login device info
- `PlayerAchievement` — Achievement with progress tracking

## 5. Key Concepts

- **Aggregation Feed:** Dashboard activity UNION-queries bookings and tournament matches for a unified timeline
- **Polymorphic Favorites:** `user_follows` table stores both club (org) and coach (user) follows with different rendering types
- **Achievement System:** Supports progress tracking (`progress`/`max_progress`) for gamification
- **Default Achievements:** If no achievements exist, returns 5 hardcoded defaults (first_booking, five_bookings, first_match, tournament_participant, academy_graduate)
