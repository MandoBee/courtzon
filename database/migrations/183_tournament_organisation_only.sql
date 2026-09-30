-- ============================================================================
-- COURTZON V3 : TOURNAMENT ORGANISATION-ONLY (G11-Tournament Phase 3)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PRODUCT RULE (locked):
--   The CourtZon PLATFORM must never create, own, fund, or financially
--   recognise a tournament. Only an ORGANISATION may create and own one.
--   CourtZon is platform / custodian only.
--
-- WHAT THIS MIGRATION DOES (schema + type normalisation ONLY):
--   1. FAIL-CLOSED GUARDS (abort the whole migration when any trips):
--        (a) an ACTIVE org-less tournament (organisation_id IS NULL and not
--            cancelled/archived) — it has no owning organisation and is still
--            reachable by players, so it must be cancelled operationally first;
--        (b) any tournament_prize_award with funding_source='platform' — there is
--            no organisation left to fund it;
--        (c) any historical ledger posting for the three removed platform event
--            types — the matching accounting concepts are being deleted, so such
--            postings could never be replayed or reversed again.
--   2. NORMALISE `tournaments.tournament_type`: every 'platform' row becomes
--      'community'. This covers BOTH forbidden shapes:
--        * the historical org-less tournament, and
--        * organisation-owned rows mislabelled 'platform' by the retired legacy
--          `activities` INSERT, which omitted `tournament_type` and therefore
--          received the column DEFAULT.
--      NOTE: prize funding NEVER depended on this column (it is derived from
--      `organisation_id`), so this is data hygiene only — zero accounting impact.
--   3. NARROW the two enums so the DATABASE ITSELF rejects the platform value:
--        * tournaments.tournament_type             ENUM('community')
--        * tournament_prize_awards.funding_source ENUM('organization')
--      Both stay NOT NULL, with 'community' / 'organization' as the DEFAULT.
--   4. Refresh the `commission_rate` comment to document that it is always the
--      owning organisation's subscription-derived immutable snapshot.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   * It does NOT add NOT NULL to `tournaments.organisation_id`. Cancelled or
--     archived org-less rows are inert historical records; the immutable-history
--     policy keeps them readable. Forward enforcement is by code (a single
--     validated organisation-scoped creation path) plus the narrowed enums.
--   * It does NOT delete, cancel, archive, or otherwise mutate any row's business
--     state, and it NEVER removes historical accounting data.
--   * It does NOT touch any `tournament_org_*` concept, account 4300, or 4140.
-- ============================================================================

DROP PROCEDURE IF EXISTS migration_183;

DELIMITER $$

CREATE PROCEDURE migration_183()
BEGIN
  DECLARE v_active_orgless INT DEFAULT 0;
  DECLARE v_platform_awards INT DEFAULT 0;
  DECLARE v_platform_ledger INT DEFAULT 0;

  -- ── Guard (a): an ACTIVE org-less tournament still exists ─────────────────
  -- Cancelling/archiving such a tournament (and refunding any cash it collected)
  -- is a deliberate operational action; a schema migration must never decide it.
  SELECT COUNT(*) INTO v_active_orgless
    FROM tournaments
   WHERE organisation_id IS NULL
     AND status NOT IN ('cancelled', 'archived')
     AND archived_at IS NULL
     AND deleted_at IS NULL;

  IF v_active_orgless > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'G11 Phase 3 aborted: an ACTIVE tournament still has organisation_id IS NULL. Cancel or archive every org-less tournament (and refund any collected cash) before applying this migration.';
  END IF;

  -- ── Guard (b): a platform-funded prize award still exists ─────────────────
  SELECT COUNT(*) INTO v_platform_awards
    FROM tournament_prize_awards
   WHERE funding_source = 'platform';

  IF v_platform_awards > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'G11 Phase 3 aborted: tournament_prize_awards rows with funding_source=platform still exist. Re-fund them under an owning organisation before applying this migration.';
  END IF;

  -- ── Guard (c): historical platform ledger postings still exist ────────────
  SELECT COUNT(*) INTO v_platform_ledger
    FROM ledger_entries
   WHERE event_type IN ('tournament_platform_card_payment', 'tournament_prize_award', 'tournament_prize_refund')
      OR source_type IN ('tournament_platform_card_payment', 'tournament_prize_award', 'tournament_prize_refund');

  IF v_platform_ledger > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'G11 Phase 3 aborted: historical ledger entries exist for the removed platform tournament event types. Reconcile/archive them before applying this migration.';
  END IF;

  -- ── 2. NORMALISE every 'platform' tournament_type to 'community' ────────────
  UPDATE `tournaments`
     SET `tournament_type` = 'community'
   WHERE `tournament_type` <> 'community';

  -- ── 3. NARROW the enums so the DB rejects the platform value ───────────────
  ALTER TABLE `tournaments`
    MODIFY COLUMN `tournament_type` enum('community') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'community'
    COMMENT 'Organisation-owned competition type. CourtZon never owns a tournament — an organisation always does.';

  ALTER TABLE `tournament_prize_awards`
    MODIFY COLUMN `funding_source` enum('organization') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'organization'
    COMMENT 'Prize funding is always the owning organisation; the CourtZon platform never funds a prize.';

  -- ── 4. Document the commission snapshot semantics ──────────────────────────
  ALTER TABLE `tournaments`
    MODIFY COLUMN `commission_rate` decimal(5,2) NOT NULL DEFAULT '0.00'
    COMMENT 'IMMUTABLE snapshot of the owning organisation subscription commission (%) taken at creation time.';
END$$

DELIMITER ;

CALL migration_183();

DROP PROCEDURE migration_183;
