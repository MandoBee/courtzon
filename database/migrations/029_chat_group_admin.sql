-- 029: Add is_admin to conversation_participants for group admin role
-- Run: mysql -u root courtzon_v3 < database/migrations/029_chat_group_admin.sql

ALTER TABLE `conversation_participants`
  ADD COLUMN `is_admin` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Group admin can edit settings, remove members, invite' AFTER `pinned_at`;
