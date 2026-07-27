-- Demo player profile extras
UPDATE player_profiles SET
  playing_hand = 'right',
  bio = 'Passionate tennis player with 5 years of experience. Love competing in local tournaments.',
  emergency_contact_name = 'Jane Doe',
  emergency_contact_phone = '+1234567890',
  emergency_contact_relation = 'Spouse'
WHERE id = 1;
