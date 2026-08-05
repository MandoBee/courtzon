-- Multi-entry emergency contacts for player profiles.
-- The legacy single-contact columns on player_profiles remain for backward compatibility;
-- the first contact is mirrored there on every save.

CREATE TABLE `player_emergency_contacts` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `name` varchar(200) NOT NULL,
  `phone` varchar(50) NOT NULL,
  `relation` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_pec_user` (`user_id`),
  CONSTRAINT `fk_pec_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill from the legacy single-contact columns so existing users keep their contact.
INSERT INTO `player_emergency_contacts` (`user_id`, `name`, `phone`, `relation`)
SELECT `user_id`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relation`
FROM `player_profiles`
WHERE `emergency_contact_name` IS NOT NULL OR `emergency_contact_phone` IS NOT NULL;
