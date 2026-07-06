ALTER TABLE notifications
  ADD COLUMN type VARCHAR(50) DEFAULT 'info' AFTER icon,
  ADD COLUMN priority ENUM('low','normal','high','critical') DEFAULT 'normal' AFTER type,
  ADD COLUMN organization_id INT UNSIGNED DEFAULT NULL AFTER priority,
  ADD COLUMN branch_id INT UNSIGNED DEFAULT NULL AFTER organization_id,
  ADD COLUMN sender_id INT UNSIGNED DEFAULT NULL AFTER branch_id,
  ADD COLUMN related_entity_type VARCHAR(50) DEFAULT NULL AFTER sender_id,
  ADD COLUMN related_entity_id VARCHAR(100) DEFAULT NULL AFTER related_entity_type,
  ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER read_at,
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER archived_at,
  ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL AFTER deleted_at,
  ADD INDEX idx_notifications_org (organization_id),
  ADD INDEX idx_notifications_entity (related_entity_type, related_entity_id),
  ADD INDEX idx_notifications_priority (priority, created_at);
