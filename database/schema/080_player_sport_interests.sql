-- Sports a player is interested in (excluding main sport), for tournaments/academies
USE courtzon_v2;

CREATE TABLE IF NOT EXISTS player_sport_interests (
  user_id   INT UNSIGNED NOT NULL,
  sport_id  INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sport_id),
  CONSTRAINT fk_psi_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_psi_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
) ENGINE=InnoDB;
