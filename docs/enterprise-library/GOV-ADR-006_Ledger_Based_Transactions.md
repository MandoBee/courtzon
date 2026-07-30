---
document_id: "GOV-ADR-006"
document_name: "Inventory Ledger-Based Transactions"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 8
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-004"]
---

# ADR-006: Inventory Ledger-Based Transactions

**Status:** Accepted | **Date:** 2025-06-01

## Context

The Marketplace inventory system tracks stock movements across multiple operations: purchase order receipts, stock transfers between warehouses, manual adjustments, order deductions, and potential future returns and reservations. These movements require:

1. **Immutability** — stock adjustments must never be lost or deleted
2. **Auditability** — every unit of stock must be traceable from source to destination
3. **Before/After snapshots** — the exact stock level before and after each movement must be known
4. **Reference provenance** — each movement must be linked to its source document (PO, transfer, order, etc.)

Options considered:
1. **Direct balance updates** — `product_variants.quantity = quantity - 1` (simple but no audit trail)
2. **Ledger entries** — Append-only `inventory_logs` with before/after snapshots
3. **Event sourcing** — Full event-sourced inventory (over-engineered for current scale)

## Decision

**Use immutable ledger entries (`inventory_logs` table) for ALL inventory movements.** No direct balance updates without an accompanying ledger entry.

### Mechanism

Every stock-changing operation follows this pattern:

```typescript
// 1. Read current stock
const currentStock = await getVariantStock(variantId, warehouseId);

// 2. Calculate new stock
const newStock = currentStock + delta;

// 3. Update variant quantity
await updateVariantQuantity(variantId, newStock);

// 4. Create immutable ledger entry
await createInventoryLog({
  variantId,
  warehouseId,
  movementType,   // 'in' | 'out' | 'adjustment' | 'reservation' | 'release' | 'return'
  quantity: Math.abs(delta),
  stockBefore: currentStock,
  stockAfter: newStock,
  reason,
  referenceType,  // 'purchase_order' | 'stock_transfer' | 'order' | 'adjustment'
  referenceId,
  createdBy,
});
```

**Evidence:** `inventory.controller.ts:397-401` (PO receive), `:473-477` (transfer out), `:543-546` (transfer in), `:590-593` (adjustment).

### Supported Movement Types

| Movement Type | Description | Reference Type |
|---------------|-------------|----------------|
| `in` | Stock received | purchase_order, stock_transfer |
| `out` | Stock deducted | stock_transfer, order |
| `adjustment` | Manual correction | adjustment |
| `reservation` | Reserved for order | order (future) |
| `release` | Reservation released | order (future) |
| `return` | Customer return | order (future) |

## Consequences

**Positive:**
- Complete audit trail — every stock change is traceable with before/after values
- Root cause analysis — any discrepancy can be traced back to its source document
- Regulatory compliance — inventory records meet audit requirements
- Partial receipt support — purchase orders can be received in multiple batches (`inventory.controller.ts:388` calculates `pendingQty = quantity - received_qty`)
- Reconciliation — stock levels can be reconstructed from ledger entries

**Negative:**
- Storage grows with every stock movement (mitigated by log retention policy)
- Read path requires aggregate query for current stock (mitigated by denormalized `quantity` on `product_variants`)
- More complex write path — two operations per movement (update balance + create log)
- Manual adjustments require admin permission and justification

## Comparison to GOV-ADR-004 (Financial Ledger)

This ADR applies the same ledger-based principle as GOV-ADR-004 but to inventory movements. Key differences:

| Aspect | Financial Ledger (GOV-ADR-004) | Inventory Ledger (GOV-ADR-006) |
|--------|-------------------------------|-------------------------------|
| Storage | `ledger_entries` (double-entry) | `inventory_logs` (single-entry) |
| Balancing | Debits must equal credits | No balancing requirement |
| Snapshot | Not stored (can be derived) | `stock_before` / `stock_after` stored per entry |
| Movement types | Debit / Credit | in, out, adjustment, reservation, release, return |
