-- ============================================================================
-- Academy platform tables (restore)
-- ============================================================================
-- The academy module expects the post-061 schema. Some deployed databases
-- recorded 061 as applied but never received academy_enrollments,
-- academy_group_sessions and academy_attendance. This migration restores
-- them additively. Idempotent: all CREATE TABLEs use IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS academy_programs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(50)  NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  category        VARCHAR(100) NOT NULL,
  level           VARCHAR(100) DEFAULT NULL,
  season          VARCHAR(100) DEFAULT NULL,
  capacity        INT UNSIGNED NOT NULL DEFAULT 0,
  price           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency        CHAR(3)      NOT NULL DEFAULT 'USD',
  price_type      ENUM('FREE','FIXED','MEMBERS_ONLY') NOT NULL DEFAULT 'FIXED',
  status          ENUM('draft','published','open','full','running','completed','cancelled','archived') NOT NULL DEFAULT 'draft',
  is_public       TINYINT(1)   NOT NULL DEFAULT 1,
  archived_at     TIMESTAMP    NULL DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code),
  KEY idx_status (status),
  KEY idx_category (category),
  KEY idx_is_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_groups (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  program_id      INT UNSIGNED NOT NULL,
  name            VARCHAR(200) NOT NULL,
  coach_id        INT UNSIGNED DEFAULT NULL,
  capacity        INT UNSIGNED NOT NULL DEFAULT 0,
  status          ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_program (program_id),
  KEY idx_coach (coach_id),
  CONSTRAINT fk_group_program FOREIGN KEY (program_id) REFERENCES academy_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_coach   FOREIGN KEY (coach_id)   REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_enrollments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  player_id       INT UNSIGNED NOT NULL,
  program_id      INT UNSIGNED NOT NULL,
  group_id        INT UNSIGNED DEFAULT NULL,
  membership_id   INT UNSIGNED DEFAULT NULL,
  status          ENUM('pending','confirmed','waiting','cancelled','completed') NOT NULL DEFAULT 'pending',
  waiting_order   INT UNSIGNED DEFAULT NULL COMMENT 'Position in waiting list (deterministic promotion)',
  enrolled_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at    TIMESTAMP    NULL DEFAULT NULL,
  completed_at    TIMESTAMP    NULL DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_player (player_id),
  KEY idx_program (program_id),
  KEY idx_group (group_id),
  KEY idx_status (status),
  KEY idx_waiting_order (waiting_order),
  CONSTRAINT fk_enrollments_player   FOREIGN KEY (player_id) REFERENCES users(id)             ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_program  FOREIGN KEY (program_id) REFERENCES academy_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_group    FOREIGN KEY (group_id)   REFERENCES academy_groups(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_group_sessions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id        INT UNSIGNED NOT NULL,
  session_date    DATE         NOT NULL,
  start_time      TIME         DEFAULT NULL,
  end_time        TIME         DEFAULT NULL,
  court_id        INT UNSIGNED DEFAULT NULL,
  coach_id        INT UNSIGNED DEFAULT NULL,
  status          ENUM('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_group (group_id),
  KEY idx_date (session_date),
  KEY idx_coach (coach_id),
  CONSTRAINT fk_session_group  FOREIGN KEY (group_id) REFERENCES academy_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_court  FOREIGN KEY (court_id) REFERENCES resources(id)      ON DELETE SET NULL,
  CONSTRAINT fk_session_coach  FOREIGN KEY (coach_id) REFERENCES users(id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academy_attendance (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_session_id  INT UNSIGNED NOT NULL,
  enrollment_id     INT UNSIGNED NOT NULL,
  attendance_status ENUM('present','absent','excused','late') NOT NULL DEFAULT 'present',
  notes             TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_session_enrollment (group_session_id, enrollment_id),
  KEY idx_enrollment (enrollment_id),
  CONSTRAINT fk_att_session    FOREIGN KEY (group_session_id) REFERENCES academy_group_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_enrollment FOREIGN KEY (enrollment_id)    REFERENCES academy_enrollments(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
