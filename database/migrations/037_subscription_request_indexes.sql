-- Performance indexes for subscription requests

ALTER TABLE organisation_upgrade_requests
  ADD INDEX `idx_org_status` (`organisation_id`, `status`),
  ADD INDEX `idx_request_type_status` (`request_type`, `status`),
  ADD INDEX `idx_created_at` (`created_at`),
  ADD INDEX `idx_requested_plan` (`requested_plan_id`);
