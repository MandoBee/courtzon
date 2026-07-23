-- Migration 048: workflow_branch_instances
-- Tracks execution of parallel and condition branches.
-- Each branch has its own status, current step, and lifecycle.
CREATE TABLE IF NOT EXISTS workflow_branch_instances (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL COMMENT 'FK to workflow_instances',
  branch_id             VARCHAR(64) NOT NULL COMMENT 'e.g. branch_0, branch_1 — defined in workflow definition',
  parent_step_id        BIGINT UNSIGNED DEFAULT NULL COMMENT 'The PARALLEL/CONDITION step that created this branch',
  branch_type           ENUM('parallel','condition') NOT NULL DEFAULT 'parallel',
  status                ENUM('pending','active','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  current_step_name     VARCHAR(128) DEFAULT NULL COMMENT 'Step the branch is currently executing',
  started_at            TIMESTAMP NULL DEFAULT NULL,
  completed_at          TIMESTAMP NULL DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_branch_workflow (workflow_instance_id),
  KEY idx_branch_parent (parent_step_id),
  CONSTRAINT fk_branch_workflow FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
