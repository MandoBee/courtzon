-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ============================================================================
-- 178_payment_allocations.sql — R5-D2-A payment allocation foundation
-- ============================================================================
-- Maps ONE recurring series CARD payment to its canonical booking occurrence
-- units. The refundable unit is `bookings.id` (an occurrence) — NEVER
-- `booking_slots`, which is availability-only and carries no money.
--
--   payment_transactions (reference_type='booking_series', booking_id NULL)
--        |
--        +--1..N--> payment_allocations  (one per paid occurrence)
--                              |
--                              +---- bookings (occurrence snapshot owner)
--
-- Every financial column is copied from the PERSISTED occurrence snapshot at
-- allocation time (subtotal=total_amount, tax_amount, commission_amount,
-- org_net=club_amount, gross=total_amount+tax_amount). NO historical pricing is
-- recomputed and NO current PricingEngine is consulted. Method-neutral
-- `payment_method` reuses the existing canonical payment method representation.
--
-- Additive, PRODUCTION_SAFE, backward-compatible. No existing table is changed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_transaction_id BIGINT UNSIGNED NOT NULL,
  series_id BIGINT UNSIGNED NULL,
  booking_id BIGINT UNSIGNED NOT NULL,

  -- Historical financial snapshot (copied verbatim from the booking row).
  subtotal DECIMAL(14,2) NOT NULL,
  tax_amount DECIMAL(14,2) NOT NULL,
  commission_amount DECIMAL(14,2) NOT NULL,
  org_net_amount DECIMAL(14,2) NOT NULL,
  gross_amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EGP',

  -- Allocation lifecycle foundation (D2-B wires the transitions; today every
  -- row is 'allocated' with refunded_amount 0).
  refunded_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('allocated','partially_refunded','refunded') NOT NULL DEFAULT 'allocated',

  -- Reuses the canonical payment method representation (same values as
  -- payment_transactions.payment_method) so the model stays method-neutral.
  payment_method ENUM('wallet','cash','card','bank_transfer','online') NOT NULL DEFAULT 'card',

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- One paid occurrence is allocated exactly once per payment (final safety
  -- net for migration replay / concurrent success handling).
  UNIQUE KEY uk_pa_payment_booking (payment_transaction_id, booking_id),
  KEY idx_pa_series (series_id),
  KEY idx_pa_booking (booking_id),
  KEY idx_pa_payment (payment_transaction_id),

  -- Financial-data policy: allocations are permanent history. Payments and
  -- bookings are never cascade-deleted away from their allocation ledger; the
  -- loose series reference is SET NULL if a series is ever removed.
  CONSTRAINT fk_pa_payment_transaction FOREIGN KEY (payment_transaction_id)
    REFERENCES payment_transactions (id) ON DELETE RESTRICT,
  CONSTRAINT fk_pa_booking_series FOREIGN KEY (series_id)
    REFERENCES booking_series (id) ON DELETE SET NULL,
  CONSTRAINT fk_pa_booking FOREIGN KEY (booking_id)
    REFERENCES bookings (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- BACKFILL — existing recurring CARD payments that are already 'paid'.
--
-- For every `payment_status='paid'` booking_series payment, create exactly one
-- allocation per canonical occurrence booking of that series, using ONLY the
-- persisted occurrence snapshots. Idempotent (NOT EXISTS + UNIQUE above), so a
-- migration replay never duplicates rows. Failed/cancelled/expired/refunded
-- payments are intentionally NOT backfilled — only a paid series is a
-- refundable series. No refunded_amount is fabricated for historical rows.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO payment_allocations
  (payment_transaction_id, series_id, booking_id,
   subtotal, tax_amount, commission_amount, org_net_amount, gross_amount,
   currency, refunded_amount, status, payment_method, created_at, updated_at)
SELECT
  pt.id,
  b.series_id,
  b.id,
  b.total_amount,
  b.tax_amount,
  b.commission_amount,
  b.club_amount,
  (b.total_amount + b.tax_amount),
  pt.currency,
  0,
  'allocated',
  pt.payment_method,
  NOW(),
  NOW()
FROM payment_transactions pt
JOIN booking_series s ON s.id = pt.reference_id AND pt.reference_type = 'booking_series'
JOIN bookings b ON b.series_id = s.id
WHERE pt.payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM payment_allocations pa
    WHERE pa.payment_transaction_id = pt.id AND pa.booking_id = b.id
  );