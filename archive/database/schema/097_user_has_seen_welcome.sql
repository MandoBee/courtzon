-- Migration 097: Add has_seen_welcome to users for first-login prompts
USE `courtzon_v2`;

ALTER TABLE users
  ADD COLUMN has_seen_welcome TINYINT(1) NOT NULL DEFAULT 0 AFTER is_email_verified;
