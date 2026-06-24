-- ============================================================================
-- COURTZON-V2 : COMMUNITY + ADVERTISING + CMS
-- ============================================================================

USE courtzon_v2;

-- ============================================================================
-- SECTION 1: COMMUNITY (Friends, Follows, Events, Chat, Ratings)
-- ============================================================================

CREATE TABLE user_follows (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  follower_id       INT UNSIGNED NOT NULL,
  following_id      INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_follow (follower_id, following_id),
  INDEX idx_following (following_id),
  CONSTRAINT fk_follow_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_following FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_friends (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_id      INT UNSIGNED NOT NULL,
  addressee_id      INT UNSIGNED NOT NULL,
  status            ENUM('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
  responded_at      TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_friendship (requester_id, addressee_id),
  INDEX idx_addressee (addressee_id),
  CONSTRAINT fk_friend_req FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_addr FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE community_events (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  creator_id        INT UNSIGNED NOT NULL,
  organisation_id   INT UNSIGNED DEFAULT NULL,
  branch_id         INT UNSIGNED DEFAULT NULL,
  resource_id       INT UNSIGNED DEFAULT NULL,
  title             VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  event_type        ENUM('match','training','social','tournament','other') NOT NULL DEFAULT 'other',
  start_time        DATETIME NOT NULL,
  end_time          DATETIME NOT NULL,
  max_participants  INT UNSIGNED DEFAULT NULL,
  is_public         BOOLEAN NOT NULL DEFAULT TRUE,
  status            ENUM('active','cancelled','completed') NOT NULL DEFAULT 'active',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_creator (creator_id),
  INDEX idx_dates (start_time, end_time),
  CONSTRAINT fk_event_creator FOREIGN KEY (creator_id) REFERENCES users(id),
  CONSTRAINT fk_event_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  CONSTRAINT fk_event_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE community_event_participants (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id          INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  status            ENUM('going','maybe','declined') NOT NULL DEFAULT 'going',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_user (event_id, user_id),
  CONSTRAINT fk_cep_event FOREIGN KEY (event_id) REFERENCES community_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_cep_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE community_tournaments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  creator_id        INT UNSIGNED NOT NULL,
  organisation_id   INT UNSIGNED DEFAULT NULL,
  branch_id         INT UNSIGNED DEFAULT NULL,
  sport_id          INT UNSIGNED DEFAULT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  bracket_type_id   INT UNSIGNED NOT NULL,
  max_participants  INT UNSIGNED NOT NULL,
  entry_fee         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency_code     CHAR(3) NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE DEFAULT NULL,
  status            ENUM('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ct_creator FOREIGN KEY (creator_id) REFERENCES users(id),
  CONSTRAINT fk_ct_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  CONSTRAINT fk_ct_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_ct_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE SET NULL,
  CONSTRAINT fk_ct_bracket FOREIGN KEY (bracket_type_id) REFERENCES tournament_bracket_types(id)
) ENGINE=InnoDB;

-- Chat system
CREATE TABLE conversations (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_type ENUM('direct','group') NOT NULL DEFAULT 'direct',
  name              VARCHAR(255) DEFAULT NULL COMMENT 'For group chats',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE conversation_participants (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id   INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  last_read_at      TIMESTAMP NULL DEFAULT NULL,
  is_muted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_convo_user (conversation_id, user_id),
  CONSTRAINT fk_cp_convo FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE messages (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id   INT UNSIGNED NOT NULL,
  sender_id         INT UNSIGNED NOT NULL,
  message_type      ENUM('text','image','file','system') NOT NULL DEFAULT 'text',
  content           TEXT NOT NULL,
  metadata          JSON DEFAULT NULL,
  is_edited         BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conversation (conversation_id),
  INDEX idx_sender (sender_id),
  INDEX idx_created (created_at),
  CONSTRAINT fk_msg_convo FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Player ratings (community)
CREATE TABLE player_ratings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rater_id          INT UNSIGNED NOT NULL,
  rated_id          INT UNSIGNED NOT NULL,
  booking_id        BIGINT UNSIGNED DEFAULT NULL,
  rating            TINYINT UNSIGNED NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text       TEXT DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rated (rated_id),
  UNIQUE KEY uk_rating (rater_id, rated_id, booking_id),
  CONSTRAINT fk_pr_rater FOREIGN KEY (rater_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_rated FOREIGN KEY (rated_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 2: ADVERTISING
-- ============================================================================

CREATE TABLE ad_placements (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  placement_key     VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. home_banner, booking_sidebar, search_results',
  name              VARCHAR(200) NOT NULL,
  description       VARCHAR(500) DEFAULT NULL,
  dimensions        VARCHAR(50) DEFAULT NULL COMMENT 'e.g. 728x90, 300x250',
  max_ads           INT UNSIGNED NOT NULL DEFAULT 1,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE ad_campaigns (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  organisation_id   INT UNSIGNED DEFAULT NULL COMMENT 'NULL = platform-wide ads',
  placement_id      INT UNSIGNED NOT NULL,
  start_date        DATETIME NOT NULL,
  end_date          DATETIME NOT NULL,
  daily_budget      DECIMAL(12,2) DEFAULT NULL,
  total_budget      DECIMAL(12,2) DEFAULT NULL,
  currency_code     CHAR(3) NOT NULL,
  status            ENUM('draft','active','paused','ended','cancelled') NOT NULL DEFAULT 'draft',
  max_impressions   INT UNSIGNED DEFAULT NULL,
  max_clicks        INT UNSIGNED DEFAULT NULL,
  created_by        INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_placement (placement_id),
  INDEX idx_status (status),
  INDEX idx_dates (start_date, end_date),
  CONSTRAINT fk_camp_placement FOREIGN KEY (placement_id) REFERENCES ad_placements(id),
  CONSTRAINT fk_camp_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  CONSTRAINT fk_camp_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE ad_creatives (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id       INT UNSIGNED NOT NULL,
  image_url         VARCHAR(500) NOT NULL,
  click_url         VARCHAR(500) DEFAULT NULL,
  alt_text          VARCHAR(255) DEFAULT NULL,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_campaign (campaign_id),
  CONSTRAINT fk_creative_camp FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ad_targeting_rules (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id       INT UNSIGNED NOT NULL UNIQUE,
  countries         JSON DEFAULT NULL COMMENT 'Array of country ISO codes',
  sports            JSON DEFAULT NULL COMMENT 'Array of sport IDs',
  player_levels     JSON DEFAULT NULL COMMENT 'Array of level IDs',
  age_min           TINYINT UNSIGNED DEFAULT NULL,
  age_max           TINYINT UNSIGNED DEFAULT NULL,
  gender            ENUM('male','female','all') DEFAULT 'all',
  user_types        JSON DEFAULT NULL COMMENT 'Array: player, coach, etc.',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_target_camp FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ad_impressions (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id       INT UNSIGNED NOT NULL,
  creative_id       INT UNSIGNED DEFAULT NULL,
  user_id           INT UNSIGNED DEFAULT NULL,
  placement_key     VARCHAR(100) NOT NULL,
  ip_address        VARCHAR(45) DEFAULT NULL,
  user_agent        TEXT DEFAULT NULL,
  served_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cost              DECIMAL(12,8) DEFAULT NULL,
  INDEX idx_campaign (campaign_id),
  INDEX idx_creative (creative_id),
  INDEX idx_user (user_id),
  INDEX idx_served (served_at),
  CONSTRAINT fk_imp_camp FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ad_clicks (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  impression_id     BIGINT UNSIGNED NOT NULL,
  campaign_id       INT UNSIGNED NOT NULL,
  creative_id       INT UNSIGNED DEFAULT NULL,
  user_id           INT UNSIGNED DEFAULT NULL,
  clicked_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cost              DECIMAL(12,8) DEFAULT NULL,
  INDEX idx_impression (impression_id),
  INDEX idx_campaign (campaign_id),
  CONSTRAINT fk_click_imp FOREIGN KEY (impression_id) REFERENCES ad_impressions(id) ON DELETE CASCADE,
  CONSTRAINT fk_click_camp FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ad_pricing (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  placement_id      INT UNSIGNED NOT NULL,
  pricing_model     ENUM('cpm','cpc','flat') NOT NULL,
  price             DECIMAL(12,6) NOT NULL,
  currency_code     CHAR(3) NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from        DATE DEFAULT NULL,
  valid_until       DATE DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_placement (placement_id),
  CONSTRAINT fk_price_placement FOREIGN KEY (placement_id) REFERENCES ad_placements(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 3: CMS (Pages, Blogs)
-- ============================================================================

CREATE TABLE cms_pages (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(200) NOT NULL UNIQUE,
  title             VARCHAR(255) NOT NULL,
  content           LONGTEXT DEFAULT NULL,
  meta_title        VARCHAR(255) DEFAULT NULL,
  meta_description  VARCHAR(500) DEFAULT NULL,
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  published_at      TIMESTAMP NULL DEFAULT NULL,
  created_by        INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE cms_sections (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  page_id           INT UNSIGNED NOT NULL,
  section_key       VARCHAR(100) NOT NULL,
  title             VARCHAR(255) DEFAULT NULL,
  content           LONGTEXT DEFAULT NULL,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_page (page_id),
  CONSTRAINT fk_section_page FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE,
  UNIQUE KEY uk_page_section (page_id, section_key)
) ENGINE=InnoDB;

CREATE TABLE cms_blogs (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(200) NOT NULL UNIQUE,
  title             VARCHAR(255) NOT NULL,
  excerpt           TEXT DEFAULT NULL,
  content           LONGTEXT DEFAULT NULL,
  cover_image       VARCHAR(500) DEFAULT NULL,
  author_id         INT UNSIGNED DEFAULT NULL,
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  published_at      TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_author (author_id),
  INDEX idx_published (is_published, published_at),
  CONSTRAINT fk_blog_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 4: ANNOUNCEMENTS (Social Feed)
-- ============================================================================

CREATE TABLE announcements (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  organisation_id   INT UNSIGNED DEFAULT NULL,
  content           TEXT NOT NULL,
  images            JSON DEFAULT NULL,
  is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_org (organisation_id),
  CONSTRAINT fk_announce_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_announce_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE announcement_comments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  announcement_id   INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  parent_id         INT UNSIGNED DEFAULT NULL,
  content           TEXT NOT NULL,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_announcement (announcement_id),
  CONSTRAINT fk_comment_announce FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_parent FOREIGN KEY (parent_id) REFERENCES announcement_comments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE announcement_likes (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  announcement_id   INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_like (announcement_id, user_id),
  CONSTRAINT fk_like_announce FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 5: MEDIA UPLOADS (Polymorphic)
-- ============================================================================

CREATE TABLE media_uploads (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_type        VARCHAR(50) NOT NULL COMMENT 'entity type',
  owner_id          INT UNSIGNED NOT NULL,
  file_url          VARCHAR(500) NOT NULL,
  file_type         VARCHAR(50) NOT NULL COMMENT 'mime type',
  file_size         INT UNSIGNED NOT NULL COMMENT 'bytes',
  file_name         VARCHAR(255) DEFAULT NULL,
  alt_text          VARCHAR(255) DEFAULT NULL,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_by       INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_owner (owner_type, owner_id),
  INDEX idx_uploader (uploaded_by)
) ENGINE=InnoDB;
