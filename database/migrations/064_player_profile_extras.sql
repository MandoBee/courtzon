-- Add player profile extra fields (Sprint 9)
ALTER TABLE player_profiles
  ADD COLUMN playing_hand ENUM('right','left','ambidextrous') DEFAULT NULL AFTER main_level_id,
  ADD COLUMN bio TEXT DEFAULT NULL AFTER playing_hand,
  ADD COLUMN emergency_contact_name VARCHAR(200) DEFAULT NULL AFTER bio,
  ADD COLUMN emergency_contact_phone VARCHAR(50) DEFAULT NULL AFTER emergency_contact_name,
  ADD COLUMN emergency_contact_relation VARCHAR(100) DEFAULT NULL AFTER emergency_contact_phone,
  ADD COLUMN privacy_show_profile TINYINT(1) NOT NULL DEFAULT 1 AFTER emergency_contact_relation,
  ADD COLUMN privacy_show_stats TINYINT(1) NOT NULL DEFAULT 1 AFTER privacy_show_profile,
  ADD COLUMN privacy_show_activity TINYINT(1) NOT NULL DEFAULT 1 AFTER privacy_show_stats;
