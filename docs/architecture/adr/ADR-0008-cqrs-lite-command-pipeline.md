# ADR-0008: CQRS-lite Command Pipeline

## Status

Accepted

## Context

CourtZon needed a consistent pattern for state-changing operations (commands) that:

1. Validate business rules before execution
2. Ensure idempotency (same command should not be applied twice)
3. Wrap all side effects in a database transaction
4. Emit domain events automatically after successful execution
5. Support authorization checks
6. Provide observability (metrics, logging)

A naive approach of direct database updates in controllers led to:
- Mixed concerns (validation, authorization, execution in the same function)
- No idempotency — webhook retries caused double-processing
- Inconsistent error responses
- No metrics on command execution

## Decision

Implement a **CQRS-lite Command Pipeline** that separates commands into four phases:

```
validate()  →  authorize()  →  execute()  →  events()
```

**Pipeline flow:**

```typescript
class CommandPipeline {
  async execute(command, handler) {
    await handler.validate(command);      // 1. Input validation
    if (handler.authorize) {             // 2. Authorization
      await handler.authorize(command);
    }
    if (alreadyProcessed(command)) {      // 3. Idempotency check
      return { status: 'skipped' };
    }
    return withTransaction(async (conn) => {   // 4. Transaction
      await recordProcessed(command, conn);    //    Idempotency record
      const data = await handler.execute(command, conn);  // 5. Execute
      const events = handler.events(command, data);       // 6. Events
      for (const event of events) {
        await eventBusV2.emit(event.name, event.payload, event.context, conn);
      }
      return data;
    });
  }
}
```

**Key characteristics:**

- **Lite** — this is not full CQRS. There is no separate read model, no event store, no projection rebuild. Commands and queries share the same database. The pipeline only adds the command/write side separation.
- **Idempotency via `processed_commands` table** — each command ID is recorded before execution; repeated execution is skipped.
- **Database transaction** — the entire execute+emit cycle is inside `withTransaction()`, so events only fire after commit.
- **Metrics** — every command execution records duration and result (processed/skipped/error).
- **Error classification** — `ValidationError`, `ForbiddenError`, `ConflictError` return typed error responses; unexpected errors propagate.

## Consequences

**Benefits:**
- Consistent error handling for all state-changing operations
- Idempotency is automatic — webhook retries are safe
- Authorization is a separate concern, not mixed with business logic
- Domain events are emitted atomically with the state change
- Metrics provide observability into command throughput and latency

**Trade-offs:**
- Every command requires a handler object with four methods — boilerplate for simple operations
- The `processed_commands` table adds a write per command — negligible for current volume but should be monitored
- Not true CQRS — reads still hit the same database, so read scalability is limited
- Event emission inside the transaction means events cannot be sent to external systems that might fail (the transaction would roll back)

**Alternatives rejected:**
- *Full CQRS/ES (Event Sourcing)*: Too complex for the current domain; the booking lifecycle has well-defined states that map naturally to a state machine, not an event stream
- *Direct controller logic*: Previous approach that lacked idempotency, authorization, and observability
- *Middleware-based command handling*: Harder to test and reason about than the explicit handler pattern

**Future considerations:**
- The `processed_commands` table should have a TTL-based cleanup to prevent unbounded growth
- For external integrations (email, SMS), consider an outbox pattern where events are stored in the outbox table and dispatched by a background worker (not inside the transaction)
- Consider adding a `compensation` phase for sagas that span multiple aggregates
