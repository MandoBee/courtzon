# Coach Collaboration — Canonical State Diagram

> Source of truth for Slice 4 implementation.
> All 13 business decisions from the final review are incorporated.

---

## 1. Complete State Machine

```
                                 ┌─────────────────────────────────────────────────────────────────────────────┐
                                 │                      COACH SESSION LIFECYCLE                                 │
                                 │  (Session State / Payment State / Notification / Timeout / Audit)            │
                                 └─────────────────────────────────────────────────────────────────────────────┘

     ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │  REQUESTED                                                                                        │
     │  Session:     requested                                                                           │
     │  Payment:     none                                                                                │
     │  Timer:       coach_response_deadline (24h configurable)                                           │
     │  Notify:      → Coach: "New session request from [player]" (push + in-app)                        │
     │  Audit:       { actor: playerId, action: 'SESSION.REQUESTED', sessionId }                         │
     │  Rules:       Player may cancel anytime before coach responds (full refund)                       │
     │               Coach may NOT see multiple requests for overlapping time (first-come-first-served)   │
     └──────────────────────┬─────────────────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────────────────────┐
              │             │                             │
              ▼             ▼                             ▼
     ┌──────────────┐ ┌──────────┐              ┌──────────────────────┐
     │  ACCEPTED    │ │ DECLINED │              │ COUNTER_PROPOSAL     │
     │              │ │          │              │                      │
     │  Session:    │ │ Session: │              │  Session:            │
     │  pending_    │ │ cancelled│              │  pending_acceptance  │
     │  acceptance  │ │          │              │  (alternate time)    │
     │              │ │ Payment: │              │                      │
     │  Payment:    │ │ none     │              │  Timer:              │
     │  none (yet)  │ │          │              │  proposal_hold       │
     │              │ │ Notify:  │              │  (15 min config)     │
     │  Timer:      │ │ → Player │              │                      │
     │  proposal_   │ │   "Coach │              │  Notify:             │
     │  hold        │ │   declined│             │  → Player:           │
     │  (15 min     │ │   reason" │              │    "Coach suggested  │
     │  configurable)│ └────┬─────┘              │    new time/location"│
     │              │      │                    └──────────┬───────────┘
     │  Notify:     │      ▼                              │
     │  → Player:   │  [END]                              │
     │    "Coach    │                                      │
     │    accepted! │              ┌───────────────────────┼───────────────┐
     │    Review    │              │                       │               │
     │    proposal" │              ▼                       ▼               ▼
     └──────┬───────┘     ┌──────────────┐        ┌──────────────┐  ┌──────────┐
            │             │ CONFIRMED     │        │ PLAYER_      │  │ TIMEOUT  │
            │             │               │        │ DECLINED     │  │          │
            ▼             │ Session:      │        │              │  │ Session: │
            │             │ confirmed     │        │ Session:     │  │ cancelled│
     ┌──────┴──────┐      │               │        │ cancelled    │  │          │
     │ COURT       │      │ Payment:      │        │              │  │ Payment: │
     │ SELECTION   │      │ player_hold   │        │ Payment:     │  │ none     │
     │             │      │ (escrow)      │        │ none         │  │          │
     │ Scheduling  │      │               │        │              │  │ Notify:  │
     │ Engine      │      │ Timer:        │        │ Notify:      │  │ → Both:  │
     │ calculates  │      │ session_start │        │ → Coach:     │  │  "Proposal│
     │ top 3       │      │ (auto-cancel  │        │  "Player     │  │  expired" │
     │ court       │      │  if no check- │        │  declined"   │  └────┬─────┘
     │ candidates  │      │  in within    │        │ → Player:    │       │
     │             │      │  15 min of    │        │  "You        │       ▼
     │ Coach       │      │  start)       │        │  declined"   │    [END]
     │ approves    │      │               │        └──────┬───────┘
     │ one         │      │ Notify:       │               │
     │             │      │ → Both:       │               ▼
     └──────┬──────┘      │  "Session     │            [END]
            │             │  confirmed!"  │
            ▼             └──────┬────────┘
                               │
                    ┌──────────┴──────────────────────┐
                    │                                  │
                    ▼                                  ▼
     ┌──────────────────────┐              ┌──────────────────────┐
     │  IN_PROGRESS         │              │  CANCELLED           │
     │                      │              │                      │
     │  Session:            │              │  Session:            │
     │  in_progress         │              │  cancelled           │
     │                      │              │                      │
     │  Payment:            │              │  Payment:            │
     │  in_escrow           │              │  refunded | none     │
     │                      │              │  (depends on timing) │
     │  Notify:             │              │                      │
     │  → Both:             │              │  Actor:              │
     │    "Session started" │              │  player | coach |    │
     │                      │              │  system | org        │
     │  Rules:              │              │                      │
     │  Coach marks start   │              │  Reason:             │
     │  Player may cancel   │              │  required string     │
     │  (partial refund)    │              │                      │
     └──────────┬───────────┘              │  Notify:             │
                │                          │  → Both:             │
                │                          │    "Session          │
                ▼                          │    cancelled:        │
     ┌──────────────────────┐              │    [reason]"         │
     │  COMPLETED           │              └──────────┬───────────┘
     │                      │                         │
     │  Session:            │                         ▼
     │  completed           │                      [END]
     │                      │
     │  Payment:            │
     │  released:           │
     │  ├─ Coach: earnings  │
     │  ├─ Org: court fee   │
     │  └─ Platform: comm   │
     │                      │
     │  Notify:             │
     │  → Both:             │
     │    "Session complete"│
     │  → Player:           │
     │    "Rate your coach" │
     │                      │
     │  Rules:              │
     │  Reviews enabled now │
     └──────────┬───────────┘
                │
                ▼
            [END]

     ┌──────────────────────┐
     │  NO_SHOW             │
     │                      │
     │  Session:            │
     │  no_show             │
     │                      │
     │  Payment:            │
     │  released to coach   │
     │  (full session fee)  │
     │  Player forfeits     │
     │                      │
     │  Notify:             │
     │  → Coach:            │
     │    "Player didn't    │
     │    show up. You've   │
     │    been paid in full."│
     │  → Player:           │
     │    "You missed your  │
     │    session. No refund│
     │    issued."          │
     │                      │
     │  Rules:              │
     │  No review allowed   │
     │  Auto-marked 15 min  │
     │  after session start │
     │  if no check-in      │
     └──────────────────────┘
```

---

## 2. Payment State Machine (Independent)

```
  ┌────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
  │ NONE   │───▶│ HELD     │───▶│ IN_ESCROW │───▶│ RELEASED │───▶│ SETTLED  │
  │        │    │ (escrow) │    │           │    │          │    │          │
  │ No     │    │ On       │    │ Session   │    │ On       │    │ Coach    │
  │ payment│    │ confirm  │    │ in_prog   │    │ complete │    │ received │
  │ yet    │    │          │    │           │    │          │    │          │
  └────────┘    └────┬─────┘    └───────────┘    └──────────┘    └──────────┘
                     │
                     ├──────────────────────────────────────────────────┐
                     │                                                  │
                     ▼                                                  ▼
              ┌──────────┐                                      ┌──────────┐
              │ REFUNDED │                                      │ FAILED   │
              │          │                                      │          │
              │ On       │                                      │ Retry    │
              │ cancel   │                                      │ max 3x   │
              │ (by rule)│                                      │ then     │
              └──────────┘                                      │ notify   │
                                                                │ support  │
                                                                └──────────┘
```

---

## 3. Negotiation Policy (Single Round)

```
Player submits request
         │
         ▼
    ┌────────┐
    │ Coach  │
    │decides │
    └───┬────┘
        │
   ┌────┼─────────┬──────────┐
   │    │         │          │
   ▼    ▼         ▼          ▼
Accept Decline  Counter-   Ignore
               Proposal   (auto-
   │    │         │       decline
   │    │         │        24h)
   │    │         ▼
   │    │    ┌────────┐
   │    │    │ Player │
   │    │    │decides │
   │    │    └───┬────┘
   │    │    ┌───┼───┐
   │    │    │   │   │
   │    │    ▼   ▼   ▼
   │    │ Accept Decline Timeout
   │    │   │     │     15min
   │    │   │     │
   ▼    ▼   ▼     ▼
[Proceed to  [END]
 court     (no more
selection]  rounds)

  RULE: Maximum ONE counter-proposal per request.
        No negotiation loops.
```

---

## 4. Court Selection (Scheduling Engine)

```
Coach accepts request
         │
         ▼
┌─────────────────────────────────────┐
│ Scheduling Engine calculates top 3  │
│ court candidates:                   │
│                                     │
│ Criteria:                           │
│ 1. Coach's affiliated orgs          │
│ 2. Coach's service area / region    │
│ 3. Court availability at requested  │
│    time (and alternate if counter)  │
│ 4. Sport match (coach sport ↔       │
│    court sport)                     │
│ 5. Distance from coach/player       │
│ 6. Pricing (court fee)              │
│ 7. Existing scheduling rules        │
│ 8. Player preferences (future)      │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│ Coach reviews top 3 options         │
│                                     │
│ Coach may:                          │
│ - Pick one → proposal sent           │
│ - Request re-search (unlikely)      │
│ - Decline (no suitable court)       │
└──────────────────┬──────────────────┘
                   │
                   ▼
            Proposal sent to player
```

---

## 5. Cancellation Ownership Matrix

| When | Actor | Refund | Commission | Audit Entry |
|------|-------|--------|------------|-------------|
| REQUESTED → CANCELLED | Player | Full | None | `SESSION.CANCELLED` { actor: player, reason, refund: full } |
| REQUESTED → CANCELLED | Coach | N/A | None | `SESSION.CANCELLED` { actor: coach, reason: 'unavailable' } |
| REQUESTED → CANCELLED (24h timeout) | System | Full | None | `SESSION.CANCELLED` { actor: system, reason: 'coach_response_timeout' } |
| ACCEPTED → CANCELLED (15min timeout) | System | Full | None | `SESSION.CANCELLED` { actor: system, reason: 'proposal_expired' } |
| CONFIRMED → CANCELLED (>24h before) | Player | Full | None | `SESSION.CANCELLED` { actor: player, reason, refund: full } |
| CONFIRMED → CANCELLED (<24h before) | Player | 50% | Platform retains | `SESSION.CANCELLED` { actor: player, reason, refund: partial } |
| CONFIRMED → CANCELLED (any time) | Coach | Full to player + penalty | Coach pays | `SESSION.CANCELLED` { actor: coach, reason, penalty } |
| CONFIRMED → CANCELLED | Organization | Full to player | Org pays | `SESSION.CANCELLED` { actor: org, reason } |
| IN_PROGRESS → CANCELLED | Either | Partial (elapsed) | Proportional | `SESSION.CANCELLED` { actor, reason, refund: partial } |
| NO_SHOW (auto) | System | 0% | Full to coach | `SESSION.NO_SHOW` { actor: system, refund: none } |

---

## 6. Notification Suppression Rules

```
RULE: Never send a notification that is obsoleted by a subsequent event.

Examples:
  - Player confirms immediately after coach accepts
    → SUPPRESS "proposal awaiting review" reminder
  - Session is cancelled before start
    → SUPPRESS "session starting soon" reminder
  - Coach declines before player views
    → SUPPRESS "new request" follow-up for coach
  - Player no-shows
    → SUPPRESS "rate your coach" prompt

Implementation:
  Before sending any notification, check current session status.
  If status has advanced past the notification's trigger phase, skip.
```

---

## 7. Timeline Table (Immutable, Append-Only)

```sql
-- Every event is INSERT only. Never UPDATE or DELETE.
-- This is the legal audit trail for the session.

CREATE TABLE coach_session_events (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id  INT NOT NULL REFERENCES coach_sessions(id),
  event       VARCHAR(50) NOT NULL,
    -- 'requested', 'accepted', 'declined', 'counter_proposal',
    -- 'proposal_viewed', 'confirmed', 'court_selected',
    -- 'cancelled', 'started', 'completed', 'no_show',
    -- 'payment_held', 'payment_released', 'payment_refunded',
    -- 'payment_failed', 'notification_sent', 'timeout_fired'
  actor_id    INT,
  actor_role  VARCHAR(20),  -- 'player', 'coach', 'system', 'org', 'platform'
  metadata    JSON,
    -- { reason?, courtId?, alternateTime?, refundAmount?, penalty? }
  created_at  TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),

  INDEX idx_session_events (session_id, created_at)
);
```

---

## 8. Configuration (Environment / DB)

```yaml
# All configurable via settings table or env vars
coach:
  response_deadline_minutes: 1440    # 24 hours
  proposal_hold_minutes: 15
  session_checkin_window_minutes: 15
  no_show_auto_mark_minutes: 15
  max_concurrent_requests_per_slot: 1   # first-come-first-served
  max_counter_proposals_per_request: 1
  court_search_radius_km: 50
  top_court_recommendations: 3
```

---

## 9. First-Come-First-Served Rule

```
When a player requests a time slot that already has a pending request:

  ┌──────────────────────────────────────────────────┐
  │  The first player to submit the request gets the │
  │  slot. The second player sees:                   │
  │                                                  │
  │  "This time slot is no longer available.         │
  │  The coach has other available times.            │
  │  Please select a different time."                │
  │                                                  │
  │  No queue. No pre-emption. First-come wins.      │
  └──────────────────────────────────────────────────┘

  Exception: If the first request expires (coach doesn't respond within 24h),
  the slot becomes available again for new requests.
```

---

## 10. AI Readiness Hooks

```
Each decision point exposes:
  - Input: structured decision context (JSON)
  - Output: structured action (JSON)
  - Confidence score
  - Explanation

Future AI can plug into:
  1. Court recommendation (replace engine ranking with AI ranking)
  2. Time slot suggestion (suggest optimal slot for both parties)
  3. Cancellation prediction (flag high-risk sessions)
  4. Coach recommendation (personalized coach matching)
  5. Dynamic pricing (adjust rates based on demand)

Architecture:
  All decision hooks are behind a feature flag:
  ai.recommendations_enabled

  When disabled: current deterministic logic runs.
  When enabled: AI model receives input → returns ranked output.
```

---

## 11. Implementation Order

| Step | Description | Depends On |
|------|-------------|------------|
| 1 | DB migration: add columns to coach_sessions + create coach_session_events table | — |
| 2 | Backend: `POST /coach-sessions/request` endpoint | Step 1 |
| 3 | Backend: `GET /coach-sessions/requests` + `POST /:id/respond` | Step 2 |
| 4 | Scheduling Engine integration: auto-calculate top 3 courts | Step 3 |
| 5 | Backend: `POST /:id/confirm` + `POST /:id/cancel` | Step 3 |
| 6 | Backend: `POST /:id/start` + `POST /:id/complete` + `POST /:id/no-show` | Step 5 |
| 7 | Backend: coach_session_events logging for all transitions | Step 1 |
| 8 | Backend: notification suppression + timer service | Step 5 |
| 9 | Backend: payment state machine integration | Step 6 |
| 10 | Frontend: Player request flow | Step 2 |
| 11 | Frontend: Coach request management | Step 3 |
| 12 | Frontend: Coach court selection | Step 4 |
| 13 | Frontend: Player proposal review + confirm | Step 5 |
| 14 | Frontend: Session management (start/complete/no-show) | Step 6 |
| 15 | Frontend: Session timeline display | Step 7 |
| 16 | Frontend: Payment status display | Step 9 |
| 17 | Tests (unit + integration + e2e) | All |
| 18 | Docker, deploy, verify | All |

---

## 12. Session Ownership Model

```
State             Owner      Why
──────────────────────────────────────────────────
REQUESTED         Player     Player initiated — controls whether to modify or cancel
ACCEPTED          Coach      Coach has chosen to engage — responsible for court selection
COUNTER_PROPOSAL  Coach      Coach proposed alternative — ball is in player's court
CONFIRMED         Platform   Both parties committed — platform guarantees execution
IN_PROGRESS       Coach      Coach is delivering the service
COMPLETED         Platform   Service delivered — platform finalizes payments + history
CANCELLED         Actor      The party who cancelled owns the decision (player/coach/org/system)
NO_SHOW           System     Deterministic timeout — no owner, just recorded fact

Implications:
  - REQUESTED: only player may cancel
  - PENDING_ACCEPTANCE: only coach may modify court selection
  - CONFIRMED: only platform-initiated cancellation (timeout) or mutual agreement
  - IN_PROGRESS: coach controls start/complete; player may cancel with penalty
  - COMPLETED: immutable — no further transitions allowed
```

---

## 13. Court Reservation Timing

```
Player confirms
       │
       ▼
┌──────────────────────────────────────┐
│  ATOMIC TRANSACTION                  │
│                                      │
│  1. Create court booking             │
│  2. Set session status = confirmed   │
│  3. Link booking to session          │
│  4. Hold payment (escrow)            │
│  5. Log timeline event               │
│  6. Emit CoachSessionConfirmed       │
│                                      │
│  If ANY step fails:                  │
│  → Rollback ALL                      │
│  → Session returns to ACCEPTED       │
│  → Coach notified to retry           │
└──────────────────────────────────────┘

RULE: Court is NEVER reserved before player confirmation.
      Scheduling Engine only recommends. Coach only selects.
      The atomic transaction at confirmation is the only reservation point.
```

---

## 14. Idempotency Requirements

```
Every state transition endpoint MUST handle duplicate requests safely.

┌─────────────────────┬──────────────────────────────────────┐
│ Endpoint            │ Idempotency Strategy                 │
├─────────────────────┼──────────────────────────────────────┤
│ POST /request       │ Returns existing session if identical│
│                     │ request exists (same coach + time)   │
├─────────────────────┼──────────────────────────────────────┤
│ POST /:id/respond   │ If session.status ≠ requested,       │
│                     │ return current state (no-op)         │
├─────────────────────┼──────────────────────────────────────┤
│ POST /:id/confirm   │ If session.status = confirmed,       │
│                     │ return success (no duplicate booking)│
├─────────────────────┼──────────────────────────────────────┤
│ POST /:id/start     │ If session.status = in_progress,     │
│                     │ return success (no-op)               │
├─────────────────────┼──────────────────────────────────────┤
│ POST /:id/complete  │ If session.status = completed,       │
│                     │ return success (no-op)               │
├─────────────────────┼──────────────────────────────────────┤
│ POST /:id/cancel    │ If session.status = cancelled,       │
│                     │ return success (no-op)               │
├─────────────────────┼──────────────────────────────────────┤
│ POST /:id/no-show   │ If session.status = no_show,         │
│                     │ return success (no-op)               │
└─────────────────────┴──────────────────────────────────────┘

Implementation:
  Check current status BEFORE applying transition.
  If target state matches current, return 200 with existing state.
  Never create a second booking or duplicate timeline event.
```

---

## 15. State Transition Validation Matrix

```
Current Status    →    Target Status          Allowed?
─────────────────────────────────────────────────────────
REQUESTED         →    ACCEPTED               ✅
REQUESTED         →    DECLINED               ✅
REQUESTED         →    COUNTER_PROPOSAL       ✅
REQUESTED         →    CANCELLED              ✅ (by player or system)
REQUESTED         →    CONFIRMED              ❌
REQUESTED         →    IN_PROGRESS            ❌
─────────────────────────────────────────────────────────
ACCEPTED          →    CONFIRMED              ✅ (by player)
ACCEPTED          →    CANCELLED              ✅ (timeout or player decline)
ACCEPTED          →    DECLINED               ❌ (coach already accepted)
ACCEPTED          →    REQUESTED              ❌ (no going back)
─────────────────────────────────────────────────────────
CONFIRMED         →    IN_PROGRESS            ✅ (by coach)
CONFIRMED         →    CANCELLED              ✅ (by any actor with penalty rules)
CONFIRMED         →    COMPLETED              ❌
CONFIRMED         →    NO_SHOW                ❌ (must be in_progress first)
─────────────────────────────────────────────────────────
IN_PROGRESS       →    COMPLETED              ✅ (by coach)
IN_PROGRESS       →    CANCELLED              ✅ (by either, partial refund)
IN_PROGRESS       →    NO_SHOW                ❌
IN_PROGRESS       →    CONFIRMED              ❌
─────────────────────────────────────────────────────────
COMPLETED         →    [any]                  ❌ (terminal state)
NO_SHOW           →    [any]                  ❌ (terminal state)
CANCELLED         →    [any]                  ❌ (terminal state)

ENFORCEMENT:
  Central validateTransition(from, to) function.
  Called by every service method before applying state change.
  Throws InvalidTransitionError with allowed-from list in error message.
```

---

## 16. Timer Ownership

```
Timer                       Owner Service           Duration (config)   Fires Action
─────────────────────────────────────────────────────────────────────────────────────
Coach response deadline     SessionTimerService     24h                 Auto-decline → notify player
Proposal hold              SessionTimerService      15 min              Release hold → notify both
Session check-in window    SessionTimerService      15 min after start  Auto no_show → release payment
Court hold expiry          BookingTimerService      15 min              Free court slot (only if not confirmed)

Implementation:
  SessionTimerService is a single responsible service.
  Timers are created when the state enters the timed window.
  Timers are cancelled when the state exits the timed window.
  Example: entering CONFIRMED → cancel proposal hold timer.
  Timers are implemented as BullMQ delayed jobs.
```

---

## 17. Administrator Capabilities

```
Action                    Allowed?   Notes
─────────────────────────────────────────────────────────
Force confirm session     ✅         Requires explicit reason + audit trail
Force cancel session      ✅         Full refund to player; coach still paid
Override timeout          ✅         Extend or cancel any active timer
Override payment state    ✅         Support-only; logs actor + reason
Reassign coach            ❌         Create new session instead
Reassign court            ✅         Only before CONFIRMED; re-run engine
Modify timeline           ❌         Never — immutable audit trail
Delete session            ❌         Sessions are immutable; cancel instead

ALL admin overrides:
  - Require `coaches.admin` permission
  - Log to audit_logs table
  - Log to coach_session_events table
  - Emit domain event with `{ override: true, adminId }`
```

---

## 18. Failure Recovery

```
Operation                 If Fails...                    Recovery
─────────────────────────────────────────────────────────────────────────────
Court booking (atomic)    Booking fails →                  Return ACCEPTED state
                          session stays ACCEPTED           Coach notified to retry
                          no payment taken
                          court NOT reserved

Payment hold              Payment service down →           Allow session to proceed
                          confirm still succeeds           Queue async retry
                          payment_status = pending         If retry fails after 3 attempts
                                                            → notify admin

Notification delivery     Push fails →                     Queue in notification service
                          In-app still delivered           Retry 3x → dead letter
                          Non-blocking

Timeline logging          DB insert fails →                Non-blocking
                          Session still transitions        Log error; retry async
                          Timeline event may be missing     Alert operations

Audit logging             DB insert fails →                Non-blocking
                          Session still transitions        Log error; alert
                          Audit gap possible

Redis lock acquire        Lock timeout →                   Retry 3x with 500ms backoff
                          Return conflict error            User retries manually

Scheduling Engine         Engine timeout →                 Cache last-good results
                          Return cached candidates         Coach can still select
                          Stale data possible              Refresh on next search
```

---

## 19. Domain Events

```
Every successful state transition emits exactly ONE canonical domain event.

┌────────────────────────────┬──────────────────┬──────────────────────────────┐
│ Event                      │ Payload           │ Consumers                    │
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionRequested      │ sessionId,        │ NotificationService,         │
│                            │ playerId,         │ SessionTimerService,         │
│                            │ coachId,          │ AnalyticsService             │
│                            │ startTime         │                              │
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionAccepted       │ sessionId,        │ NotificationService,         │
│                            │ coachId, playerId │ SchedulingEngine (court search)│
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionDeclined       │ sessionId,        │ NotificationService,         │
│                            │ reason            │ AnalyticsService             │
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionCounterProposed│ sessionId,        │ NotificationService,         │
│                            │ proposedStartTime │ SessionTimerService          │
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionConfirmed      │ sessionId,        │ NotificationService,         │
│                            │ bookingId,        │ BookingService,              │
│                            │ courtId,          │ PaymentService,              │
│                            │ totalPrice        │ SessionTimerService,         │
│                            │                   │ AnalyticsService,            │
│                            │                   │ OrgDashboardService          │
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionStarted        │ sessionId,        │ NotificationService,         │
│                            │ startTime         │ SessionTimerService          │
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionCompleted      │ sessionId,        │ PaymentService (release),    │
│                            │ endTime           │ NotificationService,         │
│                            │                   │ AnalyticsService,            │
│                            │                   │ CoachStatsService,           │
│                            │                   │ PlayerHistoryService,        │
│                            │                   │ OrgDashboardService,         │
│                            │                   │ RevenueService               │
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionCancelled      │ sessionId,        │ PaymentService (refund),     │
│                            │ actor, reason,    │ NotificationService,         │
│                            │ refundAmount      │ BookingService (release),    │
│                            │                   │ AnalyticsService,            │
│                            │                   │ CoachStatsService            │
├────────────────────────────┼──────────────────┼──────────────────────────────┤
│ CoachSessionNoShow         │ sessionId,        │ PaymentService (release to   │
│                            │                   │   coach),                    │
│                            │                   │ NotificationService,         │
│                            │                   │ AnalyticsService             │
└────────────────────────────┴──────────────────┴──────────────────────────────┘

Architecture rule:
  - Services emit events (NOT call other services directly)
  - Event handlers react to events (NOT invoked by the service)
  - Keep the emitting service decoupled from consumers
```

---

## 20. Reporting Impact

```
Transition              Analytics Impact
───────────────────────────────────────────────────────────────
CoachSessionRequested   → Increment: total_requests (coach)
                          → Increment: sessions_requested (player)
                          
CoachSessionAccepted    → Increment: sessions_accepted (coach)
                          
CoachSessionConfirmed   → Increment: total_bookings (org court)
                          → Increment: sessions_booked (player)
                          → Increment: revenue_projected (org)
                          → Update: court_occupancy (org)
                          
CoachSessionStarted     → Increment: sessions_in_progress (coach)
                          
CoachSessionCompleted   → Decrement: sessions_in_progress (coach)
                          → Increment: sessions_completed (coach)
                          → Increment: sessions_attended (player)
                          → Increment: revenue_realized (coach)
                          → Increment: revenue_realized (org court fee)
                          → Increment: commission_earned (platform)
                          → Update: coach_rating_pending (player)
                          
CoachSessionCancelled   → Decrement: sessions_in_progress (coach)
                          → Increment: sessions_cancelled (actor)
                          → Decrement: revenue_projected (org)
                          → Update: court_occupancy (org)
                          → Increment: refunds_processed (platform)
                          
CoachSessionNoShow      → Increment: no_show_count (player)
                          → Increment: revenue_realized (coach, full)
                          → Decrement: sessions_in_progress (coach)
```

---

## 21. Architecture Rules

```
1. The State Diagram is frozen.
   └── Implementation MUST follow the diagram.
   └── If implementation reveals a problem:
       1. Update the diagram FIRST
       2. Then update the code
   └── The diagram remains the single source of truth.

2. Every state transition endpoint MUST be idempotent.
   └── Check current status before applying transition.
   └── Return success if already in target state.

3. Every state transition MUST validate allowed-from states.
   └── Central validateTransition(from, to) function.
   └── Never inline transition logic in controllers.

4. Court is NEVER reserved before player confirmation.
   └── Atomic transaction at confirmation is the only reservation point.

5. Every successful transition emits exactly ONE domain event.
   └── Services emit events — they do NOT call other services directly.
   └── Event handlers react to events.

6. Timeline events are append-only. Never UPDATE or DELETE.
   └── The timeline is the legal audit trail.

7. Payment state machine is INDEPENDENT from session state machine.
   └── A session can be confirmed while payment is pending/retrying/refunded.

8. All timers are owned by SessionTimerService.
   └── Create on state entry, cancel on state exit.
   └── Implemented as BullMQ delayed jobs.

9. Duplicate notifications are suppressed.
   └── Check current status before sending.
   └── If status has passed the trigger phase, skip.
```
