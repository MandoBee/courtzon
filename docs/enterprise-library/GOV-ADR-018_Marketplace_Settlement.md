---
document_id: "GOV-ADR-018"
document_name: "Marketplace Settlement — Settlement Lifecycle with Financial Recording"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 7
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-17", "TECH-MOD-30", "TECH-MOD-12"]
  related: ["GOV-ADR-004", "GOV-ADR-005"]
---

# ADR-018: Marketplace Settlement — Settlement Lifecycle with Financial Recording

## Status

Accepted

## Context

The marketplace enables sellers to list products. When a product sells, payment is collected from the buyer (online or COD). The seller must receive their portion of the payment (sale price minus commission and fees). A settlement process is needed to calculate per-seller amounts, net COD collections against online sales, and disburse funds. Common approaches include:

1. **Instant per-order payout** — pay seller immediately per order; simple but high transaction costs; no netting opportunity
2. **Settlement lifecycle with batch processing** — collect orders over a period, calculate net amounts, disburse in bulk; reduces transaction costs
3. **Wallet-based payout** — credit seller's internal wallet immediately; settlement is a separate withdrawal flow

## Decision

**Use a settlement lifecycle with dedicated `settlements` table and double-entry financial recording.** Settlements are created on-demand by sellers (`requested → pending_approval → approved → paid → completed`). Each settlement calculates net amounts using CODoubleEntry principles, separating payment collection from settlement disbursement.

### Settlement Lifecycle

```
requested → pending_approval → approved → paid → completed
                                       ↘ rejected
              ↘ cancelled
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| State machine | `SettlementStatus` — `requested | calculating | pending_approval | approved | paid | completed | rejected | cancelled` | `settlement-aggregate.ts:1` |
| State transitions | `ALLOWED_TRANSITIONS` — explicit per-state transition map | `settlement-aggregate.ts:7-16` |
| Settlement creation | `requestSettlement()` — locks unsettled orders, calculates per-seller financials | `settlement.service.ts:19-196` |
| Netting | Compares `onlineNetTotal` vs `codFeeTotal`; determines `settlement_direction` | `settlement.service.ts:110-111` |
| Financial recording | On `markPaid()` — creates transaction entries via `transactionRepository` | `settlement.service.ts:248-266` |
| Double-entry | Debit/Credit entries using `transactionRepository.createEntries()` | `settlement.service.ts:257-265` |
| Settlement orders | `settlement_orders` table — per-order breakdown of financials | `settlement.service.ts:149-161` |
| Order item update | Only seller's items marked as `settled`; orders fully settled only when all items done | `settlement.service.ts:164-179` |
| Rejection rollback | Items reverted to `pending` settlement status | `settlement.service.ts:303-330` |

### Settlement Calculation Logic

```
For each unsettled order belonging to the seller:
  seller_subtotal = SUM(order_items.total_price) for this seller's items
  seller_fee = SUM(order_items.commission_amount)
  seller_shipping = shipping_cost × (seller_subtotal / order.subtotal)
  seller_net = seller_subtotal + seller_shipping - seller_fee

Netting:
  online_net = SUM(seller_net for online payments)
  cod_fee_total = SUM(seller_fee for COD orders)
  settlement_direction = online_net >= cod_fee_total ? 'courtzon_to_org' : 'org_to_courtzon'
  final_amount = |online_net - cod_fee_total|
```

**Evidence:** `settlement.service.ts:28-111` — full calculation logic.

### Double-Entry Recording

```typescript
// CourtZon pays seller
debit:  platform_account (CourtZon account)
credit: branch (seller's branch)
```

```typescript
// Seller pays CourtZon fees
debit:  branch (seller's branch)
credit: platform_account (CourtZon account)
```

**Evidence:** `settlement.service.ts:256-266` — double-entry call with `transactionRepository.createEntries()`.

## Consequences

### Positive

- **Clear separation**: Payment collection (checkout) is separated from settlement disbursement (separate process)
- **Netting efficiency**: COD collections netted against online sales reduces actual transfers
- **Audit trail**: Full financial recording per settlement with double-entry
- **State machine safety**: Explicit transitions prevent invalid state changes (e.g., completing an unapproved settlement)
- **Rollback support**: Rejection reverts order items to pending status

### Negative

- **Batches not automated**: Settlements are initiated by seller request, not scheduled (future: auto-settlement)
- **Single-seller focus**: Current implementation handles one seller per settlement; multi-seller netting not supported
- **No escrow**: Funds are not held in escrow — settlement timing depends on payment method (COD vs online)

## Evidence

- `settlement-aggregate.ts:1-52` — state machine with `ASSETED_TRANSITIONS`, `assertValidTransition()`
- `settlement.service.ts:19-429` — full service: request, approve, pay, complete, reject, cancel
- `settlement-constants.ts:1-2` — cancelable and rejectable status arrays
- `change-settlement-status.command.ts` — command handler for V2 status transitions
- `marketplace-payment.listener.ts` — payment events triggering settlement eligibility

## Related Decisions

- GOV-ADR-004 (Ledger Based Transactions): Double-entry recording for all financial movements
- GOV-ADR-005 (Finance Owns Financial Truth): Settlement financials recorded in general ledger
