# CourtZon Development Philosophy

> Established: July 2026
> After: Scheduling Engine architecture closed (Milestones 1–6, 326/326 tests, 4 ADRs)

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

## Core Principle

The Scheduling Engine is no longer the project. It is now infrastructure.

Future work improves the business experience for players, coaches, organizations, and administrators by building on top of this foundation. The platform evolves by delivering business value. The architecture remains stable, predictable, and reusable.

---

## The Only Question That Matters

Every new feature begins with one question:

### Is this a new Activity? or Is this a new Resource?

**If Resource** (Coach, Referee, Physio, Equipment, Ball Machine, Photographer):
- New Provider
- Resource-specific business rules
- Capability definition
- **The Scheduling Engine itself does not change.**

**If Activity** (Coach Session, Academy Session, Tournament Match, Camp, Clinic, Event):
- Activity Definition
- Required Resources
- Activity-specific policies
- **The Scheduling Engine simply resolves the required resources.**

### Architecture Rule

New business capabilities extend the existing architecture. They do not redesign it. The Scheduling Engine becomes increasingly stable over time.

---

## Do Not Redesign the Scheduling Engine

Unless a real architectural problem is discovered in production, the engine is closed.

Future development extends capabilities. It does not change the foundation.

---

## Product-First Principle

Every new feature proposal begins with the business workflow and user experience:

- What problem are we solving?
- How should the user experience feel?
- How does this improve the player, coach, organization, or administrator journey?
- Is this feature really valuable for the business?

Only after the product workflow is agreed upon do we discuss implementation.

Architecture serves the product. The product is never constrained by unnecessary architectural discussions.

---

## Development Roadmap

### Priority 1 — Coach Session UX Redesign

Completely redesign the Coach Session user experience around the Scheduling Engine. The new UX should be significantly simpler than the legacy flow.

### Priority 2 — Independent Coach

Support Service Areas, Working Regions, Maximum Travel Distance, and Working Preferences without affecting Resident Coach behavior.

### Priority 3 — Coach Discovery

Support two booking modes:
- **Any Coach** (Recommended)
- **Specific Coach**

Use the Scheduling Engine to rank available coaches.

### Priority 4 — Travel Rules

Support Travel Buffer, Branch-to-Branch Travel Time, and Impossible Schedule Prevention.

### Priority 5 — Additional Resource Providers

After the coach experience is stable, begin implementing additional providers (Referee, Equipment, Physio) only when there is a real business need. Do not implement providers speculatively.

### Priority 6 — Future Architectural Enhancements

After the engine has been successfully used in production, consider optional transaction participation or other simplifications only if there is measurable value.

---

## Feature Decision Checklist

Before implementing any feature, answer:

1. Is this a new Activity or a new Resource?
2. Can the existing Scheduling Engine already support it?
3. Can an existing Provider be extended instead of creating a new one?
4. Is there any duplicated business logic?
5. Does this change require modifying the Scheduling Engine itself?
6. Does this improve the product or only the architecture?

If the Scheduling Engine must change, provide a written architectural justification.

---

## Scheduling Engine Stability Rules

The Scheduling Engine should remain stable.

**Do not:**
- Add activity-specific logic
- Add resource-specific conditions
- Add direct repository access
- Duplicate domain business rules
- Introduce special cases for individual features

**Prefer:**
- New Providers
- New Activity Definitions
- New Policies
- Existing Domain Services

---

## Definition of Done

A feature is complete only if:

- Business workflow approved
- User experience reviewed
- Architecture unchanged (unless justified)
- Existing modules unaffected
- Tests passing
- Documentation updated
- ADR updated if an architectural decision changed
- Docker images updated
- Containers rebuilt
- GitHub synchronized

---

*The Scheduling Engine is mature. Use it as an enabler, not as the center of future discussions.*
