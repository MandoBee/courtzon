-- Migration 031: Add auth.temporary_password_reset_enabled feature flag
-- Temporary development/beta password reset without email verification.
-- Idempotent: INSERT IGNORE makes it safe to re-run.
--
-- TODO: Remove this migration and flag when email verification flow replaces the temporary reset.

SET @existing = (
  SELECT COUNT(*) FROM feature_flags
  WHERE flag_key = 'auth.temporary_password_reset_enabled'
);

SET @sql = IF(@existing = 0,
  'INSERT INTO feature_flags (flag_key, label, description, module, is_enabled, is_system, created_at)
   VALUES (''auth.temporary_password_reset_enabled'', ''Temporary Password Reset'', ''Temporary development/beta password reset without email verification'', ''auth'', 1, 0, NOW())',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
