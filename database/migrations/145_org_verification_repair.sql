-- 145_org_verification_repair.sql
-- DATA-ONLY, IDEMPOTENT repair for organisations stranded at is_active=1, is_verified=0.
--
-- Why this data fix is unavoidable (no schema change): the org portal guard
-- requires BOTH is_verified AND is_active, while the admin Organisations list
-- surfaces ONLY is_active ("Organisation Status"). Before commit af71a81 an
-- admin activation wrote is_active=1 without touching is_verified, leaving
-- rows where the admin sees "Active" but the owner is permanently stuck on
-- "Awaiting approval". The admin UI exposes no verification control, so these
-- rows cannot be repaired from any screen. Business rule (af71a81): admin
-- activation IS the approval decision.
--
-- Safety:
--   * Registration-born orgs awaiting review are (FALSE, FALSE) — untouched
--     (is_active=0 fails the WHERE).
--   * Already-correct rows match zero rows — re-runnable (idempotent).
--   * Sets verification only for orgs an admin explicitly ACTIVATED — never
--     deactivates or suspends anything.

UPDATE organisations
SET is_verified = 1
WHERE is_active = 1
  AND is_verified = 0
  AND deleted_at IS NULL;
