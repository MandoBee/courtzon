# CourtZon Coach Platform — UX Blueprint

> **Phase:** UX Design (pre-implementation)
> **Version:** 1.0
> **Status:** In Progress
> **Prerequisite:** Product Blueprint v3.0 (frozen)
>
> **This is a User Experience Design document.** It defines what users see, think, decide, and do on every screen. It is not a UI design document and does not define colors, typography, or visual layout.
>
> **Audience:** UX Designers, UI Designers, QA Engineers, Developers

---

## UX Blueprint Rules

1. Every screen is designed from the user's perspective
2. Every component has explicit permission rules (who can SEE, USE, EDIT, DELETE)
3. Business problem is defined before user experience
4. Every interaction has a decision tree
5. Every state is documented (empty, loading, error, success)
6. Permissions are evaluated down to the smallest interactive component
7. No screen is complete until all 20 attributes are documented

---

## Definition of Done (Per Screen)

A screen is UX-complete only when:

- [ ] Business workflow approved
- [ ] UX flow approved (sees → thinks → decides → acts → responds → next)
- [ ] Decision trees documented
- [ ] Edge cases documented
- [ ] Permission matrix completed
- [ ] Component permissions completed
- [ ] Validation rules completed
- [ ] Error handling documented
- [ ] Success handling documented
- [ ] Analytics events defined
- [ ] Accessibility reviewed
- [ ] Responsive behaviour documented

---

# Navigation Architecture

## App Structure

```
CourtZon App
├── Authentication Flow
│   ├── Splash Screen
│   ├── Login
│   ├── Register
│   └── Role Selection
│
├── Player Experience (Bottom Nav: Home | Bookings | Marketplace | More)
│   ├── Home
│   │   ├── Need Selection
│   │   ├── Session Type Selection
│   │   ├── Coach Search Results
│   │   ├── Coach Profile
│   │   ├── Time Selection
│   │   └── Booking Confirmation
│   ├── My Bookings
│   │   ├── Booking List
│   │   ├── Booking Detail
│   │   ├── Session Rating
│   │   └── Rebook
│   ├── Marketplace
│   │   ├── Browse Coaches
│   │   ├── Browse Clinics
│   │   └── Browse Events
│   └── More
│       ├── Profile
│       ├── Wallet
│       ├── Payment Methods
│       ├── Session History
│       ├── Favorites
│       ├── Notifications
│       ├── Settings
│       └── Help & Support
│
├── Independent Coach Experience (Bottom Nav: Dashboard | Calendar | Bookings | More)
│   ├── Dashboard
│   │   ├── Stats Overview
│   │   ├── Upcoming Sessions
│   │   ├── Recent Reviews
│   │   └── Quick Actions
│   ├── Calendar
│   │   ├── Weekly View
│   │   ├── Availability Editor
│   │   └── Session Detail
│   ├── Bookings
│   │   ├── Pending Requests
│   │   ├── Upcoming Sessions
│   │   ├── Completed Sessions
│   │   └── Booking Detail
│   └── More
│       ├── Profile Editor
│       ├── Pricing
│       ├── Service Areas
│       ├── Earnings & Wallet
│       ├── Reviews
│       ├── Analytics
│       ├── Growth & Achievements
│       ├── Notifications
│       ├── Settings
│       └── Help & Support
│
├── Resident Coach Experience (Bottom Nav: Home | Calendar | Bookings | More)
│   ├── Home
│   │   ├── Today's Schedule
│   │   ├── Upcoming Sessions
│   │   └── Quick Actions
│   ├── Calendar
│   │   ├── Weekly View
│   │   ├── Availability Editor
│   │   └── Session Detail
│   ├── Bookings
│   │   ├── Upcoming Sessions
│   │   ├── Completed Sessions
│   │   └── Booking Detail
│   └── More
│       ├── Profile
│       ├── Earnings
│       ├── Performance
│       ├── Notifications
│       ├── Settings
│       └── Help & Support
│
├── Organization Experience (Sidebar Nav: Dashboard | Coaches | Branches | Pricing | Reports | Settings)
│   ├── Dashboard
│   │   ├── Overview Stats
│   │   ├── Alerts & Actions
│   │   └── Quick Actions
│   ├── Coaches
│   │   ├── Coach List
│   │   ├── Coach Profile
│   │   ├── Applications Pipeline
│   │   ├── Application Review
│   │   ├── Performance Dashboard
│   │   └── Coach Schedule
│   ├── Branches
│   │   ├── Branch List
│   │   ├── Branch Detail
│   │   ├── Branch Schedule
│   │   └── Branch Utilization
│   ├── Pricing
│   │   ├── Pricing Rules
│   │   ├── Revenue Sharing
│   │   └── Coach Pricing Overrides
│   ├── Reports
│   │   ├── Revenue Reports
│   │   ├── Performance Reports
│   │   ├── Utilization Reports
│   │   └── Player Reports
│   └── Settings
│       ├── Organization Profile
│       ├── Team Management
│       ├── Billing
│       ├── Notifications
│       └── Help & Support
│
└── Shared
    ├── Notifications Center
    ├── Settings
    ├── Help & Support
    └── About
```

## Screen Inventory

### Player Journey (15 screens)

| # | Screen ID | Screen Name | Priority |
|---|-----------|-------------|----------|
| P-01 | PLAYER_HOME | Home — Coach Discovery | Critical |
| P-02 | PLAYER_NEED | Need Selection | Critical |
| P-03 | PLAYER_SESSION_TYPE | Session Type Selection | Critical |
| P-04 | PLAYER_COACH_LIST | Coach Search Results | Critical |
| P-05 | PLAYER_COACH_PROFILE | Coach Profile | Critical |
| P-06 | PLAYER_TIME_SELECT | Time Selection | Critical |
| P-07 | PLAYER_BOOKING_CONFIRM | Booking Confirmation | Critical |
| P-08 | PLAYER_PAYMENT | Payment Processing | Critical |
| P-09 | PLAYER_BOOKING_SUCCESS | Booking Success | Critical |
| P-10 | PLAYER_BOOKING_DETAIL | Booking Detail | High |
| P-11 | PLAYER_SESSION_RATING | Session Rating | High |
| P-12 | PLAYER_MY_BOOKINGS | My Bookings List | High |
| P-13 | PLAYER_HISTORY | Session History | Medium |
| P-14 | PLAYER_WALLET | Wallet & Payment Methods | High |
| P-15 | PLAYER_PROFILE | Player Profile & Settings | Medium |

### Independent Coach Journey (16 screens)

| # | Screen ID | Screen Name | Priority |
|---|-----------|-------------|----------|
| IC-01 | COACH_APPLICATION | Application Form | Critical |
| IC-02 | COACH_VERIFICATION | Verification Upload | Critical |
| IC-03 | COACH_APP_STATUS | Application Status | High |
| IC-04 | COACH_DASHBOARD | Dashboard Home | Critical |
| IC-05 | COACH_PROFILE_EDIT | Profile Editor | High |
| IC-06 | COACH_PRICING | Pricing Settings | High |
| IC-07 | COACH_SERVICE_AREAS | Service Areas | High |
| IC-08 | COACH_AVAILABILITY | Availability Calendar | Critical |
| IC-09 | COACH_BOOKINGS | Bookings List | Critical |
| IC-10 | COACH_BOOKING_DETAIL | Booking Detail | High |
| IC-11 | COACH_EARNINGS | Earnings & Wallet | High |
| IC-12 | COACH_WITHDRAWAL | Withdrawal | High |
| IC-13 | COACH_REVIEWS | Reviews List | Medium |
| IC-14 | COACH_ANALYTICS | Analytics Dashboard | Medium |
| IC-15 | COACH_GROWTH | Growth & Achievements | Low |
| IC-16 | COACH_SETTINGS | Settings | Medium |

### Resident Coach Journey (7 screens)

| # | Screen ID | Screen Name | Priority |
|---|-----------|-------------|----------|
| RC-01 | RESIDENT_INVITATION | Invitation Acceptance | Critical |
| RC-02 | RESIDENT_ONBOARDING | Onboarding Checklist | Critical |
| RC-03 | RESIDENT_HOME | Dashboard Home | Critical |
| RC-04 | RESIDENT_CALENDAR | Unified Calendar | Critical |
| RC-05 | RESIDENT_EARNINGS | Earnings & Revenue | High |
| RC-06 | RESIDENT_PERFORMANCE | Performance Reports | Medium |
| RC-07 | RESIDENT_SCHEDULE | Schedule Management | High |

### Organization Journey (11 screens)

| # | Screen ID | Screen Name | Priority |
|---|-----------|-------------|----------|
| OG-01 | ORG_DASHBOARD | Dashboard Home | Critical |
| OG-02 | ORG_COACH_LIST | Coach List | Critical |
| OG-03 | ORG_COACH_PROFILE | Coach Profile Detail | High |
| OG-04 | ORG_APPLICATIONS | Applications Pipeline | Critical |
| OG-05 | ORG_APP_REVIEW | Application Review | Critical |
| OG-06 | ORG_BRANCH_ASSIGN | Branch Assignment | High |
| OG-07 | ORG_PRICING | Pricing Rules | High |
| OG-08 | ORG_REVENUE_SHARE | Revenue Sharing | High |
| OG-09 | ORG_PERFORMANCE | Performance Dashboard | Medium |
| OG-10 | ORG_UTILIZATION | Utilization Reports | Medium |
| OG-11 | ORG_REPORTS | Business Reports | Medium |

### Shared Screens (8 screens)

| # | Screen ID | Screen Name | Priority |
|---|-----------|-------------|----------|
| SH-01 | LOGIN | Login | Critical |
| SH-02 | REGISTER | Register | Critical |
| SH-03 | ROLE_SELECT | Role Selection | Critical |
| SH-04 | NOTIFICATIONS | Notifications Center | High |
| SH-05 | SETTINGS | Settings | Medium |
| SH-06 | HELP | Help & Support | Low |
| SH-07 | PROFILE | Profile (通用) | Medium |
| SH-08 | ONBOARDING_WELCOME | Welcome / First Launch | Medium |

**Total screens: 57** (15 Player + 16 Independent Coach + 7 Resident Coach + 11 Organization + 8 Shared)

---

# Player Journey Screens

---

## P-01: PLAYER_HOME — Home / Coach Discovery

### Screen Purpose
The player's starting point. Shows personalized coaching options, recent activity, and quick access to find a coach. This is the "hub" of the player experience.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Secondary** | — |
| **Blocked** | Coach, Organization Admin, Guest (unauthenticated) |

### Entry Points
- App launch (default screen)
- Bottom nav "Home" tap
- Push notification tap (deep link to home)
- Back navigation from any player screen

### Exit Points
- Tap "Find a Coach" → PLAYER_NEED
- Tap a coach card → PLAYER_COACH_PROFILE
- Tap "My Bookings" → PLAYER_MY_BOOKINGS
- Tap "History" → PLAYER_HISTORY
- Bottom nav → Bookings, Marketplace, More

### User Goal
Quickly understand: "What can I do here? How do I find a coach?"

### Business Goal
Maximize booking conversion. Reduce time from app open to booking. Surface relevant coaches immediately.

### UX Flow
```
Player opens app
    │
    ├── Returning player?
    │       ├── YES → Show personalized home:
    │       │       ├── "Welcome back, [Name]" greeting
    │       │       ├── "Book again with Coach Ahmed" (last coach, one-tap)
    │       │       ├── Upcoming sessions (if any)
    │       │       ├── Recommended coaches (based on history)
    │       │       └── "Find a Coach" primary CTA
    │       │
    │       └── NO → Show onboarding home:
    │               ├── "What would you like to work on?" (need selection)
    │               ├── Popular session types
    │               ├── Top-rated coaches in your area
    │               └── "Find a Coach" primary CTA
    │
    ├── Player taps "Find a Coach"
    │       └── → PLAYER_NEED (need selection)
    │
    ├── Player taps a coach card
    │       └── → PLAYER_COACH_PROFILE
    │
    └── Player taps "Book Again"
            └── → PLAYER_TIME_SELECT (with pre-selected coach)
```

### System Actions
- Load personalized content based on player history
- Fetch recommended coaches (location + specialty matching)
- Show upcoming sessions from booking service
- Track screen view for analytics
- If first launch, show onboarding overlay

### Decision Points
```
Has player booked before?
├── YES → Personalized home (recent coaches, quick rebook)
└── NO → Discovery home (need selection, popular coaches)

Is player location enabled?
├── YES → Show nearby coaches
└── NO → Prompt for location or show all coaches

Are there upcoming sessions?
├── YES → Show "Upcoming" section at top
└── NO → Hide "Upcoming" section
```

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P01-EC1 | No coaches in player's area | Show "No coaches near you yet. Try a different area or check back soon." with location change option |
| P01-EC2 | No internet connection | Show cached home data with "Offline — showing last saved data" banner. Disable booking actions. |
| P01-EC3 | Player has pending booking | Show booking status prominently: "Your session with Coach Ahmed is tomorrow at 4pm" |
| P01-EC4 | Player has unread notifications | Show notification badge on bell icon. Do not block home screen. |
| P01-EC5 | Player's wallet is empty | Show "Top up your wallet" nudge after booking flow, not on home screen |
| P01-EC6 | Player has active complaint/dispute | Show status banner: "Your refund request is being reviewed" |

### Validation Rules
- Location permission required for "nearby" features (fallback to manual location)
- Age verification required for first booking (if player is junior)

### Component Specifications

#### Greeting Banner
| Attribute | Value |
|-----------|-------|
| **Purpose** | Welcome player, show personalization |
| **Visibility** | Always visible |
| **Permission** | Player: View |
| **States** | Default (personalized greeting), Loading (skeleton), Empty (first-time: "Welcome to CourtZon!") |
| **Business Rule** | If returning player, show last coach name. If new player, show onboarding message. |

#### "Find a Coach" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Primary CTA — start booking flow |
| **Visibility** | Always visible, prominent position |
| **Permission** | Player: Use |
| **States** | Default, Pressed, Loading (when navigating), Disabled (offline) |
| **Business Rule** | Always accessible. Leads to PLAYER_NEED. |

#### Coach Card (in recommendations)
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show coach summary for quick selection |
| **Visibility** | Player: View, Use (tap to navigate) |
| **States** | Default, Pressed, Loading (skeleton) |
| **Content** | Photo, name, specialty, rating, next available slot, price |
| **Business Rule** | Tap navigates to PLAYER_COACH_PROFILE. Long press shows quick actions (favorite, share). |

#### Upcoming Session Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show next booked session |
| **Visibility** | Player: View (only if has upcoming session) |
| **States** | Default, Loading, Empty (hidden if no sessions) |
| **Business Rule** | Tap navigates to PLAYER_BOOKING_DETAIL. Shows coach name, date, time, branch. |

### Empty States
- **No upcoming sessions:** Hide the "Upcoming" section entirely
- **No recommendations:** Show "Complete your profile to get personalized recommendations"
- **No coaches in area:** Show friendly message with location adjustment option

### Loading States
- Skeleton cards for coach recommendations
- Skeleton card for upcoming session
- Greeting loads immediately (cached)

### Error States
- Network error: Show cached data with retry option
- Location error: Show "Enable location for nearby coaches" with settings link
- Server error: Show "Something went wrong" with retry button

### Success States
- Coach card tapped: Smooth transition to coach profile
- "Find a Coach" tapped: Smooth transition to need selection

### Permissions Matrix

| Component | Player | Coach | Org Admin | Guest |
|-----------|--------|-------|-----------|-------|
| Greeting Banner | View | — | — | — |
| Find a Coach Button | Use | — | — | — |
| Coach Cards | View, Use | — | — | — |
| Upcoming Sessions | View | — | — | — |
| Notification Bell | View, Use | — | — | — |
| Bottom Nav | Use | — | — | — |

### Responsive Behaviour
- **Mobile:** Single column, cards stacked vertically, bottom nav visible
- **Tablet:** Two-column grid for coach cards, side panel for upcoming sessions
- **Desktop:** Three-column layout, sidebar navigation

### Accessibility
- Greeting text: aria-label with full greeting
- Coach cards: role="button", aria-label="Coach [name], [specialty], [rating] stars"
- "Find a Coach": aria-label="Find a coach"
- Upcoming session: aria-label="Upcoming session with [coach] on [date]"

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `home_viewed` | Screen loads | `is_returning`, `has_upcoming`, `coach_count` |
| `coach_card_tapped` | Coach card tap | `coach_id`, `position`, `source` |
| `find_coach_tapped` | CTA tap | `source` |
| `rebook_tapped` | Quick rebook tap | `coach_id` |
| `notification_tapped` | Bell tap | `unread_count` |

---

## P-02: PLAYER_NEED — Need Selection

### Screen Purpose
Help the player articulate what they need coaching for. This is the first step of the guided booking flow. The system uses this to narrow down session types and coach recommendations.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Secondary** | — |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- PLAYER_HOME "Find a Coach" button
- PLAYER_HOME coach discovery entry
- Deep link from push notification

### Exit Points
- Select a need → PLAYER_SESSION_TYPE
- Back → PLAYER_HOME
- Skip (if available) → PLAYER_COACH_LIST (show all coaches)

### User Goal
Tell the system what I need so it can show me the right options.

### Business Goal
Capture player intent to enable intelligent coach matching. Reduce decision fatigue by narrowing options early.

### UX Flow
```
Player sees need selection screen
    │
    ├── "What would you like to work on?"
    │
    ├── Player selects a category:
    │       ├── Technique
    │       │       ├── Which stroke?
    │       │       │       ├── Forehand
    │       │       │       ├── Backhand
    │       │       │       ├── Serve
    │       │       │       ├── Volley
    │       │       │       ├── Footwork
    │       │       │       └── All-round
    │       │       └── → PLAYER_SESSION_TYPE (pre-filtered for technique)
    │       │
    │       ├── Match Preparation
    │       │       └── → PLAYER_SESSION_TYPE (pre-filtered for match play)
    │       │
    │       ├── Fitness & Conditioning
    │       │       └── → PLAYER_SESSION_TYPE (pre-filtered for fitness)
    │       │
    │       ├── Junior Development
    │       │       └── → PLAYER_SESSION_TYPE (pre-filtered for juniors)
    │       │
    │       ├── Beginner Introduction
    │       │       └── → PLAYER_SESSION_TYPE (pre-filtered for beginners)
    │       │
    │       └── Just Once (Exploratory)
    │               └── → PLAYER_SESSION_TYPE (show all types)
```

### Decision Points
```
Does the player know what they need?
├── YES → Show specific categories
│       ├── Which category? → Filter session types
│       └── → Continue to session type
│
└── NO → Show guided discovery:
        ├── "Not sure? Let us help."
        ├── Ask: "What's your experience level?"
        │       ├── Beginner → Suggest beginner-friendly options
        │       ├── Intermediate → Suggest technique + match prep
        │       └── Advanced → Suggest match prep + specialization
        └── → Continue to session type with recommendations
```

### Component Specifications

#### Need Category Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Present a coaching need category |
| **Visibility** | Player: View, Use |
| **States** | Default, Selected (highlighted), Pressed, Loading |
| **Content** | Icon, category name, short description, estimated price range |
| **Business Rule** | Tap selects and advances to session type. Single select only. |

#### "Not Sure?" Helper
| Attribute | Value |
|-----------|-------|
| **Purpose** | Guide uncertain players |
| **Visibility** | Player: View, Use |
| **States** | Default, Expanded (shows guided questions) |
| **Business Rule** | Expands to show experience level question. Does not skip the flow. |

### Empty States
- All categories should always be visible (they are static content)

### Loading States
- N/A (content is static, no network call)

### Error States
- N/A (no network dependency for this screen)

### Permissions Matrix

| Component | Player | Coach | Org Admin | Guest |
|-----------|--------|-------|-----------|-------|
| Need Category Cards | View, Use | — | — | — |
| "Not Sure?" Helper | View, Use | — | — | — |
| Back Button | Use | — | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `need_selection_viewed` | Screen loads | `has_history` |
| `need_category_selected` | Category tap | `category`, `subcategory` |
| `guided_discovery_used` | "Not Sure?" tap | — |
| `experience_level_selected` | Level tap | `level` |

---

## P-03: PLAYER_SESSION_TYPE — Session Type Selection

### Screen Purpose
Present session format options based on the player's stated need. Help the player choose the right format (1-on-1, group, clinic, match play, quick hit).

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- PLAYER_NEED (after selecting a need)
- PLAYER_COACH_PROFILE (if coach offers specific session types)

### Exit Points
- Select session type → PLAYER_COACH_LIST
- Back → PLAYER_NEED

### User Goal
Understand the differences between session types and choose the one that fits my need, budget, and preference.

### Business Goal
Match the player to the right session format. Prevent mismatched expectations. Increase session completion rate.

### UX Flow
```
Player sees session type options
    │
    ├── Show available session types (filtered by need):
    │       │
    │       ├── 1-on-1 Private Session
    │       │       ├── Description: "Focused, personal training"
    │       │       ├── Duration: 60 min
    │       │       ├── Price range: 300-500 EGP
    │       │       ├── Best for: Technique, match prep, specific goals
    │       │       └── Tap → Select → PLAYER_COACH_LIST (filtered)
    │       │
    │       ├── Small Group (2-4 players)
    │       │       ├── Description: "Social, affordable, personalized"
    │       │       ├── Duration: 90 min
    │       │       ├── Price range: 150-250 EGP/player
    │       │       ├── Best for: Technique, fitness, social
    │       │       └── Tap → Select → PLAYER_COACH_LIST (filtered)
    │       │
    │       ├── Group Clinic
    │       │       ├── Description: "Structured curriculum, community"
    │       │       ├── Duration: 120 min
    │       │       ├── Price range: 100-200 EGP/player
    │       │       ├── Best for: Beginners, skill development
    │       │       └── Tap → Select → PLAYER_COACH_LIST (filtered)
    │       │
    │       ├── Match Play Session
    │       │       ├── Description: "Coach-supervised competitive play"
    │       │       ├── Duration: 90 min
    │       │       ├── Price range: 200-350 EGP/player
    │       │       ├── Best for: Match prep, competition
    │       │       └── Tap → Select → PLAYER_COACH_LIST (filtered)
    │       │
    │       └── Quick Hit (30 min)
    │               ├── Description: "Quick technique tune-up"
    │               ├── Duration: 30 min
    │               ├── Price range: 150-250 EGP
    │               ├── Best for: Specific fix, low commitment
    │               └── Tap → Select → PLAYER_COACH_LIST (filtered)
    │
    └── Player selects one → PLAYER_COACH_LIST
```

### Component Specifications

#### Session Type Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Present a session format option |
| **Visibility** | Player: View, Use |
| **States** | Default, Selected, Pressed, Recommended (if system recommends based on need) |
| **Content** | Name, description, duration, price range, "Best for" tag, icon |
| **Business Rule** | Tap selects and advances. Single select. If recommended, show "Recommended" badge. |

#### "Recommended" Badge
| Attribute | Value |
|-----------|-------|
| **Purpose** | Highlight the best session type for the player's stated need |
| **Visibility** | Player: View |
| **States** | Visible (on recommended card), Hidden |
| **Business Rule** | Only shown if system has high confidence in recommendation. |

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Session Type Cards | View, Use | — | — |
| "Recommended" Badge | View | — | — |
| Back Button | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `session_type_viewed` | Screen loads | `need_category`, `session_type_count` |
| `session_type_selected` | Card tap | `session_type`, `was_recommended` |

---

## P-04: PLAYER_COACH_LIST — Coach Search Results

### Screen Purpose
Show a curated list of coaches matching the player's need, session type, location, and availability. This is where the Scheduling Engine works invisibly — the player sees coaches, not algorithms.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- PLAYER_SESSION_TYPE (after selecting session type)
- PLAYER_HOME (direct "Find a Coach" without need selection)
- PLAYER_COACH_PROFILE (back from profile)

### Exit Points
- Tap coach card → PLAYER_COACH_PROFILE
- Tap "Book Now" (if quick book) → PLAYER_TIME_SELECT
- Back → PLAYER_SESSION_TYPE or PLAYER_HOME
- Filter/Sort → filter panel (overlay)

### User Goal
Find the best coach for my needs. Compare options. Make a confident choice.

### Business Goal
Present the top 3-5 coaches prominently. Reduce scroll depth. Maximize coach card tap-through rate.

### UX Flow
```
Player sees coach list
    │
    ├── List sorted by: Relevance (default)
    │       ├── Specialty match
    │       ├── Availability at preferred branch
    │       ├── Rating
    │       └── Price
    │
    ├── Each coach card shows:
    │       ├── Photo
    │       ├── Name
    │       ├── Specialty tags
    │       ├── Rating (stars + count)
    │       ├── Next available slot ("Tomorrow at 4pm")
    │       ├── Branch location
    │       ├── Price per session
    │       └── "Book Now" button (if slot available)
    │
    ├── Player can:
    │       ├── Tap card → PLAYER_COACH_PROFILE
    │       ├── Tap "Book Now" → PLAYER_TIME_SELECT (pre-selected coach)
    │       ├── Apply filters (overlay)
    │       │       ├── Price range
    │       │       ├── Rating (minimum)
    │       │       ├── Distance
    │       │       ├── Availability (today, this week, etc.)
    │       │       └── Session type
    │       ├── Sort by (dropdown)
    │       │       ├── Relevance (default)
    │       │       ├── Rating (high to low)
    │       │       ├── Price (low to high)
    │       │       ├── Distance (nearest)
    │       │       └── Next available (soonest)
    │       └── Search by name (search bar)
    │
    └── If no results:
            ├── "No coaches match your criteria"
            ├── Suggest: Relax filters, expand area, check different times
            └── "Join waiting list" option
```

### Decision Points
```
Are there matching coaches?
├── YES → Show sorted list
│       │
│       ├── Player applies filters?
│       │       ├── YES → Re-filter and re-sort
│       │       └── NO → Browse default list
│       │
│       └── Player selects a coach?
│               ├── Tap card → PLAYER_COACH_PROFILE
│               └── Tap "Book Now" → PLAYER_TIME_SELECT
│
└── NO (no matches)
        │
        ├── Relax criteria?
        │       ├── Expand location → Show nearby branches
        │       ├── Expand time → Show different days
        │       ├── Remove filters → Show all coaches
        │       └── Change session type → Go back to P-03
        │
        └── Join waiting list?
                ├── YES → Register for notification when coach available
                └── NO → Return to browse
```

### Component Specifications

#### Coach Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Present a coach for selection |
| **Visibility** | Player: View, Use |
| **States** | Default, Pressed, Loading (skeleton), Highlighted (if recommended) |
| **Content** | Photo, name, specialty, rating, next available, branch, price |
| **Business Rule** | Tap navigates to profile. "Book Now" navigates to time selection. |

#### "Book Now" Button (on card)
| Attribute | Value |
|-----------|-------|
| **Purpose** | Quick booking without viewing full profile |
| **Visibility** | Player: Use (only if slot available) |
| **States** | Default, Pressed, Loading, Hidden (no availability) |
| **Business Rule** | Only visible if coach has next available slot. Pre-selects that slot. |

#### Filter Panel
| Attribute | Value |
|-----------|-------|
| **Purpose** | Narrow search results |
| **Visibility** | Player: View, Use |
| **States** | Closed, Open (slide-in), Applying (loading) |
| **Business Rule** | Filters are additive. Clear all available. Apply button updates list. |

#### Sort Dropdown
| Attribute | Value |
|-----------|-------|
| **Purpose** | Change sort order of results |
| **Visibility** | Player: View, Use |
| **States** | Default (Relevance), Expanded, Selection made |
| **Business Rule** | Default sort is Relevance. Changing sort re-orders list without new search. |

#### Empty State
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show when no coaches match |
| **Visibility** | Player: View |
| **States** | No results (with suggestions), No results (without suggestions) |
| **Business Rule** | Always show at least one action: relax filters, expand area, or join waiting list. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P04-EC1 | All coaches fully booked this week | Show "No availability this week. Check next week?" with forward navigation |
| P04-EC2 | Filters return zero results | Show "Try adjusting your filters" with suggestion to relax criteria |
| P04-EC3 | Coach becomes unavailable after card displayed | If player taps "Book Now", check real-time availability. If taken, show "Slot just taken. Choose another time?" |
| P04-EC4 | Player has favorited coaches | Show favorites section at top: "Your Favorites" |
| P04-EC5 | Slow network loading | Show skeleton cards. Never show blank screen. |

### Loading States
- Skeleton coach cards (3-5 cards)
- Filter panel: skeleton options
- Sort dropdown: disabled until list loads

### Error States
- Network error: "Couldn't load coaches. Retry?" with retry button
- Server error: "Something went wrong. Please try again."

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Coach Cards | View, Use | — | — |
| "Book Now" Button | Use | — | — |
| Filter Panel | View, Use | — | — |
| Sort Dropdown | View, Use | — | — |
| Search Bar | View, Use | — | — |
| "Join Waiting List" | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `coach_list_viewed` | Screen loads | `session_type`, `need`, `coach_count` |
| `coach_card_tapped` | Card tap | `coach_id`, `position`, `sort_order` |
| `quick_book_tapped` | "Book Now" tap | `coach_id`, `slot_time` |
| `filter_applied` | Filter apply | `filters` |
| `sort_changed` | Sort change | `sort_by`, `previous_sort` |
| `waiting_list_joined` | Waiting list tap | `coach_id`, `need` |

---

## P-05: PLAYER_COACH_PROFILE — Coach Profile

### Screen Purpose
Show the player everything they need to know about a coach to make a confident booking decision. This is the "sales page" for the coach.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Secondary** | Coach (view-only of own profile as player sees it) |
| **Blocked** | Organization Admin, Guest |

### Entry Points
- PLAYER_COACH_LIST (tap coach card)
- PLAYER_HOME (tap recommended coach)
- Search (tap coach result)

### Exit Points
- Tap "Book Session" → PLAYER_TIME_SELECT
- Back → PLAYER_COACH_LIST
- Tap "Read Reviews" → Reviews section (scroll)
- Tap branch location → Map/directions

### User Goal
Decide: "Is this the right coach for me? Should I book?"

### Business Goal
Convert profile views to bookings. Build trust through transparency. Show the coach's value proposition.

### UX Flow
```
Player views coach profile
    │
    ├── Hero section:
    │       ├── Coach photo (large)
    │       ├── Name
    │       ├── Specialty tags
    │       ├── Rating (stars + review count)
    │       ├── Years of experience
    │       └── Verified badge (if verified)
    │
    ├── About section:
    │       ├── Bio (2-3 sentences)
    │       ├── Languages
    │       ├── Coaching philosophy (if provided)
    │       └── Certifications (verified badges)
    │
    ├── Stats section:
    │       ├── Sessions completed
    │       ├── Average rating
    │       ├── Repeat player rate
    │       └── Response time
    │
    ├── Session Types section:
    │       ├── Available session types with prices
    │       ├── Duration
    │       └── What's included
    │
    ├── Location section:
    │       ├── Branch(es) where coach works
    │       ├── Map preview
    │       └── Distance from player
    │
    ├── Reviews section:
    │       ├── Overall rating
    │       ├── Rating breakdown (5-star, 4-star, etc.)
    │       ├── Recent reviews (3-5)
    │       └── "Read all reviews" link
    │
    ├── Availability section:
    │       ├── Next available slots (3-5)
    │       ├── "See all availability" link
    │       └── Quick book buttons for next slots
    │
    └── Sticky footer:
            ├── Price display
            ├── "Book Session" button
            └── "Message Coach" button (if enabled)
```

### Decision Points
```
Player views profile
    │
    ├── Convinced to book?
    │       ├── YES → Tap "Book Session" → PLAYER_TIME_SELECT
    │       ├── NOT YET → Read reviews, check availability
    │       └── NO → Back to coach list
    │
    ├── Want to compare?
    │       ├── Tap "Compare" → Side-by-side with another coach
    │       └── Back to list to view another coach
    │
    └── Want to message coach?
            ├── YES → Open chat (if available)
            └── NO → Continue browsing
```

### Component Specifications

#### Hero Section
| Attribute | Value |
|-----------|-------|
| **Purpose** | First impression — visual identity |
| **Visibility** | Player: View |
| **States** | Default, Loading (skeleton) |
| **Content** | Photo, name, specialty, rating, experience, verified badge |

#### "Book Session" Button (Sticky Footer)
| Attribute | Value |
|-----------|-------|
| **Purpose** | Primary CTA — start booking |
| **Visibility** | Player: Use |
| **States** | Default, Pressed, Loading, Disabled (no availability) |
| **Business Rule** | Always visible at bottom. Tapping scrolls to session type selection or navigates to PLAYER_TIME_SELECT. |

#### Reviews Section
| Attribute | Value |
|-----------|-------|
| **Purpose** | Build trust through social proof |
| **Visibility** | Player: View |
| **States** | Default, Loading, Empty (no reviews yet) |
| **Business Rule** | Show 3-5 most recent reviews. "Read all" expands to full list. |

#### Availability Preview
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show next available slots without leaving profile |
| **Visibility** | Player: View, Use |
| **States** | Default (showing slots), Loading, Empty (no availability) |
| **Business Rule** | Quick book buttons pre-select the slot and go to PLAYER_BOOKING_CONFIRM. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P05-EC1 | Coach has no reviews yet | Show "New coach — no reviews yet" with coach's qualifications highlighted |
| P05-EC2 | Coach has no available slots | Show "No availability right now" with "Join waiting list" option |
| P05-EC3 | Coach profile is incomplete | Show what's available. Do not hide the profile. |
| P05-EC4 | Player views own profile (coach) | Show "This is how players see your profile" with edit links |
| P05-EC5 | Coach is suspended | Show "This coach is currently unavailable" with alternatives |

### Loading States
- Skeleton hero section
- Skeleton stats
- Skeleton reviews

### Permissions Matrix

| Component | Player | Coach (own) | Org Admin |
|-----------|--------|-------------|-----------|
| Hero Section | View | View (preview) | View |
| Bio & About | View | View (preview) | View |
| Stats | View | View | View |
| Session Types & Prices | View | View (preview) | View |
| Reviews | View | View | View |
| "Book Session" | Use | — | — |
| "Message Coach" | Use | — | — |
| "Read All Reviews" | Use | View | View |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `coach_profile_viewed` | Screen loads | `coach_id`, `source` |
| `book_session_tapped` | CTA tap | `coach_id` |
| `reviews_expanded` | "Read all" tap | `coach_id`, `review_count` |
| `availability_tapped` | Slot tap | `coach_id`, `slot_time` |
| `message_coach_tapped` | Message tap | `coach_id` |

---

## P-06: PLAYER_TIME_SELECT — Time Selection

### Screen Purpose
Show the player available time slots for the selected coach. Let them choose the best time for their session. This is where the Scheduling Engine's availability resolution is presented as a simple calendar.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- PLAYER_COACH_PROFILE "Book Session"
- PLAYER_COACH_LIST "Book Now"
- PLAYER_COACH_PROFILE quick book slot

### Exit Points
- Select slot → PLAYER_BOOKING_CONFIRM
- Back → PLAYER_COACH_PROFILE or PLAYER_COACH_LIST
- Change coach → PLAYER_COACH_LIST

### User Goal
Find a time that works for me and select it confidently.

### Business Goal
Maximize slot selection rate. Show only available slots (no frustration). Reduce time-to-select.

### UX Flow
```
Player sees time selection
    │
    ├── Calendar view:
    │       ├── Month view (top)
    │       │       ├── Available dates highlighted
    │       │       ├── Unavailable dates dimmed
    │       │       ├── Today highlighted
    │       │       └── Tap date → Show slots for that date
    │       │
    │       └── Day view (below calendar):
    │               ├── Available slots shown as chips/cards
    │               ├── Each slot: time range + branch
    │               ├── Slots grouped by branch (if coach works at multiple)
    │               ├── Show remaining slots: "2 spots left"
    │               └── Tap slot → Select → PLAYER_BOOKING_CONFIRM
    │
    ├── Player can:
    │       ├── Navigate months (swipe or arrows)
    │       ├── Tap date to see slots
    │       ├── Tap slot to select
    │       ├── Change coach (link back)
    │       └── See weather forecast (if outdoor)
    │
    └── Selected slot:
            ├── Highlighted in blue
            ├── "Book this slot" button appears
            └── → PLAYER_BOOKING_CONFIRM
```

### Decision Points
```
Player selects a date
    │
    ├── Slots available?
    │       ├── YES → Show available slots
    │       │       │
    │       │       ├── Player selects slot
    │       │       │       │
    │       │       │       ├── Slot still available?
    │       │       │       │       ├── YES → Highlight, show "Book" button
    │       │       │       │       └── NO → "This slot was just booked. Choose another?"
    │       │       │       │               ├── Show other available slots
    │       │       │       │               └── Join waiting list for this slot
    │       │       │       │
    │       │       │       └── Player taps "Book"
    │       │       │               └── → PLAYER_BOOKING_CONFIRM
    │       │       │
    │       │       └── Player changes date
    │       │               └── Show slots for new date
    │       │
    │       └── NO (no slots on this date)
    │               ├── "No availability on [date]"
    │               ├── Show next available date
    │               └── "Check other dates" navigation
    │
    └── Player changes coach?
            └── → PLAYER_COACH_LIST (preserves session type filter)
```

### Component Specifications

#### Calendar Component
| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate dates and see availability at a glance |
| **Visibility** | Player: View, Use |
| **States** | Default, Date Selected, Loading, Past date (disabled) |
| **Business Rule** | Only future dates selectable. Available dates highlighted. Past dates disabled. |

#### Time Slot Chip
| Attribute | Value |
|-----------|-------|
| **Purpose** | Present an available time slot |
| **Visibility** | Player: View, Use |
| **States** | Default, Selected, Pressed, Taken (just became unavailable), Loading |
| **Content** | Time range, branch name, remaining spots (if group) |
| **Business Rule** | Tap selects. Real-time availability check before confirmation. |

#### "Book This Slot" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Confirm slot selection and proceed |
| **Visibility** | Player: Use (only when slot selected) |
| **States** | Hidden (no selection), Default, Pressed, Loading |
| **Business Rule** | Only visible after slot selection. Navigates to PLAYER_BOOKING_CONFIRM. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P06-EC1 | All slots taken on selected date | "No availability on [date]. Next available: [date]" with quick jump |
| P06-EC2 | Coach works at multiple branches | Group slots by branch. Show branch name on each slot. |
| P06-EC3 | Slot becomes unavailable during selection | Real-time check at confirmation. If taken, show alternatives immediately. |
| P06-EC4 | Player has a conflict (existing booking) | Show warning: "You have a booking at this time. Book anyway?" (allow override if different branch) |
| P06-EC5 | Weather forecast shows rain (outdoor court) | Show weather icon on affected slots. "Outdoor court — rain forecast. Consider indoor option." |

### Loading States
- Calendar: skeleton month grid
- Slots: skeleton chips

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Calendar | View, Use | — | — |
| Time Slot Chips | View, Use | — | — |
| "Book This Slot" | Use | — | — |
| Branch Selector | View, Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `time_selection_viewed` | Screen loads | `coach_id`, `session_type` |
| `date_selected` | Date tap | `date`, `slots_available` |
| `slot_selected` | Slot tap | `slot_time`, `branch_id` |
| `slot_unavailable` | Slot taken error | `slot_time`, `coach_id` |

---

## P-07: PLAYER_BOOKING_CONFIRM — Booking Confirmation

### Screen Purpose
Show the player a complete summary of their booking before they commit. This is the "review your order" screen. Price, coach, time, location, policies — everything in one place.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- PLAYER_TIME_SELECT (after selecting slot)

### Exit Points
- Confirm booking → PLAYER_PAYMENT
- Back → PLAYER_TIME_SELECT
- Change coach → PLAYER_COACH_LIST
- Change time → PLAYER_TIME_SELECT

### User Goal
Review everything. Feel confident. Book.

### Business Goal
Maximize confirmation rate. Ensure price transparency. Reduce post-booking cancellations due to surprises.

### UX Flow
```
Player reviews booking summary
    │
    ├── Summary shows:
    │       ├── Coach: Name, photo, rating
    │       ├── Session type: 1-on-1, group, etc.
    │       ├── Date and time
    │       ├── Duration
    │       ├── Branch: Name, address
    │       ├── Price breakdown:
    │       │       ├── Court fee: XXX EGP
    │       │       ├── Coach fee: XXX EGP
    │       │       ├── Platform fee: XXX EGP
    │       │       └── Total: XXX EGP
    │       ├── Cancellation policy (plain language)
    │       ├── What to bring
    │       └── Coach's policies
    │
    ├── Player can:
    │       ├── Confirm → PLAYER_PAYMENT
    │       ├── Change time → PLAYER_TIME_SELECT
    │       ├── Change coach → PLAYER_COACH_LIST
    │       └── Cancel → Back to previous
    │
    └── Payment method selection:
            ├── Wallet (default if sufficient balance)
            ├── Card
            └── Cash on-site (if enabled)
```

### Decision Points
```
Player reviews summary
    │
    ├── Everything looks good?
    │       ├── YES → Select payment method → PLAYER_PAYMENT
    │       └── NO → What needs changing?
    │               ├── Wrong time → PLAYER_TIME_SELECT
    │               ├── Wrong coach → PLAYER_COACH_LIST
    │               ├── Too expensive → Back (maybe choose different session type)
    │               └── Wrong location → Check if coach has other branches
    │
    ├── Payment method?
    │       ├── Wallet
    │       │       ├── Sufficient balance? → Process payment
    │       │       └── Insufficient → "Top up wallet" or choose another method
    │       ├── Card → Redirect to payment gateway
    │       └── Cash → Confirm booking (no payment now)
    │
    └── First booking with this coach?
            ├── YES → Show coach intro: "Coach Ahmed has 4.8 stars from 120 sessions"
            └── NO → Show "Booking again with Coach [name]"
```

### Component Specifications

#### Booking Summary Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Complete booking overview |
| **Visibility** | Player: View |
| **States** | Default, Loading |
| **Content** | Coach info, session details, location, price breakdown |

#### Price Breakdown
| Attribute | Value |
|-----------|-------|
| **Purpose** | Transparent pricing |
| **Visibility** | Player: View |
| **States** | Default, Loading |
| **Business Rule** | Every line item visible. Total prominently displayed. No hidden fees. |

#### Payment Method Selector
| Attribute | Value |
|-----------|-------|
| **Purpose** | Choose how to pay |
| **Visibility** | Player: View, Use |
| **States** | Default (wallet selected), Expanded, Loading |
| **Business Rule** | Wallet is default if sufficient balance. Show balance. If insufficient, show "Insufficient" with top-up option. |

#### "Confirm & Pay" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Final confirmation |
| **Visibility** | Player: Use |
| **States** | Default, Pressed, Loading (processing), Disabled (no payment method) |
| **Business Rule** | Show total on button. "Confirm & Pay 350 EGP". Processing state during payment. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P07-EC1 | Price changed since player started flow | Show "Price updated from X to Y" with explanation. Allow continue or cancel. |
| P07-EC2 | Wallet has exactly the right amount | Show "Pay with Wallet" with balance after: "Balance after payment: 0 EGP" |
| P07-EC3 | Cash payment selected | "Pay cash at the branch. Booking confirmed." No payment processing. |
| P07-EC4 | Player has a promo code | Show promo code input. Apply discount. Update total. |

### Loading States
- Summary: skeleton content
- Payment processing: button shows spinner, screen dimmed

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Booking Summary | View | — | — |
| Price Breakdown | View | — | — |
| Payment Method Selector | View, Use | — | — |
| "Confirm & Pay" | Use | — | — |
| Promo Code Input | View, Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `booking_confirm_viewed` | Screen loads | `coach_id`, `total_price`, `payment_method` |
| `payment_method_selected` | Method tap | `method` |
| `promo_code_applied` | Promo apply | `code`, `discount_amount` |
| `booking_confirmed` | Confirm tap | `coach_id`, `total_price`, `payment_method` |

---

## P-08: PLAYER_PAYMENT — Payment Processing

### Screen Purpose
Process the player's payment securely. This screen is minimal — the payment gateway handles the heavy lifting. The player sees a clear status.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- PLAYER_BOOKING_CONFIRM "Confirm & Pay"

### Exit Points
- Payment success → PLAYER_BOOKING_SUCCESS
- Payment failed → Error state with retry
- Cancel → PLAYER_BOOKING_CONFIRM

### User Goal
Pay quickly and securely. Know exactly what's happening.

### Business Goal
Maximize payment success rate. Never lose a booking due to payment confusion. Handle failures gracefully.

### UX Flow
```
Player confirms payment
    │
    ├── Wallet payment:
    │       ├── Processing spinner (2-3 seconds)
    │       ├── Deduct from wallet
    │       ├── Create booking
    │       └── → PLAYER_BOOKING_SUCCESS
    │
    ├── Card payment:
    │       ├── Redirect to payment gateway
    │       ├── Player enters card details (on gateway)
    │       ├── Gateway processes payment
    │       ├── Return to CourtZon
    │       ├── Verify payment status
    │       └── → PLAYER_BOOKING_SUCCESS (or error)
    │
    └── Cash payment:
            ├── Confirm booking (no payment processing)
            └── → PLAYER_BOOKING_SUCCESS
```

### Decision Points
```
Payment processing
    │
    ├── Wallet
    │       ├── Sufficient balance?
    │       │       ├── YES → Process → Success
    │       │       └── NO → "Insufficient balance"
    │       │               ├── Top up wallet → Process top-up → Retry
    │       │               ├── Use card instead → Redirect to gateway
    │       │               └── Cancel → Back to confirm
    │       │
    │       └── Wallet processing failed?
    │               ├── Retry
    │               └── Use card instead
    │
    ├── Card
    │       ├── Gateway redirect successful?
    │       │       ├── YES → Verify → Success
    │       │       └── NO → Error
    │       │
    │       └── Payment declined?
    │               ├── "Payment declined. Try another card?"
    │               ├── "Try again"
    │               └── "Use wallet instead"
    │
    └── Cash
            └── Confirm → Success
```

### Component Specifications

#### Processing Overlay
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show payment is in progress |
| **Visibility** | Player: View |
| **States** | Processing (spinner), Success (checkmark), Error (retry) |
| **Business Rule** | Never show blank screen during processing. Always show status. |

#### Error Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show payment failure with recovery options |
| **Visibility** | Player: View, Use |
| **States** | Payment declined, Network error, Gateway error |
| **Business Rule** | Always show at least 2 recovery options. Never dead-end. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P08-EC1 | Network timeout during payment | Check booking status. If booking created, show success. If not, show retry. Never double-charge. |
| P08-EC2 | Payment charged but confirmation not received | "Checking your booking status..." Auto-resolve. Show result. |
| P08-EC3 | Player closes app during payment | On return, check booking status. Show appropriate screen. |
| P08-EC4 | Payment gateway is down | "Payment service temporarily unavailable. Try again in a few minutes." Hold reservation for 15 min. |

### Loading States
- Processing spinner with "Processing your payment..."
- Never blank

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Processing Overlay | View | — | — |
| Error Card | View, Use | — | — |
| Retry Button | Use | — | — |
| Cancel Button | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `payment_started` | Payment initiated | `method`, `amount` |
| `payment_success` | Payment completed | `method`, `amount`, `duration` |
| `payment_failed` | Payment failed | `method`, `error_type` |
| `payment_retry` | Retry tap | `method` |

---

## P-09: PLAYER_BOOKING_SUCCESS — Booking Success

### Screen Purpose
Confirm the booking is complete. Celebrate the moment. Show the player what happens next. This is the "order confirmed" screen.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- PLAYER_PAYMENT (after successful payment)

### Exit Points
- "View Booking" → PLAYER_BOOKING_DETAIL
- "Done" → PLAYER_HOME
- "Add to Calendar" → Calendar integration
- "Share" → Share booking details

### User Goal
Feel confident the booking is confirmed. Know what happens next. Have a record.

### Business Goal
Reduce post-booking anxiety. Increase pre-session preparation. Encourage sharing.

### UX Flow
```
Payment successful
    │
    ├── Success screen:
    │       ├── Animated checkmark
    │       ├── "Booking Confirmed!"
    │       ├── Booking reference number
    │       ├── Summary: Coach, date, time, location
    │       ├── "What happens next" section:
    │       │       ├── "Coach [name] has been notified"
    │       │       ├── "You'll receive a reminder 24 hours before"
    │       │       └── "Check your email for confirmation"
    │       ├── "Add to Calendar" button
    │       ├── "Share" button
    │       ├── "View Booking" button
    │       └── "Done" button
    │
    ├── System actions:
    │       ├── Send confirmation notification (push + email)
    │       ├── Notify coach of new booking
    │       ├── Schedule reminders (24h, 2h)
    │       └── Log booking in history
```

### Component Specifications

#### Success Animation
| Attribute | Value |
|-----------|-------|
| **Purpose** | Celebrate the moment |
| **Visibility** | Player: View |
| **States** | Animating (checkmark draws), Complete (static checkmark) |
| **Business Rule** | 1-2 second animation. Satisfying. Never skip. |

#### "What Happens Next" Section
| Attribute | Value |
|-----------|-------|
| **Purpose** | Set expectations, reduce anxiety |
| **Visibility** | Player: View |
| **States** | Default |
| **Content** | 3-4 items explaining next steps |

#### "Add to Calendar" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Add booking to device calendar |
| **Visibility** | Player: Use |
| **States** | Default, Added (checkmark), Error |
| **Business Rule** | Creates calendar event with coach name, location, time. |

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Success Animation | View | — | — |
| Booking Summary | View | — | — |
| "What Happens Next" | View | — | — |
| "Add to Calendar" | Use | — | — |
| "Share" | Use | — | — |
| "View Booking" | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `booking_success_viewed` | Screen loads | `booking_id`, `payment_method` |
| `calendar_added` | Calendar tap | `booking_id` |
| `booking_shared` | Share tap | `booking_id`, `share_method` |

---

## P-10: PLAYER_BOOKING_DETAIL — Booking Detail

### Screen Purpose
Show all details of a specific booking. Allow the player to manage the booking (cancel, reschedule, message coach, check in).

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Secondary** | Coach (view-only of their session details) |
| **Blocked** | Organization Admin, Guest |

### Entry Points
- PLAYER_BOOKING_SUCCESS "View Booking"
- PLAYER_MY_BOOKINGS (tap booking)
- Push notification tap (booking reminder)
- PLAYER_HOME (upcoming session card)

### Exit Points
- Back → PLAYER_MY_BOOKINGS or PLAYER_HOME
- Cancel → Cancel confirmation
- Reschedule → PLAYER_TIME_SELECT
- Message coach → Chat screen
- Check in → Check-in confirmation

### User Goal
See everything about my booking. Manage it if needed.

### Business Goal
Reduce no-shows through reminders and preparation info. Enable smooth cancellations/rescheduling.

### UX Flow
```
Player views booking detail
    │
    ├── Header:
    │       ├── Status badge (Upcoming, In Progress, Completed, Cancelled)
    │       ├── Date and time
    │       └── Countdown ("in 2 days, 3 hours")
    │
    ├── Coach section:
    │       ├── Photo, name, rating
    │       ├── "View Coach Profile" link
    │       └── "Message Coach" button
    │
    ├── Session details:
    │       ├── Session type
    │       ├── Duration
    │       ├── Branch: name, address
    │       ├── "Get Directions" link
    │       └── Court assignment (if assigned)
    │
    ├── Payment section:
    │       ├── Total paid
    │       ├── Payment method
    │       ├── Receipt/download
    │       └── Refund status (if applicable)
    │
    ├── Actions (based on status):
    │       ├── Upcoming:
    │       │       ├── "Cancel Booking" (with policy)
    │       │       ├── "Reschedule" → PLAYER_TIME_SELECT
    │       │       ├── "Message Coach"
    │       │       └── "Check In" (on session day, near branch)
    │       ├── In Progress:
    │       │       └── "Session in progress"
    │       ├── Completed:
    │       │       ├── "Rate Session" → PLAYER_SESSION_RATING
    │       │       ├── "Book Again" → PLAYER_TIME_SELECT
    │       │       └── "View Receipt"
    │       └── Cancelled:
    │               ├── "Reason: [reason]"
    │               ├── "Refund: [status]"
    │               └── "Book Another Session" → PLAYER_HOME
    │
    └── Preparation section:
            ├── "What to bring"
            ├── "Cancellation policy"
            └── "Branch directions"
```

### Decision Points
```
Player wants to cancel?
    │
    ├── Cancellation policy check:
    │       ├── > 24h before → Full refund
    │       ├── 12-24h → 50% refund
    │       ├── < 12h → No refund
    │       └── Coach cancelled → Full refund + rebooking
    │
    ├── Confirm cancellation:
    │       ├── "Are you sure?"
    │       ├── Show refund amount
    │       ├── "Cancel" → Process → Update status
    │       └── "Keep Booking" → Return
    │
    └── Offer alternatives:
            ├── Reschedule (find another time)
            └── Transfer to another coach

Player wants to reschedule?
    │
    ├── → PLAYER_TIME_SELECT (same coach)
    ├── Original slot released
    └── New slot confirmed

Player wants to check in?
    │
    ├── Near branch? (geofence or manual)
    │       ├── YES → "Checked in! Coach [name] is at Court [X]."
    │       └── NO → "You're not near the branch yet."
    │               ├── "Check in anyway" (manual)
    │               └── "Get Directions" → Map
```

### Component Specifications

#### Status Badge
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show booking status at a glance |
| **Visibility** | Player: View |
| **States** | Upcoming (blue), In Progress (green), Completed (gray), Cancelled (red) |
| **Business Rule** | Status updates in real-time. Auto-transitions based on time. |

#### Countdown Timer
| Attribute | Value |
|-----------|-------|
| **Purpose** | Create urgency and awareness |
| **Visibility** | Player: View |
| **States** | Active (counting down), Expired (session time passed) |
| **Business Rule** | Updates every minute. Disappears when session starts. |

#### "Cancel Booking" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Cancel the booking |
| **Visibility** | Player: Use (only if Upcoming status) |
| **States** | Default, Pressed, Loading, Hidden (if completed/cancelled) |
| **Business Rule** | Shows cancellation policy before confirming. Shows refund amount. |

#### "Check In" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Check in to the session |
| **Visibility** | Player: Use (only on session day, near branch) |
| **States** | Default, Pressed, Loading, Checked In (checkmark), Disabled (not near branch) |
| **Business Rule** | Visible only on session day. Geofence check optional. Manual check-in always available. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P10-EC1 | Coach cancels after player views detail | Real-time update. Show "Coach cancelled. Full refund processed. Rebook?" |
| P10-EC2 | Player tries to cancel within 12h | Show "No refund for late cancellations. Cancel anyway?" with warning |
| P10-EC3 | Booking is for a group session | Show other participants (first names only). Show group chat option. |
| P10-EC4 | Session time has passed but not checked in | Show "Session ended. Did you attend?" with retroactive check-in option |

### Loading States
- Skeleton content for all sections

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Booking Details | View | View (own session) | View (org sessions) |
| Status Badge | View | View | View |
| "Cancel Booking" | Use | — | — |
| "Reschedule" | Use | — | — |
| "Message Coach" | Use | — | — |
| "Check In" | Use | Confirm | — |
| "Rate Session" | Use | — | — |
| "Book Again" | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `booking_detail_viewed` | Screen loads | `booking_id`, `status` |
| `booking_cancelled` | Cancel confirm | `booking_id`, `reason`, `refund_amount` |
| `booking_rescheduled` | Reschedule tap | `booking_id` |
| `check_in_tapped` | Check-in tap | `booking_id`, `method` |
| `message_coach_tapped` | Message tap | `booking_id`, `coach_id` |

---

## P-11: PLAYER_SESSION_RATING — Session Rating

### Screen Purpose
Collect player feedback after a completed session. This drives coach quality, reputation, and platform trust.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- PLAYER_BOOKING_DETAIL "Rate Session"
- Push notification "Rate your session with Coach [name]"
- PLAYER_HOME (post-session prompt)

### Exit Points
- Submit rating → Thank you state → PLAYER_HOME
- Skip → PLAYER_HOME
- Report issue → Support flow

### User Goal
Share my experience quickly. Feel heard.

### Business Goal
Collect high-quality feedback. Achieve > 60% rating rate. Detect quality issues early.

### UX Flow
```
Player rates session
    │
    ├── Quick rating (1-5 stars):
    │       ├── 1-2 stars → "We're sorry. What went wrong?"
    │       │       ├── Specific issues:
    │       │       │       ├── Coach was late
    │       │       │       ├── Session quality was poor
    │       │       │       ├── Coach was rude
    │       │       │       ├── Session was too short
    │       │       │       └── Other
    │       │       ├── "Report to support" option
    │       │       └── "Get partial refund" option (if applicable)
    │       │
    │       ├── 3 stars → "Thanks. What could be improved?"
    │       │       ├── Optional text feedback
    │       │       └── "Would you book again?" (Yes/No)
    │       │
    │       └── 4-5 stars → "Great! Tell us more."
    │               ├── "What did you enjoy most?"
    │               │       ├── Technique instruction
    │               │       ├── Match play
    │               │       ├── Fitness
    │               │       ├── Communication
    │               │       └── Other
    │               ├── Optional text review
    │               ├── "Would you book again?" (Yes/No)
    │               └── "Share with a friend" (referral link)
    │
    └── Submit:
            ├── "Thanks for your feedback!"
            ├── "Your review helps other players find great coaches."
            ├── "Book another session?" → PLAYER_TIME_SELECT
            └── → PLAYER_HOME (after 3 seconds)
```

### Component Specifications

#### Star Rating
| Attribute | Value |
|-----------|-------|
| **Purpose** | Quick overall rating |
| **Visibility** | Player: View, Use |
| **States** | Default (no selection), Selected (1-5 highlighted), Submitted |
| **Business Rule** | Tap to select. Tap same star to deselect. Must select before submitting. |

#### Feedback Form
| Attribute | Value |
|-----------|-------|
| **Purpose** | Collect detailed feedback |
| **Visibility** | Player: View, Use |
| **States** | Collapsed (star only), Expanded (after star selection), Submitted |
| **Business Rule** | Text feedback is optional. Multiple choice is optional. Submit requires star rating only. |

#### "Submit" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Submit rating |
| **Visibility** | Player: Use |
| **States** | Default, Pressed, Loading, Disabled (no star selected) |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P11-EC1 | Player already rated | Show "You already rated this session" with previous rating. Allow update within 7 days. |
| P11-EC2 | Player wants to change rating | Allow update within 7 days. Show original. "Update your rating?" |
| P11-EC3 | Coach responds to review | Notify player: "Coach [name] responded to your review." Show response in history. |
| P11-EC4 | Rating is 1 star with serious complaint | Auto-flag for support review. Send support ticket. |

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Star Rating | View, Use | — | — |
| Feedback Form | View, Use | — | — |
| "Submit" | Use | — | — |
| Previous Rating | View (own) | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `rating_screen_viewed` | Screen loads | `booking_id`, `coach_id` |
| `star_selected` | Star tap | `rating` |
| `feedback_submitted` | Submit tap | `rating`, `feedback_text`, `would_rebook` |
| `issue_reported` | Report tap | `booking_id`, `issue_type` |

---

## P-12: PLAYER_MY_BOOKINGS — My Bookings List

### Screen Purpose
Show all of the player's bookings in one place. Upcoming, past, and cancelled. This is the player's booking management hub.

### Users
| Role | Access |
|------|--------|
| **Primary** | Player |
| **Blocked** | Coach, Organization Admin, Guest |

### Entry Points
- Bottom nav "Bookings"
- PLAYER_HOME "My Bookings"
- PLAYER_BOOKING_SUCCESS "View Booking"

### Exit Points
- Tap booking → PLAYER_BOOKING_DETAIL
- Back → PLAYER_HOME
- "Book a Coach" → PLAYER_HOME

### User Goal
See all my bookings. Find a specific booking. Take action on upcoming bookings.

### Business Goal
Keep players engaged. Reduce no-shows through visibility. Enable easy rebooking.

### UX Flow
```
Player views bookings
    │
    ├── Tabs: Upcoming | Past | Cancelled
    │
    ├── Upcoming tab (default):
    │       ├── Sorted by date (nearest first)
    │       ├── Each card shows:
    │       │       ├── Coach name + photo
    │       │       ├── Date + time
    │       │       ├── Branch
    │       │       ├── Status badge (Confirmed, Pending)
    │       │       ├── Countdown ("in 2 days")
    │       │       └── Quick actions (Cancel, Reschedule)
    │       └── "Book a Coach" button (if no upcoming)
    │
    ├── Past tab:
    │       ├── Sorted by date (most recent first)
    │       ├── Each card shows:
    │       │       ├── Coach name + photo
    │       │       ├── Date + time
    │       │       ├── Rating given (if rated)
    │       │       ├── "Rate" button (if not rated)
    │       │       └── "Book Again" button
    │       └── Empty: "No past sessions"
    │
    └── Cancelled tab:
            ├── Sorted by date (most recent first)
            ├── Each card shows:
            │       ├── Coach name + photo
            │       ├── Date + time
            │       ├── Cancellation reason
            │       └── Refund status
            └── Empty: "No cancelled bookings"
```

### Component Specifications

#### Booking Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Summarize a booking |
| **Visibility** | Player: View, Use |
| **States** | Default, Pressed, Loading |
| **Content** | Coach info, date/time, branch, status, actions |
| **Business Rule** | Tap navigates to PLAYER_BOOKING_DETAIL. Quick actions available on card. |

#### Tab Bar (Upcoming / Past / Cancelled)
| Attribute | Value |
|-----------|-------|
| **Purpose** | Filter bookings by status |
| **Visibility** | Player: View, Use |
| **States** | Default (Upcoming selected), Tab selected |
| **Business Rule** | Default to Upcoming. Show count badge on each tab. |

### Empty States
- **No upcoming:** "No upcoming sessions. Book a coach to get started!" with CTA
- **No past:** "Your session history will appear here."
- **No cancelled:** "No cancelled bookings."

### Loading States
- Skeleton booking cards

### Permissions Matrix

| Component | Player | Coach | Org Admin |
|-----------|--------|-------|-----------|
| Booking Cards | View | — | — |
| Tab Bar | View, Use | — | — |
| "Cancel" Quick Action | Use | — | — |
| "Reschedule" Quick Action | Use | — | — |
| "Book Again" | Use | — | — |
| "Rate" Button | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `bookings_list_viewed` | Screen loads | `tab`, `booking_count` |
| `booking_card_tapped` | Card tap | `booking_id`, `status` |
| `tab_changed` | Tab tap | `tab` |

---

## P-13 to P-15: Remaining Player Screens

### P-13: PLAYER_HISTORY — Session History

**Purpose:** Show complete session history with progress tracking.
**Key components:** Session timeline, skills worked on, spending summary, progress charts.
**Permission:** Player: View (own history only).
**Analytics:** `history_viewed`, `progress_tapped`, `spending_viewed`

### P-14: PLAYER_WALLET — Wallet & Payment Methods

**Purpose:** Manage wallet balance, payment methods, and transaction history.
**Key components:** Balance display, top-up, transaction list, saved cards, withdrawal.
**Permission:** Player: View, Use (own wallet only).
**Analytics:** `wallet_viewed`, `topup_initiated`, `payment_method_added`

### P-15: PLAYER_PROFILE — Player Profile & Settings

**Purpose:** Manage personal information, preferences, and app settings.
**Key components:** Profile editor, notification preferences, location settings, language, help.
**Permission:** Player: View, Edit (own profile only).
**Analytics:** `profile_viewed`, `profile_updated`, `settings_changed`

---

# Independent Coach Journey Screens

---

## IC-01: COACH_APPLICATION — Application Form

### Screen Purpose
Collect coach information for platform onboarding. This is the first impression — it must be simple, professional, and respectful of the coach's time.

### Users
| Role | Access |
|------|--------|
| **Primary** | Coach (applicant) |
| **Blocked** | Player, Organization Admin, Guest (logged-in users) |

### Entry Points
- App launch (not logged in) → "Become a Coach" CTA
- Landing page "Join as Coach"
- Referral link from existing coach
- Push notification from recruitment campaign

### Exit Points
- Submit application → IC-03 (Application Status)
- Save draft → Preserve progress, show "Continue later"
- Back → Landing page

### User Goal
Apply quickly. Not spend 30 minutes filling forms.

### Business Goal
Capture enough information for verification without discouraging applications. Maximize application completion rate.

### UX Flow
```
Coach opens application
    │
    ├── Step 1: Personal Information
    │       ├── Full name
    │       ├── Phone number (with country code)
    │       ├── Email
    │       ├── City / Area
    │       └── "Continue" button
    │
    ├── Step 2: Coaching Experience
    │       ├── Years of coaching experience
    │       ├── Specialties (multi-select):
    │       │       ├── Technique
    │       │       ├── Fitness
    │       │       ├── Juniors
    │       │       ├── Beginners
    │       │       ├── Match Play
    │       │       └── Other
    │       ├── Current coaching location (if any)
    │       └── "Continue" button
    │
    ├── Step 3: Certifications
    │       ├── Upload certification (photo/PDF)
    │       ├── Or select from list of known certifications
    │       ├── "I don't have a certification" option
    │       └── "Continue" button
    │
    ├── Step 4: Profile Setup
    │       ├── Upload photo (or skip)
    │       ├── Write bio (or use template)
    │       ├── Why join CourtZon? (optional)
    │       └── "Submit Application" button
    │
    └── Progress: Step 1 of 4 → 2 of 4 → 3 of 4 → 4 of 4
```

### Decision Points
```
Does the coach have a certification?
├── YES → Upload or select from list
├── NO → "I don't have a certification"
│       │
│       ├── Show: "You can still apply. Certification increases your visibility."
│       ├── Option to continue without certification
│       └── If approved, coach gets "Uncertified" badge
│
└── Skip for now → Continue, upload later

Does the coach want to complete now?
├── YES → Complete all steps → Submit
├── NO → "Save and continue later"
│       ├── Save progress
│       ├── Send reminder in 24 hours
│       └── Allow resume from last step
```

### Component Specifications

#### Progress Indicator
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show application progress |
| **Visibility** | Coach: View |
| **States** | Step 1-4, Loading, Complete |
| **Business Rule** | Show "Step X of 4". Allow going back to previous steps. |

#### Certification Upload
| Attribute | Value |
|-----------|-------|
| **Purpose** | Collect coaching certification |
| **Visibility** | Coach: View, Use |
| **States** | Empty (no file), Uploading, Uploaded (preview), Error, "No certification" selected |
| **Business Rule** | Accept images and PDF. Max 10MB. Show preview after upload. |

#### Specialty Multi-Select
| Attribute | Value |
|-----------|-------|
| **Purpose** | Capture coaching specialties |
| **Visibility** | Coach: View, Use |
| **States** | Default (none selected), Some selected, All selected |
| **Business Rule** | Minimum 1 selection required. Maximum 6. Tap to toggle. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| IC01-EC1 | Coach has no certification | Allow continue. Mark as "Uncertified". Reduced visibility in search. |
| IC01-EC2 | Upload fails (too large, wrong format) | Clear error: "File must be under 10MB. Accepted: JPG, PNG, PDF." |
| IC01-EC3 | Coach closes app mid-application | Auto-save progress. Resume from last step on return. |
| IC01-EC4 | Phone number already registered | "This phone number is already associated with an account. Log in instead." |
| IC01-EC5 | Email already registered | "This email is already associated with an account." |

### Loading States
- Upload spinner during file upload
- Form fields: immediate (no loading)

### Permissions Matrix

| Component | Coach (applicant) | Player | Org Admin |
|-----------|-------------------|--------|-----------|
| Application Form | View, Use | — | — |
| Certification Upload | View, Use | — | — |
| Photo Upload | View, Use | — | — |
| "Submit" Button | Use | — | — |
| "Save Draft" | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `application_started` | Form opened | `source` |
| `application_step_completed` | Step complete | `step`, `duration` |
| `application_submitted` | Submit tap | `has_certification`, `specialty_count`, `total_duration` |
| `application_saved_draft` | Save tap | `step` |

---

## IC-04: COACH_DASHBOARD — Dashboard Home

### Screen Purpose
The coach's command center. Shows at-a-glance performance, upcoming sessions, pending actions, and quick access to key features. This is where the coach starts every day.

### Users
| Role | Access |
|------|--------|
| **Primary** | Independent Coach |
| **Blocked** | Player, Organization Admin, Guest |

### Entry Points
- App launch (if coach role)
- Bottom nav "Dashboard"
- Push notification tap

### Exit Points
- Tap stat card → Detail screen
- Tap booking → IC-10 (Booking Detail)
- Tap review → IC-13 (Reviews)
- Bottom nav → Calendar, Bookings, More

### User Goal
Quickly understand: "How is my coaching business doing? What do I need to do next?"

### Business Goal
Drive coach engagement. Surface actionable insights. Prompt responses to pending bookings.

### UX Flow
```
Coach opens dashboard
    │
    ├── Welcome banner:
    │       ├── "Good morning, Coach [Name]"
    │       ├── Profile completion (if < 100%): "Complete your profile to get more bookings"
    │       └── Announcement (if any)
    │
    ├── Stats row:
    │       ├── This week's earnings: X EGP
    │       ├── Upcoming sessions: X
    │       ├── Average rating: X.X
    │       └── Utilization: X%
    │
    ├── Pending actions:
    │       ├── New booking requests (X)
    │       │       └── Tap → IC-09 (Pending Bookings)
    │       ├── Messages (X)
    │       └── Reviews to respond to (X)
    │
    ├── Upcoming sessions (next 3):
    │       ├── Player name, session type, date/time, branch
    │       └── Tap → IC-10 (Booking Detail)
    │
    ├── Quick actions:
    │       ├── "Update Availability" → IC-08
    │       ├── "View Earnings" → IC-11
    │       └── "Share Profile" → Share link
    │
    ├── Recent reviews (last 2):
    │       ├── Star rating, player name, excerpt
    │       └── "View All Reviews" → IC-13
    │
    └── Insights (if data available):
            ├── "Your Saturday mornings are fully booked. Consider adding Friday."
            ├── "3 players viewed your profile this week"
            └── "You're in the top 20% of coaches in Maadi"
```

### Component Specifications

#### Stats Row
| Attribute | Value |
|-----------|-------|
| **Purpose** | Key metrics at a glance |
| **Visibility** | Coach: View |
| **States** | Default, Loading (skeleton), Zero values |
| **Content** | Earnings, sessions, rating, utilization |
| **Business Rule** | Tap any stat to see detail. If zero, show encouraging message. |

#### Pending Actions Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Surface items requiring coach attention |
| **Visibility** | Coach: View, Use |
| **States** | Default (items present), Empty (no pending items), Loading |
| **Business Rule** | Show count badge. If urgent (booking request), highlight prominently. |

#### Upcoming Sessions Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show next sessions |
| **Visibility** | Coach: View, Use |
| **States** | Default, Loading, Empty (no upcoming sessions) |
| **Business Rule** | Show max 3 sessions. "View all" links to IC-09. |

#### Insights Card
| Attribute | Value |
|-----------|-------|
| **Purpose** | Provide actionable business intelligence |
| **Visibility** | Coach: View |
| **States** | Default (insights available), Loading, Empty (not enough data) |
| **Business Rule** | Show max 3 insights. Rotate weekly. Insights based on actual data. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| IC04-EC1 | New coach with no data | Show onboarding checklist: "Complete your profile, set availability, add service areas" |
| IC04-EC2 | Coach has pending booking > 24h | Highlight "New booking request" with urgency indicator. "Respond within 24h to maintain your response rate." |
| IC04-EC3 | Coach's rating dropped | Show alert: "Your rating dropped from 4.6 to 4.3. View details." |
| IC04-EC4 | No upcoming sessions | Show "No upcoming sessions. Update your availability to get more bookings." |

### Loading States
- Skeleton stats row
- Skeleton session cards
- Skeleton review cards

### Permissions Matrix

| Component | Coach | Player | Org Admin |
|-----------|-------|--------|-----------|
| Welcome Banner | View | — | — |
| Stats Row | View | — | — |
| Pending Actions | View, Use | — | — |
| Upcoming Sessions | View, Use | — | — |
| Quick Actions | View, Use | — | — |
| Recent Reviews | View | — | — |
| Insights | View | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `coach_dashboard_viewed` | Screen loads | `has_pending`, `upcoming_count` |
| `pending_action_tapped` | Action tap | `action_type` |
| `insight_tapped` | Insight tap | `insight_type` |

---

## IC-05: COACH_PROFILE_EDIT — Profile Editor

### Screen Purpose
Let the coach build and maintain their professional profile. This is their storefront — the profile that players see.

### Users
| Role | Access |
|------|--------|
| **Primary** | Independent Coach |
| **Secondary** | Player (view-only of published profile) |
| **Blocked** | Organization Admin, Guest |

### Entry Points
- IC-04 Dashboard "Complete your profile"
- IC-16 Settings "Edit Profile"
- PLAYER_COACH_PROFILE "This is your profile" (preview mode)

### Exit Points
- Save → Success toast, stay on screen
- Preview → View as player sees it
- Back → Previous screen

### User Goal
Present myself professionally. Show players why they should book me.

### Business Goal
Maximize profile completeness. Profiles with photo + bio + certifications get 3x more bookings.

### UX Flow
```
Coach edits profile
    │
    ├── Profile sections:
    │       ├── Photo
    │       │       ├── Current photo displayed
    │       │       ├── "Change Photo" button
    │       │       ├── Upload from camera or gallery
    │       │       └── Crop/resize tool
    │       │
    │       ├── Name
    │       │       ├── First name
    │       │       ├── Last name
    │       │       └── Display name (how players see it)
    │       │
    │       ├── Bio
    │       │       ├── Text area (max 500 characters)
    │       │       ├── Character count
    │       │       ├── "Use a template" link
    │       │       └── Templates:
    │       │               ├── "Coach with [X] years of experience specializing in [specialty]"
    │       │               ├── "Passionate about helping players improve their [technique/fitness/match play]"
    │       │               └── "Certified coach dedicated to junior development"
    │       │
    │       ├── Specialties
    │       │       ├── Multi-select chips
    │       │       ├── Add/remove specialties
    │       │       └── Max 6 selections
    │       │
    │       ├── Certifications
    │       │       ├── List of uploaded certifications
    │       │       ├── "Add Certification" button
    │       │       ├── Upload flow (photo/PDF)
    │       │       └── Verification status (Pending, Verified, Expired)
    │       │
    │       ├── Languages
    │       │       └── Multi-select from list
    │       │
    │       ├── Video Introduction (optional)
    │       │       ├── "Add a 30-second video intro"
    │       │       ├── Upload from gallery
    │       │       └── Preview
    │       │
    │       └── Success Stories (optional)
    │               ├── "Add a success story"
    │               ├── Title + description
    │               └── Photo (optional)
    │
    ├── Actions:
    │       ├── "Save Changes" → Save, show success toast
    │       ├── "Preview as Player" → View published profile
    │       └── "Cancel" → Discard changes
    │
    └── Completeness meter:
            ├── "Profile: 70% complete"
            ├── "Add a photo to reach 90%"
            └── Progress bar
```

### Component Specifications

#### Profile Completeness Meter
| Attribute | Value |
|-----------|-------|
| **Purpose** | Motivate profile completion |
| **Visibility** | Coach: View |
| **States** | 0-100%, Loading |
| **Business Rule** | Calculate based on: photo (+20%), bio (+20%), certifications (+20%), specialties (+20%), video (+20%). Show suggestion for next step. |

#### Photo Upload
| Attribute | Value |
|-----------|-------|
| **Purpose** | Upload professional photo |
| **Visibility** | Coach: View, Use |
| **States** | Current photo, Uploading, Uploaded, Error |
| **Business Rule** | Accept JPG, PNG. Max 5MB. Crop to square. Show preview. |

#### Bio Text Area
| Attribute | Value |
|-----------|-------|
| **Purpose** | Write professional bio |
| **Visibility** | Coach: View, Use |
| **States** | Empty, Partial, Complete, Over limit |
| **Business Rule** | Max 500 characters. Show count. Show template options. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| IC05-EC1 | Photo upload fails | "Upload failed. Try again or choose a different photo." |
| IC05-EC2 | Bio exceeds 500 characters | Show red character count. Disable save until within limit. |
| IC05-EC3 | Certification expired | Show "Expired" badge. Prompt to upload renewed certification. |
| IC05-EC4 | Player views incomplete profile | Show what's available. Do not hide profile. Show "Coach is setting up their profile." |

### Loading States
- Photo: skeleton while uploading
- Form fields: immediate

### Permissions Matrix

| Component | Coach (own) | Player | Org Admin |
|-----------|-------------|--------|-----------|
| Photo Upload | View, Use | View (published) | — |
| Bio Editor | View, Use | View (published) | — |
| Specialties | View, Use | View (published) | — |
| Certifications | View, Use | View (published) | — |
| Video Upload | View, Use | View (published) | — |
| "Save" | Use | — | — |
| "Preview" | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `profile_editor_viewed` | Screen loads | `completeness` |
| `profile_photo_changed` | Photo save | — |
| `profile_bio_updated` | Bio save | `char_count` |
| `profile_saved` | Save tap | `completeness_before`, `completeness_after` |
| `profile_previewed` | Preview tap | `completeness` |

---

## IC-06: COACH_PRICING — Pricing Settings

### Screen Purpose
Let the coach set and adjust their pricing. Show market data to inform decisions. Display projected earnings.

### Users
| Role | Access |
|------|--------|
| **Primary** | Independent Coach |
| **Blocked** | Player, Organization Admin, Guest |

### Entry Points
- IC-04 Dashboard
- IC-16 Settings
- Onboarding flow

### Exit Points
- Save → Success toast
- Back → Previous screen

### User Goal
Set prices that attract players and reflect my value.

### Business Goal
Optimize coach pricing for market competitiveness and player conversion.

### UX Flow
```
Coach sets pricing
    │
    ├── Market data banner:
    │       "Coaches in your area with similar experience charge 300-500 EGP/hour"
    │
    ├── Pricing by session type:
    │       ├── 1-on-1 Private: [input] EGP/hour
    │       ├── Small Group: [input] EGP/player/hour
    │       ├── Group Clinic: [input] EGP/player/session
    │       ├── Match Play: [input] EGP/player/session
    │       └── Quick Hit: [input] EGP/30min
    │
    ├── Dynamic pricing toggle:
    │       ├── "Peak hours" (evenings, weekends): [+X%] or [fixed amount]
    │       ├── "Off-peak" (mornings, weekdays): [-X%] or [fixed amount]
    │       └── "Last-minute" (< 2h before): [-X%] or [fixed amount]
    │
    ├── Platform fee display:
    │       "CourtZon takes 15%. At your current rate, you keep [amount] per session."
    │
    ├── Projected earnings:
    │       "At 350 EGP/hour, 10 sessions/week = 14,000 EGP/month (before platform fee)"
    │
    └── "Save Pricing" button
```

### Component Specifications

#### Price Input
| Attribute | Value |
|-----------|-------|
| **Purpose** | Set price per session type |
| **Visibility** | Coach: View, Use |
| **States** | Default, Editing, Error (below minimum), Saved |
| **Business Rule** | Minimum 50 EGP. Maximum 2000 EGP. Show platform fee deduction. Show "You keep X" below input. |

#### Market Data Banner
| Attribute | Value |
|-----------|-------|
| **Purpose** | Inform pricing decisions |
| **Visibility** | Coach: View |
| **States** | Default, Loading, No data (new market) |
| **Business Rule** | Update weekly. Based on actual market data. Show range, not exact competitor prices. |

#### Projected Earnings
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show impact of pricing on earnings |
| **Visibility** | Coach: View |
| **States** | Default, Loading |
| **Business Rule** | Update in real-time as price changes. Show monthly projection based on average sessions. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| IC06-EC1 | Price set below market minimum | "Your price is significantly below market. This may attract many bookings but could undervalue your expertise." Allow save. |
| IC06-EC2 | Price set above market maximum | "Your price is above market average. This may reduce bookings. Continue anyway?" Allow save with warning. |
| IC06-EC3 | Coach changes price frequently | Show warning: "You've changed your price 3 times this week. Frequent changes may confuse players." |
| IC06-EC4 | Existing bookings at old price | "Existing bookings will be honored at your previous price. New bookings will use your new price." |

### Permissions Matrix

| Component | Coach (own) | Player | Org Admin |
|-----------|-------------|--------|-----------|
| Price Inputs | View, Use | View (published) | — |
| Dynamic Pricing | View, Use | — | — |
| Market Data | View | — | — |
| Projected Earnings | View | — | — |
| "Save Pricing" | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `pricing_viewed` | Screen loads | `current_price` |
| `price_changed` | Input change | `session_type`, `old_price`, `new_price` |
| `pricing_saved` | Save tap | `prices` |

---

## IC-07: COACH_SERVICE_AREAS — Service Areas

### Screen Purpose
Let the coach define where they are willing to work. Show demand data to inform decisions.

### Users
| Role | Access |
|------|--------|
| **Primary** | Independent Coach |
| **Blocked** | Player, Organization Admin, Guest |

### Entry Points
- IC-04 Dashboard
- IC-16 Settings
- Onboarding flow

### Exit Points
- Save → Success toast
- Back → Previous screen

### User Goal
Choose branches where I want to coach. See which branches need me most.

### Business Goal
Match coach availability to branch demand. Reduce empty slots.

### UX Flow
```
Coach sets service areas
    │
    ├── Map view:
    │       ├── All CourtZon branches shown as pins
    │       ├── Coach's home/base location (if set)
    │       ├── Maximum travel distance radius (slider)
    │       └── Branches within radius highlighted
    │
    ├── Branch list:
    │       ├── Each branch shows:
    │       │       ├── Name
    │       │       ├── Distance from coach
    │       │       ├── Current coach count
    │       │       ├── Player demand level (High/Medium/Low)
    │       │       ├── Toggle (On/Off)
    │       │       └── Schedule constraints (optional):
    │       │               ├── "Only on weekday evenings"
    │       │               ├── "Only on weekends"
    │       │               └── "Any time"
    │       │
    │       └── "Add Branch" button (if more branches available)
    │
    ├── Travel settings:
    │       ├── Maximum travel distance: [slider: 5km - 50km]
    │       ├── "I'll travel up to [X] km for coaching"
    │       └── Show impact: "Adding Maadi branch could increase your bookings by 30%"
    │
    └── "Save Service Areas" button
```

### Component Specifications

#### Map View
| Attribute | Value |
|-----------|-------|
| **Purpose** | Visual branch selection |
| **Visibility** | Coach: View, Use |
| **States** | Default, Branch selected, Loading |
| **Business Rule** | Tap branch pin to toggle. Show demand indicator on each pin. |

#### Branch Toggle
| Attribute | Value |
|-----------|-------|
| **Purpose** | Enable/disable coaching at a branch |
| **Visibility** | Coach: View, Use |
| **States** | On, Off, Loading |
| **Business Rule** | Toggle immediately shows/hides coach from that branch's search. No confirmation needed. |

#### Travel Distance Slider
| Attribute | Value |
|-----------|-------|
| **Purpose** | Set maximum travel distance |
| **Visibility** | Coach: View, Use |
| **States** | Default (10km), Adjusted |
| **Business Rule** | Snap to 5km increments. Show affected branches as slider moves. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| IC07-EC1 | Coach selects no branches | "You haven't selected any service areas. Players won't be able to find you." Force at least 1. |
| IC07-EC2 | Branch is far away | Show warning: "[Branch] is [X] km away. This may affect your ability to reach sessions on time." |
| IC07-EC3 | Coach has existing bookings at branch being removed | "You have upcoming bookings at [branch]. They will be honored. No new bookings will be accepted." |

### Permissions Matrix

| Component | Coach (own) | Player | Org Admin |
|-----------|-------------|--------|-----------|
| Map View | View, Use | — | — |
| Branch Toggles | View, Use | — | — |
| Travel Slider | View, Use | — | — |
| "Save" | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `service_areas_viewed` | Screen loads | `branch_count` |
| `branch_toggled` | Toggle tap | `branch_id`, `enabled` |
| `travel_distance_changed` | Slider change | `distance_km` |
| `service_areas_saved` | Save tap | `branches` |

---

## IC-08: COACH_AVAILABILITY — Availability Calendar

### Screen Purpose
Let the coach set their available hours. This is the most important screen for getting bookings — if a coach has no availability, they cannot be booked.

### Users
| Role | Access |
|------|--------|
| **Primary** | Independent Coach |
| **Blocked** | Player, Organization Admin, Guest |

### Entry Points
- IC-04 Dashboard
- Bottom nav "Calendar"
- Onboarding flow

### Exit Points
- Save → Success toast
- Back → Previous screen

### User Goal
Set my schedule easily. See the connection between availability and potential earnings.

### Business Goal
Maximize coach availability. Reduce empty slots. Show demand overlay to encourage opening more slots.

### UX Flow
```
Coach sets availability
    │
    ├── Weekly view:
    │       ├── 7-day grid (Mon-Sun)
    │       ├── Each day shows available time blocks
    │       ├── Tap to add/edit/remove blocks
    │       ├── Drag to extend/shorten blocks
    │       └── Color coding:
    │               ├── Green: Available for booking
    │               ├── Blue: Reserved (organization session, if applicable)
    │               └── Gray: Unavailable
    │
    ├── Add time block:
    │       ├── Tap "Add" on a day
    │       ├── Select start time
    │       ├── Select end time
    │       ├── Or use presets:
    │       │       ├── "Morning (8am-12pm)"
    │       │       ├── "Afternoon (12pm-5pm)"
    │       │       ├── "Evening (5pm-9pm)"
    │       │       └── "Full day (8am-9pm)"
    │       └── Save block
    │
    ├── Recurring schedule:
    │       ├── "Set as recurring" toggle
    │       ├── Apply to: Same day each week
    │       └── "This schedule repeats every [day]"
    │
    ├── Exceptions:
    │       ├── "Add exception" button
    │       ├── Date range picker
    │       ├── Reason: "Vacation", "Personal", "Other"
    │       └── Exception blocks all slots in range
    │
    ├── Demand overlay:
    │       ├── Show demand indicator on each time slot
    │       ├── "High demand" (many players searching)
    │       ├── "Medium demand"
    │       └── "Low demand"
    │
    └── "Save Availability" button
```

### Decision Points
```
Coach adds availability
    │
    ├── Conflict with existing booking?
    │       ├── YES → "You have a booking at this time. Block this slot instead?"
    │       │       ├── YES → Block slot, keep booking
    │       │       └── NO → Cancel, keep availability
    │       └── NO → Add slot
    │
    ├── Slot overlaps with existing slot?
    │       ├── YES → Merge slots or replace
    │       └── NO → Add new slot
    │
    └── Coach sets recurring?
            ├── YES → Apply to all future weeks
            └── NO → One-time slot only
```

### Component Specifications

#### Weekly Grid
| Attribute | Value |
|-----------|-------|
| **Purpose** | Visual availability editing |
| **Visibility** | Coach: View, Use |
| **States** | Default, Editing, Loading |
| **Business Rule** | Show current week. Navigate to other weeks. Show demand overlay. |

#### Time Block
| Attribute | Value |
|-----------|-------|
| **Purpose** | Represent an available time period |
| **Visibility** | Coach: View, Use |
| **States** | Available (green), Reserved (blue), Unavailable (gray), Creating, Editing |
| **Business Rule** | Drag to resize. Tap to edit details. Swipe to delete. Minimum 30-minute blocks. |

#### Demand Overlay
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show player demand on time slots |
| **Visibility** | Coach: View |
| **States** | High (orange), Medium (yellow), Low (green), No data |
| **Business Rule** | Based on real search data. Update weekly. Encourage opening high-demand slots. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| IC08-EC1 | Coach sets availability but has no service areas | "You have availability but no service areas. Players can't find you. Set service areas?" |
| IC08-EC2 | Coach has availability but no pricing | "You have availability but no pricing set. Set your prices?" |
| IC08-EC3 | Coach tries to delete slot with existing booking | "You have a booking at this time. You cannot delete this slot. Cancel the booking first." |
| IC08-EC4 | Coach sets availability for past dates | "You cannot set availability for past dates." Disable past dates. |

### Loading States
- Weekly grid: skeleton blocks
- Demand overlay: loading indicator

### Permissions Matrix

| Component | Coach (own) | Player | Org Admin |
|-----------|-------------|--------|-----------|
| Weekly Grid | View, Use | — | — |
| Time Blocks | View, Use, Delete | — | — |
| Demand Overlay | View | — | — |
| "Save" | Use | — | — |
| Recurring Toggle | View, Use | — | — |
| Exceptions | View, Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `availability_viewed` | Screen loads | `available_hours` |
| `time_block_added` | Block add | `day`, `start`, `end` |
| `time_block_deleted` | Block delete | `day`, `start`, `end` |
| `recurring_set` | Recurring toggle | `day`, `recurring` |
| `availability_saved` | Save tap | `total_hours`, `high_demand_hours` |

---

## IC-09: COACH_BOOKINGS — Bookings List

### Screen Purpose
Show all bookings for the coach. Pending requests, upcoming sessions, and completed sessions.

### Users
| Role | Access |
|------|--------|
| **Primary** | Independent Coach |
| **Blocked** | Player, Organization Admin, Guest |

### Entry Points
- Bottom nav "Bookings"
- IC-04 Dashboard pending actions

### Exit Points
- Tap booking → IC-10 (Booking Detail)
- Back → Previous screen

### User Goal
See all my bookings. Respond to new requests quickly.

### Business Goal
Maximize booking acceptance rate. Reduce response time. Show booking trends.

### UX Flow
```
Coach views bookings
    │
    ├── Tabs: Pending | Upcoming | Completed
    │
    ├── Pending tab (default if has pending):
    │       ├── New booking requests (sorted by date)
    │       ├── Each card shows:
    │       │       ├── Player name
    │       │       ├── Session type
    │       │       ├── Date + time
    │       │       ├── Branch
    │       │       ├── Requested at (time ago)
    │       │       ├── "Accept" button (green)
    │       │       ├── "Decline" button (red)
    │       │       └── "Suggest Alternative" button
    │       └── Response time indicator: "Respond within 24h"
    │
    ├── Upcoming tab:
    │       ├── Confirmed sessions (sorted by date)
    │       ├── Each card shows:
    │       │       ├── Player name + photo
    │       │       ├── Session type
    │       │       ├── Date + time + countdown
    │       │       ├── Branch
    │       │       ├── Player notes (if any)
    │       │       └── "Prepare" button → Session prep info
    │       └── Empty: "No upcoming sessions"
    │
    └── Completed tab:
            ├── Past sessions (sorted by date, most recent first)
            ├── Each card shows:
            │       ├── Player name
            │       ├── Date
            │       ├── Rating given (if any)
            │       ├── Earnings for this session
            │       └── "View Details" button
            └── Empty: "No completed sessions"
```

### Component Specifications

#### Booking Request Card (Pending)
| Attribute | Value |
|-----------|-------|
| **Purpose** | Show a pending booking request |
| **Visibility** | Coach: View, Use |
| **States** | Default, Accepting (loading), Declining (loading), Responded (hidden from pending) |
| **Business Rule** | Accept/Decline immediately. No confirmation dialog for accept. Confirmation for decline with reason. |

#### "Accept" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Accept booking request |
| **Visibility** | Coach: Use |
| **States** | Default, Pressed, Loading, Accepted (checkmark), Hidden (already responded) |
| **Business Rule** | Instant action. Notify player immediately. Add to calendar. |

#### "Decline" Button
| Attribute | Value |
|-----------|-------|
| **Purpose** | Decline booking request |
| **Visibility** | Coach: Use |
| **States** | Default, Pressed, Loading, Declined (hidden) |
| **Business Rule** | Show confirmation dialog with reason selection. Notify player. Offer alternatives. |

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| IC09-EC1 | Booking request > 24h old | Highlight with urgency: "This request is 23 hours old. Respond to maintain your response rate." |
| IC09-EC2 | Player cancels while coach is reviewing | Remove from pending. Notify coach: "Player cancelled this request." |
| IC09-EC3 | Coach declines, player rebooks with another coach | Normal flow. No action needed from declining coach. |
| IC09-EC4 | Multiple pending requests | Sort by urgency (oldest first). Show count badge on tab. |

### Loading States
- Skeleton booking cards
- Accept/Decline: button spinner

### Permissions Matrix

| Component | Coach | Player | Org Admin |
|-----------|-------|--------|-----------|
| Booking Cards | View | — | — |
| "Accept" | Use | — | — |
| "Decline" | Use | — | — |
| "Suggest Alternative" | Use | — | — |
| Tab Bar | View, Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `bookings_list_viewed` | Screen loads | `tab`, `pending_count` |
| `booking_accepted` | Accept tap | `booking_id`, `response_time` |
| `booking_declined` | Decline tap | `booking_id`, `reason`, `response_time` |

---

## IC-10 to IC-16: Remaining Independent Coach Screens

### IC-10: COACH_BOOKING_DETAIL — Booking Detail
**Purpose:** Show full details of a specific booking. Allow coach to prepare for the session.
**Key components:** Player info, session details, preparation notes, session notes, actions (complete, cancel).
**Permission:** Coach: View (own bookings), Use (own bookings actions).
**Analytics:** `coach_booking_detail_viewed`, `session_prepared`, `session_completed`, `session_notes_saved`

### IC-11: COACH_EARNINGS — Earnings & Wallet
**Purpose:** Show earnings history, wallet balance, and transaction details.
**Key components:** Balance display, earnings chart, transaction list, pending earnings, withdrawal history.
**Permission:** Coach: View (own earnings).
**Analytics:** `earnings_viewed`, `wallet_balance_viewed`, `earnings_chart_interacted`

### IC-12: COACH_WITHDRAWAL — Withdrawal
**Purpose:** Allow coach to withdraw earnings to bank account.
**Key components:** Withdrawal amount input, bank account selection, confirmation, processing status.
**Permission:** Coach: Use (own wallet).
**Edge cases:** Insufficient balance, bank verification pending, daily limit reached.
**Analytics:** `withdrawal_initiated`, `withdrawal_completed`, `withdrawal_failed`

### IC-13: COACH_REVIEWS — Reviews List
**Purpose:** Show all player reviews. Allow coach to respond.
**Key components:** Overall rating, rating breakdown, review cards, response input, improvement suggestions.
**Permission:** Coach: View (own reviews), Use (respond to own reviews).
**Analytics:** `reviews_viewed`, `review_responded`, `improvement_suggestion_viewed`

### IC-14: COACH_ANALYTICS — Analytics Dashboard
**Purpose:** Show business performance metrics and insights.
**Key components:** Metrics cards, charts (earnings, bookings, rating trends), comparisons, recommendations.
**Permission:** Coach: View (own analytics).
**Analytics:** `analytics_viewed`, `metric_tapped`, `recommendation_tapped`

### IC-15: COACH_GROWTH — Growth & Achievements
**Purpose:** Show coach progression, badges, tier status, and growth opportunities.
**Key components:** Tier display, achievement badges, growth suggestions, referral program.
**Permission:** Coach: View (own growth).
**Analytics:** `growth_viewed`, `badge_tapped`, `referral_shared`

### IC-16: COACH_SETTINGS — Settings
**Purpose:** Manage account settings, notifications, privacy, and preferences.
**Key components:** Account info, notification preferences, privacy settings, language, help, logout.
**Permission:** Coach: View, Edit (own settings).
**Analytics:** `settings_viewed`, `setting_changed`, `account_deleted`

---

# Resident Coach Journey Screens

---

## RC-01: RESIDENT_INVITATION — Invitation Acceptance

### Screen Purpose
Show the coach their invitation from an organization. Allow them to accept or decline with full context.

### Users
| Role | Access |
|------|--------|
| **Primary** | Resident Coach (invitee) |
| **Secondary** | Organization Admin (sent invitation) |
| **Blocked** | Player, Guest |

### Entry Points
- Push notification "You've been invited by [Organization]"
- Email invitation link
- In-app notification center

### Exit Points
- Accept → RC-02 (Onboarding)
- Decline → Confirmation → Home
- Save and return later → Preserved

### UX Flow
```
Coach views invitation
    │
    ├── Organization details:
    │       ├── Organization name + logo
    │       ├── Branch assignment
    │       ├── Role: Resident Coach
    │       ├── Compensation model:
    │       │       ├── Per-session rate OR revenue share
    │       │       └── Bonus structure (if any)
    │       ├── Expected hours per week
    │       ├── Working hours preference
    │       └── Mentor assigned (name + photo)
    │
    ├── Coach decides:
    │       ├── "Accept Invitation"
    │       │       ├── Confirmation: "Welcome to [Organization]!"
    │       │       └── → RC-02 (Onboarding)
    │       │
    │       ├── "Decline"
    │       │       ├── "Are you sure?"
    │       │       ├── Reason (optional): Not ready, Wrong location, Wrong terms, Other
    │       │       └── "Invitation declined. You can reapply in 6 months."
    │       │
    │       └── "Save for Later"
    │               ├── "This invitation expires in 14 days."
    │               └── Reminder in 7 days
```

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| RC01-EC1 | Invitation expired (14 days) | "This invitation has expired. Contact the organization to re-invite." |
| RC01-EC2 | Coach already accepted another invitation | "You are already assigned to [Org]. Leave current org first?" |
| RC01-EC3 | Coach's certification expired | "Your certification has expired. Please renew before accepting." |

### Permissions Matrix

| Component | Coach (invitee) | Organization Admin | Player |
|-----------|-----------------|-------------------|--------|
| Invitation Details | View | View (sent) | — |
| "Accept" | Use | — | — |
| "Decline" | Use | — | — |
| "Save for Later" | Use | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `invitation_viewed` | Screen loads | `org_id`, `days_until_expiry` |
| `invitation_accepted` | Accept tap | `org_id` |
| `invitation_declined` | Decline tap | `org_id`, `reason` |

---

## RC-02 to RC-07: Remaining Resident Coach Screens

### RC-02: RESIDENT_ONBOARDING — Onboarding Checklist
**Purpose:** Guide the coach through organization-specific onboarding.
**Key components:** Checklist (complete profile, set hours, review policies, meet mentor), progress bar, mentor intro.
**Permission:** Coach: View, Use (own onboarding).

### RC-03: RESIDENT_HOME — Dashboard Home
**Purpose:** Show today's schedule, upcoming sessions, and quick actions.
**Key components:** Today's schedule, upcoming sessions, organization announcements, quick actions.
**Permission:** Coach: View (own schedule).

### RC-04: RESIDENT_CALENDAR — Unified Calendar
**Purpose:** Show all coaching activity in one calendar — organization sessions and player bookings.
**Key components:** Weekly view, color coding (org vs player), gap detection, swap requests.
**Permission:** Coach: View, Use (own calendar), Request swap.

### RC-05: RESIDENT_EARNINGS — Earnings & Revenue
**Purpose:** Show earnings from organization coaching. Transparent revenue share.
**Key components:** Per-session earnings, monthly summary, revenue share breakdown, bonus tracking.
**Permission:** Coach: View (own earnings).

### RC-06: RESIDENT_PERFORMANCE — Performance Reports
**Purpose:** Show performance metrics and improvement suggestions.
**Key components:** Rating, attendance, utilization, player feedback, improvement suggestions, goals.
**Permission:** Coach: View (own performance).

### RC-07: RESIDENT_SCHEDULE — Schedule Management
**Purpose:** Manage working hours, swap requests, time-off requests.
**Key components:** Working hours editor, swap request flow, time-off request, overtime opportunities.
**Permission:** Coach: View, Use (own schedule), Request swap/time-off.

---

# Organization Journey Screens

---

## OG-01: ORG_DASHBOARD — Dashboard Home

### Screen Purpose
Command center for the organization admin. Shows coaching operations at a glance — staffing, revenue, utilization, alerts.

### Users
| Role | Access |
|------|--------|
| **Primary** | Organization Admin |
| **Secondary** | Branch Manager (read-only for their branch) |
| **Blocked** | Player, Coach |

### Entry Points
- Login (if org admin role)
- Sidebar navigation "Dashboard"

### Exit Points
- Tap stat → Detail screen
- Tap alert → Action screen
- Sidebar nav → Coaches, Branches, Pricing, Reports, Settings

### UX Flow
```
Admin opens dashboard
    │
    ├── Overview stats:
    │       ├── Total coaches: X
    │       ├── Active coaches: X
    │       ├── Sessions this week: X
    │       ├── Revenue this month: X EGP
    │       ├── Utilization: X%
    │       └── Player satisfaction: X.X
    │
    ├── Alerts & Actions (priority sorted):
    │       ├── "3 coaching gaps this week" → Branch schedule
    │       ├── "2 new coach applications" → Applications pipeline
    │       ├── "Coach Ahmed's rating dropped" → Performance review
    │       ├── "Branch Maadi at 90% capacity" → Branch detail
    │       └── "Revenue down 10% this month" → Reports
    │
    ├── Quick actions:
    │       ├── "Invite Coach" → Coach recruitment
    │       ├── "View Reports" → Reports
    │       ├── "Manage Pricing" → Pricing
    │       └── "Add Branch" → Branch management
    │
    └── Chart: Revenue trend (last 6 months)
```

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| OG01-EC1 | No coaches yet | Show onboarding: "Add your first coach to get started" with recruitment CTA |
| OG01-EC2 | No revenue yet | Show "Revenue will appear here after your first coaching session" |
| OG01-EC3 | Multiple branches | Show branch selector to filter dashboard by branch |

### Permissions Matrix

| Component | Org Admin | Branch Manager | Coach | Player |
|-----------|-----------|---------------|-------|--------|
| Overview Stats | View | View (own branch) | — | — |
| Alerts & Actions | View, Use | View (own branch) | — | — |
| Quick Actions | View, Use | — | — | — |
| Revenue Chart | View | View (own branch) | — | — |
| "Invite Coach" | Use | — | — | — |

### Analytics Events
| Event | Trigger | Properties |
|-------|---------|------------|
| `org_dashboard_viewed` | Screen loads | `coach_count`, `revenue` |
| `alert_tapped` | Alert tap | `alert_type`, `priority` |
| `quick_action_tapped` | Action tap | `action_type` |

---

## OG-02 to OG-11: Remaining Organization Screens

### OG-02: ORG_COACH_LIST — Coach List
**Purpose:** Show all coaches in the organization with status, performance, and actions.
**Key components:** Coach cards (name, branch, rating, status, utilization), filters (branch, status, performance), search, bulk actions.
**Permission:** Org Admin: View, Edit, Manage. Branch Manager: View (own branch).

### OG-03: ORG_COACH_PROFILE — Coach Profile Detail
**Purpose:** Full coach profile with performance, schedule, earnings, and management actions.
**Key components:** Profile info, performance metrics, schedule, earnings, actions (edit, reassign, suspend, terminate).
**Permission:** Org Admin: View, Edit, Manage. Branch Manager: View (own branch coaches).

### OG-04: ORG_APPLICATIONS — Applications Pipeline
**Purpose:** Manage incoming coach applications. Kanban-style pipeline.
**Key components:** Pipeline columns (New, Reviewing, Interview, Approved, Rejected), application cards, batch actions.
**Permission:** Org Admin: View, Approve, Reject.

### OG-05: ORG_APP_REVIEW — Application Review
**Purpose:** Detailed review of a single application. Make approval decision.
**Key components:** Applicant profile, qualifications, fit score, risk factors, approve/reject/hold buttons.
**Permission:** Org Admin: View, Approve, Reject.

### OG-06: ORG_BRANCH_ASSIGN — Branch Assignment
**Purpose:** Assign coaches to branches. Optimize coverage.
**Key components:** Branch needs view, coach list, drag-to-assign, optimization suggestions, impact preview.
**Permission:** Org Admin: View, Edit assignments.

### OG-07: ORG_PRICING — Pricing Rules
**Purpose:** Set organization-wide, branch-specific, and coach-specific pricing.
**Key components:** Pricing tiers, branch overrides, coach overrides, time-based pricing, revenue projections.
**Permission:** Org Admin: View, Edit pricing.

### OG-08: ORG_REVENUE_SHARE — Revenue Sharing
**Purpose:** Define and manage revenue sharing models with coaches.
**Key components:** Revenue share models (percentage, tiered, flat), coach-specific overrides, transparency view.
**Permission:** Org Admin: View, Edit revenue share.

### OG-09: ORG_PERFORMANCE — Performance Dashboard
**Purpose:** Monitor coach performance across the organization.
**Key components:** Performance rankings, rating trends, attendance, retention, comparison to benchmarks.
**Permission:** Org Admin: View. Branch Manager: View (own branch).

### OG-10: ORG_UTILIZATION — Utilization Reports
**Purpose:** Track and optimize coaching capacity utilization.
**Key components:** Utilization by coach, by branch, by time slot, waste identification, optimization suggestions.
**Permission:** Org Admin: View. Branch Manager: View (own branch).

### OG-11: ORG_REPORTS — Business Reports
**Purpose:** Generate and view comprehensive business reports.
**Key components:** Revenue reports, player reports, coach reports, operational reports, export, scheduled reports.
**Permission:** Org Admin: View, Export.

---

# Shared Screens

---

## SH-01: LOGIN — Login

### Screen Purpose
Authenticate the user and route them to the correct experience based on their role.

### UX Flow
```
User opens app (not logged in)
    │
    ├── Login screen:
    │       ├── Email/phone input
    │       ├── Password input
    │       ├── "Login" button
    │       ├── "Forgot Password?" link
    │       └── "Don't have an account? Register" link
    │
    ├── User enters credentials
    │       │
    │       ├── Valid credentials?
    │       │       ├── YES → Route by role:
    │       │       │       ├── Player → Player Home
    │       │       │       ├── Independent Coach → Coach Dashboard
    │       │       │       ├── Resident Coach → Resident Home
    │       │       │       ├── Organization Admin → Org Dashboard
    │       │       │       └── Multiple roles → Role Selection
    │       │       │
    │       │       └── NO → "Invalid email or password"
    │       │               ├── Show error
    │       │               ├── Clear password field
    │       │               └── Keep email field
    │       │
    │       └── Account locked? → "Account locked. Contact support."
    │
    └── Biometric login (if available):
            ├── Face ID / Fingerprint
            └── → Route by role
```

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| SH01-EC1 | 5 failed attempts | Lock account for 15 minutes. Show "Account locked. Try again in X minutes." |
| SH01-EC2 | Session expired | "Your session expired. Please log in again." |
| SH01-EC3 | New device login | Send verification code to phone/email. Verify before granting access. |

### Permissions Matrix

| Component | Guest | Player | Coach | Org Admin |
|-----------|-------|--------|-------|-----------|
| Email Input | Use | — | — | — |
| Password Input | Use | — | — | — |
| "Login" | Use | — | — | — |
| "Forgot Password" | Use | — | — | — |
| Biometric Login | Use | — | — | — |

---

## SH-02: REGISTER — Register

### Screen Purpose
Create a new account. Determine the user's role.

### UX Flow
```
User registers
    │
    ├── Registration form:
    │       ├── Full name
    │       ├── Email
    │       ├── Phone number (with verification)
    │       ├── Password
    │       ├── Confirm password
    │       ├── "Register" button
    │       └── "Already have an account? Login" link
    │
    ├── Phone verification:
    │       ├── Send OTP to phone
    │       ├── Enter OTP (4-6 digits)
    │       ├── Verify
    │       └── If invalid: "Invalid code. Try again."
    │
    ├── After verification:
    │       ├── Account created
    │       ├── Welcome screen
    │       ├── "What best describes you?"
    │       │       ├── "I'm looking for coaching" → Player
    │       │       ├── "I'm a coach" → Coach application
    │       │       └── "I manage coaches" → Organization onboarding
    │       └── → Role-specific onboarding
```

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| SH02-EC1 | Email already registered | "This email is already registered. Log in instead?" |
| SH02-EC2 | Phone already registered | "This phone number is already registered. Log in instead?" |
| SH02-EC3 | OTP expired | "Code expired. Resend?" with cooldown timer |
| SH02-EC4 | Weak password | "Password must be at least 8 characters with one number and one letter." |

---

## SH-03: ROLE_SELECT — Role Selection

### Screen Purpose
When a user has multiple roles (e.g., player AND coach), let them choose which experience to enter.

### UX Flow
```
User has multiple roles
    │
    ├── "Welcome back, [Name]"
    ├── "How would you like to continue?"
    │       ├── "As a Player" → Player Home
    │       ├── "As a Coach" → Coach Dashboard
    │       └── "As an Organization Admin" → Org Dashboard
    └── "Switch role" available from profile/settings
```

### Permissions Matrix
| Component | Multi-role User |
|-----------|----------------|
| Role Cards | View, Use |
| "Switch Role" | Use |

---

## SH-04: NOTIFICATIONS — Notifications Center

### Screen Purpose
Central hub for all notifications. Organized by type and priority.

### UX Flow
```
User opens notifications
    │
    ├── Tabs: All | Bookings | Payments | System
    │
    ├── Notification list (sorted by time, newest first):
    │       ├── Each notification:
    │       │       ├── Icon (type indicator)
    │       │       ├── Title (bold if unread)
    │       │       ├── Preview text
    │       │       ├── Time ago
    │       │       ├── Unread dot (if unread)
    │       │       └── Tap → Navigate to relevant screen
    │       │
    │       └── Empty: "No notifications yet"
    │
    ├── Actions:
    │       ├── "Mark all as read"
    │       ├── Swipe to delete
    │       └── "Notification settings" → Settings
```

### Edge Cases
| # | Edge Case | System Behavior |
|---|-----------|----------------|
| SH04-EC1 | 100+ notifications | Paginate. Load 20 at a time. |
| SH04-EC2 | Notification for deleted booking | "This booking was cancelled." Remove action link. |
| SH04-EC3 | Notification for expired promotion | "This offer has expired." |

---

## SH-05 to SH-08: Remaining Shared Screens

### SH-05: SETTINGS — Settings
**Purpose:** Manage account, notifications, privacy, language, and app preferences.
**Key components:** Account info, notification toggles, privacy settings, language selector, theme, help, logout.
**Permission:** All users: View, Edit (own settings).

### SH-06: HELP — Help & Support
**Purpose:** Provide help resources and support contact.
**Key components:** FAQ, contact form, live chat (if available), terms, privacy policy.
**Permission:** All users: View.

### SH-07: PROFILE — Profile (Generic)
**Purpose:** View and edit personal profile information.
**Key components:** Name, photo, contact info, preferences, account actions.
**Permission:** All users: View, Edit (own profile).

### SH-08: ONBOARDING_WELCOME — Welcome / First Launch
**Purpose:** Introduce the app to first-time users. Guide role selection.
**Key components:** Welcome carousel, feature highlights, role selection, skip option.
**Permission:** Guest: View.

---

# Complete Role & Permission Matrix

## Role Definitions

| Role | Description | Can Access |
|------|-------------|------------|
| **Guest** | Unauthenticated user | Login, Register, Landing pages |
| **Player** | User seeking coaching | Player screens, Shared screens |
| **Independent Coach** | Self-employed coach on platform | Coach screens, Shared screens |
| **Resident Coach** | Coach employed by organization | Resident screens, Shared screens |
| **Organization Admin** | Manages coaching operations | Org screens, Shared screens |
| **Branch Manager** | Manages a specific branch | Org screens (branch-scoped), Shared screens |
| **Platform Admin** | CourtZon internal admin | All screens, Admin panel |

## Screen-Level Permission Matrix

| Screen | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|--------|-------|--------|------------|------------|-----------|------------|----------------|
| **Player Screens** |
| P-01 Home | — | View | — | — | — | — | View |
| P-02 Need Selection | — | View, Use | — | — | — | — | View |
| P-03 Session Type | — | View, Use | — | — | — | — | View |
| P-04 Coach List | — | View, Use | — | — | — | — | View |
| P-05 Coach Profile | — | View, Use | View (own) | — | View | View (branch) | View |
| P-06 Time Select | — | View, Use | — | — | — | — | View |
| P-07 Booking Confirm | — | View, Use | — | — | — | — | View |
| P-08 Payment | — | View, Use | — | — | — | — | View |
| P-09 Booking Success | — | View | — | — | — | — | View |
| P-10 Booking Detail | — | View, Use | View (own session) | View (own session) | View (org) | View (branch) | View |
| P-11 Session Rating | — | View, Use | — | — | — | — | View |
| P-12 My Bookings | — | View | — | — | — | — | View |
| P-13 History | — | View | — | — | — | — | View |
| P-14 Wallet | — | View, Use | — | — | — | — | View |
| P-15 Profile | — | View, Edit | — | — | — | — | View |
| **Independent Coach Screens** |
| IC-01 Application | View, Use | — | — | — | — | — | View |
| IC-02 Verification | View, Use | — | — | — | — | — | View |
| IC-03 App Status | View | — | View | — | — | — | View |
| IC-04 Dashboard | — | — | View | — | — | — | View |
| IC-05 Profile Edit | — | — | View, Edit | — | — | — | View |
| IC-06 Pricing | — | — | View, Edit | — | — | — | View |
| IC-07 Service Areas | — | — | View, Edit | — | — | — | View |
| IC-08 Availability | — | — | View, Edit | — | — | — | View |
| IC-09 Bookings | — | — | View, Use | — | — | — | View |
| IC-10 Booking Detail | — | — | View, Use | — | — | — | View |
| IC-11 Earnings | — | — | View | — | — | — | View |
| IC-12 Withdrawal | — | — | View, Use | — | — | — | View |
| IC-13 Reviews | — | — | View, Use | — | — | — | View |
| IC-14 Analytics | — | — | View | — | — | — | View |
| IC-15 Growth | — | — | View | — | — | — | View |
| IC-16 Settings | — | — | View, Edit | — | — | — | View |
| **Resident Coach Screens** |
| RC-01 Invitation | — | — | — | View, Use | View (sent) | — | View |
| RC-02 Onboarding | — | — | — | View, Use | — | — | View |
| RC-03 Home | — | — | — | View | — | — | View |
| RC-04 Calendar | — | — | — | View, Use | View (org) | View (branch) | View |
| RC-05 Earnings | — | — | — | View | View (org) | View (branch) | View |
| RC-06 Performance | — | — | — | View | View (org) | View (branch) | View |
| RC-07 Schedule | — | — | — | View, Use | View (org) | View (branch) | View |
| **Organization Screens** |
| OG-01 Dashboard | — | — | — | — | View | View (branch) | View |
| OG-02 Coach List | — | — | — | — | View, Edit | View (branch) | View |
| OG-03 Coach Profile | — | — | — | — | View, Edit | View (branch) | View |
| OG-04 Applications | — | — | — | — | View, Approve | — | View |
| OG-05 App Review | — | — | — | — | View, Approve, Reject | — | View |
| OG-06 Branch Assign | — | — | — | — | View, Edit | View (own branch) | View |
| OG-07 Pricing | — | — | — | — | View, Edit | — | View |
| OG-08 Revenue Share | — | — | — | — | View, Edit | — | View |
| OG-09 Performance | — | — | — | — | View | View (branch) | View |
| OG-10 Utilization | — | — | — | — | View | View (branch) | View |
| OG-11 Reports | — | — | — | — | View, Export | View (branch) | View |
| **Shared Screens** |
| SH-01 Login | View, Use | — | — | — | — | — | — |
| SH-02 Register | View, Use | — | — | — | — | — | — |
| SH-03 Role Select | — | View, Use | View, Use | View, Use | View, Use | View, Use | View, Use |
| SH-04 Notifications | — | View | View | View | View | View | View |
| SH-05 Settings | — | View, Edit | View, Edit | View, Edit | View, Edit | View, Edit | View, Edit |
| SH-06 Help | View | View | View | View | View | View | View |
| SH-07 Profile | — | View, Edit | View, Edit | View, Edit | View, Edit | View, Edit | View, Edit |

## Component-Level Permission Examples

### Coach Card (P-04, P-05)
| Action | Player | Coach (own) | Org Admin |
|--------|--------|-------------|-----------|
| View photo | Yes | Yes | Yes |
| View name | Yes | Yes | Yes |
| View rating | Yes | Yes | Yes |
| View price | Yes | Yes | Yes |
| Tap to view profile | Yes | Yes (preview) | Yes |
| "Book" button | Yes | No | No |
| "Edit" button | No | Yes (own) | Yes |
| "Suspend" button | No | No | Yes |
| "Delete" button | No | No | Yes (Platform Admin only) |

### Booking Request Card (IC-09)
| Action | Coach | Player | Org Admin |
|--------|-------|--------|-----------|
| View details | Yes (own) | Yes (own) | Yes (org) |
| "Accept" button | Yes | No | No |
| "Decline" button | Yes | No | No |
| "Cancel" button | No | Yes (own) | Yes (org) |
| "Reschedule" button | Yes (own) | Yes (own) | Yes (org) |

### Pricing Input (IC-06, OG-07)
| Action | Coach | Org Admin | Player |
|--------|-------|-----------|--------|
| View price | Yes (own) | Yes (org) | Yes (published) |
| Edit price | Yes (own) | Yes (org) | No |
| View market data | Yes | Yes | No |
| View projected earnings | Yes | Yes | No |
| Override coach price | No | Yes | No |

---

# Micro Interactions Catalog

## Button Interactions

| Interaction | Behavior |
|-------------|----------|
| **Button press** | Scale down 95%, darken background 10%, haptic feedback (light) |
| **Button release** | Scale back to 100%, return to original color, trigger action |
| **Button loading** | Replace text with spinner, disable interaction, maintain width |
| **Button success** | Replace with checkmark animation (200ms), then navigate or show toast |
| **Button error** | Shake animation (300ms), show error toast, re-enable button |

## Card Interactions

| Interaction | Behavior |
|-------------|----------|
| **Card tap** | Subtle scale (98%), navigate to detail |
| **Card long press** | Haptic feedback, show context menu (if applicable) |
| **Card swipe left** | Reveal secondary action (e.g., "Delete", "Archive") |
| **Card swipe right** | Reveal primary action (e.g., "Accept", "Complete") |
| **Card skeleton** | Shimmer animation while loading, fade to content |

## Input Interactions

| Interaction | Behavior |
|-------------|----------|
| **Input focus** | Border color change (brand color), label floats up, cursor blink |
| **Input blur** | Validate on blur. If valid: green border (1s). If invalid: red border + error message |
| **Typing** | Character count updates. Auto-save draft every 5 seconds. |
| **Error** | Red border, error message slides in below, shake animation |
| **Success** | Green border briefly (1s), then returns to default |

## Navigation Interactions

| Interaction | Behavior |
|-------------|----------|
| **Screen transition (forward)** | Slide in from right (300ms ease) |
| **Screen transition (back)** | Slide out to right (300ms ease) |
| **Tab switch** | Content crossfade (200ms), active tab underline slides |
| **Modal open** | Background fade in (200ms), content slides up from bottom (300ms) |
| **Modal close** | Content slides down (200ms), background fades out (200ms) |
| **Bottom sheet open** | Slide up from bottom (300ms), handle bar visible |
| **Bottom sheet drag** | Follow finger, snap to predefined heights (25%, 50%, 90%) |

## Pull-to-Refresh

| Interaction | Behavior |
|-------------|----------|
| **Pull down** | Show refresh indicator at top. Spinner animates. |
| **Release (threshold met)** | Trigger refresh. Show loading spinner. |
| **Release (threshold not met)** | Spinner retracts. No action. |
| **Refresh complete** | Spinner retracts. Content updates. New content fades in. |

## Toast Messages

| Interaction | Behavior |
|-------------|----------|
| **Toast appear** | Slide up from bottom (200ms). Auto-dismiss after 4s (success), 5s (error). |
| **Toast dismiss** | Swipe up to dismiss immediately. Or auto-dismiss. |
| **Toast action** | "Undo" link in toast. Tap to undo action. Toast disappears. |

## Search Interactions

| Interaction | Behavior |
|-------------|----------|
| **Search focus** | Expand search bar. Show recent searches. Keyboard appears. |
| **Typing** | Debounce 300ms. Show live results or suggestions. |
| **Search submit** | Show results. Hide keyboard. Track analytics. |
| **Search clear** | Clear input. Show recent searches again. Reset results. |
| **Search blur (no results)** | "No results for '[query]'. Try different keywords." |

## Calendar Interactions

| Interaction | Behavior |
|-------------|----------|
| **Date tap** | Highlight date. Load slots for that date. Smooth scroll to slots. |
| **Date swipe** | Navigate to next/previous week. Smooth horizontal scroll. |
| **Slot tap** | Highlight slot. Show "Book" button. Subtle scale animation. |
| **Slot unavailable** | Brief shake. Show "Just taken" tooltip. |

## Rating Interactions

| Interaction | Behavior |
|-------------|----------|
| **Star tap** | Fill star with animation (scale up, then settle). Haptic feedback. |
| **Star tap (already selected)** | Unfill star. Reset all stars after selected. |
| **Rating submitted** | Confetti animation (if 5 stars). Checkmark animation. |

## Pull-to-Refresh

| Interaction | Behavior |
|-------------|----------|
| **Pull down** | Show refresh indicator. Spinner animates. |
| **Release** | Trigger data refresh. Show loading. |
| **Complete** | Spinner retracts. Content fades in. |

---

# Notification Catalog

## Player Notifications

| Trigger | Channel | Message | Action |
|---------|---------|---------|--------|
| Booking confirmed | Push + Email | "Your session with Coach [name] is confirmed for [date] at [time]" | View booking |
| Reminder (24h) | Push | "Reminder: Your session with Coach [name] is tomorrow at [time]" | View details |
| Reminder (2h) | Push | "Your session with Coach [name] starts in 2 hours at [branch]" | Get directions |
| Coach cancelled | Push + Email | "Coach [name] cancelled your session. Full refund processed." | Rebook |
| Coach accepted | Push | "Coach [name] accepted your booking for [date]!" | View booking |
| Rating reminder | Push | "How was your session with Coach [name]? Rate now" | Rate session |
| Wallet low | Push | "Your wallet balance is low. Top up to keep booking." | Top up |
| Refund processed | Push + Email | "Your refund of [amount] has been processed." | View details |

## Coach Notifications

| Trigger | Channel | Message | Action |
|---------|---------|---------|--------|
| New booking request | Push | "New booking from [player] for [date] at [time]" | View request |
| Booking cancelled by player | Push | "[Player] cancelled their booking for [date]" | View details |
| New review | Push | "[Player] left a [X]-star review" | View review |
| Earnings credited | Push | "You earned [amount] from your session with [player]" | View earnings |
| Withdrawal processed | Push + Email | "Your withdrawal of [amount] has been processed" | View details |
| Profile viewed | Push | "3 players viewed your profile this week" | View analytics |
| Rating change | Push | "Your rating changed from [old] to [new]" | View details |
| Certification expiring | Push + Email | "Your certification expires in [X] days. Renew to keep your badge." | Renew |

## Organization Notifications

| Trigger | Channel | Message | Action |
|---------|---------|---------|--------|
| New application | Push | "New coach application from [name]" | Review application |
| Coach rating drop | Push | "Coach [name]'s rating dropped below [threshold]" | View performance |
| Branch capacity alert | Push | "Branch [name] is at [X]% capacity this week" | View branch |
| Revenue milestone | Push | "Your monthly revenue reached [amount]!" | View reports |
| Utilization alert | Push | "Branch [name] utilization dropped to [X]%" | View utilization |

---

# UI Inventory (Design System Components)

## Buttons

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Primary Button** | Default, Large, Small, Full-width | Default, Pressed, Loading, Disabled, Success | Yes |
| **Secondary Button** | Default, Large, Small | Default, Pressed, Loading, Disabled | Yes |
| **Text Button** | Default | Default, Pressed, Disabled | Yes |
| **Icon Button** | Default, Circle, Square | Default, Pressed, Disabled | Yes |
| **Floating Action Button** | Default, Extended | Default, Pressed, Loading | Yes |
| **Toggle Button** | On, Off | Default, Pressed, Disabled | Yes |

## Inputs

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Text Input** | Default, With Icon, With Suffix, With Counter | Default, Focus, Filled, Error, Disabled, Loading | Yes |
| **Password Input** | Default, With Toggle | Default, Focus, Error, Disabled | Yes |
| **Phone Input** | With Country Code | Default, Focus, Error | Yes |
| **Number Input** | Default, With Stepper | Default, Focus, Error, Disabled | Yes |
| **Search Input** | Default, With Filter | Default, Focus, Active, With Results | Yes |

## Selectors

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Dropdown Select** | Default, Multi-select | Default, Open, Selected, Disabled | Yes |
| **Radio Button** | Default, Card-style | Default, Selected, Disabled | Yes |
| **Checkbox** | Default, Card-style | Default, Checked, Indeterminate, Disabled | Yes |
| **Toggle/Switch** | Default, Label | On, Off, Disabled | Yes |
| **Segmented Control** | 2-segment, 3-segment | Default, Selected | Yes |
| **Chip/Tag Selector** | Default, Multi-select | Default, Selected, Disabled | Yes |

## Cards

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Coach Card** | List, Grid, Compact | Default, Pressed, Loading, Highlighted | Yes |
| **Booking Card** | Upcoming, Past, Pending | Default, Pressed, Loading | Yes |
| **Session Type Card** | Default, Recommended | Default, Selected, Pressed | Yes |
| **Stats Card** | Number, Chart, Comparison | Default, Loading, Zero | Yes |
| **Review Card** | Default, With Response | Default, Loading | Yes |
| **Alert Card** | Info, Warning, Error, Success | Default, Dismissed | Yes |
| **Empty State Card** | Default, With Illustration | Default | Yes |
| **Profile Card** | Coach, Player, Organization | Default, Loading | Yes |

## Navigation

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Bottom Navigation** | 4-tab, 5-tab | Default, Active tab | Yes |
| **Top Navigation Bar** | Default, With Search, With Actions | Default, Scrolled | Yes |
| **Sidebar Navigation** | Collapsible, Fixed | Open, Collapsed | Yes |
| **Tab Bar** | Underline, Pill, Scrollable | Default, Active | Yes |
| **Breadcrumb** | Default | Default | Yes |
| **Pagination** | Numbers, Load More, Infinite Scroll | Default, Loading, End | Yes |

## Feedback

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Toast/Snackbar** | Success, Error, Warning, Info, With Action | Visible, Dismissing | Yes |
| **Dialog/Modal** | Alert, Confirm, Input, Full-screen | Open, Closing | Yes |
| **Bottom Sheet** | Default, Full, With Handle | Opening, Dragging, Closed | Yes |
| **Tooltip** | Default, With Arrow | Visible, Hidden | Yes |
| **Progress Bar** | Linear, Circular, Determinate, Indeterminate | Default, Complete, Error | Yes |
| **Skeleton Loader** | Text, Card, List, Image | Loading | Yes |
| **Spinner** | Small, Medium, Large | Loading | Yes |

## Data Display

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Avatar** | Image, Initials, Icon | Default, Online, Loading | Yes |
| **Badge** | Count, Dot, Status | Default, Error, Warning | Yes |
| **Rating Stars** | Read-only, Interactive | Filled, Half, Empty | Yes |
| **Price Display** | Default, Strikethrough, Range | Default, Discounted | Yes |
| **Timeline** | Vertical, Horizontal | Default | Yes |
| **Calendar** | Month, Week, Day | Default, Selected, Today | Yes |
| **Time Slot Picker** | Chips, Grid, List | Available, Selected, Unavailable, Taken | Yes |
| **Chart** | Line, Bar, Pie, Donut | Default, Loading, Empty | Yes |
| **Table** | Default, Sortable, Paginated | Default, Loading, Empty | Yes |
| **List** | Default, Divider, Interactive | Default, Loading, Empty | Yes |

## Layout

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Page Header** | Default, With Back, With Actions | Default | Yes |
| **Section Header** | Default, With Count, With Action | Default | Yes |
| **Divider** | Default, Inset, Full | Default | Yes |
| **Spacer** | xs, sm, md, lg, xl | Default | Yes |
| **Safe Area** | Top, Bottom, Both | Default | Yes |

## Map & Location

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Map View** | Default, With Pins, With Radius | Default, Loading, Error | Yes |
| **Branch Pin** | Available, Unavailable, Selected | Default, Pressed | Yes |
| **Distance Display** | Default, With Icon | Default | Yes |
| **Directions Button** | Default | Default, Pressed | Yes |

## Specialized

| Component | Variants | States | Reusable |
|-----------|----------|--------|----------|
| **Booking Slot** | Available, Unavailable, Selected, Taken | Default, Pressed, Loading | Yes |
| **Coach Availability Block** | Available, Reserved, Unavailable | Default, Dragging, Resizing | Yes |
| **Demand Indicator** | High, Medium, Low, None | Default | Yes |
| **Status Badge** | Active, Inactive, Pending, Suspended | Default | Yes |
| **Verification Badge** | Verified, Pending, Expired | Default | Yes |
| **Tier Badge** | Bronze, Silver, Gold, Platinum | Default | Yes |
| **Completion Meter** | Linear, Circular | Default, Complete | Yes |
| **Streak Badge** | Default | Default, Animated | Yes |

---

*Documented: July 2026*
*Version: 1.0 — UX Blueprint*
*Status: Complete*
*Screens: 57 total (15 Player + 16 Independent Coach + 7 Resident Coach + 11 Organization + 8 Shared)*
*Components: 60+ reusable UI components defined*
*Micro Interactions: 20+ interaction patterns documented*
*Notifications: 20+ notification types cataloged*
*Role Matrix: 7 roles × 57 screens fully mapped*
