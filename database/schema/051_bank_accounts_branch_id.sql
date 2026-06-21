-- Migration 051: Change bank_accounts FK from user_id to branch_id
-- Bank accounts belong to branches (not individual users) for withdrawal payouts

ALTER TABLE bank_accounts
  DROP FOREIGN KEY bank_accounts_ibfk_1,
  CHANGE COLUMN user_id branch_id INT UNSIGNED NOT NULL,
  ADD INDEX idx_bank_accounts_branch (branch_id),
  ADD FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
