# Architecture Health Dashboard

## Purpose

CourtZon's architecture health dashboard provides continuous, measurable insight into the platform's architectural quality. Unlike pass/fail validation (which only tells you if rules are broken), the health dashboard tracks trends over time so the team can answer questions like:

- Is the architecture improving or degrading?
- Are technical debts accumulating?
- Are shared contracts growing in a healthy way?
- Are new modules following the established patterns?

## How it works

After architecture validation completes, the metrics script scans the codebase and produces:

1. A **console summary** with the current health state
2. A **JSON report** (`artifacts/architecture-health.json`) suitable for dashboards and CI

```bash
node scripts/architecture/metrics.js
```

## Metrics Reference

### Project Metrics

| Metric | Description | Healthy Range | Current |
|--------|-------------|---------------|---------|
| **Modules** | Top-level directories in `backend/src/modules/` | 30–50 | 41 |
| **Bounded Contexts** | Modules with domain + application structure | 30–45 | 37 |
| **Shared Contracts** | Exported types in `@courtzon/shared` | Grows with platform | 38 |
| **DTOs** | Interfaces/types ending in `Dto` | Grows with API surface | 2 |
| **Enums** | Enum declarations and `as const` patterns | Grows with domain | 7 |

**Trend:** Modules and bounded contexts should grow as the platform adds features. A sudden decrease indicates potential consolidation or removal. Stagnation for multiple releases may indicate stalled development.

### Architecture Metrics

| Metric | Description | Healthy Range | Current |
|--------|-------------|---------------|---------|
| **Domain Events** | `eventBusV2.emit()` calls | Grows with features | 93 |
| **Event Handlers** | `eventBusV2.on()` subscriptions | Grows with features | 15 |
| **EventBus Subscribers** | Queue-based `.subscribe()` calls | Any growth is significant | 0 |
| **Notification Producers** | `dispatchToUser()` calls | Grows with features | 46 |
| **Notification Types** | Unique event names subscribed | Grows with features | 158 |
| **Boundary Violations** | Forbidden cross-module imports | Must be **0** | 0 |
| **Layer Violations** | Domain → Infrastructure imports | Must be **0** | 0 |
| **Circular Dependencies** | Detected circular imports | Must be **0** | 0 |

**Trend:** Domain events and handlers should increase as the event-driven architecture grows. A significant gap between events and handlers indicates events with no consumers. Boundary violations must remain at zero.

### Realtime Metrics

| Metric | Description | Healthy Range | Current |
|--------|-------------|---------------|---------|
| **Socket Events** | Socket.IO `.emit()` calls in realtime module | Grows with features | 1 |
| **Socket Listeners** | Socket.IO `.on()` listeners | Grows with features | 4 |
| **EventBus→Socket Bridge** | Events flowing from EventBus to Socket | Grows with features | 10 |

**Trend:** The EventBus→Socket bridge count should be roughly proportional to the number of realtime features. A high socket event count with a low bridge count may indicate events bypassing the EventBus.

### Code Quality Metrics

| Metric | Description | Healthy Range | Current |
|--------|-------------|---------------|---------|
| **TODO Comments** | `TODO` markers in code | ≤ 20 | 7 |
| **FIXME Comments** | `FIXME` markers in code | ≤ 5 | 0 |
| **Deprecated Usages** | `@deprecated` annotations + deprecation TODOs | ≤ 10 | 2 |
| **Legacy Layers** | Backward-compat shims and compatibility code | Decreasing | 0 |

**Trend:** TODO and FIXME counts should decrease over time as tech debt is addressed. A sharp increase indicates shortcuts being taken. Legacy compatibility layers should trend toward zero.

### Testing Metrics

| Metric | Description | Healthy Range | Current |
|--------|-------------|---------------|---------|
| **Test Files** | `.spec.ts` and `.test.ts` files | Grows with codebase | 97 |
| **Architecture Validators** | Validation scripts in `scripts/architecture/` | Stable or growing | 6 |

## Health Score

The Health Score is a single number (0–100) that aggregates all metrics into a quick indicator of architectural health.

**Scoring formula:**

```
Start: 100
  -5  per import boundary violation
  -5  per layer violation
  -1  per TODO comment
  -1  per FIXME comment
  -2  per deprecated API usage
  -2  per legacy compatibility layer
  _____________________________
  = Health Score (min 0)
```

**Thresholds:**

| Score | Status | Action |
|-------|--------|--------|
| 90–100 | ✅ Excellent | No action needed |
| 70–89 | ⚠ Warning | Review warnings, plan improvements |
| 50–69 | ❌ Concerning | Schedule architecture improvement sprint |
| 0–49 | 🚨 Critical | Immediate architecture remediation required |

**Current score: 89/100** — Warning level. Review the warnings and plan improvements.

## Viewing the report

### Local

```bash
cat artifacts/architecture-health.json
```

### CI (GitHub Actions)

```yaml
- name: Architecture Health
  run: node scripts/architecture/metrics.js
- name: Upload Health Report
  uses: actions/upload-artifact@v4
  with:
    name: architecture-health
    path: artifacts/architecture-health.json
```

### Grafana / Dashboards

The JSON report can be imported into any dashboard that supports JSON data sources. The schema is:

```json
{
  "timestamp": "ISO 8601",
  "healthScore": 0..100,
  "...": "..."
}
```

## Adding new metrics

1. Add the metric to the `collectMetrics()` function in `scripts/architecture/metrics.js`
2. Add its display line in `printConsole()`
3. Add its definition in this document
4. Re-run `node scripts/architecture/metrics.js` to verify

## Relationship to enforcement

Architecture validation (`scripts/architecture/validate-*.js`) is a **pass/fail gate** — it blocks the build if rules are broken.

Architecture metrics (`scripts/architecture/metrics.js`) is an **observability tool** — it measures trends but never blocks the build.

Both should be run together:

```bash
node scripts/architecture/validate-all.js && node scripts/architecture/metrics.js
```
