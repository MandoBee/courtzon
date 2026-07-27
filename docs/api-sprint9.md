# Sprint 9 API Documentation

## Player Experience Module

### Player Dashboard

#### `GET /players/my/dashboard`
- **Permission:** `player.dashboard.view`
- **Response:** Dashboard summary including wallet balance, unread notifications, upcoming bookings/matches, academy enrollments, tournament registrations, league teams, and recent activity.

#### `GET /players/my/upcoming`
- **Permission:** `player.dashboard.view`
- **Response:** List of upcoming bookings, matches, and academy sessions.

#### `GET /players/my/statistics`
- **Permission:** `player.statistics.view`
- **Response:** Player statistics summary (bookings, matches, academy sessions, tournaments, followers, wallet balance).

#### `GET /players/my/qr-profile`
- **Permission:** `player.qr.view`
- **Response:** QR profile data — name, avatar, join date, stats.

#### `GET /players/search?q=&page=1&limit=20`
- **Permission:** `player.search`
- **Response:** Paginated player search results.

#### `GET /players/:id/profile`
- **Permission:** `player.profile.view`
- **Response:** Public player profile.

### Favorites

#### `GET /players/my/favorites/clubs`
- **Permission:** `player.favorites.manage`
- **Response:** List of favorite clubs/organizations.

#### `POST /players/my/favorites/clubs/:orgId`
- **Permission:** `player.favorites.manage`
- **Response:** `{ message: "Club added to favorites" }`

#### `DELETE /players/my/favorites/clubs/:orgId`
- **Permission:** `player.favorites.manage`
- **Response:** `{ message: "Club removed from favorites" }`

#### `GET /players/my/favorites/coaches`
- **Permission:** `player.favorites.manage`
- **Response:** List of favorite coaches.

### Devices

#### `GET /players/my/devices`
- **Permission:** `player.devices.manage`
- **Response:** List of registered user devices.

#### `DELETE /players/my/devices/:id`
- **Permission:** `player.devices.manage`
- **Response:** `{ message: "Device removed" }`

### Achievements

#### `GET /players/my/achievements`
- **Permission:** `player.achievements.view`
- **Response:** List of achievements (targeted or default).

### Rank History (Sprint 9)

#### `GET /my/rank-history`
- **Permission:** `player.rank.history`
- **Response:**
```json
{
  "tournament_standings": [
    {
      "id": 1,
      "tournament_name": "Summer Open 2024",
      "rank_position": 3,
      "start_date": "2024-06-01T00:00:00.000Z",
      ...
    }
  ],
  "league_standings": [
    {
      "id": 1,
      "league_name": "Premier League",
      "division_name": "Division A",
      "position": 2,
      "league_code": "PL-2024",
      ...
    }
  ]
}
```

### My Tournaments (Sprint 9)

#### `GET /my/tournaments`
- **Permission:** `tournament.view`
- **Response:**
```json
[
  {
    "id": 1,
    "tournament_id": 5,
    "player_id": 1,
    "tournament_name": "Summer Open 2024",
    "tournament_code": "SO-2024",
    "tournament_status": "registration_open",
    "format": "single_elimination",
    "start_date": "2024-06-01",
    "end_date": "2024-06-15",
    "registered_at": "2024-05-20T10:00:00.000Z"
  }
]
```

## Auth Module — Profile Updates (Sprint 9)

### `PATCH /auth/profile`
- **New fields (all optional):**

| Field | Type | Max Length |
|-------|------|------------|
| `playing_hand` | `enum('right','left','ambidextrous')` | — |
| `bio` | `string` | 1000 |
| `emergency_contact_name` | `string` | 200 |
| `emergency_contact_phone` | `string` | 50 |
| `emergency_contact_relation` | `string` | 100 |
| `privacy_show_profile` | `boolean` | — |
| `privacy_show_stats` | `boolean` | — |
| `privacy_show_activity` | `boolean` | — |

**Response:** Updated user object with new profile fields.

## Wallet

### `GET /wallets/me`
- **Response:** Wallet info (balance, currency).

### `GET /wallets/transactions?page=1&limit=20`
- **Response:** Paginated wallet transaction history.

### `POST /wallets/deposit`
- **Body:** `{ amount: number, paymentMethod: string, returnUrl?: string }`
- **Response:** Deposit result or payment redirect URL.

## Payments (Sprint 9)

### `GET /payments/transactions?page=1&limit=20&status=completed|pending|failed`
- **Response:** Paginated payment transaction history.

## Permission Keys Added in Sprint 9

| Key | Module | Type | Description |
|-----|--------|------|-------------|
| `player.profile.update` | player | action | Update Own Profile |
| `player.profile.view.emergency-contact` | player | field | View Emergency Contact |
| `player.profile.edit.playing-hand` | player | field | Edit Playing Hand |
| `player.profile.edit.bio` | player | field | Edit Bio |
| `player.profile.edit.preferred-sports` | player | field | Edit Preferred Sports |
| `player.profile.edit.skill-level` | player | field | Edit Skill Level |
| `player.profile.privacy` | player | action | Manage Privacy Settings |
| `player.wallet.view` | player | page | View Wallet |
| `player.wallet.transactions` | player | action | View Wallet Transactions |
| `player.payments.view` | player | page | View Payment History |
| `player.payments.invoices` | player | action | View Invoices |
| `player.bookings.view` | player | page | View Booking History |
| `player.notifications.view` | player | page | View Notifications |
| `player.rank.history` | player | page | View Rank History |
| `player.tournaments.register` | player | action | Register in Tournaments |
| `academy.self_enroll` | academy | action | Self-enroll in Academy |
| `league.self_register` | league | action | Self-register in League |
