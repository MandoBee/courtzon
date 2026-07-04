# ADR 004: Logging Strategy

**Status:** Accepted  
**Date:** 2026-07-04  
**Authors:** CourtZon Engineering

## Context

Production observability requires structured logging for debugging, auditing, and monitoring. We need a consistent logging strategy across all 39+ backend modules.

## Decision

1. **Pino as the logging framework.** Fastify uses Pino natively. Module-level logging uses `createModuleLogger()` from `shared/utils/logger.js` which wraps Pino with module-name context.

2. **Structured JSON logging.** Every log statement uses object format: `log.info({ traceId, userId, paymentId }, 'Message')`. Never use string interpolation: `log.info('User ' + userId + ' did X')`.

3. **End-to-end correlation via `traceId`.** Payment operations generate a UUID at charge initiation. The traceId is stored in `payment_transactions.trace_id` and carried through webhook processing, fulfillment, and audit logging. All log statements in the payment pipeline include traceId.

4. **No `console.log` in production.** Enforced by LOG-01 in engineering standards. Zero violations exist as of 2026-07-04.

5. **Sensitive data redaction.** Pino configuration in shared/utils/logger.ts redacts `authorization`, `cookie`, `password`, `token`, `secret` from logged objects.

6. **Error logging includes context.** Error logs include `err` (the Error object), plus contextual fields: `userId`, `entityId`, `gatewayRef`, `traceId`. Never log just the message string.

## Alternatives Considered

- **Winston (rejected).** Pino is faster (JSON-first, no string formatting overhead) and already integrated with Fastify.
- **Elasticsearch/Logstash/Kibana (ELK) stack (future).** Pino's JSON output is compatible. Can be added later without code changes.
- **CloudWatch/DataDog (dependent on deployment).** Pino writes to stdout; container orchestration handles log aggregation.

## Consequences

- **Positive:** All 39 modules use the same logger. No raw console.log. traceId enables end-to-end debugging. Redaction prevents secret leaks in logs.
- **Negative:** Two separate Pino instances exist (Fastify's built-in logger and the shared module logger). Minor formatting inconsistency.
- **Enforcement:** LOG-01 through LOG-05 in engineering standards.
