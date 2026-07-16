# CourtZon Coach Platform — Product Decision Review

> **Phase:** Product Decision Review (Pre-Implementation)
> **Version:** 1.0
> **Date:** July 2026
> **Prerequisite:** Phase 0 (UX Validation) complete, Implementation Roadmap approved
>
> **This document makes business decisions.** No code, no redesigns, no implementation. Every decision here determines what gets built and how it works.

---

## Part 1: Priority Classification

### Classification System

| Priority | Meaning | Gate |
|----------|---------|------|
| **P0** | Cannot begin ANY implementation until resolved | Blocks Slice 0 |
| **P1** | Must be resolved before the affected vertical slice starts | Blocks specific slice |
| **P2** | Can be resolved during implementation without blocking | No gate |

---

### B-1: Booking Confirmation Workflow

**Priority: P0**

**Why P0:** This decision determines the fundamental business model of the platform. It affects:
- Payment flow (when money moves)
- Booking state machine (what states exist)
- Notification strategy (what messages are sent)
- Refund policy (when refunds trigger)
- Coach UX (accept/decline vs instant confirm)
- Player UX (confirmation certainty vs waiting)
- Scheduling Engine integration (when slots are locked)

Every slice that touches bookings (Slices 1, 2, 4, 5, 6, 7) depends on this decision. It cannot be deferred.

---

### B-2: Marketplace Screens

**Priority: P1**

**Why P1:** Marketplace affects Slice 1 (Player Booking Flow) but only the navigation shell. The core booking flow works without Marketplace. If Marketplace is deferred, the bottom nav changes but the booking journey is unaffected.

Blocks: Slice 1 (navigation design), but not core booking logic.

---

### B-3: Chat/Messaging

**Priority: P1**

**Why P1:** Chat affects Slice 1 (Player Booking Flow) — specifically the "Message Coach" button on P-05 and P-10. If chat is deferred, those buttons are removed or hidden. The booking flow continues working without chat.

Blocks: Slice 1 (player-coach communication), but not booking completion.

---

### B-4: Orphan Screens (No Entry Points)

**Priority: P1**

**Why P1:** Orphan screens affect navigation design in Slice 0 (Foundation) and specific slices where those screens belong. The navigation shell must be correct before building screens.

Blocks: Slice 0 (navigation), Slices 2, 5, 6, 7, 8, 9 (specific screens).

---

### B-5: Dead-End Screens (No Exit Points)

**Priority: P1**

**Why P5:** Dead-end screens affect user flow within specific slices. They don't block slice start but must be resolved before the slice is complete.

Blocks: Completion of affected slices, not start.

---

### B-6: IC-02 Verification Screen Orphaned

**Priority: P1**

**Why P1:** This affects Slice 3 (Coach Onboarding). The verification step is critical for coach quality but doesn't block Slice 0 or Slice 1.

Blocks: Slice 3 (Coach Onboarding flow).

---

### B-7: Pricing Authority Conflict

**Priority: P0**

**Why P0:** This decision determines who controls pricing — the fundamental revenue model. It affects:
- Player-facing prices (what they see and pay)
- Coach earnings (what they receive)
- Organization revenue (what they manage)
- Pricing UI in IC-06 and OG-07
- Revenue sharing calculations in OG-08
- Payment processing in Slice 1

Every slice that touches money (Slices 1, 2, 5, 7, 9) depends on this decision.

---

### B-8: Date/Time Format Standard

**Priority: P2**

**Why P2:** This is a consistency standard, not a business decision. It can be defined during Slice 0 implementation and applied across all subsequent slices. It doesn't block any slice start.

Blocks: Nothing. Resolved during implementation.

---

### Priority Summary

| Issue | Priority | Blocks |
|-------|----------|--------|
| B-1: Booking Confirmation | **P0** | Slices 1, 2, 4, 5, 6, 7 |
| B-7: Pricing Ownership | **P0** | Slices 1, 2, 5, 7, 9 |
| B-2: Marketplace | **P1** | Slice 1 (navigation only) |
| B-3: Chat | **P1** | Slice 1 (communication only) |
| B-4: Orphan Screens | **P1** | Slice 0 (navigation) |
| B-5: Dead-End Screens | **P1** | Completion of affected slices |
| B-6: IC-02 Verification | **P1** | Slice 3 (coach onboarding) |
| B-8: Date/Time Format | **P2** | Nothing (during implementation) |

---

## Part 2: Decision Analysis

---

### B-1: Booking Confirmation Workflow

#### Problem

The UX Blueprint contains a fundamental contradiction:
- **P-09** tells the player: "Booking Confirmed! Coach [name] has been notified"
- **IC-09** shows the coach: "New Booking Request — Accept / Decline"
- Player paid for a booking that the coach can still reject

This creates a trust and financial integrity problem. The player believes the booking is final. The coach can still decline it. If the coach declines, the player needs a refund — but no refund flow is defined for coach-initiated declines.

#### Why It Exists

The UX Blueprint was designed from two perspectives:
1. Player journey assumes instant confirmation (modern marketplace model)
2. Coach journey assumes request-based confirmation (traditional service model)

These two models were never reconciled.

#### Business Models

##### Model A: Instant Confirmation (Airbnb/Uber Model)

**How it works:**
1. Player selects slot and pays
2. Booking is immediately confirmed
3. Coach sees "Upcoming Session" — no accept/decline
4. Coach can cancel (with policy penalties)
5. Slot is locked in Scheduling Engine at payment

**Pros:**
- Simplest player experience — instant certainty
- Highest conversion rate (no waiting anxiety)
- Slot is guaranteed — no double-booking risk
- Matches modern marketplace expectations
- Simplest technical implementation

**Cons:**
- Coach has no control over who books them
- Coach may get bookings they can't fulfill (illness, emergency)
- Cancellation rate may increase (coaches cancel after confirming)
- No "screening" capability for coaches
- Coach retention risk (feeling controlled)

**Business Impact:**
- Higher player satisfaction (instant gratification)
- Higher booking volume (less friction)
- Higher cancellation rate (coaches cancel more)
- Lower coach satisfaction (less control)

**UX Impact:**
- P-09: "Booking Confirmed!" ✅ (already designed)
- IC-09: Remove Accept/Decline, show "Upcoming" directly
- IC-10: Add "Cancel" action with reason selection
- P-10: Add "Coach cancelled" flow with auto-refund

**Technical Impact:**
- Scheduling Engine: Lock slot at payment (already implemented)
- Payment: Process immediately
- Notifications: "New booking" to coach (informational, not action-required)
- Refund: Auto-refund on coach cancellation (within policy window)

---

##### Model B: Request-Accept (Houzz/Thumbtack Model)

**How it works:**
1. Player selects slot and submits request
2. Player is NOT charged yet
3. Coach has 24h to Accept/Decline
4. If accepted: Player is charged, booking confirmed
5. If declined: Player is notified, no charge
6. If timeout: Auto-decline, player notified

**Pros:**
- Coach has control — can screen bookings
- No refund needed on decline (no charge happened)
- Coach satisfaction higher (feeling of control)
- Reduces coach cancellations (they accepted deliberately)
- Better coach-player matching (coach confirms availability)

**Cons:**
- Player uncertainty (waiting for acceptance)
- Lower conversion rate (abandonment during wait)
- 24h window may lose impatient players
- More complex state machine (Pending → Accepted → Confirmed)
- Slot not locked during wait (another player could take it)

**Business Impact:**
- Lower player satisfaction (waiting anxiety)
- Lower booking volume (friction)
- Lower cancellation rate (committed bookings)
- Higher coach satisfaction (control)

**UX Impact:**
- P-09: Change to "Request Sent — waiting for coach confirmation"
- P-07: Remove payment until acceptance
- IC-09: Keep Accept/Decline as designed
- Add timeout notification: "Coach didn't respond. Try another coach?"

**Technical Impact:**
- Scheduling Engine: Reserve slot (not lock) during wait period
- Payment: Hold payment method, charge on acceptance
- Notifications: "New request" to coach (action required)
- Timeout: Auto-decline after 24h, notify player

---

##### Model C: Hybrid Instant + Request (Booking.com Model)

**How it works:**
1. Coach sets "Instant Book" or "Request to Book" per session type
2. Instant Book: Player pays, booking confirmed immediately (Model A)
3. Request to Book: Player submits, coach accepts/declines (Model B)
4. Player sees which model each coach uses before booking
5. Default: Instant Book for established coaches, Request for new coaches

**Pros:**
- Flexibility — coaches choose their comfort level
- Player can choose based on urgency
- New coaches get screening; established coaches get convenience
- Market-driven — players prefer instant coaches, book them more
- Graduated trust system

**Cons:**
- Most complex to implement
- Two code paths for booking flow
- Two state machines to maintain
- Player confusion (why is this coach instant and that one isn't?)
- Coach confusion (which mode should I use?)

**Business Impact:**
- Balanced satisfaction (both sides get what they want)
- Moderate conversion rate (depends on coach mode mix)
- Moderate cancellation rate
- Higher implementation cost

**UX Impact:**
- P-04: Show "Instant Book" badge on coach cards
- P-07: Show "This coach accepts instant bookings" or "This coach reviews requests"
- P-09: Conditional — "Confirmed!" (instant) or "Request Sent" (request)
- IC-09: Conditional — no accept/decline (instant) or accept/decline (request)

**Technical Impact:**
- Scheduling Engine: Two modes — lock (instant) or reserve (request)
- Payment: Two flows — immediate charge (instant) or hold (request)
- State machine: Two paths — Confirmed directly, or Pending → Confirmed
- Notifications: Different templates per mode

---

##### Model D: Platform-Mediated (Zocdoc Model)

**How it works:**
1. Player submits booking request
2. Platform (not coach) confirms availability instantly
3. If platform confirms: Booking is final, player charged
4. If platform can't confirm: Suggest alternatives
5. Coach sees confirmed bookings — no accept/decline

**Pros:**
- Player gets instant confirmation (like Model A)
- Coach gets no unwanted bookings (like Model B)
- Platform controls quality (can reject mismatched bookings)
- Scheduling Engine handles all logic (no human decision)

**Cons:**
- Requires sophisticated matching algorithm
- Platform becomes the decision-maker (liability)
- Coach feels less control (platform decides)
- High technical complexity (real-time availability + matching)
- Platform support burden (disputes about matching)

**Business Impact:**
- Highest player satisfaction (instant + guaranteed)
- Moderate coach satisfaction (less control, but no bad bookings)
- Highest technical cost
- Best matching quality

**UX Impact:**
- P-09: "Booking Confirmed!" (platform confirmed)
- P-08: Payment processed after platform confirmation
- IC-09: "Confirmed Sessions" only — no pending requests
- Error state: "We couldn't find an exact match. Here are alternatives."

**Technical Impact:**
- Scheduling Engine: Must resolve availability in real-time at booking
- Payment: Process after platform confirmation
- Matching algorithm: Multi-factor (availability, specialty, location, price)
- Fallback: Alternative suggestions if exact match fails

---

#### Recommendation

**Model A: Instant Confirmation** for Version 1.

**Rationale:**
1. Simplest to implement — fastest to market
2. Highest player conversion — critical for early adoption
3. Scheduling Engine already supports slot locking — no engine changes needed
4. Cancellation policy already exists in UX Blueprint — handles coach cancellations
5. Coach screening can be added later (Model C) once trust is established
6. Matches the dominant marketplace pattern (Uber, Airbnb, ClassPass)

**Migration path:** If coach screening becomes necessary, introduce "Request to Book" as an opt-in coach setting in a future release (Model C).

---

#### Decision Required

**Approve Model A: Instant Confirmation** — or specify alternative.

---

### B-7: Pricing Ownership

#### Problem

Two screens define pricing with conflicting authority:
- **IC-06** (Coach Pricing): Coach sets their own prices freely, with no mention of org constraints
- **OG-07** (Org Pricing): Organization sets org-wide, branch-specific, and coach-specific pricing rules

No precedence rule exists. If a coach sets their price to 400 EGP but the org sets their price to 300 EGP, which price does the player see?

#### Why It Exists

The UX Blueprint designed IC-06 and OG-07 independently without defining the relationship between them. The coach journey assumes coach autonomy. The organization journey assumes org control.

#### Pricing Authority Models

##### Model 1: Organization Controls All (Top-Down)

**How it works:**
- Organization sets pricing per session type per branch
- Coach pricing (IC-06) is read-only — coach sees org-set price
- Coach cannot override org pricing
- Organization can set coach-specific overrides (higher or lower)
- Revenue sharing is org-defined

**Pros:**
- Simplest pricing logic — one authority
- Consistent player experience (same price regardless of coach)
- Organization controls revenue完全
- No pricing conflicts

**Cons:**
- Coach feels undervalued (no pricing control)
- Coach retention risk (can't price themselves competitively)
- Organization overhead (must set prices for everything)
- Not suitable for independent coaches (who should control their own pricing)

**Business Impact:**
- Organization: Full control ✅
- Coach: No control ❌
- Player: Consistent pricing ✅
- Revenue: Predictable ✅

---

##### Model 2: Coach Controls Within Bounds (Guardrails)

**How it works:**
- Organization sets floor and ceiling per session type per branch
- Coach sets their actual price within those bounds
- If coach doesn't set a price, org default applies
- Organization can see all coach prices but override only with justification
- Revenue sharing calculated on actual price

**Pros:**
- Coach has autonomy within safe range
- Organization maintains quality (no too-low prices)
- Player sees coach-specific pricing (market dynamics)
- Balance of control

**Cons:**
- More complex pricing logic (bounds checking)
- Coach may cluster at floor price (race to bottom)
- Organization must maintain bounds (ongoing work)
- Price comparison becomes complex for players

**Business Impact:**
- Organization: Moderate control ✅
- Coach: Moderate control ✅
- Player: Varied pricing (market-driven) ⚠️
- Revenue: Variable (depends on coach pricing) ⚠️

---

##### Model 3: Hybrid — Resident vs Independent (Split Authority)

**How it works:**
- **Resident Coach:** Organization controls pricing (Model 1) — coach is employee
- **Independent Coach:** Coach controls pricing freely (no org bounds) — coach is contractor
- Organization can see independent coach prices but cannot override
- Organization sets revenue share percentage for independent coaches
- Different pricing UI for each coach type

**Pros:**
- Matches real-world business relationships (employees vs contractors)
- Resident coaches: consistent pricing (org brand)
- Independent coaches: full autonomy (market competition)
- Clear separation of concerns

**Cons:**
- Two pricing systems to maintain
- Player sees different pricing models (confusing?)
- Organization has less control over independent coach pricing
- Revenue sharing more complex (fixed vs percentage)

**Business Impact:**
- Organization: Full control (resident), Limited control (independent) ✅
- Coach: No control (resident), Full control (independent) ✅
- Player: Consistent (resident), Varied (independent) ⚠️
- Revenue: Predictable (resident), Variable (independent) ⚠️

---

##### Model 4: Platform Sets Base, Others Override (Layered)

**How it works:**
- Platform sets base pricing per session type (market rate)
- Organization can override per branch (higher or lower)
- Coach can override within org range (if org allows)
- Final price = Platform base → Org override → Coach override
- Each layer can set min/max bounds for the next

**Pros:**
- Market-driven base (competitive)
- Organization can adjust for local market
- Coach can differentiate (premium pricing)
- Most flexible model

**Cons:**
- Most complex pricing logic (3 layers)
- Debugging price disputes is hard ("which layer set this price?")
- Player may see different prices for same session type (trust issue)
- Highest implementation cost

**Business Impact:**
- All parties have some control ✅
- Most complex to manage ❌
- Highest implementation cost ❌

---

#### Recommendation

**Model 3: Hybrid — Resident vs Independent**

**Rationale:**
1. Matches the business reality — resident coaches are employees, independent coaches are contractors
2. Resident coaches: org controls pricing (consistent brand, predictable revenue)
3. Independent coaches: coach controls pricing (market competition, autonomy)
4. Simplest mental model — "I'm an employee, org sets my price" vs "I'm independent, I set my price"
5. Organization still sees all prices (visibility without control for independents)
6. Revenue sharing is cleaner — fixed for residents, percentage for independents

**Implementation:**
- IC-06: Show "Your price" (editable for independents, read-only for residents with org price shown)
- OG-07: Show "Resident pricing" (org controls) and "Independent pricing" (view-only, revenue share %)
- P-03/P-04/P-05: Show price (same UI regardless of coach type — player doesn't see the difference)
- P-07: Show price breakdown (court fee + coach fee + platform fee — same structure)

---

#### Decision Required

**Approve Model 3: Hybrid — Resident vs Independent** — or specify alternative.

---

### B-2: Marketplace Screens

#### Problem

The player bottom nav includes "Marketplace" with Browse Clinics and Browse Events, but no screen IDs exist for these screens in the 57-screen inventory. The Marketplace tab leads to undefined screens.

#### Why It Exists

The navigation architecture was designed before the screen inventory. "Marketplace" was included as a future feature placeholder but never broken into specific screens.

#### Analysis

**Marketplace Value Proposition:**
- Browse Clinics: Find group training sessions (already covered by P-03 Session Type Selection → "Group Clinic")
- Browse Events: Find tournaments, workshops, social events (not in current scope)

**Current Coverage:**
- Individual coaching: Covered by P-01 through P-09 (Player Booking Flow)
- Group sessions: Covered by P-03 "Group Clinic" session type → P-04 Coach List → P-06 Time Selection
- Events: NOT covered anywhere

**Options:**

##### Option A: Include Marketplace in V1

**Pros:**
- Complete player experience from day one
- Bottom nav matches marketing materials
- Events can drive engagement

**Cons:**
- Adds 2+ screens to V1 scope
- Events require event management system (not built)
- Delays V1 launch
- Group clinics already work through booking flow

**Business Impact:** Delays V1 by estimated 2-4 weeks.
**UX Impact:** Bottom nav has 4 tabs: Home | Bookings | Marketplace | More.

##### Option B: Defer Marketplace to V2

**Pros:**
- V1 scope remains focused on individual coaching
- Faster V1 launch
- Group clinics still work through booking flow
- Events can be designed properly in V2

**Cons:**
- Bottom nav has only 3 tabs: Home | Bookings | More
- Marketing must explain "Marketplace coming soon"
- Players looking for group sessions must use "Find a Coach" flow

**Business Impact:** V1 launches faster. Marketplace in V2.
**UX Impact:** Bottom nav: Home | Bookings | More. "Find a Coach" covers all session types.

##### Option C: Rename "Marketplace" to "Find a Coach" (Merge)

**Pros:**
- Bottom nav becomes: Home | Bookings | Find a Coach | More
- "Find a Coach" covers individual, group, clinics (all session types)
- No new screens needed — P-04 already handles all types
- Clean navigation

**Cons:**
- "Find a Coach" is a verb, not a noun (inconsistent with other tabs)
- Loses the "Marketplace" concept for future expansion

**Business Impact:** No delay. Clean V1.
**UX Impact:** Bottom nav: Home | Bookings | Find a Coach | More.

---

#### Recommendation

**Option B: Defer Marketplace to V2**

**Rationale:**
1. Group clinics already work through the booking flow (P-03 → P-04 → P-06)
2. Events require a separate event management system — not in V1 scope
3. V1 should focus on individual coaching (core value proposition)
4. Bottom nav with 3 tabs is simpler and cleaner for V1
5. Marketplace can be added in V2 with proper screen design

**V1 Bottom Nav:** Home | Bookings | More
**V2 Addition:** Home | Bookings | Marketplace | More (Marketplace added when events/clinic browsing is designed)

---

#### Decision Required

**Approve Option B: Defer Marketplace to V2** — or specify alternative.

---

### B-3: Chat/Messaging

#### Problem

P-10 references "Message Coach → Chat screen" but no chat screen exists. Players and coaches have no defined way to communicate within the app.

#### Why It Exists

Chat was assumed to be a standard feature but never designed as part of the UX Blueprint. The notification system handles one-way communication (platform → user), but two-way communication (user ↔ user) was not addressed.

#### Analysis

**Communication Needs:**

| Need | Frequency | Urgency | Current Solution |
|------|-----------|---------|------------------|
| Pre-booking questions | Medium | Medium | None (player must book blind) |
| Session preparation | Low | Low | None (coach has no way to send prep info) |
| Schedule changes | Low | High | Notifications (one-way) |
| Post-session feedback | Low | Low | Rating system (P-11) |
| Cancellation communication | Low | High | Notifications (one-way) |
| Support issues | Low | High | Help & Support (SH-06) |

**Options:**

##### Option A: Full Chat in V1

**Pros:**
- Complete communication channel
- Player can ask questions before booking
- Coach can send preparation instructions
- Modern app expectation

**Cons:**
- Chat is a complex feature (real-time, message history, read receipts, media)
- Requires WebSocket infrastructure
- Requires moderation system (abuse prevention)
- Requires notification system for new messages
- Delays V1 by estimated 4-6 weeks
- Support burden (message disputes)

**Business Impact:** Delays V1 significantly.
**UX Impact:** New SH-09 CHAT screen + chat UI in P-05, P-10, IC-09, IC-10.

##### Option B: Structured Messages (No Free Chat)

**How it works:**
- Pre-defined message templates: "Running 5 min late", "Where is the court?", "Can we reschedule?"
- Player sends template message → Coach receives notification
- Coach responds with template → Player receives notification
- No free-form text input
- Message history visible in booking detail

**Pros:**
- Simple to implement (notification system already exists)
- No moderation needed (templates are safe)
- Covers 80% of use cases
- Faster V1 launch

**Cons:**
- Feels restrictive (can't ask custom questions)
- Not a "real" chat experience
- Players may want to ask specific questions

**Business Impact:** Minimal delay. Uses existing notification infrastructure.
**UX Impact:** Template buttons on P-05, P-10, IC-09, IC-10. No new screen.

##### Option C: Defer Chat to V2

**How it works:**
- Remove "Message Coach" buttons from P-05 and P-10
- Notifications handle all platform communication
- Players book without pre-booking communication
- Coaches send prep info via booking detail notes (not real-time)
- Chat designed properly in V2

**Pros:**
- Fastest V1 launch
- Notifications are sufficient for V1 scope
- Chat can be designed with user feedback
- No moderation system needed

**Cons:**
- Players can't ask questions before booking
- Coaches can't send prep instructions in real-time
- Feels less personal (no direct communication)
- May reduce booking conversion (uncertainty)

**Business Impact:** Fastest V1. Chat in V2.
**UX Impact:** Remove "Message Coach" buttons. Notifications handle all communication.

##### Option D: External Link (WhatsApp/SMS)

**How it works:**
- "Message Coach" button opens WhatsApp or SMS with pre-filled message
- Communication happens outside the app
- No in-app chat infrastructure needed

**Pros:**
- Zero implementation cost
- Players and coaches already use WhatsApp
- No moderation needed
- Familiar experience

**Cons:**
- Communication leaves the app (loss of control)
- No message history in the app
- No platform moderation (abuse risk)
- Professionalism concern (personal phone numbers)
- Privacy concern (phone number sharing)

**Business Impact:** Zero delay. Zero implementation cost.
**UX Impact:** "Message Coach" opens external app.

---

#### Recommendation

**Option C: Defer Chat to V2**

**Rationale:**
1. Notifications handle all platform communication (bookings, cancellations, reminders)
2. Pre-booking questions are rare — most players book based on profile and reviews
3. Post-booking communication is handled by booking detail notes (coach prep notes)
4. Chat is a complex feature — better to design it properly with user feedback
5. V1 should focus on the core booking flow, not communication features
6. Rating system (P-11) handles post-session feedback

**V1 Communication:** Notifications + Booking Detail Notes
**V2 Addition:** Full chat system (SH-09 CHAT)

**If pre-booking communication is critical:** Use Option B (Structured Messages) as a compromise — template buttons on P-05 and P-10 that send notifications to the coach.

---

#### Decision Required

**Approve Option C: Defer Chat to V2** — or specify alternative.

---

### B-4: Orphan Screens (No Entry Points)

#### Problem

11 screens have no documented entry points. Users cannot reach them through any navigation path.

#### Why It Exists

The UX Blueprint documented screens in isolation without completing the navigation graph. The "More" tab and sidebar were assumed to provide access but never explicitly mapped.

#### Resolution

This is a documentation issue, not a business decision. The screens exist but need navigation paths.

**Required Navigation Additions:**

| Screen | Entry Point | Location |
|--------|------------|----------|
| P-14 PLAYER_WALLET | More → Wallet | Bottom nav "More" tab |
| P-15 PLAYER_PROFILE | More → Profile | Bottom nav "More" tab |
| IC-12 COACH_WITHDRAWAL | Earnings → Withdraw | IC-11 "Withdraw" button |
| IC-14 COACH_ANALYTICS | More → Analytics | Bottom nav "More" tab |
| IC-15 COACH_GROWTH | More → Growth | Bottom nav "More" tab |
| RC-05 RESIDENT_EARNINGS | More → Earnings | Bottom nav "More" tab |
| RC-06 RESIDENT_PERFORMANCE | More → Performance | Bottom nav "More" tab |
| RC-07 RESIDENT_SCHEDULE | Calendar → Schedule | Bottom nav "Calendar" tab |
| OG-03 through OG-11 | Sidebar navigation | Org sidebar menu |

**Decision Required:** Approve the navigation paths above.

---

### B-5: Dead-End Screens (No Exit Points)

#### Problem

6 screens have no documented exit points. Users who reach these screens cannot navigate away without using system back.

#### Resolution

This is a documentation issue, not a business decision. Every screen needs at least a "Back" button.

**Required Exit Point Additions:**

| Screen | Exit Points |
|--------|------------|
| P-13 PLAYER_HISTORY | Back → Home, Tap booking → P-10 |
| P-14 PLAYER_WALLET | Back → More, Top up → Payment flow |
| P-15 PLAYER_PROFILE | Back → More, Save → Stay, Logout → Login |
| IC-02 COACH_VERIFICATION | Back → IC-01, Submit → IC-03 |
| IC-03 COACH_APP_STATUS | Back → Home, Dashboard → IC-04 |
| RC-02 RESIDENT_ONBOARDING | Back → RC-01, Complete → RC-03 |

**Decision Required:** Approve the exit points above.

---

### B-6: IC-02 Verification Screen Orphaned

#### Problem

IC-01 Application exits directly to IC-03 Status, skipping IC-02 Verification entirely. The verification step (upload ID, certificates, video intro) is never reached.

#### Why It Exists

The IC-01 → IC-03 flow was documented without including the intermediate verification step. The verification upload is critical for coach quality assurance.

#### Resolution

**Correct Flow:** IC-01 (Application Form) → IC-02 (Verification Upload) → IC-03 (Application Status)

**Required Changes:**
- IC-01 exit: Submit → IC-02 (not IC-03)
- IC-02 entry: From IC-01 after form submission
- IC-02 exit: Upload complete → IC-03

**Decision Required:** Approve the corrected flow.

---

### B-8: Date/Time Format Standard

#### Problem

No date/time format is defined. Durations mix "60 min", "1 hour", "24h". Times use "4pm" vs "4:00 PM".

#### Resolution

This is a consistency standard, not a business decision.

**Proposed Standards:**

| Context | Format | Example |
|---------|--------|---------|
| Date | DD/MM/YYYY | 15/07/2026 |
| Time | HH:MM AM/PM | 4:00 PM |
| Date + Time | DD/MM/YYYY, HH:MM AM/PM | 15/07/2026, 4:00 PM |
| Duration (cards) | XX min | 60 min |
| Duration (notifications) | X hour(s) | 2 hours |
| Duration (policies) | XX hours | 24 hours |
| Relative | X ago / in X | 5 min ago |

**Decision Required:** Approve the format standards above.

---

## Part 3: Canonical Components Review

### Component 1: PlayerCoachCard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display coach information for player selection |
| **Used In** | P-01 (Home recommendations), P-04 (Search results) |
| **Roles** | Player (View, Use), Guest (View — if public profiles) |
| **Permissions** | `players.coaches.view` — View card, `players.coaches.book` — Tap "Book Session" |
| **Variants** | List (P-04), Grid (P-01 mobile), Compact (P-01 sidebar), Highlighted (recommended) |
| **States** | Default, Pressed, Loading (skeleton), Highlighted (recommended), Offline (cached) |
| **Content** | Photo, name, specialty tags, rating (stars + count), next available slot, branch, price |
| **Replaces** | None — this is the canonical player-facing coach card |

---

### Component 2: OrgCoachCard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display coach information for organization management |
| **Used In** | OG-02 (Coach List), OG-03 (Coach Profile — as header) |
| **Roles** | Org Admin (View, Use, Edit), Branch Manager (View — branch only) |
| **Permissions** | `org.coaches.view` — View card, `org.coaches.manage` — Actions (suspend, reassign) |
| **Variants** | Default (list item), Status-based (with status badge) |
| **States** | Default, Pressed, Loading, Suspended (grayed), Inactive |
| **Content** | Name, branch, rating, status, utilization %, sessions completed, earnings |
| **Replaces** | None — this is the canonical org-facing coach card |

---

### Component 3: PlayerBookingCard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display a player's booking in list view |
| **Used In** | P-12 (My Bookings — all tabs) |
| **Roles** | Player (View, Use) |
| **Permissions** | `bookings.view` — View card, `bookings.cancel` — Cancel button, `bookings.rate` — Rate button |
| **Variants** | Upcoming (with countdown + quick actions), Past (with rating + "Book Again"), Cancelled (with reason + refund) |
| **States** | Default, Pressed, Loading, In Progress (green badge), Completed, Cancelled |
| **Content** | Coach name + photo, session type, date/time, branch, status badge, action buttons |
| **Replaces** | None — this is the canonical player booking card |

---

### Component 4: CoachBookingCard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display a booking request/session for coach management |
| **Used In** | IC-09 (Coach Bookings — all tabs) |
| **Roles** | Independent Coach (View, Use), Resident Coach (View, Use) |
| **Permissions** | `coach.bookings.view` — View card, `coach.bookings.accept` — Accept button, `coach.bookings.decline` — Decline button |
| **Variants** | Pending (with Accept/Decline), Upcoming (with Prepare), Completed (with rating) |
| **States** | Default, Accepting (loading), Declining (loading), Responded (accepted/declined) |
| **Content** | Player name, session type, date/time, branch, requested time, action buttons |
| **Replaces** | None — this is the canonical coach booking card |

---

### Component 5: DatePickerCalendar

| Attribute | Value |
|-----------|-------|
| **Purpose** | Read-only date picker for selecting booking dates |
| **Used In** | P-06 (Time Selection — top section) |
| **Roles** | Player (View, Use) |
| **Permissions** | `bookings.dates.view` — View calendar, `bookings.dates.select` — Select date |
| **Variants** | Month (default), Week (compact) |
| **States** | Default, Date Selected, Loading, Past (disabled), Today (highlighted), Available dates (highlighted) |
| **Content** | Month grid, available dates highlighted, unavailable dates dimmed, today marker |
| **Replaces** | None — this is the canonical date picker for booking |

---

### Component 6: AvailabilityEditor

| Attribute | Value |
|-----------|-------|
| **Purpose** | Interactive grid for editing coach availability |
| **Used In** | IC-08 (Coach Availability), RC-07 (Resident Schedule — working hours) |
| **Roles** | Independent Coach (View, Use, Edit), Resident Coach (View — read-only for org-set hours) |
| **Permissions** | `coach.availability.view` — View grid, `coach.availability.edit` — Edit blocks, `coach.availability.recurring` — Set recurring |
| **Variants** | Week grid (default), Recurring editor, Exceptions editor |
| **States** | Default, Editing (block selected), Creating (new block), Dragging (resize), Loading |
| **Content** | Mon-Sun grid, time blocks (Available/Reserved/Unavailable), drag handles, demand overlay |
| **Replaces** | None — this is the canonical availability editor |

---

### Component 7: UnifiedCalendar

| Attribute | Value |
|-----------|-------|
| **Purpose** | Combined view of org sessions and player bookings |
| **Used In** | RC-04 (Resident Calendar) |
| **Roles** | Resident Coach (View, Use) |
| **Permissions** | `resident.calendar.view` — View calendar, `resident.calendar.swap` — Request swap |
| **Variants** | Week view (default), Day view |
| **States** | Default, Loading, With conflicts (red indicator) |
| **Content** | Week grid, color coding (org = blue, player = green), gap detection, swap request button |
| **Replaces** | None — this is the canonical unified calendar for resident coaches |

---

### Component 8: TimeSlotPicker

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display and select available time slots |
| **Used In** | P-06 (Time Selection — below calendar) |
| **Roles** | Player (View, Use) |
| **Permissions** | `bookings.slots.view` — View slots, `bookings.slots.select` — Select slot |
| **Variants** | Chips (default), Grid (compact), List (detailed) |
| **States** | Default, Selected, Pressed, Taken (just became unavailable), Loading, Empty (no slots) |
| **Content** | Time range, branch name, remaining spots (if group), price |
| **Replaces** | None — this is the canonical slot picker for players |

---

### Component 9: PriceBreakdown

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display line-item cost decomposition |
| **Used In** | P-07 (Booking Confirmation), P-10 (Booking Detail — payment section) |
| **Roles** | Player (View), Coach (View — own sessions), Org Admin (View) |
| **Permissions** | `payments.breakdown.view` — View price breakdown |
| **Variants** | Pre-booking (P-07 — editable payment method), Post-booking (P-10 — read-only receipt) |
| **States** | Default, Loading, With discount (promo code applied), With refund |
| **Content** | Court fee, coach fee, platform fee, discount, total, payment method |
| **Replaces** | None — this is the canonical price breakdown |

---

### Component 10: WalletDisplay

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display wallet balance and transaction history |
| **Used In** | P-14 (Player Wallet), IC-11 (Coach Earnings — balance section) |
| **Roles** | Player (View, Use), Independent Coach (View, Use) |
| **Permissions** | `wallet.view` — View balance, `wallet.topup` — Top up, `wallet.withdraw` — Withdraw (coach only) |
| **Variants** | Player (top-up focused), Coach (withdrawal focused) |
| **States** | Default, Low balance (warning), Empty, Loading, Processing (top-up/withdrawal in progress) |
| **Content** | Balance, recent transactions, top-up button, withdrawal button (coach), saved cards |
| **Replaces** | None — this is the canonical wallet display |

---

### Component 11: EarningsSummary

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display earnings analytics and revenue breakdown |
| **Used In** | IC-11 (Coach Earnings — analytics section), RC-05 (Resident Earnings) |
| **Roles** | Independent Coach (View), Resident Coach (View) |
| **Permissions** | `earnings.view` — View earnings, `earnings.export` — Export report |
| **Variants** | Coach (individual earnings), Resident (revenue share breakdown) |
| **States** | Default, Loading, Empty (no earnings yet), With trend (up/down arrow) |
| **Content** | Total earnings, pending earnings, completed earnings, chart, revenue share breakdown (resident) |
| **Replaces** | None — this is the canonical earnings summary |

---

### Component 12: PricingConfig

| Attribute | Value |
|-----------|-------|
| **Purpose** | Edit pricing rules per session type |
| **Used In** | IC-06 (Coach Pricing — independent only), OG-07 (Org Pricing — resident + org rules) |
| **Roles** | Independent Coach (View, Use — own prices), Org Admin (View, Use — all prices) |
| **Permissions** | `pricing.view` — View prices, `pricing.edit` — Edit prices, `pricing.override` — Override coach price (org only) |
| **Variants** | Coach (individual, editable), Org (hierarchical, org/branch/coach) |
| **States** | Default, Editing, Saving, Saved (confirmation), With constraint (org floor/ceiling shown) |
| **Content** | Session types, price input, platform fee display, projected earnings, market comparison |
| **Replaces** | None — this is the canonical pricing configuration |

---

### Component 13: CoachProfileHero

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display coach profile for player evaluation |
| **Used In** | P-05 (Coach Profile — top section) |
| **Roles** | Player (View), Coach (View — preview of own profile) |
| **Permissions** | `coaches.profile.view` — View profile |
| **Variants** | Default, Verified (with badge), Compact (in search results) |
| **States** | Default, Loading (skeleton), Incomplete (missing sections highlighted) |
| **Content** | Photo, name, specialty tags, rating, experience, verified badge, bio, certifications |
| **Replaces** | None — this is the canonical coach profile hero |

---

### Component 14: ProfileEditor

| Attribute | Value |
|-----------|-------|
| **Purpose** | Edit user profile information |
| **Used In** | IC-05 (Coach Profile Edit), P-15 (Player Profile), SH-07 (Generic Profile) |
| **Roles** | Independent Coach (View, Use), Player (View, Use), Resident Coach (View, Use) |
| **Permissions** | `profile.view` — View profile, `profile.edit` — Edit profile, `profile.photo` — Change photo |
| **Variants** | Coach (specialties, certifications, video), Player (preferences, location), Generic (contact info) |
| **States** | Default, Editing, Saving, Saved (confirmation), With validation errors |
| **Content** | Name, photo, bio, contact info, role-specific fields, save button |
| **Replaces** | None — this is the canonical profile editor |

---

### Component 15: OrgCoachProfile

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display coach profile for organization management |
| **Used In** | OG-03 (Coach Profile Detail) |
| **Roles** | Org Admin (View, Use, Manage), Branch Manager (View — branch only) |
| **Permissions** | `org.coaches.profile.view` — View profile, `org.coaches.manage` — Actions (suspend, reassign, terminate) |
| **Variants** | Default, Management actions (with action buttons) |
| **States** | Default, Loading, Suspended, Inactive |
| **Content** | Full profile + performance data + schedule + earnings + management actions |
| **Replaces** | None — this is the canonical org coach profile |

---

### Component 16: ReviewCard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display a single review |
| **Used In** | P-05 (Coach Profile — reviews section), IC-04 (Dashboard — recent reviews), IC-13 (Reviews List) |
| **Roles** | Player (View), Coach (View, Use — response), Org Admin (View) |
| **Permissions** | `reviews.view` — View review, `reviews.respond` — Respond to review (coach only), `reviews.report` — Report review |
| **Variants** | Default (read-only), With Response (coach response), Compact (dashboard preview) |
| **States** | Default, Loading, With response, Reported |
| **Content** | Player name, star rating, review text, date, coach response (if any) |
| **Replaces** | None — this is the canonical review card |

---

### Component 17: NotificationCard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display a single notification |
| **Used In** | SH-04 (Notifications Center — all journeys) |
| **Roles** | All roles (View, Use) |
| **Permissions** | `notifications.view` — View notification, `notifications.mark_read` — Mark as read, `notifications.delete` — Delete |
| **Variants** | Default, Unread (bold + dot), With action (CTA button) |
| **States** | Default, Unread, Read, With action, Loading |
| **Content** | Icon (type indicator), title, preview text, time ago, unread dot, tap → navigate |
| **Replaces** | None — this is the canonical notification card |

---

### Component 18: StatsCard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display a metric or KPI |
| **Used In** | IC-04 (Dashboard), OG-01 (Dashboard), P-05 (Coach Profile stats), IC-14 (Analytics), OG-09 (Performance), RC-06 (Performance) |
| **Roles** | All roles (View — context-dependent) |
| **Permissions** | `stats.view` — View metric (role-dependent scope) |
| **Variants** | Number (single value + label), Chart (trend over time), Comparison (benchmark vs actual) |
| **States** | Default, Loading, Zero (show "0" with context), With trend (↑↓ arrow), With benchmark |
| **Content** | Metric value, label, trend indicator, comparison benchmark, period label |
| **Replaces** | None — this is the canonical stats card |

---

### Component 19: SearchInput

| Attribute | Value |
|-----------|-------|
| **Purpose** | Search for coaches or content |
| **Used In** | P-04 (Coach Search), OG-02 (Org Coach Search) |
| **Roles** | Player (View, Use), Org Admin (View, Use) |
| **Permissions** | `search.coaches` — Search coaches |
| **Variants** | Default, With Filter (expandable filter panel), With Clear (show clear button) |
| **States** | Default, Focused, With query, Loading results, Empty results |
| **Content** | Text input, search icon, clear button, filter toggle |
| **Replaces** | None — this is the canonical search input |

---

### Component 20: FilterPanel

| Attribute | Value |
|-----------|-------|
| **Purpose** | Advanced filtering for lists |
| **Used In** | P-04 (Coach Search — filter overlay), OG-02 (Org Coach List — filter sidebar) |
| **Roles** | Player (View, Use), Org Admin (View, Use) |
| **Permissions** | `search.filters.view` — View filters, `search.filters.apply` — Apply filters |
| **Variants** | Overlay (mobile — slide-in), Sidebar (desktop — persistent) |
| **States** | Closed, Open, Applying (loading), With active filters (count badge) |
| **Content** | Filter categories (price, rating, distance, availability, session type), clear all, apply button |
| **Replaces** | None — this is the canonical filter panel |

---

### Component 21: StatusBadge

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display entity status |
| **Used In** | All screens (bookings, coaches, applications, payments) |
| **Roles** | All roles (View) |
| **Permissions** | `status.view` — View badge |
| **Variants** | Color-coded (green=active, yellow=pending, red=cancelled, gray=inactive) |
| **States** | Active, Inactive, Pending, Suspended, Cancelled, Completed, Expired |
| **Content** | Status text, color background |
| **Replaces** | None — this is the canonical status badge |

---

### Component 22: EmptyState

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display when a list or section has no content |
| **Used In** | All screens with lists or dynamic content |
| **Roles** | All roles (View) |
| **Permissions** | `empty.view` — View empty state |
| **Variants** | With CTA (action button), Without CTA (informational only) |
| **States** | Default (never changes) |
| **Content** | Illustration/icon, message, CTA button (if applicable) |
| **Replaces** | None — this is the canonical empty state |

---

### Component 23: ErrorState

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display when an error occurs |
| **Used In** | All screens (network errors, server errors, specific errors) |
| **Roles** | All roles (View) |
| **Permissions** | `error.view` — View error state |
| **Variants** | Network (connection lost), Server (something went wrong), Specific (what failed + how to fix) |
| **States** | Default (never changes) |
| **Content** | Icon, error message, retry button (if applicable), help link |
| **Replaces** | None — this is the canonical error state |

---

### Component 24: SkeletonLoader

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display while content is loading |
| **Used In** | All screens (loading states) |
| **Roles** | All roles (View) |
| **Permissions** | None (always visible during loading) |
| **Variants** | Card (rectangle blocks), List (row blocks), Grid (square blocks), Text (line blocks) |
| **States** | Default (pulsing animation) |
| **Content** | Gray blocks matching the shape of the content being loaded |
| **Replaces** | None — this is the canonical skeleton loader |

---

## Part 4: Role & Permission Verification

### Permission Model Architecture

```
Layer 1: Screen Access
    └── Layer 2: Section Visibility
        └── Layer 3: Component Visibility
            └── Layer 4: Component Action
                └── Layer 5: Field Editability
```

**Rule:** Visibility, usability, and editability are independent. A user can SEE a component without being able to USE it. A user can USE a component without being able to EDIT it.

### Role Definitions

| Role | Description | Scope |
|------|-------------|-------|
| **Guest** | Unauthenticated user | Landing page, public coach profiles |
| **Player** | End user who books coaching | Own bookings, own wallet, own profile |
| **Independent Coach** | Self-employed coach | Own availability, own bookings, own earnings |
| **Resident Coach** | Organization-employed coach | Org-assigned schedule, org-managed earnings |
| **Org Admin** | Organization administrator | All org data, all coaches, all branches |
| **Branch Manager** | Branch-level manager | Branch-scoped data only |
| **Platform Admin** | System administrator | All data, system configuration |

### Permission Matrix: Player Journey

#### P-01: PLAYER_HOME

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Greeting Banner | — | View | — | — | — | — | View |
| Find a Coach Button | — | Use | — | — | — | — | View |
| Coach Cards | View* | View, Use | — | — | View | View | View |
| Upcoming Sessions | — | View | — | — | — | — | View |
| Notification Bell | — | View, Use | — | — | — | — | View |
| Bottom Nav | — | Use | Use | Use | — | — | — |

*Guest sees limited coach cards (no personalization)

#### P-04: PLAYER_COACH_LIST

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Coach Cards | View* | View, Use | — | — | View | View | View |
| "Book Session" Button | — | Use | — | — | — | — | — |
| Filter Panel | — | View, Use | — | — | View | View | View |
| Sort Dropdown | — | View, Use | — | — | View | View | View |
| Search Bar | — | View, Use | — | — | View | View | View |

#### P-05: PLAYER_COACH_PROFILE

| Element | Guest | Player | Ind. Coach (own) | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------------|------------|-----------|------------|----------------|
| Hero Section | View* | View | View (preview) | View | View | View | View |
| Bio & About | View* | View | View (preview) | View | View | View | View |
| Stats | View* | View | View | View | View | View | View |
| Session Types | View* | View | View (preview) | View | View | View | View |
| Reviews | View* | View | View | View | View | View | View |
| Availability | View* | View | — | View | View | View | View |
| "Book Session" | — | Use | — | — | — | — | — |
| "Message Coach" | — | Use** | — | — | — | — | — |

**"Message Coach" hidden in V1 (deferred to V2)

#### P-07: PLAYER_BOOKING_CONFIRM

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Booking Summary | — | View | — | — | — | — | View |
| Price Breakdown | — | View | — | — | — | — | View |
| Payment Method | — | View, Use | — | — | — | — | — |
| "Confirm & Pay" | — | Use | — | — | — | — | — |
| Promo Code | — | View, Use | — | — | — | — | — |

#### P-10: PLAYER_BOOKING_DETAIL

| Element | Guest | Player | Ind. Coach (own) | Res. Coach (own) | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------------|------------------|-----------|------------|----------------|
| Status Badge | — | View | View | View | View | View | View |
| Booking Info | — | View | View | View | View | View | View |
| Cancel Button | — | Use*** | — | — | — | — | — |
| Reschedule Button | — | Use*** | — | — | — | — | — |
| Rate Button | — | Use**** | — | — | — | — | — |
| "Book Again" | — | Use | — | — | — | — | — |

***Hidden if completed/cancelled, disabled if < 24h before session
****Hidden if already rated

---

### Permission Matrix: Coach Journey

#### IC-04: COACH_DASHBOARD

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Welcome Banner | — | — | View | View | — | — | View |
| Stats Row | — | — | View | View | View | View | View |
| Pending Actions | — | — | View, Use | View, Use | View | View | View |
| Upcoming Sessions | — | — | View, Use | View, Use | View | View | View |
| Recent Reviews | — | — | View | View | View | View | View |
| Quick Actions | — | — | Use | Use | — | — | View |

#### IC-08: COACH_AVAILABILITY

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Weekly Grid | — | — | View, Use | View (read-only) | View | View | View |
| Time Blocks | — | — | View, Use | View | View | View | View |
| Demand Overlay | — | — | View | View | View | View | View |
| Recurring Settings | — | — | View, Use | View | View | View | View |
| Save Button | — | — | Use | — | — | — | — |

#### IC-09: COACH_BOOKINGS

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Booking Cards | — | — | View | View | View | View | View |
| Accept Button | — | — | Use | Use | — | — | — |
| Decline Button | — | — | Use | Use | — | — | — |
| Tab Bar | — | — | View, Use | View, Use | View | View | View |

---

### Permission Matrix: Resident Coach Journey

#### RC-03: RESIDENT_HOME

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Today's Schedule | — | — | — | View | View | View | View |
| Upcoming Sessions | — | — | — | View | View | View | View |
| Quick Actions | — | — | — | Use | — | — | View |

#### RC-04: RESIDENT_CALENDAR

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Unified Calendar | — | — | — | View, Use | View | View | View |
| Color Coding | — | — | — | View | View | View | View |
| Swap Request | — | — | — | Use | — | — | — |

---

### Permission Matrix: Organization Journey

#### OG-01: ORG_DASHBOARD

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Overview Stats | — | — | — | — | View | View (branch) | View |
| Alerts & Actions | — | — | — | — | View, Use | View | View |
| Quick Actions | — | — | — | — | Use | — | View |

#### OG-07: ORG_PRICING

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Pricing Rules | — | — | View (own) | — | View, Edit | — | View |
| Revenue Sharing | — | — | — | — | View, Edit | — | View |
| Coach Overrides | — | — | — | — | View, Edit | — | View |

---

### Permission Matrix: Shared Screens

#### SH-04: NOTIFICATIONS

| Element | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Branch Mgr | Platform Admin |
|---------|-------|--------|------------|------------|-----------|------------|----------------|
| Notification List | — | View | View | View | View | View | View |
| Mark All Read | — | Use | Use | Use | Use | Use | Use |
| Swipe Delete | — | Use | Use | Use | Use | Use | Use |
| Settings Link | — | Use | Use | Use | Use | Use | Use |

---

### Field-Level Permissions (Examples)

#### P-15: Player Profile

| Field | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Platform Admin |
|-------|-------|--------|------------|------------|-----------|----------------|
| First Name | — | View, Edit | — | — | View | View |
| Last Name | — | View, Edit | — | — | View | View |
| Email | — | View, Edit | — | — | View | View |
| Phone | — | View, Edit | — | — | View | View |
| Profile Photo | — | View, Edit | — | — | View | View |
| Location | — | View, Edit | — | — | View | View |
| Notification Prefs | — | View, Edit | — | — | — | — |
| Language | — | View, Edit | — | — | — | — |

#### IC-06: Coach Pricing

| Field | Guest | Player | Ind. Coach | Res. Coach | Org Admin | Platform Admin |
|-------|-------|--------|------------|------------|-----------|----------------|
| 1-on-1 Price | — | View | View, Edit | View (read-only) | View, Edit | View |
| Group Price | — | View | View, Edit | View (read-only) | View, Edit | View |
| Clinic Price | — | View | View, Edit | View (read-only) | View, Edit | View |
| Platform Fee | — | View | View | View | View | View |
| Projected Earnings | — | — | View | View | View | View |

---

### API Permission Validation

Every API endpoint must validate permissions at the server level. Client-side permission checks are for UI only — never trust client-side permissions for data access.

| API Endpoint | Method | Required Permission | Scope |
|-------------|--------|---------------------|-------|
| `GET /api/players/:id` | GET | `players.profile.view` | Own profile or org scope |
| `PUT /api/players/:id` | PUT | `players.profile.edit` | Own profile only |
| `GET /api/coaches` | GET | `coaches.search` | Public (limited fields) |
| `GET /api/coaches/:id` | GET | `coaches.profile.view` | Public (full profile) |
| `PUT /api/coaches/:id/availability` | PUT | `coach.availability.edit` | Own availability only |
| `POST /api/bookings` | POST | `bookings.create` | Player role required |
| `GET /api/bookings/:id` | GET | `bookings.view` | Own bookings or org scope |
| `PUT /api/bookings/:id/cancel` | PUT | `bookings.cancel` | Own bookings only |
| `POST /api/bookings/:id/accept` | POST | `coach.bookings.accept` | Own bookings only |
| `POST /api/bookings/:id/decline` | POST | `coach.bookings.decline` | Own bookings only |
| `GET /api/wallet` | GET | `wallet.view` | Own wallet only |
| `POST /api/wallet/topup` | POST | `wallet.topup` | Own wallet only |
| `POST /api/wallet/withdraw` | POST | `wallet.withdraw` | Coach wallet only |
| `GET /api/org/coaches` | GET | `org.coaches.view` | Org scope |
| `PUT /api/org/pricing` | PUT | `org.pricing.edit` | Org scope |
| `GET /api/org/reports` | GET | `org.reports.view` | Org scope |

---

## Part 5: Approval Checklist

### Business Decisions

| # | Decision | Recommendation | Approved |
|---|----------|---------------|----------|
| B-1 | Booking Confirmation | Model A: Instant Confirmation | ☐ |
| B-7 | Pricing Ownership | Model 3: Hybrid (Resident vs Independent) | ☐ |
| B-2 | Marketplace | Option B: Defer to V2 | ☐ |
| B-3 | Chat | Option C: Defer to V2 | ☐ |
| B-4 | Orphan Screens | Approve navigation paths | ☐ |
| B-5 | Dead-End Screens | Approve exit points | ☐ |
| B-6 | IC-02 Verification | Approve corrected flow | ☐ |
| B-8 | Date/Time Format | Approve format standards | ☐ |

### Canonical Components

| # | Component | Purpose | Approved |
|---|-----------|---------|----------|
| 1 | PlayerCoachCard | Player-facing coach display | ☐ |
| 2 | OrgCoachCard | Org-facing coach display | ☐ |
| 3 | PlayerBookingCard | Player booking list card | ☐ |
| 4 | CoachBookingCard | Coach booking request card | ☐ |
| 5 | DatePickerCalendar | Read-only date picker | ☐ |
| 6 | AvailabilityEditor | Interactive availability grid | ☐ |
| 7 | UnifiedCalendar | Combined org + player calendar | ☐ |
| 8 | TimeSlotPicker | Available slot selection | ☐ |
| 9 | PriceBreakdown | Line-item cost display | ☐ |
| 10 | WalletDisplay | Balance + transactions | ☐ |
| 11 | EarningsSummary | Earnings analytics | ☐ |
| 12 | PricingConfig | Pricing rules editor | ☐ |
| 13 | CoachProfileHero | Read-only coach profile | ☐ |
| 14 | ProfileEditor | Editable profile form | ☐ |
| 15 | OrgCoachProfile | Org management view | ☐ |
| 16 | ReviewCard | Review display | ☐ |
| 17 | NotificationCard | Notification display | ☐ |
| 18 | StatsCard | Metrics display | ☐ |
| 19 | SearchInput | Search field | ☐ |
| 20 | FilterPanel | Advanced filtering | ☐ |
| 21 | StatusBadge | Status indicator | ☐ |
| 22 | EmptyState | Empty content state | ☐ |
| 23 | ErrorState | Error display | ☐ |
| 24 | SkeletonLoader | Loading placeholder | ☐ |

### Permission Model

| # | Aspect | Approved |
|---|--------|----------|
| 1 | 7-role model (Guest, Player, Ind. Coach, Res. Coach, Org Admin, Branch Mgr, Platform Admin) | ☐ |
| 2 | 5-layer permission depth (Screen → Section → Component → Action → Field) | ☐ |
| 3 | Visibility, usability, editability are independent | ☐ |
| 4 | Server-side permission validation required | ☐ |
| 5 | API permission matrix | ☐ |

### Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Tech Lead | | | |
| UX Designer | | | |
| QA Lead | | | |

---

*This document is the single source of truth for product decisions. No code is written until all decisions are approved and the UX Blueprint is updated to reflect them.*
