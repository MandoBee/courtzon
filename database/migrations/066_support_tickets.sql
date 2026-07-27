CREATE TABLE IF NOT EXISTS support_tickets (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED DEFAULT NULL,
  user_id         INT UNSIGNED NOT NULL,
  subject         VARCHAR(255) NOT NULL,
  description     TEXT NOT NULL,
  category        ENUM('general','billing','technical','account','feature_request','other') NOT NULL DEFAULT 'general',
  priority        ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status          ENUM('open','in_progress','waiting_on_customer','resolved','closed') NOT NULL DEFAULT 'open',
  assigned_to     INT UNSIGNED DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_organisation (organisation_id),
  KEY idx_user (user_id),
  KEY idx_status (status),
  KEY idx_assigned (assigned_to),
  CONSTRAINT fk_st_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  CONSTRAINT fk_st_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_st_assign FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id       INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  message         TEXT NOT NULL,
  is_internal     TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Internal admin note, not visible to customer',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_ticket (ticket_id),
  CONSTRAINT fk_stm_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_stm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
