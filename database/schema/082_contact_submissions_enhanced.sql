-- Enhanced contact form: country, referral source, email delivery metadata, attachments

ALTER TABLE cms_contact_submissions
  ADD COLUMN country_id SMALLINT UNSIGNED NULL AFTER email,
  ADD COLUMN subject_other VARCHAR(255) NULL AFTER subject,
  ADD COLUMN referral_source VARCHAR(100) NULL AFTER message,
  ADD COLUMN referral_other VARCHAR(255) NULL AFTER referral_source,
  ADD COLUMN email_sent_at TIMESTAMP NULL DEFAULT NULL AFTER is_read,
  ADD COLUMN email_error TEXT NULL AFTER email_sent_at;

ALTER TABLE cms_contact_submissions
  ADD INDEX idx_contact_country (country_id);

CREATE TABLE IF NOT EXISTS cms_contact_submission_attachments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submission_id   INT UNSIGNED NOT NULL,
  upload_id       BIGINT UNSIGNED NOT NULL,
  sort_order      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contact_attach_submission FOREIGN KEY (submission_id) REFERENCES cms_contact_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_contact_attach_upload FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
  INDEX idx_contact_attach_submission (submission_id)
) ENGINE=InnoDB;
