# Payment Database Schema

## Tables

### payment_transactions

Core payment transaction table. One record per payment attempt.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT | Primary key |
| `user_id` | INT | FK to users |
| `order_id` | INT NULL | FK to orders (nullable for non-order payments) |
| `payment_method` | ENUM | wallet, cash, card, bank_transfer, online |
| `gateway_provider` | VARCHAR | paymob, mock |
| `gateway_reference` | VARCHAR UNIQUE | Paymob intention_order_id (unique index `uk_gateway_reference`) |
| `amount` | DECIMAL(10,2) | Payment amount |
| `currency` | VARCHAR(3) | EGP, USD, etc. |
| `payment_status` | ENUM | created, pending, processing, paid, failed, expired, refunded, cancelled |
| `gateway_response` | JSON | Raw Paymob API response |
| `paid_at` | DATETIME NULL | Timestamp when payment confirmed |
| `created_at` | DATETIME | Created timestamp |
| `updated_at` | DATETIME | Last updated timestamp |

### orders

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key |
| `user_id` | INT | FK to users |
| `status` | ENUM | pending, confirmed, processing, completed, cancelled, refunded |
| `payment_status` | ENUM | unpaid, paid, refunded |
| `paid_at` | DATETIME NULL | Payment confirmation time |
| `payment_method` | VARCHAR | wallet, cash, card |
| `total` | DECIMAL | Order total |

### wallet_transactions

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key |
| `user_id` | INT | FK to users |
| `type` | ENUM | credit, debit |
| `amount` | DECIMAL | Transaction amount |
| `balance_before` | DECIMAL | Balance before transaction |
| `balance_after` | DECIMAL | Balance after transaction |
| `reference_type` | VARCHAR | payment, refund, topup |
| `reference_id` | INT | FK to reference entity |
| `created_at` | DATETIME | Timestamp |

### financial_journal_entries

Double-entry bookkeeping journal.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key |
| `reference_type` | VARCHAR | payment, refund, wallet, gateway_sync |
| `reference_id` | INT | FK to reference entity |
| `account_type` | ENUM | debit, credit |
| `account_name` | VARCHAR | payment_receivable, revenue, etc. |
| `amount` | DECIMAL | Journal amount |
| `description` | TEXT | Journal description |
| `created_at` | DATETIME | Timestamp |

### cart_items

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key |
| `user_id` | INT | FK to users |
| `product_id` | INT | FK to marketplace products |
| `quantity` | INT | Quantity |
| `price` | DECIMAL | Unit price at time of adding |
| `reserved_until` | DATETIME | Reservation expiry |

## Consistency Rules

1. **No orphan transactions**: Every payment_transaction with order_id must reference an existing order
2. **Status consistency**: If order.payment_status='paid', payment_transaction.payment_status must also be 'paid'
3. **No duplicate journals**: Maximum one financial_journal_entry per payment reference_type+reference_id
4. **Unique gateway references**: `uk_gateway_reference` prevents duplicate Paymob references
5. **Cart cleared only on payment**: Cart items are only removed in `_fulfillOrder()` after payment confirmation

## Verification Queries

```sql
-- Orphan transactions
SELECT COUNT(*) FROM payment_transactions t
WHERE t.order_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = t.order_id);

-- Inconsistent payment status
SELECT COUNT(*) FROM orders o
JOIN payment_transactions t ON t.order_id = o.id
WHERE o.payment_status = 'paid' AND t.payment_status != 'paid';

-- Duplicate payment journals
SELECT COUNT(*) FROM (
  SELECT reference_type, reference_id, COUNT(*) AS cnt
  FROM financial_journal_entries
  WHERE reference_type = 'payment'
  GROUP BY reference_type, reference_id
  HAVING cnt > 1
) d;

-- Stale cart items
SELECT COUNT(*) FROM cart_items
WHERE reserved_until < NOW();
```
