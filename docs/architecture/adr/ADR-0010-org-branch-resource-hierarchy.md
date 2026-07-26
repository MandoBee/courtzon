# ADR-0010: Organisation / Branch / Resource Hierarchy

## Status

Accepted

## Context

CourtZon serves sports facility venues with a hierarchical structure:

```
Organisation (e.g., "City Sports Club")
  └── Branch (e.g., "City Sports Club - Downtown")
       └── Resource (e.g., "Court 3 - Tennis")
            └── Time slots (e.g., "10:00-11:00")
```

Multi-branch organisations need:
- Centralised management (branding, subscription, settings)
- Per-branch configuration (hours, pricing, staff)
- Per-resource availability and scheduling
- Role-based access at each level (org admin, branch manager, staff)

Additionally, the platform itself acts as a "platform owner" that manages multiple organisations, each with their own subscription plan and commission rates.

## Decision

Model the hierarchy with three levels:

**1. Organisation**

- Owned by a user (the organisation admin)
- Has a subscription plan (defines features, commission rates)
- Can have multiple branches
- Manages global settings: branding, payment credentials, tax configuration

**2. Branch**

- Belongs to an organisation
- Has its own timezone, opening hours, address, contact information
- Can have multiple resources
- Manages local settings: pricing rules, peak hours, seasonal rates

**3. Resource**

- Belongs to a branch
- Represents a bookable entity (court, pitch, lane, table)
- Has a slot duration, hourly price, sport type
- Can be temporarily disabled for maintenance

**Cross-cutting concerns:**

- **User-Organisation membership** — users can belong to multiple organisations with different roles (admin, manager, staff)
- **Subscription plans** — organisations subscribe to plans that define feature access and commission rates
- **Commission rates** — calculated at the plan level, applied per booking
- **Approval workflow** — new organisations require admin approval before going live

## Consequences

**Benefits:**
- Clear ownership and permission boundaries at each level
- Multi-branch organisations can manage everything centrally or delegate to branch managers
- Subscription-based monetisation with feature gating
- Commission calculation is consistent (plan-level rates applied to organisation-level bookings)
- Approval workflow prevents unauthorised venues from appearing on the platform

**Trade-offs:**
- Three-level hierarchy may be too rigid for some venue types (e.g., a single-court facility doesn't need branches)
- Cross-organisation reporting requires aggregation across multiple levels
- The approval workflow adds latency for new organisations — they cannot operate until approved

**Alternatives rejected:**
- *Flat venue model (no hierarchy)*: Would not support multi-branch organisations, which are the primary customer segment
- *Flexible depth hierarchy (nested groups)*: Over-engineered for the current domain; three levels cover all known use cases
- *Organisation-only (no branches)*: Insufficient for venues that manage multiple locations under one brand

**Future considerations:**
- Consider adding a "venue group" abstraction above organisation for franchise chains that share branding but operate independently
- The resource model could be extended with resource types (indoor/outdoor, covered/uncovered) for better filtering
- Branch-level timezone support is critical — each branch must be able to set its own timezone independently of the organisation
