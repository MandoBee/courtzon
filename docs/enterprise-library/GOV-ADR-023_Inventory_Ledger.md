---
document_id: "GOV-ADR-023"
document_name: "Inventory Ledger — Immutable Log as Source of Truth"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 5
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-18", "TECH-MOD-08"]
  related: ["GOV-ADR-004"]
---

# ADR-023: Inventory Ledger — Immutable Log as Source of Truth

## Status

Accepted

## Context

Marketplace inventory tracks stock levels for product variants (quantities available for sale). Stock levels change due to orders, returns, adjustments, and reservations. Without an audit trail, it's impossible to determine why a quantity changed or who made the change. Common approaches include:

1. **Mutable `quantity` column only** — simple; no audit trail; impossible to debug stock discrepancies
2. **Immutable inventory log + materialized quantity** — full audit trail; `variant.quantity` is derived from log; recoverable
3. **Event-sourced inventory** — inventory events as source of truth; complex infrastructure

## Decision

**Use `inventory_logs` table as the immutable source of truth for all stock movements. `product_variants.quantity` is a materialized projection updated in real-time.** Every stock movement creates an immutable log entry with before/after snapshots and reason metadata.

### Architecture

```
Stock Movement
  → INSERT INTO inventory_logs (variant_id, movement_type, quantity,
      stock_before, stock_after, reason, reference_type, reference_id, created_by)
  → UPDATE product_variants SET quantity = stock_after

Query current stock:
  → SELECT quantity FROM product_variants WHERE id = ?

Query stock history:
  → SELECT * FROM inventory_logs WHERE variant_id = ? ORDER BY created_at
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Inventory logs table | `inventory_logs` — `id`, `variant_id`, `movement_type`, `quantity`, `stock_before`, `stock_after`, `reason`, `reference_type`, `reference_id`, `created_by`, `created_at` | `001_courtzon_v3.sql:1482-1501` |
| Movement types | `enum('in','out','adjustment','reservation','release','return')` | `001_courtzon_v3.sql:1485` |
| Quantity convention | Positive for stock-in, negative for stock-out | `001_courtzon_v3.sql:1486` |
| Before/after snapshots | `stock_before` and `stock_after` recorded for every movement | `001_courtzon_v3.sql:1487-1488` |
| Reference tracking | `reference_type` + `reference_id` links movement to source (order, adjustment, return) | `001_courtzon_v3.sql:1490-1491` |
| Quantity column | `product_variants.quantity` — materialized projection, updated on each movement | `001_courtzon_v3.sql:2054+` |
| User accountability | `created_by` FK to `users` | `001_courtzon_v3.sql:1492,1499` |
| Indexes | `variant_id`, `created_at`, `reference_type+reference_id` | `001_courtzon_v3.sql:1495-1497` |

### Log Entry Example

```json
{
  "variant_id": 42,
  "movement_type": "out",
  "quantity": -2,
  "stock_before": 50,
  "stock_after": 48,
  "reason": "Order fulfillment",
  "reference_type": "order",
  "reference_id": 1001,
  "created_by": 15
}
```

### Stock Reconciliation

```
Reconciliation procedure:
  1. SUM all movements for variant_id from inventory_logs
  2. Compare with product_variants.quantity
  3. If mismatch: replay log from beginning to compute correct quantity
  4. Fix product_variants.quantity via adjustment movement (new log entry)
```

## Consequences

### Positive

- **Full audit trail**: Every stock movement is recorded with before/after snapshots, reason, and user
- **Recoverable**: If `product_variants.quantity` gets corrupted, it can be rebuilt from `inventory_logs`
- **Reference tracking**: Each movement links to its source order/adjustment — full traceability
- **Immutability**: Log entries are never deleted or updated — append-only
- **Materialized performance**: `product_variants.quantity` provides O(1) read performance for current stock

### Negative

- **Dual writes**: Every stock movement requires two operations: log insert + variant update
- **Storage growth**: Each stock movement adds a row; high-volume items generate many log rows
- **Consistency risk**: If variant update succeeds but log insert fails, or vice versa (mitigated by DB transactions)
- **No automatic reconciliation**: Materialized quantity may drift over time; periodic reconciliation scripts needed

## Evidence

- `database/baseline/001_courtzon_v3.sql:1482-1501` — `inventory_logs` table DDL
- `database/baseline/001_courtzon_v3.sql:2054+` — `product_variants` table with `quantity` column
- `database/migrations/067_marketplace_inventory.sql:91-92` — adds `warehouse_id` to `inventory_logs`

## Related Decisions

- GOV-ADR-004 (Ledger Based Transactions): Inventory ledger follows similar immutable-ledger pattern
