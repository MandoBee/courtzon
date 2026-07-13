-- 028: Add created_by to conversations + group management support
-- Run: mysql -u root courtzon_v3 < database/migrations/028_chat_group_edit.sql

ALTER TABLE `conversations`
  ADD COLUMN `created_by` int(10) unsigned DEFAULT NULL COMMENT 'User who created the group conversation' AFTER `avatar_url`,
  ADD CONSTRAINT `fk_convo_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- Backfill existing group conversations: set created_by to the first participant
UPDATE conversations c
  JOIN (
    SELECT conversation_id, user_id,
           ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at ASC) AS rn
    FROM conversation_participants
  ) cp ON cp.conversation_id = c.id AND cp.rn = 1
  SET c.created_by = cp.user_id
  WHERE c.conversation_type = 'group' AND c.created_by IS NULL;
