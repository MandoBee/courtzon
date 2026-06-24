-- Migration 102: Add is_public to users for profile visibility toggle
USE `courtzon_v2`;

ALTER TABLE users
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 1 AFTER is_email_verified;
