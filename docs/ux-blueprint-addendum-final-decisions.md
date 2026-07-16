# CourtZon Coach Platform — UX Blueprint Addendum: Final Product Decisions

> **Date:** July 2026
> **Supersedes:** Product Decision Review recommendations for B-1 and B-7
> **Status:** APPROVED — Implementation may begin after Slice Contracts are signed

---

## Decision 1: Booking Confirmation Policy

### Approved Model: Configurable Confirmation Policy

Booking confirmation is NOT a global rule. It is a configurable business policy per coach type and session type.

### Policy Matrix

| Coach Type | Default Policy | Override Allowed | Scope |
|------------|---------------|------------------|-------|
| **Resident Coach** | Instant Confirmation | No | Organization-wide |
| **Independent Coach** | Instant Confirmation | Yes — can switch to Request Approval | Per session type |
| **VIP Coach** | Request Approval | No | Organization-wide |
| **Academy Session** | Organization Policy | No | Per organization |

### Confirmation Policy Definitions

#### Instant Confirmation

```
Player selects slot
    │
    ├── Slot available?
    │       ├── YES → Lock slot → Process payment → Booking confirmed
    │       └── NO → "Slot taken. Choose another?"
    │
    └── Coach sees "Upcoming Session" (no action required)
```

- Slot locked at payment
- Player charged immediately
- Coach can cancel (with policy penalties)
- No accept/decline flow

#### Request Approval

```
Player selects slot
    │
    ├── Slot available?
    │       ├── YES → Reserve slot → Notify coach → Wait for response
    │       └── NO → "Slot taken. Choose another?"
    │
    ├── Coach responds within 24h?
    │       ├── Accept → Lock slot → Process payment → Booking confirmed
    │       ├── Decline → Release slot → Notify player → Suggest alternatives
    │       └── Timeout → Auto-decline → Release slot → Notify player
    │
    └── Player NOT charged until coach accepts
```

- Slot reserved (not locked) during wait
- Player payment method held, not charged
- Coach has 24h to respond
- Auto-decline on timeout

### Scheduling Engine Integration

The Scheduling Engine does not change. Confirmation policy is a **caller-level concern**:

```typescript
// Scheduling Engine API remains the same
const result = await schedulingEngine.resolveAvailability({
  activity: coachSession,
  resources: [coachResource, courtResource],
  requestedSlot: timeSlot,
});

// Confirmation policy is handled by the Booking Service
if (policy === 'instant') {
  await lockSlot(result.slot);
  await processPayment(player, amount);
  await confirmBooking(booking);
} else if (policy === 'request_approval') {
  await reserveSlot(result.slot, { expiresIn: '24h' });
  await notifyCoach(coach, booking);
  await setBookingStatus(booking, 'pending_confirmation');
}
```

### UI Impact

#### Player Side (Instant Confirmation)

| Screen | Change |
|--------|--------|
| P-07 Booking Confirmation | "Confirm & Pay" → Booking confirmed immediately |
| P-09 Booking Success | "Booking Confirmed!" (no change) |
| P-10 Booking Detail | Status: "Confirmed" immediately |

#### Player Side (Request Approval)

| Screen | Change |
|--------|--------|
| P-07 Booking Confirmation | "Send Request" (not "Confirm & Pay") |
| P-09 Booking Success | "Request Sent — waiting for coach confirmation" |
| P-10 Booking Detail | Status: "Pending" with countdown "Coach has 23h to respond" |
| P-10 | New state: "Coach accepted — payment processed" |
| P-10 | New state: "Coach declined — no charge. Try another coach?" |
| P-10 | New state: "No response — slot released. Try another coach?" |

#### Coach Side (Instant Confirmation)

| Screen | Change |
|--------|--------|
| IC-09 Coach Bookings | "Upcoming" tab only — no "Pending" tab |
| IC-09 | No Accept/Decline buttons |

#### Coach Side (Request Approval)

| Screen | Change |
|--------|--------|
| IC-09 Coach Bookings | "Pending" tab with Accept/Decline |
| IC-09 | Accept: "Accept & Confirm" → locks slot, charges player |
| IC-09 | Decline: "Decline" → releases slot, notifies player |
| IC-09 | Timeout indicator: "Auto-declines in X hours" |

### Notification Templates (Updated)

| Event | Recipient | Instant Confirmation | Request Approval |
|-------|-----------|---------------------|------------------|
| Booking created | Player | "Booking Confirmed! Session with [coach] on [date]" | "Request Sent — [coach] has 24h to respond" |
| Booking created | Coach | "New booking: [player] booked [session] on [date]" | "New request: [player] wants [session] on [date]. Accept?" |
| Coach accepts | Player | N/A | "Great news! [coach] accepted. Payment processed." |
| Coach declines | Player | N/A | "[coach] couldn't make it. No charge. Try another coach?" |
| Timeout | Player | N/A | "No response from [coach]. Slot released. Try another coach?" |

### Configuration

Organization admins can set default confirmation policy per coach type:

```
OG-07 Pricing Rules → Confirmation Policy tab
├── Resident Coaches: Instant Confirmation (locked)
├── Independent Coaches: Instant Confirmation (default, switchable)
├── VIP Coaches: Request Approval (locked)
└── Academy Sessions: Organization Policy (locked)
```

Independent coaches can override their default in IC-06:

```
IC-06 Pricing Settings → Booking Policy section
├── "How do players book your sessions?"
│   ├── ○ Instant Confirmation (recommended — higher conversion)
│   └── ○ Request Approval (you review before confirming)
└── Note: "Instant Confirmation is recommended. Coaches with Request Approval may receive fewer bookings."
```

---

## Decision 2: Pricing Pipeline

### Approved Model: Hybrid Pricing with Explicit Pipelines

Two distinct pricing pipelines based on coach type. Both pipelines are the single source of truth for all financial features.

### Pipeline 1: Resident Coach Pricing

```
Organization Pricing (base)
    │
    ├── Per session type per branch
    │   ├── 1-on-1: 400 EGP
    │   ├── Group: 200 EGP/player
    │   └── Clinic: 150 EGP/player
    │
    └── Applied to all resident coaches at that branch
            │
            ▼
Coach Override (optional)
    │
    ├── Coach can request price change
    │   ├── Must be within ±20% of org base
    │   ├── Requires org approval
    │   └── Effective date: approved date
    │
    └── Or: Org sets coach-specific override
        ├── Higher price for senior coaches
        └── Lower price for new coaches
            │
            ▼
Campaigns / Discounts (optional)
    │
    ├── Org-wide campaigns
    │   ├── "Summer Discount: 20% off all sessions"
    │   └── Applies to all resident coaches
    │
    ├── Branch-specific campaigns
    │   ├── "New branch opening: 30% off"
    │   └── Applies to coaches at that branch
    │
    └── Player-specific discounts
        ├── "First booking: 15% off"
        └── Applies to specific player
            │
            ▼
Final Price = (Org Base ± Coach Override) × (1 - Campaign Discount)
```

**Example:**
- Org base: 400 EGP
- Coach override: +10% (senior coach) → 440 EGP
- Campaign: 15% off → 440 × 0.85 = 374 EGP
- **Final price: 374 EGP**

### Pipeline 2: Independent Coach Pricing

```
Coach Base Price
    │
    ├── Coach sets their own price per session type
    │   ├── 1-on-1: 500 EGP
    │   ├── Group: 250 EGP/player
    │   └── Clinic: 180 EGP/player
    │
    └── No org override (coach has full control)
            │
            ▼
Platform Commission
    │
    ├── Platform takes % of coach price
    │   ├── Standard: 15%
    │   ├── Premium coaches: 10%
    │   └── New coaches (first 3 months): 10%
    │
    ├── Displayed to coach in IC-06
    │   ├── "Your price: 500 EGP"
    │   ├── "Platform fee (15%): -75 EGP"
    │   └── "You receive: 425 EGP"
    │
    └── Displayed to player in P-07
        ├── "Coach fee: 500 EGP"
        ├── "Platform fee: 75 EGP"
        └── "Total: 575 EGP"
            │
            ▼
Campaigns / Discounts (optional)
    │
    ├── Coach-initiated discounts
    │   ├── "I'm offering 10% off this week"
    │   ├── Coach absorbs discount (not platform)
    │   └── Coach earnings reduced proportionally
    │
    ├── Platform campaigns
    │   ├── "Platform promotion: 20% off"
    │   ├── Platform absorbs discount
    │   └── Coach earnings unchanged
    │
    └── Player-specific discounts
        ├── "First booking: 15% off"
        └── Platform absorbs discount
            │
            ▼
Final Price = Coach Price × (1 - Discount%) + Platform Fee
Coach Receives = Coach Price × (1 - Commission%) × (1 - Coach Discount%)
```

**Example:**
- Coach price: 500 EGP
- Platform commission: 15% → 75 EGP
- Coach discount: 10% → -50 EGP
- Platform absorbs discount
- **Final price to player: 500 × 0.9 + 75 = 525 EGP**
- **Coach receives: 500 × 0.85 = 425 EGP**

### Pipeline Comparison

| Aspect | Resident Coach | Independent Coach |
|--------|---------------|-------------------|
| Price setter | Organization | Coach |
| Override | Org can override | Coach has full control |
| Commission | None (salary model) | Platform takes % |
| Discounts | Org campaigns | Coach or platform campaigns |
| Revenue | Org receives full amount | Platform receives commission, rest to coach |
| Price consistency | Same price for all players | Coach can vary by session type |

### Scheduling Engine Integration

The Scheduling Engine does not change. Pricing is a **caller-level concern**:

```typescript
// Pricing Service calculates final price
const finalPrice = await pricingService.calculatePrice({
  coachType: 'resident', // or 'independent'
  sessionType: '1-on-1',
  branchId: 'branch-123',
  coachId: 'coach-456',
  playerId: 'player-789',
  campaignCode: 'SUMMER2026',
});

// Result
{
  basePrice: 400,        // org base (resident) or coach price (independent)
  coachOverride: 44,     // +10% for senior coach (resident only)
  platformFee: 75,       // 15% commission (independent only)
  discount: -66.6,       // 15% campaign
  finalPrice: 377.4,     // what player pays
  coachReceives: 440,    // what coach gets (resident: full, independent: after commission)
  platformReceives: 75,  // platform commission (independent only)
}
```

### UI Impact

#### IC-06: Coach Pricing Settings

**Resident Coach (read-only):**
```
Your Session Prices
├── 1-on-1: 400 EGP (set by organization)
├── Group: 200 EGP/player (set by organization)
└── Clinic: 150 EGP/player (set by organization)

Note: Prices are set by your organization.
To request a price change, contact your branch manager.
```

**Independent Coach (editable):**
```
Your Session Prices
├── 1-on-1: [500] EGP ← editable
├── Group: [250] EGP/player ← editable
└── Clinic: [180] EGP/player ← editable

Platform Fee: 15%
├── 1-on-1: 500 × 15% = 75 EGP
├── Your earnings: 500 - 75 = 425 EGP
└── Player pays: 500 + 75 = 575 EGP

Market Range: 350–600 EGP (your area)
Your Position: Above average (competitive)
```

#### OG-07: Organization Pricing Rules

**Resident Pricing:**
```
Resident Coach Pricing
├── Branch: [Maadi Branch ▼]
│   ├── 1-on-1: [400] EGP
│   ├── Group: [200] EGP/player
│   └── Clinic: [150] EGP/player
├── Coach Overrides
│   ├── Coach Ahmed: +10% (senior)
│   └── Coach Sara: -5% (new)
└── Campaigns
    ├── "Summer Discount": 20% off (active)
    └── "+ Create Campaign"
```

**Independent Pricing (view-only):**
```
Independent Coach Pricing
├── Platform Commission: 15%
├── Coach Sets Own Price
└── Revenue Sharing
    ├── Platform receives: 15% of coach price
    └── Coach receives: 85% of coach price

Note: Independent coaches set their own prices.
You can view their prices but cannot override them.
```

#### P-07: Booking Confirmation (Player View)

**Resident Coach:**
```
Session with Coach Ahmed
├── 1-on-1 Private Session
├── Date: 15/07/2026, 4:00 PM
├── Branch: Maadi Sports Club
├── Price Breakdown
│   ├── Session fee: 400 EGP
│   ├── Platform fee: 0 EGP
│   └── Total: 400 EGP
└── [Confirm & Pay 400 EGP]
```

**Independent Coach:**
```
Session with Coach Sara
├── 1-on-1 Private Session
├── Date: 15/07/2026, 4:00 PM
├── Branch: Heliopolis Club
├── Price Breakdown
│   ├── Coach fee: 500 EGP
│   ├── Platform fee: 75 EGP
│   └── Total: 575 EGP
└── [Confirm & Pay 575 EGP]
```

### Pricing Pipeline as Single Source of Truth

All financial features reference the pricing pipeline:

| Feature | References Pipeline |
|---------|-------------------|
| P-07 Booking Confirmation | Final Price |
| P-10 Booking Detail | Final Price, Coach Receives, Platform Receives |
| P-14 Player Wallet | Transaction history with price breakdown |
| IC-06 Coach Pricing | Coach Base Price, Platform Commission |
| IC-11 Coach Earnings | Coach Receives (after commission) |
| RC-05 Resident Earnings | Final Price (no commission) |
| OG-07 Org Pricing | Org Base, Coach Override |
| OG-08 Revenue Share | Platform Receives, Coach Receives |
| OG-11 Reports | All pipeline values |

---

## Implementation Impact

### Scheduling Engine

**No changes.** Confirmation policy and pricing are caller-level concerns. The engine resolves availability; the Booking Service handles confirmation and pricing.

### New Services Required

| Service | Purpose | Slice |
|---------|---------|-------|
| `ConfirmationPolicyService` | Determine confirmation policy per booking | Slice 1 |
| `PricingPipelineService` | Calculate final price through pipeline | Slice 1 |
| `CampaignService` | Manage discounts and promotions | Slice 9 |

### Database Changes

| Table | Change | Slice |
|-------|--------|-------|
| `coach_confirmation_policies` | New: coach_id, session_type, policy, effective_date | Slice 1 |
| `pricing_pipelines` | New: coach_type, base_price, commission_rate, effective_date | Slice 1 |
| `campaigns` | New: campaign definitions, discounts, eligibility | Slice 9 |

---

*These two decisions are final. The UX Blueprint is updated. Implementation may begin.*
