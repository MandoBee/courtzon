# FINANCIAL SYSTEM DESIGN

## Revenue Model (3-Tier Subscription + Commission)

| Plan | Monthly Price | Yearly Price | Commission Rate |
|---|---|---|---|---|
| **Premium** | 4,999 EGP | 49,990 EGP (16% discount) | 5% (booking, coach, academy) / 7.5% (tournament) / 3% (marketplace) |
| **Standard** | 1,999 EGP | N/A (monthly only) | 10% (booking, coach, academy) / 15% (tournament) / 7% (marketplace) |
| **Freemium** | 0 EGP | N/A | 18% (booking, coach, academy) / 22% (tournament) / 12% (marketplace) |

Commission applies to: bookings, tournament entry fees, marketplace sales, coach sessions, academy enrollments.

## Wallet System
- Each user has one wallet (1:1) — auto-created via MySQL trigger on user insert
- Optimistic locking via `version` column (SELECT ... FOR UPDATE + version check)
- Balance stored in `user_wallets.balance`
- Transaction types: deposit, withdrawal, booking_payment, refund, commission, settlement
- Direction: credit (adds to balance) or debit (subtracts)

### Wallet Module — Backend
| File | Purpose |
|---|---|
| `modules/wallet/presentation/wallet.dto.ts` | Zod schemas: DepositSchema, WithdrawSchema, TransferSchema, WalletQuerySchema |
| `modules/wallet/presentation/wallet.controller.ts` | Handlers: getMyWallet, deposit, withdraw, getTransactions |
| `modules/wallet/presentation/wallet.routes.ts` | Fastify routes: GET /wallets/me, POST /wallets/deposit, POST /wallets/withdraw, GET /wallets/transactions |
| `modules/wallet/application/wallet.service.ts` | Business logic: getMyWallet (auto-create), deposit (gateway or direct), withdraw (balance check + optimistic lock), getTransactions |
| `modules/wallet/infrastructure/repositories/wallet.repository.ts` | Data access: findByUserId, lockAndGetBalance (FOR UPDATE), updateBalance (optimistic), createTransaction, findTransactions, getBalance |

### Wallet UI — Frontend
- `pages/profile/WalletPage.tsx` — balance card, quick-amount buttons (100/200/500/1000), deposit form with method selector, transaction history with pagination

## Payment Gateway Abstraction
- Interface-driven design in `shared/services/gateway/`
- Three implementations behind `gatewayFactory`:
  - **Mock Gateway** (`mock-gateway.ts`): always succeeds, for dev/testing
  - **Paymob Gateway** (`paymob-gateway.ts`): full integration (auth → order → payment_key → hosted checkout URL → webhook HMAC verification)
  - Extensible: implement `PaymentGateway` interface for Fawry, etc.

### Payment Flow
```
Player books court
  → If wallet selected && sufficient balance:
       deduct balance immediately inside booking transaction
       booking status = 'confirmed'
  → If wallet selected && insufficient balance:
       booking status = 'pending_payment'
       generate gateway payment URL
  → If card/gateway selected:
       booking status = 'pending_payment'
       generate gateway payment URL
  → Gateway webhook: POST /payments/webhook
       verify HMAC signature
       update payment_transaction status
  → Manual: charge via POST /payments/charge, refund via POST /payments/:id/refund
```

### Payment Module — Backend
| File | Purpose |
|---|---|
| `modules/payment/presentation/payment.dto.ts` | Zod: ChargeSchema, RefundPaymentSchema |
| `modules/payment/presentation/payment.controller.ts` | Handlers: charge, refund, webhook, getTransactions |
| `modules/payment/presentation/payment.routes.ts` | Routes: POST /payments/charge (auth), POST /payments/:id/refund (auth), POST /payments/webhook (public), GET /payments/transactions (auth) |
| `modules/payment/application/payment.service.ts` | chargeByWallet (direct debit), chargeByGateway (redirect), handleWebhook (verify + update), refund |
| `modules/payment/infrastructure/repositories/payment.repository.ts` | CRUD: create, findById, findByGatewayRef, updateStatus, findByUser, createJournalEntry |

## Settlement Engine
- Admin-triggered via POST /settlements/run (requires admin/super_admin)
- Aggregates completed bookings for an org in a date range
- Creates settlement + settlement_items records
- Writes double-entry journal entry
- Approval workflow: approve via POST /settlements/approve

### Settlement Module — Backend
| File | Purpose |
|---|---|
| `modules/settlement/presentation/settlement.dto.ts` | Zod: SettlementQuerySchema, ApproveSettlementSchema |
| `modules/settlement/presentation/settlement.controller.ts` | Handlers: runSettlement, approveSettlement, getSettlements, getOrgSettlements |
| `modules/settlement/presentation/settlement.routes.ts` | Routes (all admin): POST /settlements/run, POST /settlements/approve, GET /settlements, GET /settlements/organisation/:organisationId |
| `modules/settlement/application/settlement.service.ts` | runSettlement (aggregate → create → journal), approveSettlement, getSettlements |
| `modules/settlement/infrastructure/repositories/settlement.repository.ts` | createSettlement, createSettlementItem, findSettlementById, updateSettlementStatus, findPendingSettlements, findSettlements, getCompletedBookingsInRange |

### Settlement UI — Frontend
- `pages/admin/settlements/SettlementListPage.tsx` — run form, filter by status, table with gross/commission/net, approve button

## Database Migration (005_payment_gateway.sql)
1. `bank_accounts` — branch bank accounts for withdrawals
2. `payment_transactions` — gateway_transaction_id, gateway_response columns
3. `settlements` — settled_by, settled_at, notes columns
4. `payment_gateway_config` — per-org/providers gateway config
5. `withdrawal_requests` — admin approval workflow for manual withdrawals
6. `invoices` — formal invoice records with tax support

## Double-Entry Journal
Every financial operation creates two entries (debit/credit):
- `Booking payment`: debit=Revenue, credit=Cash
- `Refund`: debit=Refund Expense, credit=Cash
- `Commission earned`: debit=Accounts Receivable, credit=Commission Revenue
- `Settlement`: debit=Settlement Receivable, credit=Revenue
- `Payout to org`: debit=Settlement Payable, credit=Bank Account

## Commission Engine
Commission rules are defined globally but overridable per organization based on their subscription plan:
- Plan determines the commission percentage in `subscription_plan_rates`
- `commission_rules` table stores rule definitions
- `commission_transactions` records each commission event
- Rules can target specific entities (booking, tournament, marketplace)

## Key Configuration
- Gateway selection via `PAYMENT_GATEWAY_PROVIDER` env var (mock|paymob|fawry)
- Paymob: `PAYMOB_API_KEY`, `PAYMOB_MERCHANT_ID`, `PAYMOB_HMAC_SECRET`
- Webhook endpoint: `POST /payments/webhook` (public, HMAC-signed)
