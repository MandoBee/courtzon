-- ============================================================================
-- COURTZON-V2 : TOURNAMENTS + ACADEMIES + COACHES
-- ============================================================================

USE courtzon_v2;

-- ============================================================================
-- SECTION 1: TOURNAMENTS
-- ============================================================================

CREATE TABLE tournament_bracket_types (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  slug              VARCHAR(50) NOT NULL UNIQUE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  config_schema     JSON DEFAULT NULL COMMENT 'JSON Schema for bracket-specific config',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tournaments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id         CHAR(36) NOT NULL UNIQUE,
  creator_id        INT UNSIGNED NOT NULL COMMENT 'Any role can create',
  organisation_id   INT UNSIGNED DEFAULT NULL COMMENT 'NULL = community tournament',
  branch_id         INT UNSIGNED DEFAULT NULL,
  bracket_type_id   INT UNSIGNED NOT NULL,
  sport_id          INT UNSIGNED DEFAULT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  tournament_type   ENUM('platform','community') NOT NULL DEFAULT 'platform',
  max_participants  INT UNSIGNED NOT NULL,
  min_participants  INT UNSIGNED NOT NULL DEFAULT 2,
  entry_fee         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency_code     CHAR(3) NOT NULL,
  commission_rate   DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Platform commission % on entry fees',
  prize_description TEXT DEFAULT NULL,
  status            ENUM('draft','open','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
  registration_opens TIMESTAMP NULL DEFAULT NULL,
  registration_closes TIMESTAMP NULL DEFAULT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE DEFAULT NULL,
  rules             TEXT DEFAULT NULL,
  is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
  image_url         VARCHAR(500) DEFAULT NULL,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_creator (creator_id),
  INDEX idx_org (organisation_id),
  INDEX idx_sport (sport_id),
  INDEX idx_status (status),
  INDEX idx_dates (start_date, end_date),
  CONSTRAINT fk_tourn_creator FOREIGN KEY (creator_id) REFERENCES users(id),
  CONSTRAINT fk_tourn_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  CONSTRAINT fk_tourn_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_tourn_bracket FOREIGN KEY (bracket_type_id) REFERENCES tournament_bracket_types(id),
  CONSTRAINT fk_tourn_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE tournament_registrations (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tournament_id     INT UNSIGNED NOT NULL,
  player_id         INT UNSIGNED NOT NULL,
  seed_rank         INT UNSIGNED DEFAULT NULL,
  payment_status    ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
  status            ENUM('registered','confirmed','withdrawn','disqualified') NOT NULL DEFAULT 'registered',
  registered_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tournament (tournament_id),
  INDEX idx_player (player_id),
  UNIQUE KEY uk_player_tourn (tournament_id, player_id),
  CONSTRAINT fk_reg_tourn FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_player FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tournament_matches (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tournament_id     INT UNSIGNED NOT NULL,
  round             INT UNSIGNED NOT NULL,
  match_number      INT UNSIGNED NOT NULL,
  player1_id        INT UNSIGNED DEFAULT NULL,
  player2_id        INT UNSIGNED DEFAULT NULL,
  resource_id       INT UNSIGNED DEFAULT NULL COMMENT 'Linked resource allocation',
  start_time        DATETIME DEFAULT NULL,
  end_time          DATETIME DEFAULT NULL,
  status            ENUM('scheduled','in_progress','completed','walkover','cancelled') NOT NULL DEFAULT 'scheduled',
  winner_id         INT UNSIGNED DEFAULT NULL,
  score_summary     VARCHAR(500) DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tournament (tournament_id),
  INDEX idx_player1 (player1_id),
  INDEX idx_player2 (player2_id),
  INDEX idx_status (status),
  CONSTRAINT fk_match_tourn FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_player1 FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_match_player2 FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_match_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE tournament_match_scores (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  match_id          INT UNSIGNED NOT NULL,
  set_number        TINYINT UNSIGNED NOT NULL,
  player1_score     VARCHAR(20) DEFAULT NULL,
  player2_score     VARCHAR(20) DEFAULT NULL,
  entered_by        INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_match (match_id),
  CONSTRAINT fk_score_match FOREIGN KEY (match_id) REFERENCES tournament_matches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 2: ACADEMIES
-- ============================================================================

CREATE TABLE academies (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id   INT UNSIGNED NOT NULL,
  branch_id         INT UNSIGNED DEFAULT NULL,
  sport_id          INT UNSIGNED DEFAULT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  image_url         VARCHAR(500) DEFAULT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_org (organisation_id),
  CONSTRAINT fk_acad_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_acad_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_acad_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE academy_curriculums (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academy_id        INT UNSIGNED NOT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  level_required    INT UNSIGNED DEFAULT NULL COMMENT 'Min player level',
  duration_weeks    INT UNSIGNED DEFAULT NULL,
  price             DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency_code     CHAR(3) NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_academy (academy_id),
  CONSTRAINT fk_cur_acad FOREIGN KEY (academy_id) REFERENCES academies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE academy_enrollments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academy_id        INT UNSIGNED NOT NULL,
  curriculum_id     INT UNSIGNED DEFAULT NULL,
  player_id         INT UNSIGNED NOT NULL,
  status            ENUM('active','completed','dropped','waitlisted') NOT NULL DEFAULT 'active',
  enrolled_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at      TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_academy (academy_id),
  INDEX idx_player (player_id),
  UNIQUE KEY uk_player_acad (academy_id, player_id),
  CONSTRAINT fk_enroll_acad FOREIGN KEY (academy_id) REFERENCES academies(id) ON DELETE CASCADE,
  CONSTRAINT fk_enroll_cur FOREIGN KEY (curriculum_id) REFERENCES academy_curriculums(id) ON DELETE SET NULL,
  CONSTRAINT fk_enroll_player FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE academy_sessions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academy_id        INT UNSIGNED NOT NULL,
  curriculum_id     INT UNSIGNED DEFAULT NULL,
  coach_id          INT UNSIGNED DEFAULT NULL,
  resource_id       INT UNSIGNED DEFAULT NULL,
  title             VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  start_time        DATETIME NOT NULL,
  end_time          DATETIME NOT NULL,
  max_participants  INT UNSIGNED NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_academy (academy_id),
  INDEX idx_coach (coach_id),
  INDEX idx_dates (start_time, end_time),
  CONSTRAINT fk_sess_acad FOREIGN KEY (academy_id) REFERENCES academies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sess_cur FOREIGN KEY (curriculum_id) REFERENCES academy_curriculums(id) ON DELETE SET NULL,
  CONSTRAINT fk_sess_coach FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sess_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE academy_session_attendance (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id        INT UNSIGNED NOT NULL,
  player_id         INT UNSIGNED NOT NULL,
  status            ENUM('present','absent','excused') NOT NULL DEFAULT 'present',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_attendance (session_id, player_id),
  CONSTRAINT fk_att_sess FOREIGN KEY (session_id) REFERENCES academy_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_player FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE academy_evaluations (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academy_id        INT UNSIGNED NOT NULL,
  player_id         INT UNSIGNED NOT NULL,
  evaluator_id      INT UNSIGNED NOT NULL COMMENT 'Coach who evaluated',
  skill_scores      JSON NOT NULL COMMENT '{skill_name: score}',
  overall_score     DECIMAL(5,2) DEFAULT NULL,
  notes             TEXT DEFAULT NULL,
  recommended_level_id INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_player (player_id),
  CONSTRAINT fk_eval_acad FOREIGN KEY (academy_id) REFERENCES academies(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_player FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 3: COACHES (Freelance)
-- ============================================================================

CREATE TABLE coach_profiles (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL UNIQUE,
  bio               TEXT DEFAULT NULL,
  experience_years  TINYINT UNSIGNED DEFAULT NULL,
  certifications    JSON DEFAULT NULL,
  sports            JSON DEFAULT NULL COMMENT 'Array of sport_ids they coach',
  hourly_rate       DECIMAL(12,2) DEFAULT NULL,
  currency_code     CHAR(3) DEFAULT NULL,
  rating_avg        DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count      INT UNSIGNED NOT NULL DEFAULT 0,
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_coach_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE coach_org_agreements (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coach_id          INT UNSIGNED NOT NULL,
  organisation_id   INT UNSIGNED NOT NULL,
  coach_split_pct   DECIMAL(5,2) NOT NULL COMMENT 'Coach % after platform commission',
  org_split_pct     DECIMAL(5,2) NOT NULL COMMENT 'Org % after platform commission',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coach_org (coach_id, organisation_id),
  CONSTRAINT fk_agr_coach FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_agr_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE coach_sessions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coach_id          INT UNSIGNED NOT NULL,
  organisation_id   INT UNSIGNED DEFAULT NULL COMMENT 'NULL = independent session',
  branch_id         INT UNSIGNED DEFAULT NULL,
  resource_id       INT UNSIGNED DEFAULT NULL,
  player_id         INT UNSIGNED NOT NULL,
  start_time        DATETIME NOT NULL,
  end_time          DATETIME NOT NULL,
  price             DECIMAL(12,2) NOT NULL,
  currency_code     CHAR(3) NOT NULL,
  platform_commission_pct DECIMAL(5,2) NOT NULL,
  coach_earnings    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  org_earnings      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status            ENUM('scheduled','confirmed','in_progress','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coach (coach_id),
  INDEX idx_player (player_id),
  INDEX idx_dates (start_time, end_time),
  CONSTRAINT fk_cs_coach FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  CONSTRAINT fk_cs_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_cs_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
  CONSTRAINT fk_cs_player FOREIGN KEY (player_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE coach_reviews (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coach_id          INT UNSIGNED NOT NULL,
  player_id         INT UNSIGNED NOT NULL,
  session_id        INT UNSIGNED DEFAULT NULL,
  rating            TINYINT UNSIGNED NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text       TEXT DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coach (coach_id),
  UNIQUE KEY uk_review (coach_id, player_id, session_id),
  CONSTRAINT fk_cr_coach FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_player FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_session FOREIGN KEY (session_id) REFERENCES coach_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB;
