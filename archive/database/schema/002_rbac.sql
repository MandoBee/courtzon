-- ============================================================================
-- COURTZON-V2 : RBAC — DYNAMIC ROLES, PERMISSIONS, SCOPES
-- ============================================================================

USE courtzon_v2;

-- ============================================================================
-- SECTION 1: PERMISSION REGISTRY (DB-stored, readable keys)
-- ============================================================================

CREATE TABLE permission_modules (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(50) NOT NULL UNIQUE COMMENT 'e.g. bookings, users, financial',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module_id         INT UNSIGNED NOT NULL,
  permission_key    VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. booking.create, booking.cancel.any',
  is_system         BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'System permissions cannot be deleted',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_perm_module FOREIGN KEY (module_id) REFERENCES permission_modules(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 2: ROLES
-- ============================================================================

CREATE TABLE roles (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id   INT UNSIGNED DEFAULT NULL COMMENT 'NULL = system role, non-null = org-specific',
  name              VARCHAR(100) NOT NULL,
  slug              VARCHAR(100) NOT NULL,
  description       VARCHAR(500) DEFAULT NULL,
  is_system         BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'System roles (Super Admin, Player)',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_role_slug (organisation_id, slug),
  INDEX idx_org_role (organisation_id),
  CONSTRAINT fk_role_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id           INT UNSIGNED NOT NULL,
  permission_id     INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_role_perm (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 3: USER-ROLE ASSIGNMENT WITH SCOPE
-- ============================================================================

CREATE TABLE user_roles (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  role_id           INT UNSIGNED NOT NULL,
  assigned_by       INT UNSIGNED DEFAULT NULL,
  assigned_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at        TIMESTAMP NULL DEFAULT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_user_role (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_assigner FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Granular scope: what can this user actually access?
CREATE TABLE user_role_scopes (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_role_id      INT UNSIGNED NOT NULL,
  scope_type        ENUM('organisation','branch','resource') NOT NULL,
  scope_id          INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_scope (user_role_id, scope_type, scope_id),
  CONSTRAINT fk_scope_userrole FOREIGN KEY (user_role_id) REFERENCES user_roles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SECTION 3b: FEATURE FLAGS
-- ============================================================================

CREATE TABLE feature_flags (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flag_key      VARCHAR(100) NOT NULL UNIQUE,
  label         VARCHAR(255) NOT NULL,
  description   TEXT DEFAULT NULL,
  module        VARCHAR(50) NOT NULL DEFAULT 'general',
  is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO feature_flags (flag_key, label, description, module, is_enabled) VALUES
  ('app.registration_enabled', 'User Registration', 'Allow new users to register', 'general', TRUE),
  ('app.marketplace_enabled', 'Marketplace', 'Enable marketplace module', 'marketplace', TRUE),
  ('app.tournaments_enabled', 'Tournaments', 'Enable tournaments module', 'tournaments', TRUE),
  ('app.academies_enabled', 'Academies', 'Enable academies module', 'academies', TRUE),
  ('app.beta_features', 'Beta Features', 'Enable experimental features', 'general', FALSE),
  ('app.dark_mode_toggle', 'Dark Mode Toggle', 'Allow users to switch dark mode', 'general', TRUE),
  ('booking.auto_confirm', 'Auto-Confirm Bookings', 'Automatically confirm bookings without admin approval', 'bookings', FALSE),
  ('booking.waitlist', 'Waitlist', 'Enable waitlist for fully booked slots', 'bookings', FALSE),
  ('payment.wallet_enabled', 'Wallet Payments', 'Enable wallet-based payments', 'financial', TRUE),
  ('payment.online_enabled', 'Online Payments', 'Enable online payment gateway', 'financial', FALSE),
  ('community.events_enabled', 'Community Events', 'Enable community events module', 'community', TRUE),
  ('community.chat_enabled', 'Chat', 'Enable community chat', 'community', TRUE);

-- ============================================================================
-- SECTION 4: SEED — SYSTEM ROLES & PERMISSIONS
-- Note: Modules seeded here; permissions will be populated by super admin UI
-- ============================================================================

INSERT INTO permission_modules (slug, sort_order) VALUES
  ('dashboard', 1),
  ('users', 2),
  ('roles', 3),
  ('organisations', 4),
  ('branches', 5),
  ('resources', 6),
  ('bookings', 7),
  ('financial', 8),
  ('marketplace', 9),
  ('tournaments', 10),
  ('academies', 11),
  ('coaches', 12),
  ('community', 13),
  ('notifications', 14),
  ('ads', 15),
  ('cms', 16),
  ('settings', 17),
  ('audit', 18),
  ('reports', 19),
  ('translations', 20);

INSERT IGNORE INTO roles (organisation_id, name, slug, description, is_system) VALUES
  (NULL, 'Super Admin', 'super_admin', 'Full system access, can bypass any restriction', TRUE),
  (NULL, 'Player', 'player', 'Regular user who books resources and accesses PWA', FALSE),
  (NULL, 'Org Admin', 'org-admin', 'Full permissions to their organisation', FALSE),
  (NULL, 'Branch Manager', 'branch-mgr', 'Full permissions to their branch(es)', FALSE),
  (NULL, 'Resource Manager', 'resource-mgr', 'Full access to their resources', FALSE),
  (NULL, 'Shop Admin', 'shop-admin', 'Full marketplace access for their organisation', FALSE),
  (NULL, 'Coach', 'coach', 'Coach with session management', FALSE),
  (NULL, 'Accountant', 'accountant', 'Financial data access', FALSE);
