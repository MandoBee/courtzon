# CourtZon Coach Platform — Product Blueprint

> **Phase:** Product Design (pre-implementation)
> **Version:** 2.0
> **Status:** Awaiting approval before implementation
> **Principle:** The Scheduling Engine should disappear into the background
>
> **Audience:** Product Managers, UX Designers, QA Engineers, Developers
> This document is the single source of truth for the Coach Platform. A UX designer should be able to design interfaces from it. A QA engineer should be able to write test scenarios from it. A developer should be able to implement it without additional business clarification.

---

## Design Philosophy

The player should never feel they are using a scheduling engine. They should simply feel that booking a coach is effortless.

The coach should never feel they are managing a complex business. They should feel that growing their coaching practice is natural.

The organization should never feel they are drowning in administrative overhead. They should feel that managing coaches is as simple as managing a schedule.

**The technology should be invisible. The experience should be intelligent.**

---

## Guiding Principles

- **Product First** — Start with the user experience, not the architecture
- **Business Value Before Complexity** — Deliver what matters before what is elegant
- **Backward Compatibility** — Existing features must not break when adding new ones
- **Single Source of Truth** — One place for every decision, never duplicated logic
- **Reuse Before Rewrite** — Extend what exists before building what is new
- **Build on Demand** — Implement only when there is a real business need
- **Architecture Evolves Slowly** — Change the foundation only when production proves it necessary

---

## Journey Ownership Overview

| Journey | Primary User | Supporting Users | Business Owner | System Responsibility |
|---------|-------------|-----------------|----------------|----------------------|
| **Player** | Player | Coach, Organization | Head of Product | Match player need to right coach, handle payment, manage session lifecycle |
| **Independent Coach** | Independent Coach | Player, Platform Admin | Head of Product | Onboard coach, manage availability, process payments, grow coach business |
| **Resident Coach** | Resident Coach | Organization, Player | Head of Product (with Org input) | Integrate coach into org, manage schedule, track performance |
| **Organization** | Organization Admin | Coach, Player, Platform Admin | Head of Product | Staff coaching operations, optimize revenue, manage coach lifecycle |

---

# Journey 1: Player

## Ownership

| Attribute | Value |
|-----------|-------|
| **Primary User** | Player (any user seeking coaching) |
| **Supporting Users** | Coach (receives booking), Organization (if applicable) |
| **Business Owner** | Head of Product |
| **System Responsibility** | Match player need to right coach, handle payment, manage session lifecycle end-to-end |

## Goal

A player opens CourtZon, finds the right coach for their exact need, books a session, pays without friction, arrives well-informed, trains, and leaves confident that they made a good choice. The entire experience from need to completion should feel like talking to a knowledgeable friend who knows exactly who can help.

## Steps

### 1. Open the App — "I need coaching"

The player opens CourtZon. They may arrive from a notification, a direct link, or simply browsing.

**Player decision:** What kind of help do I need?

The system understands that the player has a coaching need but does not yet know what shape it takes. The player may know:
- "I want to improve my serve"
- "I need a coach for my kid"
- "I just want to try coaching once"
- "I have a match coming up and need preparation"

**System behavior:**
- Present a simple, inviting entry point — not a form, not a search bar, but a guided question
- "What would you like to work on?" with natural categories:
  - Technique (forehand, serve, backhand, volley, footwork)
  - Match preparation
  - Fitness and conditioning
  - Junior development
  - Beginner introduction
  - Just once (exploratory)
- If the player has booked before, show their preferred coaches and recent activity immediately

### 2. Choose Session Type — "What kind of session fits?"

Once the player expresses what they need, the system presents session options tailored to that need.

**Player decision:** Which format works for me?

Options presented based on the need:
- **1-on-1 Private Session** — focused, personal, premium
- **Small Group (2-4 players)** — social, affordable, still personalized
- **Group Clinic** — structured curriculum, community feel
- **Match Play Session** — coach-supervised competitive play
- **Quick Hit (30 min)** — technique tune-up, low commitment

**System behavior:**
- Show estimated duration, price range, and what to expect for each format
- If the player is a beginner, highlight the beginner-friendly options
- If the player has history, show what worked before: "Last time you did 1-on-1 technique with Coach Ahmed"

### 3. Find the Coach — "Who is right for me?"

This is where the Scheduling Engine works invisibly. The player never sees availability grids, time slot pickers, or resource allocation. They see coaches.

**Player decision:** Which coach feels right?

The system presents a curated list ranked by:
1. **Relevance** — Coach specializes in what the player needs
2. **Availability** — Coach has open slots that work for the player's schedule
3. **Proximity** — Coach is at a convenient branch
4. **Rating** — Player reviews and reputation
5. **Price** — Within the player's indicated budget (if any)

Each coach card shows:
- Name, photo, specialty
- Rating (stars + number of reviews)
- Next available slot (human-readable: "Tomorrow at 4pm")
- Branch location
- Price per session
- One-line bio that sounds human, not corporate

**System behavior:**
- If no coach is available at the preferred branch, show nearby branches with availability
- If the player's preferred coach is unavailable, show the next best match
- If the player has booked before, prioritize their previous coach
- "Any Coach" mode: system picks the best available coach automatically
- "Specific Coach" mode: player already knows who they want

### 4. Choose Time — "When works for me?"

The player sees availability for their chosen coach (or the system's recommended coach).

**Player decision:** When do I want to train?

**System behavior:**
- Show a clean calendar view with only available dates highlighted
- No greyed-out times, no confusing grids — just open slots
- Show time in a human-friendly format: "Tomorrow 4:00 PM - 5:00 PM"
- Show branch name and address
- If the coach has multiple branches, show which branch for each slot
- Suggest "best times" based on the player's history: "You usually book weekday evenings"
- Show how many slots remain: "Only 2 slots left this week" (scarcity, but honest)

### 5. Review & Book — "Confirm my session"

Before booking, the player sees a clear summary:

**Player decision:** Do I want to proceed?

The summary shows:
- Coach name and photo
- Session type (1-on-1, group, etc.)
- Date and time
- Duration
- Branch and location
- Total price breakdown (court fee + coach fee + platform fee)
- What to bring / what to expect
- Cancellation policy (plain language, not legal jargon)

**System behavior:**
- If wallet has sufficient balance, show "Pay with Wallet" as default
- If wallet is insufficient, offer payment methods (card, wallet top-up)
- If this is the player's first booking with this coach, show a brief intro: "Coach Ahmed has 4.8 stars from 120 sessions"
- Show a "Book Now" button that is clear, confident, and final
- After tapping, show a brief processing state, then immediate confirmation

### 6. Payment — "Done"

The payment happens seamlessly.

**System behavior:**
- Wallet payment: instant deduction, immediate confirmation
- Card payment: redirect to payment gateway, return with confirmation
- Show receipt with booking reference
- Send confirmation notification (push + email)
- If payment fails, show a clear error and retry option — never lose the booking

### 7. Pre-Session Experience — "I'm ready"

Between booking and arrival, the system keeps the player informed and prepared.

**System behavior:**
- **Immediate:** Confirmation with booking details, coach info, branch directions
- **24 hours before:** Reminder with session details, what to bring, weather forecast
- **2 hours before:** Final reminder with branch address, parking info, coach's current status
- **If coach cancels:** Immediate notification with rebooking options (system finds alternatives automatically)
- **If player needs to cancel:** One-tap cancellation with clear policy explanation
- **Pre-session chat:** Optional messaging with coach (introduction, special requests, injuries)

### 8. Arrival & Check-in — "I'm here"

The player arrives at the branch.

**System behavior:**
- Push notification: "Welcome to CourtZon Maadi! Coach Ahmed is expecting you."
- Check-in can be automatic (geofence), manual (QR code), or coach-confirmed
- If the player is late, show a gentle notification: "Your session started 10 minutes ago. Coach Ahmed is ready when you are."
- If the coach is late, apologize and provide an ETA or alternative
- Show the court assignment on a simple map of the branch

### 9. Training — "This is great"

The training session happens. The system is invisible during training but works in the background.

**System behavior:**
- Track session start and end (for billing accuracy)
- If the session is extended, handle gracefully (both parties agree, system updates)
- If the coach cancels mid-session (emergency), handle refund fairly
- No notifications during training (Do Not Disturb mode for active sessions)

### 10. Post-Session Rating — "That was worth it"

After the session, the player is invited to rate the experience.

**Player decision:** How was my session?

**System behavior:**
- Simple, one-tap rating (1-5 stars) with optional text review
- Ask specific questions: "Was the coach punctual?" "Was the session helpful?" "Would you book again?"
- Rating affects coach visibility in search results
- If rating is low, trigger a support check-in (automated but human-feeling)
- Offer to rebook: "Book another session with Coach Ahmed?" with the same or different time
- If the player loved it, suggest sharing: "Tell a friend about Coach Ahmed"

### 11. History & Growth — "I'm improving"

Over time, the player builds a coaching history.

**System behavior:**
- Session history with coach names, dates, and types
- Progress tracking (if the player opts in): sessions attended, skills worked on, consistency streak
- Spending summary: total invested in coaching, average per session
- Favorite coaches list for quick rebooking
- Recommendations: "Based on your progress, you might benefit from match play sessions"
- Loyalty: "You've trained 10 times this month — here's a small thank you"

---

## Decision Trees — Player Journey

### Decision Tree 1: Need Recognition

```
Player opens app
    │
    ├── Has a specific coach in mind?
    │       ├── YES → Go to Decision Tree 3 (Time Selection)
    │       └── NO
    │               │
    │               ├── Knows what they need?
    │               │       ├── YES → Select session type → Go to Decision Tree 2
    │               │       └── NO → Guided discovery:
    │               │               │
    │               │               ├── "What would you like to work on?"
    │               │               │       ├── Technique → Which stroke? → Suggest 1-on-1 or Quick Hit
    │               │               │       ├── Match preparation → Suggest Match Play Session
    │               │               │       ├── Fitness → Suggest Fitness & Conditioning session
    │               │               │       ├── Junior development → Suggest 1-on-1 with junior specialist
    │               │               │       ├── Beginner introduction → Suggest beginner-friendly coach
    │               │               │       └── Just once → Suggest Quick Hit (30 min)
    │               │               │
    │               │               └── Go to Decision Tree 2 (Coach Discovery)
    │               │
    │               └── Go to Decision Tree 2 (Coach Discovery)
```

### Decision Tree 2: Coach Discovery

```
Player needs a coach
    │
    ├── "Any Coach" or "Specific Coach"?
    │       │
    │       ├── Specific Coach
    │       │       ├── Coach available at preferred branch?
    │       │       │       ├── YES → Go to Decision Tree 3 (Time Selection)
    │       │       │       └── NO
    │       │       │               │
    │       │       │               ├── Coach available at nearby branch?
    │       │       │               │       ├── YES → "Coach Ahmed is available at [nearby branch], X min away. Book there?"
    │       │       │               │       │       ├── YES → Go to Decision Tree 3
    │       │       │               │       │       └── NO → Go to alternative options
    │       │       │               │       │
    │       │       │               │       └── NO → Coach unavailable this week
    │       │       │               │               │
    │       │       │               │               ├── "Would you like to:"
    │       │       │               │               │       ├── Check other times → Show next available slots
    │       │       │               │               │       ├── Join waiting list → Notify if slot opens
    │       │       │               │               │       ├── Choose another coach → Show similar coaches
    │       │       │               │               │       └── Set reminder → Notify when coach is available
    │       │       │               │               │
    │       │       │               │               └── Go to alternative options
    │       │
    │       └── Any Coach (Recommended)
    │               │
    │               ├── System finds best match based on:
    │               │       1. Specialty match
    │               │       2. Availability at preferred branch
    │               │       3. Rating
    │               │       4. Price
    │               │
    │               ├── Results found?
    │               │       ├── YES → Show top 3-5 recommended coaches
    │               │       │       │
    │               │       │       ├── Player selects a coach → Go to Decision Tree 3
    │               │       │       └── Player wants to see more → Show full list (sorted by relevance)
    │               │       │
    │               │       └── NO (no coaches match all criteria)
    │               │               │
    │               │               ├── Relax criteria progressively:
    │               │               │       ├── Expand to nearby branches
    │               │               │       ├── Expand to different session types
    │               │               │       ├── Show coaches available on different days
    │               │               │       │
    │               │               └── "No coaches match right now. Would you like to:"
    │               │                       ├── Join waiting list
    │               │                       ├── Check back later (reminder)
    │               │                       └── Browse all available coaches
```

### Decision Tree 3: Time Selection

```
Player selects a coach
    │
    ├── Coach has available slots?
    │       │
    │       ├── YES → Show calendar with available slots
    │       │       │
    │       │       ├── Player selects a slot
    │       │       │       │
    │       │       │       ├── Slot still available at confirmation?
    │       │       │       │       ├── YES → Go to Decision Tree 4 (Booking Confirmation)
    │       │       │       │       └── NO (slot taken by another player)
    │       │       │       │               │
    │       │       │       │               ├── "This slot was just booked. Would you like to:"
    │       │       │       │               │       ├── Choose another time → Show next available slots
    │       │       │       │               │       ├── Choose another coach → Show similar coaches
    │       │       │       │               │       └── Join waiting list → Notify if slot opens
    │       │       │       │
    │       │       │       └── Player wants to see other dates
    │       │       │               └── Show calendar navigation
    │       │       │
    │       │       └── Player wants to change coach
    │       │               └── Go back to Decision Tree 2
    │       │
    │       └── NO (coach has no available slots)
    │               │
    │               ├── "Coach [name] has no available slots this week."
    │               │       │
    │               │       ├── Would you like to:
    │               │       │       ├── Check next week → Show future availability
    │               │       │       ├── Join waiting list → Notify if slot opens
    │               │       │       ├── Choose another coach → Show similar coaches
    │               │       │       └── Go back → Return to previous step
```

### Decision Tree 4: Booking Confirmation

```
Player ready to book
    │
    ├── Review summary
    │       │
    │       ├── Player confirms
    │       │       │
    │       │       ├── Payment method?
    │       │       │       │
    │       │       │       ├── Wallet
    │       │       │       │       ├── Sufficient balance?
    │       │       │       │       │       ├── YES → Process payment → Go to Decision Tree 5
    │       │       │       │       │       └── NO → "Insufficient wallet balance."
    │       │       │       │       │               │
    │       │       │       │       │               ├── Would you like to:
    │       │       │       │       │               │       ├── Top up wallet → Show top-up flow
    │       │       │       │       │               │       ├── Pay with card → Redirect to payment gateway
    │       │       │       │       │               │       └── Cancel → Release reservation
    │       │       │       │       │
    │       │       │       ├── Card
    │       │       │       │       └── Redirect to payment gateway
    │       │       │       │               │
    │       │       │       │               ├── Payment successful? → Go to Decision Tree 5
    │       │       │       │               └── Payment failed?
    │       │       │       │                       │
    │       │       │       │                       ├── Would you like to:
    │       │       │       │                       │       ├── Retry payment
    │       │       │       │                       │       ├── Pay with wallet
    │       │       │       │                       │       ├── Use another card
    │       │       │       │                       │       └── Cancel booking
    │       │       │       │                       │
    │       │       │       │                       └── Reservation held for 15 minutes
    │       │       │       │
    │       │       │       └── Cash / On-site
    │       │       │               └── Confirm booking → Go to Decision Tree 5
    │       │       │
    │       │       └── Player goes back to modify
    │       │               └── Allow changes to coach, time, or session type
    │       │
    │       └── Player cancels
    │               └── Release reservation, return to browse
```

### Decision Tree 5: Post-Booking

```
Booking confirmed
    │
    ├── Pre-session period
    │       │
    │       ├── Player needs to cancel?
    │       │       │
    │       │       ├── Cancellation policy check:
    │       │       │       ├── More than 24 hours before → Full refund
    │       │       │       ├── 12-24 hours before → 50% refund
    │       │       │       ├── Less than 12 hours → No refund
    │       │       │       └── Coach cancellation → Full refund + rebooking assistance
    │       │       │
    │       │       ├── Confirm cancellation
    │       │       │       ├── "Are you sure? You will receive [refund amount]."
    │       │       │       │       ├── YES → Process cancellation → Refund → Notify coach
    │       │       │       │       └── NO → Return to booking details
    │       │       │
    │       │       └── Offer alternatives:
    │       │               ├── Reschedule (find another time with same coach)
    │       │               └── Transfer to another coach (if available)
    │       │
    │       ├── Coach cancels?
    │       │       │
    │       │       ├── Notify player immediately
    │       │       ├── Full refund processed automatically
    │       │       ├── "Coach [name] cancelled your session. Would you like to:"
    │       │       │       ├── Rebook with same coach → Show next available slots
    │       │       │       ├── Book with similar coach → Show alternatives (system-recommended)
    │       │       │       └── Get refund only → Process refund
    │       │
    │       └── Session day arrives
    │               │
    │               ├── Player checks in
    │               │       │
    │               │       ├── On time?
    │               │       │       ├── YES → "Welcome! Coach [name] is ready at Court [X]."
    │               │       │       └── NO (late)
    │               │       │               │
    │               │       │               ├── < 15 min late → "Coach [name] is waiting. Your session will end at [time]."
    │               │       │               ├── 15-30 min late → "Your session was shortened. Still want to train?"
    │               │       │               │       ├── YES → Shortened session at reduced price
    │               │       │               │       └── NO → Cancel with partial refund
    │               │       │               └── > 30 min late → "Session forfeited. No refund."
    │               │       │
    │               │       └── No-show?
    │               │               ├── After 30 min → Mark as no-show
    │               │               ├── Notify player: "You missed your session. No refund."
    │               │               └── Offer rebooking at full price
```

### Decision Tree 6: Post-Session

```
Session completed
    │
    ├── Rate the session
    │       │
    │       ├── Player rates 1-2 stars (negative)
    │       │       │
    │       │       ├── "We're sorry about that. Would you like to:"
    │       │       │       ├── Report a specific issue → Collect details → Flag for support
    │       │       │       ├── Get a partial refund → Review case
    │       │       │       └── Book with another coach → Show alternatives
    │       │       │
    │       │       └── Trigger support check-in (automated)
    │       │
    │       ├── Player rates 3 stars (neutral)
    │       │       │
    │       │       ├── "Thanks for the feedback. What could be improved?"
    │       │       │       ├── Collect specific feedback → Share with coach (confidential)
    │       │       │       └── Offer rebooking with same or different coach
    │       │
    │       └── Player rates 4-5 stars (positive)
    │               │
    │               ├── "Great! Would you like to:"
    │               │       ├── Book another session with same coach → Quick rebook flow
    │               │       ├── Leave a text review → Optional
    │               │       ├── Share with a friend → Referral link
    │               │       └── Done → Return to home
    │
    └── History updated
            ├── Session logged in history
            ├── Progress tracking updated (if opted in)
            ├── Spending summary updated
            └── Coach notified of rating
```

---

## Edge Cases — Player Journey

| # | Edge Case | System Behavior |
|---|-----------|----------------|
| P-EC1 | **No coaches available at preferred branch** | Show nearest branches with availability. Display distance and travel time. Offer to notify when preferred branch has availability. |
| P-EC2 | **No coaches available anywhere** | Show message: "No coaches match your criteria right now." Offer to join waiting list. Suggest relaxing criteria (different time, different session type, different branch). |
| P-EC3 | **Coach available but court unavailable** | System automatically tries alternative courts at the same branch. If none available, show next available slot. Never show coach without confirming court. |
| P-EC4 | **Court available but coach unavailable** | This scenario should never reach the player. The Scheduling Engine filters it before display. If it occurs due to a race condition, show error and refresh results. |
| P-EC5 | **Coach outside player's service area** | If player has a location preference, deprioritize coaches beyond the radius but do not hide them. Show travel time clearly. Let player decide. |
| P-EC6 | **Budget too low for any coach** | Show the most affordable option with transparent pricing. Suggest group clinics or small group sessions as lower-cost alternatives. Never block the player from seeing options. |
| P-EC7 | **Player cancels after booking** | Apply cancellation policy (see Decision Tree 5). Process refund according to timing. Notify coach immediately. Release court slot. |
| P-EC8 | **Player cancels repeatedly (3+ times)** | Flag account for review. Show cancellation history to player. Offer alternatives before booking: "You've cancelled 3 sessions recently. Would you prefer a shorter session or a different time?" |
| P-EC9 | **Coach cancels after booking** | Full refund to player. Notify player immediately. Automatically show rebooking alternatives. Prioritize rebooking with same coach at next available slot. |
| P-EC10 | **Coach cancels within 2 hours of session** | Full refund plus goodwill gesture (discount on next booking or priority rebooking). Flag coach for review if pattern emerges. |
| P-EC11 | **Payment fails** | Hold reservation for 15 minutes. Show clear error message. Offer retry, alternative payment method, or cancel. Never lose the booking slot during retry window. |
| P-EC12 | **Network interruption during booking** | If payment was charged but confirmation not received, check booking status before reattempting. Never double-charge. Show "Checking your booking status..." and resolve automatically. |
| P-EC13 | **Player is a minor (junior)** | Require parent/guardian consent for first booking. Parent receives notification of booking. Parent can view session details and history. Coach is informed player is a junior. |
| P-EC14 | **Player requests refund after session** | Evaluate case-by-case. If coach missed session or quality was poor, offer partial or full refund. If player simply didn't enjoy it, offer rebooking discount. Log all refund decisions. |
| P-EC15 | **Session overruns scheduled time** | If both parties agree to extend, system updates billing. If coach needs to leave, session ends at scheduled time. Player is not charged beyond the agreed duration. |
| P-EC16 | **Multiple players book same group slot** | System manages group capacity. When slot is full, remove from available list. Show "Full" status. Offer waitlist for group slots. |
| P-EC17 | **Player wants to switch coaches mid-session** | Not supported during session. After session, player can book with different coach. System does not facilitate mid-session coach changes. |
| P-EC18 | **Player leaves negative review incorrectly** | Coach can respond publicly. Player can update review within 7 days. Platform does not mediate content but flags abusive language for moderation. |

---

## Success Metrics — Player Journey

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Time from app open to booking** | < 3 minutes | Median time from session start to confirmed booking |
| **Booking completion rate** | > 70% | Percentage of sessions started that result in confirmed booking |
| **Average booking duration** | < 2 minutes | Time spent in the booking flow (excluding browsing) |
| **First-time booking rate** | > 40% | Percentage of new users who complete a booking within 7 days |
| **Cancellation rate** | < 10% | Percentage of bookings cancelled before session |
| **No-show rate** | < 5% | Percentage of bookings where player does not arrive |
| **Rebooking rate** | > 60% | Percentage of players who book a second session within 30 days |
| **Player satisfaction (CSAT)** | > 4.5 / 5 | Average post-session rating |
| **Net Promoter Score (NPS)** | > 50 | "How likely are you to recommend CourtZon coaching?" |
| **Payment success rate** | > 98% | Percentage of payment attempts that succeed on first try |
| **Session completion rate** | > 95% | Percentage of booked sessions that are actually completed |
| **Refund rate** | < 3% | Percentage of bookings that result in full refund |

---

## Journey Completion Criteria — Player Journey

The Player Journey is **complete** when all of the following are true:

- [ ] Booking confirmed with coach, time, and location
- [ ] Payment completed (wallet, card, or cash-on-site)
- [ ] Confirmation notification sent (push + email)
- [ ] Reminder scheduled (24h and 2h before session)
- [ ] Session completed (check-in, training, check-out)
- [ ] Post-session rating submitted
- [ ] Session logged in player history
- [ ] Progress tracking updated (if opted in)
- [ ] Coach notified of rating and review
- [ ] Rebooking option presented

**The journey does NOT end at payment.** It ends when the player has completed the full cycle: need → booking → training → rating → history.

---

## Smart Automation Ideas — Player Journey

1. **Smart Suggestion Engine:** "Based on your last session with Coach Ahmed (forehand technique), we recommend a follow-up session focusing on backhand. Coach Ahmed has availability Thursday at 5pm."

2. **Weather-Aware Rescheduling:** "It's forecast to rain Thursday at 5pm. Would you like to move to an indoor court or reschedule?"

3. **Social Proof:** "3 players at your level booked Coach Ahmed this week."

4. **Budget Intelligence:** "You've spent 800 EGP on coaching this month. A group clinic could save you 40% while keeping the quality."

5. **Streak Recognition:** "You've trained 4 weeks in a row! Keep it up — here's your coaching streak badge."

6. **Intelligent Cancellation:** If a player cancels often, offer "Prefer a different time? Here are the best slots for your schedule."

7. **Match-Ready Detection:** "You've had 6 technique sessions. Ready for a match-play session to test your skills?"

---
---

# Journey 2: Independent Coach

## Ownership

| Attribute | Value |
|-----------|-------|
| **Primary User** | Independent Coach (self-employed coach on the platform) |
| **Supporting Users** | Player (books the coach), Platform Admin (reviews applications) |
| **Business Owner** | Head of Product |
| **System Responsibility** | Onboard coach, manage availability and pricing, process payments, grow coach business through data and tools |

## Goal

An independent coach applies to CourtZon, gets verified, builds a profile that reflects their expertise, sets their availability and pricing, receives bookings, gets paid, builds a reputation, and grows their coaching business — all with minimal administrative burden. The platform should feel like a business partner, not a bureaucracy.

## Steps

### 1. Application — "I want to coach"

A coach discovers CourtZon (through the app, word of mouth, or a referral) and decides to apply.

**Coach decision:** Is this platform worth my time?

The application should be simple and respectful of the coach's time:
- Name, phone, email
- Coaching certification (upload or select from list)
- Years of experience
- Specialties (technique, fitness, juniors, beginners, etc.)
- Current coaching location (if any)
- Why they want to join CourtZon (optional, but gives context)

**System behavior:**
- Pre-fill what can be inferred (location from phone number, specialties from certification)
- Save progress — the coach can return and finish later
- Show estimated review time: "We typically review applications within 48 hours"
- Send confirmation: "Application received. We'll be in touch soon."

### 2. Verification — "Prove your credentials"

The coach provides proof of qualifications.

**Coach decision:** What do I need to provide?

**System behavior:**
- Request only what is necessary: certification, ID, experience proof
- Accept photos of documents (OCR extracts key information)
- Show progress: "Step 2 of 4: Verification"
- If something is unclear, reach out with a specific question, not a generic "please resubmit"
- While waiting, show the coach what they will be able to do once approved

### 3. Approval — "Welcome aboard"

The coach is approved.

**Coach decision:** Am I ready to go live?

**System behavior:**
- Welcome message with a clear next step: "Your profile is live! Here's how to get your first booking"
- Guided onboarding: 3-4 steps to complete the profile
- Show a preview of how their profile looks to players
- Offer a "soft launch": "Start with reduced availability until you're comfortable"
- Assign a success contact (for the first 30 days)

### 4. Profile — "This is who I am"

The coach builds their professional profile.

**Coach decision:** How do I present myself?

Profile elements:
- Professional photo (with guidelines for quality)
- Bio (with templates and examples)
- Certifications (verified badges)
- Specialties (multi-select with descriptions)
- Languages spoken
- Coaching philosophy (optional, but differentiating)
- Video introduction (optional, but highly engaging)
- Success stories (optional, but builds trust)

**System behavior:**
- Show a profile completeness meter: "Your profile is 70% complete — add a photo to reach 100%"
- Suggest improvements: "Coaches with a video get 3x more bookings"
- Allow preview: "See how players see your profile"

### 5. Pricing — "What am I worth?"

The coach sets their pricing.

**Coach decision:** How much should I charge?

**System behavior:**
- Show market data: "Coaches with your experience typically charge 300-500 EGP/hour in your area"
- Suggest a starting price: "We recommend starting at 350 EGP/hour to build your reputation"
- Allow different pricing for different session types
- Show projected earnings: "At 350 EGP/hour, 10 sessions/week = 14,000 EGP/month (before platform fee)"
- Allow dynamic pricing: peak hours, off-peak discounts
- Show platform fee clearly: "CourtZon takes 15% — you keep 85%"

### 6. Service Areas — "Where do I work?"

The coach defines where they are willing to travel.

**Coach decision:** Which branches/areas am I available at?

**System behavior:**
- Show a map with all CourtZon branches
- Coach selects branches they serve (tap to select/deselect)
- For each branch, show distance, demand, and current coach saturation
- Set maximum travel distance (slider)
- Allow scheduling constraints: "I only work at Maadi on weekday evenings"

### 7. Availability — "When can I work?"

The coach sets their available hours.

**Coach decision:** What is my schedule?

**System behavior:**
- Weekly calendar view with drag-to-set availability
- Set recurring schedules: "Every Monday, Wednesday, Friday 4pm-8pm"
- Set exceptions: "Not available July 20-25 (vacation)"
- Show demand overlay: "Tuesday evenings are your busiest"
- Show projected earnings per slot

### 8. Bookings — "I have a client"

The coach receives and manages bookings.

**Coach decision:** Accept, decline, or reschedule?

**System behavior:**
- Instant notification with booking details
- Show player info: name, level, session history, special requests
- One-tap accept or decline (with reason)
- Pre-session check: "Your session with Sarah M. is tomorrow at 4pm"
- Session notes (private): record what was covered
- Auto-reminder 24 hours before
- Calendar integration

### 9. Payments — "I got paid"

The coach receives payment for their sessions.

**Coach decision:** When and how do I get paid?

**System behavior:**
- After each session, payment is processed automatically
- Show clear earnings per session with fee breakdown
- Wallet balance updates in real-time
- Withdrawal options: bank transfer, wallet top-up
- Weekly earnings summary
- Monthly statement: downloadable, tax-ready
- Transparent fee breakdown always visible

### 10. Wallet — "My money"

The coach manages their earnings.

**Coach decision:** What do I do with my earnings?

**System behavior:**
- Real-time balance display
- Transaction history with filters
- Withdraw to bank account (instant or standard)
- Set auto-withdrawal schedule
- Show growth over time

### 11. Reviews — "What do players think?"

The coach sees and responds to player reviews.

**Coach decision:** How do I improve?

**System behavior:**
- All reviews in one place
- Aggregate rating with trend
- Specific feedback highlights
- Suggested actions for negative reviews
- Coach can respond publicly
- Show how rating affects visibility

### 12. Analytics — "How is my business doing?"

The coach sees their business performance.

**Coach decision:** What should I focus on?

**System behavior:**
- Dashboard: sessions, earnings, rating, booking rate, repeat rate, utilization
- Trends and comparisons
- Insights and recommendations
- Player retention data

### 13. Growth — "How do I get better?"

The coach develops their career on the platform.

**Coach decision:** What is my next step?

**System behavior:**
- Skill development suggestions
- Marketing support
- Achievement system (badges, milestones)
- Tier system: Bronze → Silver → Gold → Platinum
- Referral program
- Community features

---

## Decision Trees — Independent Coach Journey

### Decision Tree 1: Application & Verification

```
Coach applies
    │
    ├── Application submitted
    │       │
    │       ├── Documents valid?
    │       │       ├── YES → Application approved
    │       │       │       │
    │       │       │       ├── Send welcome message
    │       │       │       ├── Start guided onboarding
    │       │       │       └── Show "Complete your profile" checklist
    │       │       │
    │       │       └── NO
    │       │               │
    │       │               ├── What is the issue?
    │       │               │       ├── Incomplete documents → "Please provide: [specific missing item]"
    │       │               │       ├── Expired certification → "Your certification has expired. Please renew and resubmit."
    │       │               │       ├── Unclear documents → "We couldn't read [specific document]. Could you resubmit a clearer photo?"
    │       │               │       └── Does not meet requirements → "Unfortunately, you don't meet our requirements at this time. [Explain why]. You may reapply in [timeframe]."
    │       │               │
    │       │               └── Coach resubmits → Return to verification
    │       │
    │       └── Coach saves and returns later
    │               └── Application preserved, resume where left off
```

### Decision Tree 2: Profile Completion

```
Coach building profile
    │
    ├── Profile elements
    │       │
    │       ├── Photo uploaded?
    │       │       ├── YES → Score +20%
    │       │       └── NO → "Add a professional photo. Coaches with photos get 3x more bookings."
    │       │
    │       ├── Bio written?
    │       │       ├── YES → Score +20%
    │       │       └── NO → "Write a short bio. Here are some templates: [3 examples]"
    │       │
    │       ├── Certifications added?
    │       │       ├── YES → Score +20% (verified badge if validated)
    │       │       └── NO → "Add your certifications. Verified certifications increase trust."
    │       │
    │       ├── Specialties selected?
    │       │       ├── YES → Score +20%
    │       │       └── NO → "Choose your specialties. This helps players find you."
    │       │
    │       ├── Video introduction?
    │       │       ├── YES → Score +20% + "Featured" badge
    │       │       └── NO → "Add a 30-second video intro. It's optional but highly recommended."
    │       │
    │       └── Profile complete (100%)
    │               │
    │               ├── "Your profile is complete! You're ready to receive bookings."
    │               └── Show preview: "This is how players see your profile"
```

### Decision Tree 3: Pricing Strategy

```
Coach sets pricing
    │
    │
    ├── "How should I price?"
    │       │
    │       ├── Show market data
    │       │       "Coaches in your area charge 300-500 EGP/hour"
    │       │
    │       ├── Coach chooses pricing model
    │       │       │
    │       │       ├── Fixed rate → Set price per session type
    │       │       │       │
    │       │       │       ├── Price within market range?
    │       │       │       │       ├── YES → Approved
    │       │       │       │       └── NO (too high) → "Your price is above market average. This may reduce bookings. Continue anyway?"
    │       │       │       │               ├── YES → Allow (coach's choice)
    │       │       │       │               └── NO → Adjust price
    │       │       │       │
    │       │       │       └── Price too low?
    │       │       │               → "Your price is below market average. Consider raising to [suggested] to reflect your experience."
    │       │       │
    │       │       ├── Dynamic pricing → Set peak/off-peak rates
    │       │       │       "Peak hours (evenings, weekends): [price]. Off-peak: [price]."
    │       │       │
    │       │       └── Follow organization pricing → (for coaches also linked to an org)
    │       │               "Your organization sets the base rate. You can set a personal rate above the minimum."
    │       │
    │       └── Show projected earnings
    │               "At [price], 10 sessions/week = [amount]/month (before 15% platform fee)"
```

### Decision Tree 4: Receiving a Booking

```
New booking notification received
    │
    ├── Coach reviews booking details
    │       │
    │       ├── Accept?
    │       │       ├── YES → Booking confirmed
    │       │       │       │
    │       │       │       ├── Notify player: "Coach [name] confirmed your session!"
    │       │       │       ├── Add to calendar
    │       │       │       ├── Set reminder (24h before)
    │       │       │       └── Show in "Upcoming sessions"
    │       │       │
    │       │       └── NO (decline)
    │       │               │
    │       │               ├── Reason for decline?
    │       │               │       ├── Not available at that time
    │       │               │       ├── Already booked
    │       │               │       ├── Don't teach that specialty
    │       │               │       └── Other
    │       │               │
    │       │               ├── System offers alternatives:
    │       │               │       ├── "Would you like to suggest an alternative time?"
    │       │               │       └── "Would you like to recommend another coach?"
    │       │               │
    │       │               ├── Notify player: "Coach [name] is unavailable. Here are alternatives:"
    │       │               │       ├── Another time with same coach
    │       │               │       ├── Another coach at same branch
    │       │               │       └── Another branch with available coach
    │       │               │
    │       │               └── If coach declines > 30% of bookings → Flag for review
    │       │
    │       └── Request reschedule?
    │               │
    │               ├── Coach proposes alternative time
    │               │       ├── Player accepts → Booking updated
    │               │       ├── Player declines → Original booking cancelled, refund issued
    │               │       └── Player proposes counter-time → Coach accepts or declines
    │               │
    │               └── If reschedule requested > 24h before session → No penalty
    │                       If < 24h before → Coach receives warning
```

### Decision Tree 5: Payment & Withdrawal

```
Session completed
    │
    ├── Payment processed
    │       │
    │       ├── Earnings credited to wallet
    │       │       │
    │       │       ├── Coach wants to withdraw?
    │       │       │       │
    │       │       │       ├── Withdraw to bank account
    │       │       │       │       │
    │       │       │       │       ├── Bank account verified?
    │       │       │       │       │       ├── YES → Process withdrawal
    │       │       │       │       │       │       ├── Standard (1-3 business days)
    │       │       │       │       │       │       └── Instant (if available, with fee)
    │       │       │       │       │       │
    │       │       │       │       │       └── NO → "Please add and verify your bank account first."
    │       │       │       │       │               │
    │       │       │       │       │               ├── Add bank details
    │       │       │       │       │               ├── Verify (micro-deposit or instant)
    │       │       │       │       │               └── Retry withdrawal
    │       │       │       │       │
    │       │       │       │       └── Withdrawal fails?
    │       │       │       │               │
    │       │       │       │               ├── Insufficient balance → "Balance: [amount]. Minimum withdrawal: [amount]."
    │       │       │       │               ├── Bank rejected → "Bank rejected the transfer. Please check your account details."
    │       │       │       │               ├── System error → "Withdrawal could not be processed. Try again in a few minutes."
    │       │       │       │               └── Daily limit reached → "You've reached your daily withdrawal limit. Try again tomorrow."
    │       │       │       │
    │       │       │       └── Use balance for CourtZon services
    │       │       │               └── Pay for court bookings, equipment, etc. from wallet
    │       │       │
    │       │       └── Auto-withdrawal set?
    │       │               ├── YES → Process automatically on schedule
    │       │               └── NO → Manual withdrawal only
    │       │
    │       └── Transaction logged
    │               ├── Earnings entry created
    │               ├── Platform fee recorded
    │               └── Monthly statement updated
```

### Decision Tree 6: Reviews & Reputation

```
Player submits review
    │
    │
    ├── Review received by coach
    │       │
    │       ├── Rating 1-2 (negative)
    │       │       │
    │       │       ├── System analyzes feedback themes
    │       │       │       │
    │       │       │       ├── Coach sees: "This player mentioned [specific issue]"
    │       │       │       │       │
    │       │       │       │       ├── Suggested actions:
    │       │       │       │       │       ├── Punctuality issue → "Consider setting earlier reminders"
    │       │       │       │       │       ├── Communication issue → "Try sending a pre-session message"
    │       │       │       │       │       ├── Skill mismatch → "Review your specialty settings"
    │       │       │       │       │       └── Other → "Consider reaching out to understand the concern"
    │       │       │       │       │
    │       │       │       │       └── Coach can respond (publicly, professionally)
    │       │       │       │
    │       │       │       └── If 3+ negative reviews in a month → Flag for coaching intervention
    │       │       │
    │       │       └── Coach reputation impact:
    │       │               ├── Rating drops below 4.0 → Reduced visibility in search
    │       │               ├── Rating drops below 3.5 → Suspension review
    │       │               └── Rating recovers → Visibility restored
    │       │
    │       ├── Rating 3 (neutral)
    │       │       │
    │       │       ├── "Thanks for the feedback"
    │       │       ├── Coach sees specific improvement areas
    │       │       └── No reputation impact
    │       │
    │       └── Rating 4-5 (positive)
    │               │
    │               ├── Coach reputation boost
    │               │       ├── Higher visibility in search
    │               │       ├── "Top Rated" badge (if 4.8+ with 20+ reviews)
    │               │       └── Priority in "Any Coach" matching
    │               │
    │               └── Coach sees: "Players love your [specific strength]"
```

---

## Edge Cases — Independent Coach Journey

| # | Edge Case | System Behavior |
|---|-----------|----------------|
| IC-EC1 | **Verification rejected** | Send specific reason. Allow appeal within 30 days. Coach can resubmit corrected documents. If rejected twice, require 6-month wait before reapplication. |
| IC-EC2 | **Certification expires while active** | Notify coach 60 days, 30 days, and 7 days before expiry. If expired, hide "Verified" badge. Coach can still receive bookings but with lower visibility. If expired 90+ days, suspend profile until renewed. |
| IC-EC3 | **No bookings for 30+ days** | Trigger "Dormant Coach" workflow. Notify coach: "You haven't received a booking in 30 days." Suggest: update profile, adjust pricing, expand service area, add availability. If no response in 14 days, send reminder. If 60+ days dormant, suggest pausing profile. |
| IC-EC4 | **High cancellation rate (>20%)** | Warn coach: "Your cancellation rate is higher than average." Explain impact on visibility. Suggest reasons: overcommitment, unrealistic availability. If >40% for 2 months, review for platform standards compliance. |
| IC-EC5 | **Coach double-books (system failure)** | If the system fails to prevent double-booking (should not happen), contact both players. First booking honored. Second booking: full refund + alternative coach + goodwill gesture. Investigate root cause immediately. |
| IC-EC6 | **Wallet withdrawal failure** | Retry once automatically. If fails again, notify coach with specific error. Hold funds safely. Allow retry after 24 hours. If bank account is the issue, prompt to update bank details. |
| IC-EC7 | **Coach wants to pause profile** | Allow "Pause" mode. Profile hidden from search. Existing bookings honored. No new bookings received. Coach can resume anytime. Pause for 90+ days triggers "Inactive" status. |
| IC-EC8 | **Coach wants to leave platform** | Allow account deactivation. Settle outstanding earnings. Fulfill existing bookings or transfer to another coach. Retain review history for 12 months (anonymized). Allow reactivation within 12 months. |
| IC-EC9 | **Coach receives abusive player** | Allow coach to block player. Block prevents future bookings. Report to platform for review. Existing booking honored unless safety concern. Platform investigates and takes action. |
| IC-EC10 | **Player requests refund after session** | Coach is notified. Coach can provide context. If refund justified (poor quality, no-show by coach), deduct from next earnings. If unjustified, coach is not penalized. Platform makes final decision. |
| IC-EC11 | **Coach rating drops suddenly** | Immediate notification: "Your rating dropped from X to Y." Show which sessions caused the drop. Suggest specific improvements. If below 4.0, offer coaching intervention. If below 3.5, initiate review. |
| IC-EC12 | **Coach wants to change pricing** | Allow price changes at any time. Show impact preview: "Increasing from 300 to 350 EGP may reduce bookings by 10% but increase earnings per session." Existing bookings honored at original price. |
| IC-EC13 | **Platform fee dispute** | Show transparent breakdown for every transaction. Allow coach to query specific charges. If dispute valid, refund difference. If not, explain the fee structure clearly. Escalate to support if unresolved. |

---

## Success Metrics — Independent Coach Journey

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Time to first booking** | < 7 days | Days from profile approval to first completed booking |
| **Profile completion rate** | > 80% | Percentage of approved coaches with 100% complete profiles |
| **Booking acceptance rate** | > 85% | Percentage of received bookings that are accepted |
| **Monthly earnings growth** | > 10% MoM | Month-over-month increase in average coach earnings |
| **Repeat player rate** | > 50% | Percentage of players who rebook the same coach |
| **Average coach rating** | > 4.3 / 5 | Platform-wide average coach rating |
| **Coach retention (90-day)** | > 70% | Percentage of coaches still active 90 days after approval |
| **Time to first withdrawal** | < 14 days | Days from first earnings to first successful withdrawal |
| **Coach satisfaction (CSAT)** | > 4.0 / 5 | Quarterly coach satisfaction survey |
| **Cancellation rate (coach-initiated)** | < 10% | Percentage of bookings cancelled by coach |
| **Profile-to-booking conversion** | > 15% | Percentage of profile views that result in a booking |

---

## Journey Completion Criteria — Independent Coach Journey

The Independent Coach Journey is **complete** when all of the following are true:

- [ ] Application submitted and verified
- [ ] Profile approved and live
- [ ] Profile 100% complete (photo, bio, certifications, specialties)
- [ ] Pricing set for all session types
- [ ] Service areas and branches selected
- [ ] Availability configured
- [ ] First booking received and completed
- [ ] Payment received in wallet
- [ ] First withdrawal processed (or earnings visible)
- [ ] First review received
- [ ] Analytics dashboard accessible

**The journey does NOT end at approval.** It ends when the coach has completed the full cycle: application → profile → first booking → payment → review → growth.

---

## Smart Automation Ideas — Independent Coach Journey

1. **Smart Pricing Suggestions:** "Coaches at Maadi with your specialty charge 350-450 EGP. Your current rate (300 EGP) is below market — consider increasing to 380 EGP."

2. **Demand Forecasting:** "Next Saturday is a holiday. Demand typically drops 40%. Consider offering a 'holiday special' to fill your slots."

3. **Player Matching:** "Player Sarah M. is looking for a forehand specialist. You match 90% of her criteria. Accept this booking?"

4. **Schedule Optimization:** "You have gaps between 2pm and 4pm on Wednesdays. Filling those gaps could earn you an extra 700 EGP/week."

5. **Retention Alerts:** "Player Ahmed K. hasn't booked in 3 weeks. Send a check-in message?"

6. **Revenue Alerts:** "Your earnings are 15% below last month. Here are 3 things you can do this week to recover."

7. **Certification Reminders:** "Your coaching certification expires in 60 days. Renew now to keep your verified badge."

---
---

# Journey 3: Resident Coach

## Ownership

| Attribute | Value |
|-----------|-------|
| **Primary User** | Resident Coach (coach employed by an organization) |
| **Supporting Users** | Organization Admin (manages the coach), Player (books the coach) |
| **Business Owner** | Head of Product (with Organization input) |
| **System Responsibility** | Integrate coach into organization, manage schedule and bookings, track performance, ensure transparent earnings |

## Goal

A resident coach is invited by an organization, assigned to a branch, and integrated into the organization's coaching team. They focus on delivering great coaching while the organization handles business operations. The platform should feel like a supportive workplace, not a gig economy app.

## Steps

### 1. Invitation — "You've been invited"

The coach receives an invitation from an organization.

**Coach decision:** Do I want to join this organization?

**System behavior:**
- Personalized invitation with organization name, branch, and role details
- Clear explanation of terms: compensation model, working hours, expectations
- One-tap accept or decline
- If accepted, guided onboarding specific to the organization
- If declined, polite acknowledgment and option to reconsider later

### 2. Organization Assignment — "This is your team"

The coach is assigned to an organization.

**Coach decision:** What is my role here?

**System behavior:**
- Show organization profile: name, reputation, branches, coaching philosophy
- Show team: other coaches, management, support staff
- Show expectations: session types, minimum hours, quality standards
- Show compensation: per-session rate, revenue share, bonuses
- Show growth path: what does success look like here?
- Assign a mentor (experienced coach at the organization)

### 3. Branch Assignment — "This is your home"

The coach is assigned to a specific branch.

**Coach decision:** Where will I work?

**System behavior:**
- Show branch details: location, facilities, court types, amenities
- Show schedule: when am I expected?
- Show current coaching team at this branch
- Show player demand at this branch
- Allow feedback: "I'd prefer to also work at [other branch]"
- Show commute information and travel time estimates

### 4. Working Hours — "This is my schedule"

The coach sets or receives their working hours.

**Coach decision:** When am I available?

**System behavior:**
- Show the organization's required hours (if any)
- Allow the coach to set preferred hours within those constraints
- Show how hours translate to potential sessions and earnings
- Handle schedule changes: swap requests, time-off requests, overtime opportunities
- Sync with personal calendar

### 5. Availability — "I'm ready to coach"

The coach sets their availability for player bookings.

**Coach decision:** Which slots are open for booking?

**System behavior:**
- Availability derived from working hours (no duplication)
- Coach can mark slots as "available for booking" vs. "reserved for organization sessions"
- Show demand forecast
- Auto-fill open slots for player booking
- Coach can block specific dates in advance

### 6. Bookings — "I'm coaching"

The coach receives and manages bookings.

**Coach decision:** Prepare for the session

**System behavior:**
- Unified view of organization sessions and player bookings
- Show organization session notes (if applicable)
- Show player history and preferences
- Track attendance and session quality
- Auto-reminder system

### 7. Calendar — "This is my week"

The coach sees their complete schedule.

**Coach decision:** How do I manage my time?

**System behavior:**
- Weekly calendar with all sessions (organization and player)
- Color coding: organization sessions, player bookings, personal time
- Drag to reschedule (within organization rules)
- Show gaps: "You have a 2-hour gap — open for booking?"
- Sync with external calendars
- Show earnings per day

### 8. Revenue — "How much am I earning?"

The coach sees their earnings from the organization.

**Coach decision:** Am I being paid fairly?

**System behavior:**
- Per-session earnings with transparent breakdown
- Monthly summary
- Revenue share breakdown (if applicable)
- Comparison to branch average
- Payment schedule clarity
- Bonus tracking

### 9. Reports — "How am I doing?"

The coach receives performance feedback.

**Coach decision:** What can I improve?

**System behavior:**
- Performance metrics: sessions, rating, retention, utilization
- Player feedback summary
- Comparative analysis (anonymized)
- Goal tracking
- Improvement suggestions
- Recognition for top performance

---

## Decision Trees — Resident Coach Journey

### Decision Tree 1: Invitation & Onboarding

```
Invitation received
    │
    ├── Review invitation details
    │       │
    │       ├── Accept invitation?
    │       │       │
    │       │       ├── YES → Onboarding starts
    │       │       │       │
    │       │       │       ├── Organization profile shown
    │       │       │       ├── Terms and compensation explained
    │       │       │       ├── Branch assignment confirmed
    │       │       │       ├── Mentor assigned
    │       │       │       ├── Working hours set
    │       │       │       └── "Welcome to [Organization]! Here's your first week."
    │       │       │
    │       │       └── NO
    │       │               │
    │       │               ├── Reason?
    │       │               │       ├── Don't know the organization → "Here's more about [Org]: [details]"
    │       │               │       ├── Terms not acceptable → "Would you like to discuss terms with the organization?"
    │       │               │       ├── Location inconvenient → "Would you prefer a different branch? [available options]"
    │       │               │       └── Not ready → "No problem. This invitation is valid for 14 days."
    │       │               │
    │       │               └── Invitation expires after 14 days → Notify organization
    │       │
    │       └── Save and return later
    │               └── Invitation preserved, reminder sent in 7 days
```

### Decision Tree 2: Schedule Management

```
Coach viewing schedule
    │
    ├── Weekly view
    │       │
    │       ├── Organization session scheduled
    │       │       │
    │       │       ├── Can coach attend?
    │       │       │       ├── YES → Confirm attendance
    │       │       │       └── NO
    │       │       │               │
    │       │       │               ├── Request swap with another coach
    │       │       │               │       ├── Swap partner found?
    │       │       │               │       │       ├── YES → Organization approves swap
    │       │       │               │       │       └── NO → Request time off instead
    │       │       │               │       │
    │       │       │               ├── Request time off
    │       │       │               │       ├── Approved?
    │       │       │               │       │       ├── YES → Schedule updated, session reassigned
    │       │       │               │       │       └── NO → "Coverage needed. Please find a swap partner."
    │       │       │               │       │
    │       │       │               │       └── Last-minute (< 24h) → Warning recorded
    │       │       │               │
    │       │       │               └── Emergency (same day) → Notify organization immediately
    │       │       │
    │       │       └── Player booking in same time slot?
    │       │               └── Conflict detected → Player booking takes priority (organization rule)
    │       │                       └── Player notified of any changes
    │       │
    │       └── Open slots (no organization session)
    │               │
    │               ├── Auto-opened for player booking?
    │               │       ├── YES → Visible to players
    │               │       └── NO → Coach chose to keep personal time
    │               │
    │               └── Gap > 2 hours?
    │                       └── "You have open time. Would you like to make it available for booking?"
```

### Decision Tree 3: Revenue & Payment

```
Session completed
    │
    ├── Revenue calculated
    │       │
    │       ├── Organization model
    │       │       │
    │       │       ├── Fixed rate per session
    │       │       │       └── Coach earns: [fixed amount] per session
    │       │       │
    │       │       ├── Revenue share
    │       │       │       └── Coach earns: [percentage]% of session price
    │       │       │
    │       │       └── Hybrid
    │       │               └── Base rate + bonus for exceeding targets
    │       │
    │       ├── Earnings credited to wallet
    │       │       │
    │       │       ├── Monthly payout schedule?
    │       │       │       ├── YES → Paid on [date] of each month
    │       │       │       └── NO → Paid after each session
    │       │       │
    │       │       └── Withdrawal available?
    │       │               ├── YES → Same as independent coach withdrawal flow
    │       │               └── NO → Earnings accumulate until monthly payout
    │       │
    │       └── Bonus triggered?
    │               │
    │               ├── exceeded session target → Bonus credited
    │               ├── top rating this month → Bonus credited
    │               └── zero cancellations → Bonus credited
```

---

## Edge Cases — Resident Coach Journey

| # | Edge Case | System Behavior |
|---|-----------|----------------|
| RC-EC1 | **Organization removes assignment** | Notify coach with reason. Honor existing bookings for the current period. If termination, process final payment within 7 days. Allow coach to appeal within 14 days. |
| RC-EC2 | **Branch closed (emergency)** | Notify all assigned coaches immediately. Reassign sessions to nearest available branch or cancel with full refund. Coach is not penalized for cancelled sessions. |
| RC-EC3 | **Schedule conflict** | Detect at booking time. Organization session takes precedence. Player booking moved or refunded. Coach notified of conflict resolution. |
| RC-EC4 | **Temporary replacement needed** | Organization assigns substitute coach. Player notified of coach change. Original coach's sessions transferred. Coach returns to schedule when available. |
| RC-EC5 | **Coach exceeds maximum working hours** | Warn coach: "You've exceeded [X] hours this week." Block new bookings beyond limit. Organization can override for special circumstances. |
| RC-EC6 | **Coach wants to transfer branches** | Submit transfer request. Organization reviews. If approved, update assignment. Existing bookings at old branch honored. New availability at new branch activated. |
| RC-EC7 | **Organization changes compensation model** | Notify coach 30 days before change takes effect. Existing bookings honored at old rate. New rate applies to new bookings. Coach can accept or decline (with notice period). |
| RC-EC8 | **Coach performance below standards** | Notify coach of specific metrics below threshold. Offer improvement plan with timeline. If no improvement in 30 days, escalate to organization for review. |
| RC-EC9 | **Coach on medical leave** | Allow leave request with documentation. Suspend schedule without penalty. Organization arranges coverage. Coach returns when cleared. Earnings paused during leave. |
| RC-EC10 | **Player complains about resident coach** | Notify organization and coach. Organization investigates. If valid, coaching intervention. If repeated, reassignment or termination. Player offered alternative coach. |

---

## Success Metrics — Resident Coach Journey

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Utilization rate** | > 75% | Percentage of available hours that are booked (organization + player) |
| **Attendance rate** | > 95% | Percentage of scheduled sessions actually attended |
| **Punctuality rate** | > 90% | Percentage of sessions starting on time |
| **Player retention** | > 60% | Percentage of players who rebook the same coach within 30 days |
| **Average rating** | > 4.2 / 5 | Average player rating |
| **Schedule adherence** | > 85% | Percentage of sessions completed as originally scheduled |
| **Organization satisfaction** | > 4.0 / 5 | Quarterly organization survey of coach performance |
| **Revenue per hour** | > 250 EGP | Average earnings per coaching hour |
| **Time to first booking** | < 3 days | Days from onboarding completion to first player booking |
| **Conflict rate** | < 5% | Percentage of bookings with schedule conflicts |

---

## Journey Completion Criteria — Resident Coach Journey

The Resident Coach Journey is **complete** when all of the following are true:

- [ ] Invitation accepted
- [ ] Organization profile and terms reviewed
- [ ] Branch assigned
- [ ] Mentor assigned
- [ ] Working hours configured
- [ ] Availability set for player bookings
- [ ] First organization session completed
- [ ] First player booking received and completed
- [ ] Earnings visible in wallet
- [ ] First performance report reviewed
- [ ] Calendar fully functional (sync, reschedule, swap)

**The journey does NOT end at onboarding.** It ends when the coach is fully integrated: invited → onboarded → scheduled → coaching → earning → growing.

---

## Smart Automation Ideas — Resident Coach Journey

1. **Smart Scheduling:** "You have a gap between 3pm and 5pm on Wednesday. The system found 3 players looking for coaching at that time. Open these slots?"

2. **Performance Alerts:** "Your rating dropped from 4.7 to 4.5 this month. Here are the specific sessions that pulled it down and what players said."

3. **Earnings Optimization:** "You're earning 20% less than coaches with similar experience at your branch. Consider opening weekend slots — demand is highest then."

4. **Retention Intelligence:** "Player Ahmed K. has booked you 5 times. He's a great candidate for a package deal — 10 sessions at a discount."

5. **Schedule Conflict Detection:** "You have an organization session at 4pm and a player booking at 4:30pm. The system detected the conflict and moved the player booking to 5pm."

---
---

# Journey 4: Organization

## Ownership

| Attribute | Value |
|-----------|-------|
| **Primary User** | Organization Admin (manages coaching operations) |
| **Supporting Users** | Coach (managed by org), Player (books coaches), Platform Admin |
| **Business Owner** | Head of Product |
| **System Responsibility** | Enable org to recruit, manage, and optimize coaching staff; provide data-driven insights for revenue and performance; automate administrative operations |

## Goal

An organization manages its coaching staff efficiently — recruiting the right coaches, assigning them to branches, setting pricing, tracking performance, and maximizing revenue — all without administrative overhead. The platform should feel like a coaching management dashboard, not a spreadsheet.

## Steps

### 1. Recruitment — "I need coaches"

The organization identifies coaching needs.

**Organization decision:** What coaches do I need?

**System behavior:**
- Show current coaching capacity vs. demand per branch
- Show gaps: "You need 2 more coaches for Saturday mornings at Maadi"
- Suggest recruitment sources: "15 coaches in your area are looking for opportunities"
- Allow posting a position
- Show applicant pipeline

### 2. Coach Approval — "Is this person right?"

The organization reviews coach applications.

**Organization decision:** Approve or reject?

**System behavior:**
- Show applicant profile with fit score
- Show risk factors
- One-tap approve or reject (with reason)
- Batch approval capability
- Onboarding automation after approval

### 3. Branch Assignment — "Where do they work?"

The organization assigns coaches to branches.

**Organization decision:** Which coach goes where?

**System behavior:**
- Show branch needs and coach preferences
- Optimization suggestions
- Show impact of assignments
- Allow temporary assignments

### 4. Pricing Rules — "What do we charge?"

The organization sets pricing policies.

**Organization decision:** What is our pricing strategy?

**System behavior:**
- Show market rates and competitor pricing
- Set organization-wide, coach-specific, and branch-specific pricing
- Set time-based pricing
- Show revenue projections

### 5. Revenue Sharing — "How do we split?"

The organization defines revenue sharing with coaches.

**Organization decision:** What is the split?

**System behavior:**
- Define revenue share model
- Show impact on both coach earnings and organization revenue
- Handle different models for different coach types
- Transparent to both parties

### 6. Coach Performance — "Who is doing well?"

The organization monitors coach performance.

**Organization decision:** Who needs support? Who deserves recognition?

**System behavior:**
- Dashboard with all coaches ranked by performance
- Identify underperformers and top performers
- Show player feedback themes per coach
- Generate performance reports

### 7. Utilization — "Are we efficient?"

The organization tracks coaching capacity utilization.

**Organization decision:** Are we using our coaches well?

**System behavior:**
- Utilization rate per coach and branch
- Identify waste and suggest optimization
- Show revenue per utilized hour
- Forecast impact of utilization improvements

### 8. Reports — "Show me the numbers"

The organization sees comprehensive business reports.

**Organization decision:** How is our coaching business performing?

**System behavior:**
- Revenue, player, coach, and operational reports
- Trend analysis and benchmarking
- Export capabilities
- Scheduled report delivery

---

## Decision Trees — Organization Journey

### Decision Tree 1: Recruitment

```
Organization identifies coaching need
    │
    ├── Analyze current capacity
    │       │
    │       ├── Sufficient coaches?
    │       │       ├── YES → Monitor for changes
    │       │       └── NO
    │       │               │
    │       │               ├── What is the gap?
    │       │               │       ├── New branch → Need full coaching team
    │       │               │       ├── Existing branch, growing demand → Need more coaches
    │       │               │       ├── Specialty gap → Need specific expertise
    │       │               │       └── Seasonal demand → Need temporary coverage
    │       │               │
    │       │               ├── Recruitment options
    │       │               │       │
    │       │               │       ├── Search existing CourtZon coaches
    │       │               │       │       │
    │       │               │       │       ├── Filters:
    │       │               │       │       │   ├── Specialty match
    │       │               │       │       │   ├── Location/proximity
    │       │               │       │       │   ├── Rating (>4.0)
    │       │               │       │       │   ├── Availability
    │       │               │       │       │   └── Experience level
    │       │               │       │       │
    │       │               │       │       ├── Results found?
    │       │               │       │       │       ├── YES → Send invitations to top candidates
    │       │               │       │       │       └── NO → Expand search or post position
    │       │               │       │       │
    │       │               │       │       └── Invite coach
    │       │               │       │               │
    │       │               │       │               ├── Coach accepts?
    │       │               │       │               │       ├── YES → Start onboarding
    │       │               │       │               │       ├── NO → Try next candidate
    │       │               │       │               │       └── No response (7 days) → Follow up or move on
    │       │               │       │
    │       │               │       └── Post position (public listing)
    │       │               │               │
    │       │               │               ├── Applications received
    │       │               │               │       │
    │       │               │               │       ├── Review pipeline
    │       │               │               │       │       ├── New applicants → Review profile
    │       │               │               │       │       ├── Under review → Make decision
    │       │               │               │       │       ├── Approved → Send invitation
    │       │               │               │       │       └── Rejected → Send polite decline
    │       │               │               │       │
    │       │               │               │       └── If no applications in 14 days
    │       │               │               │               ├── Expand listing reach
    │       │               │               │               ├── Adjust requirements
    │       │               │               │               └── Consider internal promotion
```

### Decision Tree 2: Coach Approval

```
Application received
    │
    ├── Review applicant
    │       │
    │       ├── Check qualifications
    │       │       │
    │       │       ├── Certification valid?
    │       │       │       ├── YES → Continue review
    │       │       │       └── NO → Request updated certification or reject
    │       │       │
    │       │       ├── Experience sufficient?
    │       │       │       ├── YES → Continue review
    │       │       │       ├── Borderline → "This coach has [X] years experience. Minimum is [Y]. Consider?"
    │       │       │       └── NO → Reject with feedback
    │       │       │
    │       │       └── Specialties match need?
    │       │               ├── YES → Strong candidate
    │       │               ├── Partial → "Coach specializes in [X] but you need [Y]. Trainable?"
    │       │               └── NO → Reject or consider for different role
    │       │
    │       ├── Fit score calculated
    │       │       "This coach matches 85% of your [branch] [specialty] needs"
    │       │
    │       ├── Decision
    │       │       │
    │       │       ├── Approve
    │       │       │       │
    │       │       │       ├── Send welcome package
    │       │       │       ├── Assign branch
    │       │       │       ├── Set initial schedule
    │       │       │       ├── Assign mentor
    │       │       │       └── Start onboarding
    │       │       │
    │       │       ├── Reject
    │       │       │       │
    │       │       │       ├── Reason required (for coach)
    │       │       │       │       ├── Doesn't meet requirements
    │       │       │       │       ├── Position filled
    │       │       │       │       ├── Not the right fit
    │       │       │       │       └── Other
    │       │       │       │
    │       │       │       ├── Send professional decline
    │       │       │       │       "Thank you for applying. Unfortunately, we've decided to move forward with other candidates."
    │       │       │       │
    │       │       │       └── Coach can reapply after 6 months
    │       │       │
    │       │       └── Hold (need more information)
    │       │               │
    │       │               ├── Request additional documents
    │       │               ├── Schedule interview/call
    │       │               └── Decision pending for max 14 days
    │       │
    │       └── Batch review mode
    │               │
    │               ├── Review multiple applicants at once
    │               ├── Approve/reject in bulk
    │               └── Priority queue: best matches shown first
```

### Decision Tree 3: Pricing & Revenue

```
Organization setting pricing
    │
    ├── Pricing strategy
    │       │
    │       ├── Base pricing (organization-wide)
    │       │       │
    │       │       ├── Session type pricing
    │       │       │       ├── 1-on-1 private: [amount] EGP/hour
    │       │       │       ├── Small group: [amount] EGP/player/hour
    │       │       │       ├── Group clinic: [amount] EGP/player/session
    │       │       │       └── Match play: [amount] EGP/player/session
    │       │       │
    │       │       ├── Branch overrides
    │       │       │       ├── Maadi: +10% (higher demand)
    │       │       │       ├── Heliopolis: base rate
    │       │       │       └── Neweyba: -5% (building demand)
    │       │       │
    │       │       └── Time-based adjustments
    │       │               ├── Peak (evenings, weekends): +15%
    │       │               ├── Off-peak (mornings, weekdays): -10%
    │       │               └── Last-minute (< 2h): -20%
    │       │
    │       ├── Coach-specific pricing
    │       │       │
    │       │       ├── Premium coaches (4.8+ rating, 100+ sessions)
    │       │       │       "Coach Ahmed can charge up to [amount] (above org base rate)"
    │       │       │
    │       │       ├── Standard coaches
    │       │       │       "Follows organization base rate"
    │       │       │
    │       │       └── New coaches (first 30 days)
    │       │               "Introductory rate: -10% to attract first players"
    │       │
    │       └── Revenue share model
    │               │
    │               ├── Define split
    │               │       "Coach earns [X]%, Organization earns [Y]%"
    │               │
    │               ├── Show impact
    │               │       "At 60/40 split, Coach Ahmed earns 240 EGP per 400 EGP session"
    │               │       "Organization earns 160 EGP per session × 100 sessions/month = 16,000 EGP"
    │               │
    │               ├── Transparency
    │               │       Both coach and organization see same numbers
    │               │       All deductions visible
    │               │
    │               └── Adjustments
    │                       ├── Bonus structure: "Top-rated coaches get 5% more"
    │                       ├── Volume discount: "100+ sessions/month = extra 2% for coach"
    │                       └── Platform fee: "CourtZon takes 15% from total" (clearly shown)
```

### Decision Tree 4: Performance Management

```
Organization monitoring coaches
    │
    ├── Review performance dashboard
    │       │
    │       ├── Coach performing well?
    │       │       │
    │       │       ├── YES (above standards)
    │       │       │       │
    │       │       │       ├── Recognition
    │       │       │       │       ├── "Top Performer" badge
    │       │       │       │       ├── Bonus consideration
    │       │       │       │       ├── Promotion opportunity
    │       │       │       │       └── Featured in search results
    │       │       │       │
    │       │       │       └── Growth
    │       │       │               ├── "Consider expanding their service area"
    │       │       │               ├── "They could mentor new coaches"
    │       │       │               └── "Premium pricing approved"
    │       │       │
    │       │       └── NO (below standards)
    │       │               │
    │       │               ├── What is the issue?
    │       │               │       │
    │       │               │       ├── Low rating (< 4.0)
    │       │               │       │       │
    │       │               │       │       ├── Coach notified with specific feedback
    │       │               │       │       ├── Improvement plan created
    │       │               │       │       │       ├── Goal: raise rating to 4.2 in 30 days
    │       │               │       │       │       ├── Actions: training, shadowing, feedback sessions
    │       │               │       │       │       └── Check-in: weekly progress review
    │       │               │       │       │
    │       │               │       │       └── No improvement after 30 days?
    │       │               │       │               ├── Reassignment to different branch/specialty
    │       │               │       │               ├── Reduced hours
    │       │               │       │               ├── Termination review
    │       │               │       │               └── Player impact: offer alternative coaches
    │       │               │       │
    │       │               │       ├── High cancellation rate (> 20%)
    │       │               │       │       ├── Warning issued
    │       │               │       │       ├── Root cause analysis
    │       │               │       │       └── If > 40% for 2 months → Termination review
    │       │               │       │
    │       │               │       ├── Low utilization (< 50%)
    │       │               │       │       ├── Is it demand or supply?
    │       │               │       │       ├── If demand: "Marketing needed for this branch"
    │       │               │       │       ├── If supply: "Coach availability doesn't match demand"
    │       │               │       │       └── Suggest: adjust hours, change branch, adjust pricing
    │       │               │       │
    │       │               │       └── Player complaints
    │       │               │               ├── Investigate specific complaints
    │       │               │               ├── Mediate if needed
    │       │               │               ├── Coach counseled
    │       │               │               └── If serious: immediate suspension review
    │       │
    │       └── Comparative analysis
    │               │
    │               ├── "Coach X vs. branch average:"
    │               │       ├── Rating: 4.5 vs 4.2 (above)
    │               │       ├── Sessions: 20 vs 18 (above)
    │               │       ├── Retention: 55% vs 50% (above)
    │               │       └── Utilization: 70% vs 75% (below)
    │               │
    │               └── "Overall branch performance:"
    │                       ├── Total revenue: [amount] (trend)
    │                       ├── Average rating: [amount] (trend)
    │                       ├── Coach utilization: [amount]% (trend)
    │                       └── Player satisfaction: [amount] (trend)
```

---

## Edge Cases — Organization Journey

| # | Edge Case | System Behavior |
|---|-----------|----------------|
| OG-EC1 | **No suitable coaches available** | Expand search radius. Lower requirements temporarily. Post position publicly. Suggest internal training/promotion. If critical, offer platform assistance for recruitment. |
| OG-EC2 | **Coach resigns** | Notify organization immediately. Coach must fulfill existing bookings or transfer to another coach. Organization enters recruitment mode. Player sessions at risk are flagged for priority rebooking. |
| OG-EC3 | **Coach suspended** | Immediate suspension of new bookings. Existing bookings reviewed case-by-case. Coach notified with reason and appeal process. Player sessions reassigned. If suspension upheld, final payment processed. |
| OG-EC4 | **Branch reaches full capacity** | "Branch is fully booked for [date]. Waitlist enabled." Players can join waitlist. Organization notified of demand overflow. Consider: additional coach, extended hours, or overflow branch. |
| OG-EC5 | **Revenue dispute with coach** | Show transparent transaction log. Both parties see same numbers. Platform mediates if needed. If unresolved, escalate to account manager. All disputes logged for audit. |
| OG-EC6 | **Coach ratings manipulation detected** | Detect suspicious patterns (same IP, rapid reviews, fake accounts). Flag reviews for investigation. Remove fraudulent reviews. Warn or suspend coach. Protect platform integrity. |
| OG-EC7 | **Organization wants to change revenue share** | Notify coaches 30 days before change. Existing bookings at old rate. New rate for new bookings. Coach can accept or decline (with notice period). Cannot retroactively change. |
| OG-EC8 | **Seasonal demand spike** | Predict spike based on historical data. Suggest: temporary coaches, extended hours, peak pricing. Alert organization 4 weeks before expected spike. |
| OG-EC9 | **Coach medical emergency during session** | Immediate notification to organization. Emergency services contacted if needed. Session cancelled with full player refund. Coach on medical leave. Replacement arranged. |
| OG-EC10 | **Multiple organizations compete for same coach** | Coach sees all offers. Organization sees coach's availability (not competing offers). Coach chooses. No bidding wars. Fair and transparent process. |

---

## Success Metrics — Organization Journey

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Coach utilization** | > 75% | Percentage of available coaching hours that are booked |
| **Revenue per coach per month** | > 8,000 EGP | Average monthly revenue generated per coach |
| **Coach retention (annual)** | > 60% | Percentage of coaches still active after 12 months |
| **Time to fill coaching demand** | < 7 days | Days from identifying a gap to having a coach assigned |
| **Player satisfaction per org** | > 4.3 / 5 | Average rating for organization's coaches |
| **Booking completion rate** | > 90% | Percentage of bookings that are completed (not cancelled) |
| **Revenue growth (QoQ)** | > 15% | Quarter-over-quarter revenue growth |
| **Admin time per coach** | < 2 hours/week | Time spent on coaching administration per coach |
| **Coach application conversion** | > 40% | Percentage of invitations accepted |
| **Report generation time** | < 5 minutes | Time to generate a comprehensive business report |

---

## Journey Completion Criteria — Organization Journey

The Organization Journey is **complete** when all of the following are true:

- [ ] Coaching need identified and gap analyzed
- [ ] Recruitment process initiated (invitation or job posting)
- [ ] Coach applications received and reviewed
- [ ] Coach approved and onboarding started
- [ ] Branch assignment confirmed
- [ ] Pricing rules configured
- [ ] Revenue sharing model defined
- [ ] Coach actively receiving and completing bookings
- [ ] Performance dashboard accessible and populated
- [ ] Utilization tracking active
- [ ] Reports generated and reviewed
- [ ] Revenue flowing to organization and coaches

**The journey does NOT end at hiring a coach.** It ends when the organization is running a profitable, well-managed coaching operation: recruit → onboard → assign → price → manage → optimize → grow.

---

## Smart Automation Ideas — Organization Journey

1. **Demand Forecasting:** "Next week is a holiday. Expect 30% fewer bookings. Consider reducing coach hours or offering special promotions."

2. **Staffing Recommendations:** "Your Saturday morning demand exceeds capacity by 40%. Hire 1 more coach or reduce session lengths."

3. **Revenue Optimization:** "Increasing your private session rate from 350 to 400 EGP would reduce bookings by only 5% but increase revenue by 10%."

4. **Retention Alerts:** "Coach Ahmed's rating dropped from 4.6 to 4.2 over 3 months. Schedule a performance review."

5. **Growth Opportunities:** "Player demand for junior coaching at Heliopolis increased 50% this quarter. Consider adding a junior coach there."

6. **Automated Onboarding:** "New coach Coach Sara is approved. Auto-assign to Heliopolis branch, set initial schedule, send welcome package."

---
---

# Cross-Journey Themes

## Theme 1: The Invisible Engine

Every journey should feel effortless because the Scheduling Engine works invisibly:
- Players never see resource allocation
- Coaches never see slot management
- Organizations never see conflict resolution

The engine is the bridge between what the user wants and what the system needs to do.

## Theme 2: Intelligent Defaults

Every screen should have a smart default:
- "Book with your last coach" instead of "Search for a coach"
- "Set your usual schedule" instead of "Enter every slot"
- "Apply the standard pricing" instead of "Set each price manually"

The system should learn from behavior and reduce decisions over time.

## Theme 3: Transparency

Every financial transaction should be visible:
- Players see exactly what they pay and why
- Coaches see exactly what they earn and when
- Organizations see exactly what the platform takes and why

Transparency builds trust. Trust builds loyalty.

## Theme 4: Growth Orientation

Every journey should help the user grow:
- Players improve their game through structured coaching
- Coaches grow their business through data and tools
- Organizations increase revenue through optimization

The platform is not just a booking tool — it is a growth partner.

## Theme 5: Human Connection

Despite all the technology, the core of CourtZon is human:
- A player trusting a coach to improve their game
- A coach investing in a player's development
- An organization building a team of great coaches

The platform should amplify this connection, never replace it.

## Theme 6: Edge Case Empathy

When something goes wrong, the system should feel human:
- Never blame the user
- Always explain what happened and what happens next
- Always offer a clear path forward
- Always preserve the user's trust

Errors are not failures. They are opportunities to demonstrate care.

## Theme 7: Progressive Disclosure

Show only what the user needs, when they need it:
- First booking: simple, guided, minimal choices
- Fifth booking: more options, less guidance
- Twentieth booking: full control, personalized defaults

The system should grow with the user.

---

# Appendix: Complete Edge Case Summary

## Player Edge Cases (18)

| ID | Scenario | Criticality |
|----|----------|-------------|
| P-EC1 | No coaches at preferred branch | Medium |
| P-EC2 | No coaches available anywhere | High |
| P-EC3 | Coach available, court unavailable | High |
| P-EC4 | Court available, coach unavailable | Critical (system bug if reaches player) |
| P-EC5 | Coach outside service area | Low |
| P-EC6 | Budget too low | Medium |
| P-EC7 | Player cancels after booking | High |
| P-EC8 | Player cancels repeatedly | Medium |
| P-EC9 | Coach cancels after booking | High |
| P-EC10 | Coach cancels within 2 hours | Critical |
| P-EC11 | Payment fails | High |
| P-EC12 | Network interruption during booking | Critical |
| P-EC13 | Player is a minor | High |
| P-EC14 | Player requests refund after session | Medium |
| P-EC15 | Session overruns | Low |
| P-EC16 | Multiple players book group slot | Medium |
| P-EC17 | Player wants to switch coach mid-session | Low |
| P-EC18 | Incorrect negative review | Low |

## Independent Coach Edge Cases (13)

| ID | Scenario | Criticality |
|----|----------|-------------|
| IC-EC1 | Verification rejected | High |
| IC-EC2 | Certification expires while active | High |
| IC-EC3 | No bookings for 30+ days | Medium |
| IC-EC4 | High cancellation rate | High |
| IC-EC5 | Coach double-books (system failure) | Critical |
| IC-EC6 | Wallet withdrawal failure | High |
| IC-EC7 | Coach wants to pause profile | Low |
| IC-EC8 | Coach wants to leave platform | Medium |
| IC-EC9 | Coach receives abusive player | High |
| IC-EC10 | Player requests refund after session | Medium |
| IC-EC11 | Rating drops suddenly | High |
| IC-EC12 | Coach wants to change pricing | Low |
| IC-EC13 | Platform fee dispute | Medium |

## Resident Coach Edge Cases (10)

| ID | Scenario | Criticality |
|----|----------|-------------|
| RC-EC1 | Organization removes assignment | High |
| RC-EC2 | Branch closed (emergency) | Critical |
| RC-EC3 | Schedule conflict | High |
| RC-EC4 | Temporary replacement needed | High |
| RC-EC5 | Coach exceeds max working hours | Medium |
| RC-EC6 | Coach wants to transfer branches | Medium |
| RC-EC7 | Org changes compensation model | High |
| RC-EC8 | Coach performance below standards | High |
| RC-EC9 | Coach on medical leave | High |
| RC-EC10 | Player complains about coach | Medium |

## Organization Edge Cases (10)

| ID | Scenario | Criticality |
|----|----------|-------------|
| OG-EC1 | No suitable coaches available | High |
| OG-EC2 | Coach resigns | Critical |
| OG-EC3 | Coach suspended | High |
| OG-EC4 | Branch reaches full capacity | High |
| OG-EC5 | Revenue dispute with coach | Medium |
| OG-EC6 | Rating manipulation detected | Critical |
| OG-EC7 | Org wants to change revenue share | High |
| OG-EC8 | Seasonal demand spike | Medium |
| OG-EC9 | Coach medical emergency | Critical |
| OG-EC10 | Multiple orgs compete for coach | Low |

**Total edge cases: 51** (18 Player + 13 Independent Coach + 10 Resident Coach + 10 Organization)

---

# Appendix: Complete Metrics Summary

## Player Metrics (12)

| Metric | Target |
|--------|--------|
| Time from app open to booking | < 3 minutes |
| Booking completion rate | > 70% |
| Average booking duration | < 2 minutes |
| First-time booking rate | > 40% |
| Cancellation rate | < 10% |
| No-show rate | < 5% |
| Rebooking rate | > 60% |
| Player satisfaction (CSAT) | > 4.5 / 5 |
| Net Promoter Score (NPS) | > 50 |
| Payment success rate | > 98% |
| Session completion rate | > 95% |
| Refund rate | < 3% |

## Independent Coach Metrics (11)

| Metric | Target |
|--------|--------|
| Time to first booking | < 7 days |
| Profile completion rate | > 80% |
| Booking acceptance rate | > 85% |
| Monthly earnings growth | > 10% MoM |
| Repeat player rate | > 50% |
| Average coach rating | > 4.3 / 5 |
| Coach retention (90-day) | > 70% |
| Time to first withdrawal | < 14 days |
| Coach satisfaction (CSAT) | > 4.0 / 5 |
| Cancellation rate (coach-initiated) | < 10% |
| Profile-to-booking conversion | > 15% |

## Resident Coach Metrics (10)

| Metric | Target |
|--------|--------|
| Utilization rate | > 75% |
| Attendance rate | > 95% |
| Punctuality rate | > 90% |
| Player retention | > 60% |
| Average rating | > 4.2 / 5 |
| Schedule adherence | > 85% |
| Organization satisfaction | > 4.0 / 5 |
| Revenue per hour | > 250 EGP |
| Time to first booking | < 3 days |
| Conflict rate | < 5% |

## Organization Metrics (10)

| Metric | Target |
|--------|--------|
| Coach utilization | > 75% |
| Revenue per coach per month | > 8,000 EGP |
| Coach retention (annual) | > 60% |
| Time to fill coaching demand | < 7 days |
| Player satisfaction per org | > 4.3 / 5 |
| Booking completion rate | > 90% |
| Revenue growth (QoQ) | > 15% |
| Admin time per coach | < 2 hours/week |
| Coach application conversion | > 40% |
| Report generation time | < 5 minutes |

**Total metrics: 43** (12 Player + 11 Independent Coach + 10 Resident Coach + 10 Organization)

---

# Product Strategy & User Promise

## Why CourtZon?

Before any feature is built, every stakeholder should understand one thing: **why does this platform exist, and why would anyone use it?**

The answers are not about technology. They are about human value.

---

## Player Value Proposition

**The promise to the player:** CourtZon makes finding and working with a great coach as easy as ordering food delivery.

### Why would a player choose CourtZon instead of simply calling a coach?

| Without CourtZon | With CourtZon |
|------------------|---------------|
| Call or text multiple coaches to find availability | See available coaches instantly, filtered by need, location, and schedule |
| No idea if the coach is good — rely on word of mouth | Verified ratings, reviews, and session history from real players |
| Negotiate price every time | Transparent pricing, no surprises |
| Hope the coach shows up | Confirmed booking with reminders, accountability, and backup options |
| No record of progress | History of sessions, skills worked on, and improvement over time |
| Pay cash, no receipt | Secure payment, instant receipt, wallet management |
| Cancel via awkward text message | One-tap cancellation with clear policy |

### The six promises:

1. **Find the right coach, not just any coach.** The system matches your need, schedule, location, and budget to the best available coach — not the first one who answers the phone.

2. **Book in minutes, not days.** From opening the app to confirmed booking, the entire process takes less than 3 minutes.

3. **Know exactly what you pay.** Price breakdown shown before you confirm. No hidden fees. No last-minute surprises.

4. **Trust who you train with.** Every coach is verified. Every session is rated. Every review is real.

5. **One place for your coaching journey.** Sessions, progress, payments, history — everything in one place, always accessible.

6. **Improve through data.** Track your sessions, see your patterns, and get recommendations for what to work on next.

---

## Independent Coach Value Proposition

**The promise to the independent coach:** CourtZon turns coaching from a side hustle into a real business — with the tools, visibility, and payments to match.

### Why would an independent coach join CourtZon instead of using WhatsApp and Instagram?

| Without CourtZon | With CourtZon |
|------------------|---------------|
| Post on Instagram, hope for DMs | Appear in search results for players actively looking for coaching |
| Manually check calendar, negotiate times | Real-time availability, automatic booking |
| Chase players for payment | Automatic payment processing after every session |
| No idea what to charge | Market data, pricing intelligence, earnings projections |
| Manage everything in your head | Dashboard: bookings, earnings, ratings, analytics |
| No professional profile | Verified, complete profile with photo, bio, certifications |
| Build reputation through word of mouth | Build reputation through verified reviews and ratings |
| No growth tools | Analytics, insights, recommendations, tier system |

### The seven promises:

1. **More bookings.** Players find you through search, not through your Instagram story. Appear when players need exactly what you offer.

2. **Less administration.** Bookings, payments, reminders, scheduling — handled automatically. You focus on coaching.

3. **Better visibility.** A professional profile with verified credentials, ratings, and reviews. Players trust you before they meet you.

4. **Easier payments.** No more chasing cash. Payment processed automatically after every session. Withdraw to your bank account anytime.

5. **Pricing intelligence.** Know what coaches like you charge in your area. Set prices that attract players and reflect your value.

6. **Business growth tools.** Analytics show you what's working, what's not, and where to focus next. Data-driven coaching business.

7. **Reputation that compounds.** Every good session builds your rating. Every rating builds your visibility. Every visibility builds your career.

---

## Organization Value Proposition

**The promise to the organization:** CourtZon gives you full visibility and control over your coaching operations — without the spreadsheets, phone calls, and guesswork.

### Why would an organization manage coaches through CourtZon instead of Excel and phone calls?

| Without CourtZon | With CourtZon |
|------------------|---------------|
| Track coach schedules in Excel | Real-time calendar with automatic conflict detection |
| Phone coaches to fill gaps | System detects gaps and suggests replacements automatically |
| Manually calculate revenue share | Automatic, transparent revenue split after every session |
| No visibility into coach performance | Dashboard: ratings, utilization, retention, revenue per coach |
| Reactive recruitment | Predictive staffing: system tells you when you need more coaches |
| Manual reporting | Automated reports: revenue, performance, utilization, trends |
| Coach leaves, you lose everything | Platform retains history, reviews, and institutional knowledge |
| No benchmarking | Compare your performance to industry averages |

### The seven promises:

1. **Better coach utilization.** See exactly which coaches are underused and why. Fill gaps before they become revenue losses.

2. **Higher revenue.** Data-driven pricing, optimized scheduling, and reduced idle time all contribute to more revenue per coach.

3. **Less manual work.** Booking, payment, scheduling, reporting — automated. Your admin team focuses on strategy, not data entry.

4. **Transparent financials.** Every transaction visible. Every revenue share calculated automatically. No disputes, no surprises.

5. **Performance visibility.** Know exactly who is performing, who needs support, and who deserves recognition — with data, not gut feeling.

6. **Faster recruitment.** Find, evaluate, and onboard new coaches in days, not weeks. The platform handles the pipeline.

7. **Better player satisfaction.** When coaches are well-managed, players have better experiences. Better experiences mean higher retention.

---

## Core Product Principles

These principles should never be violated. Every feature, every screen, every decision should be tested against them.

### 1. Always recommend, never overwhelm.

Show the player three great options, not thirty possible ones. Show the coach three actionable insights, not a wall of data. Show the organization one clear recommendation, not ten charts.

**The system should reduce cognitive load, not increase it.**

### 2. Automation before manual work.

If the system can do it automatically, it should. Players should not manually search for coaches. Coaches should not manually track payments. Organizations should not manually generate reports.

**Manual work is a sign of incomplete product design.**

### 3. Transparency before complexity.

Every financial transaction should be visible to all parties. Every decision the system makes should be explainable. Every error should be clear and actionable.

**If the user cannot understand what happened, the system has failed.**

### 4. One source of truth.

There should be one place for every piece of information. One calendar. One wallet. One set of reviews. One performance dashboard. No duplicate data. No conflicting records.

**If there are two versions of the truth, one of them is wrong.**

### 5. Product decisions before technical decisions.

Every feature starts with the business workflow and user experience. Architecture follows product. Product does not follow architecture.

**The user does not care how it works. They care that it works.**

### 6. The Scheduling Engine remains invisible.

No user should ever know that a scheduling engine exists. They should see coaches, availability, and bookings — never resource allocation, slot management, or conflict resolution.

**The best infrastructure is the one nobody notices.**

### 7. The player always comes first.

When there is a conflict between player needs and coach needs, optimize for the player. When there is a conflict between coach needs and organization needs, optimize for the coach. When there is a conflict between organization needs and platform needs, optimize for the organization.

**The player is the reason the platform exists.**

---

## North Star Metric

### Successful Coaching Sessions Completed

Everything else supports this metric.

When a player books a coach, shows up, trains, and leaves satisfied — that is a successful coaching session. Every feature, every improvement, every decision should ultimately increase this number.

### Supporting Metrics

| Metric | Why It Matters |
|--------|---------------|
| **Booking conversion** | Are players who start the booking flow completing it? |
| **Coach utilization** | Are coaches' available hours being filled with sessions? |
| **Player retention** | Are players coming back for more sessions? |
| **Coach retention** | Are coaches staying on the platform? |
| **Player satisfaction** | Are players happy with their sessions? |
| **Session completion rate** | Are booked sessions actually happening? |
| **Time to first booking** | How quickly can a new player get started? |

**If successful coaching sessions increase, the platform is healthy. If they decrease, something is broken.**

---

## Out of Scope (This Version)

The following are intentionally excluded from this version of the Coach Platform. They may be considered in future versions, but only after the core experience is proven in production.

| Feature | Why It Is Out of Scope |
|---------|----------------------|
| **AI coaching recommendations** | The system recommends coaches based on simple matching (specialty, availability, rating). AI-driven coaching advice is a separate product. |
| **Dynamic pricing using machine learning** | Pricing is data-informed (market rates, demand) but manually set. ML-driven pricing requires significant data maturity. |
| **Video coaching / remote sessions** | This version is about in-person coaching at physical branches. Video coaching is a different product with different requirements. |
| **Marketplace integration** | The platform does not sell equipment, merchandise, or third-party services. Focus on coaching. |
| **Tournament coaching automation** | Tournament coaching is a specialized use case. It may be added as an Activity type in the future, but not in this version. |
| **Social features (feed, posts, community)** | The platform is for coaching, not social networking. Community features, if needed, will be minimal and purpose-driven. |
| **Multi-language support** | This version supports Arabic and English. Additional languages may be added based on market demand. |
| **White-label solution** | The platform is CourtZon-branded. White-labeling is a future business model, not a product feature. |

**Saying no to these features protects the focus and quality of the core experience.**

---

## Future Vision

### Year 1: Prove the Core

The Coach Platform launches with the four journeys: Player, Independent Coach, Resident Coach, and Organization. The focus is on making coaching booking effortless, payments transparent, and coach management data-driven.

**Success looks like:** Players prefer CourtZon over calling coaches directly. Coaches prefer CourtZon over WhatsApp. Organizations prefer CourtZon over spreadsheets.

### Year 2: Expand the Ecosystem

With the core experience proven, the platform expands:

- **New Activity Types:** Academy sessions, camps, clinics — all powered by the same Scheduling Engine
- **New Resource Providers:** Referees, equipment, physiotherapists — when there is real business need
- **Coach Discovery 2.0:** "Any Coach" mode becomes smarter. The system learns from player preferences and session outcomes to make better recommendations
- **Travel Rules:** Independent coaches get intelligent travel routing, buffer times, and impossible schedule prevention
- **Package Deals:** Players can purchase multi-session packages at a discount. Coaches can offer loyalty programs

**Success looks like:** The platform becomes the default way coaching happens in the market. New coaches join because players are there. New players join because coaches are there.

### Year 3: Intelligence Layer

With data from thousands of sessions, the platform adds intelligence:

- **Predictive demand:** Organizations know they need coaches before they know it
- **Smart pricing:** Dynamic pricing that balances coach earnings with player affordability
- **Career progression:** Coaches see a clear path from entry-level to premium
- **Marketplace expansion:** Equipment, nutrition, fitness — curated recommendations that enhance the coaching experience
- **Regional expansion:** The platform model works in new cities and eventually new countries

**Success looks like:** The platform is not just a booking tool — it is the intelligence layer for the coaching industry.

### The Long-Term Vision

CourtZon becomes the operating system for coaching. Every coach, every organization, every player — connected through a platform that makes coaching accessible, transparent, and rewarding for everyone.

The Scheduling Engine is the invisible infrastructure. The product is the human experience. The result is a world where getting better at your sport is as easy as opening an app.

---

## Product Blueprint Frozen

This document is now the **single source of truth** for the CourtZon Coach Platform.

**From this point forward:**

- No more architectural discussions unless a production problem is discovered
- No more workflow redesigns unless user research demands it
- Every future feature should reference this blueprint rather than redefining it
- Development should focus on delivering business value while keeping the architecture stable

**The blueprint is complete. Implementation begins when approved.**

---

*Documented: July 2026*
*Version: 3.0 — Product Blueprint (Final)*
*Status: Frozen — awaiting implementation approval*
*Audience: Product Managers, UX Designers, QA Engineers, Developers, Business Stakeholders*
