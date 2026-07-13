-- Migration 027: Chat groups, invitations, pin conversations, unread counts
-- Adds: group invitations, avatar on conversations, pinned_at on participants

-- 1. Add avatar_url to conversations (for group logos)
ALTER TABLE `conversations`
  ADD COLUMN `avatar_url` varchar(500) DEFAULT NULL COMMENT 'Group avatar/logo URL' AFTER `name`;

-- 2. Add pinned_at to conversation_participants (null = not pinned)
ALTER TABLE `conversation_participants`
  ADD COLUMN `pinned_at` timestamp NULL DEFAULT NULL COMMENT 'When the user pinned this conversation' AFTER `is_muted`;

-- 3. Create group_invitations table
CREATE TABLE IF NOT EXISTS `group_invitations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(10) unsigned NOT NULL,
  `inviter_id` int(10) unsigned NOT NULL,
  `invitee_id` int(10) unsigned NOT NULL,
  `status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_invite` (`conversation_id`,`invitee_id`),
  KEY `fk_gi_inviter` (`inviter_id`),
  KEY `fk_gi_invitee` (`invitee_id`),
  CONSTRAINT `fk_gi_convo` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gi_inviter` FOREIGN KEY (`inviter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gi_invitee` FOREIGN KEY (`invitee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
