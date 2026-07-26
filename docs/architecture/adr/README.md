# Architecture Decision Records (ADR)

## What is an ADR?

An Architecture Decision Record is a short document capturing a significant architectural decision made during the development of CourtZon. Each ADR describes:

- **Context** — What problem existed and what constraints were present
- **Decision** — What was decided and why
- **Consequences** — Benefits, trade-offs, rejected alternatives, and future considerations

ADRs are not implementation documentation. They capture **why** a decision was made, not **how** the code works.

## When to write an ADR

Write an ADR when:

- Introducing a new architectural pattern (e.g., CQRS, Event Sourcing)
- Choosing a technology or framework (e.g., Fastify vs Express, BullMQ vs Bee-Queue)
- Designing a cross-cutting concern (e.g., event bus, notification system, payment flow)
- Changing an existing architectural decision
- Adding a new bounded context or module boundary

If the decision affects more than one module or team, it needs an ADR.

## When NOT to write an ADR

- Bug fixes
- Minor refactoring
- Adding a new API endpoint
- Updating dependencies
- Cosmetic changes

## ADR Lifecycle

| Status | Meaning |
|--------|---------|
| **Accepted** | The decision is in effect |
| **Superseded** | A newer ADR replaced this decision |
| **Deprecated** | The decision is no longer recommended |

### How to update an ADR

1. If the decision is still valid but the context has changed, add a note to the **Future considerations** section.
2. If the decision is no longer valid, create a new ADR that supersedes it, then mark the old ADR as **Superseded** with a link to the new one.

Never edit an Accepted ADR to change the decision itself. Create a new ADR instead.

## Relationship to code

ADRs live in `docs/architecture/adr/`. Each ADR is a Markdown file named `ADR-NNNN.md`.

The code implements the decisions recorded in ADRs. If the code and an ADR disagree, the ADR represents the intended architecture — consider whether the code or the decision needs to change.

## Index

See [ADR-INDEX.md](ADR-INDEX.md) for a complete list of all ADRs.
