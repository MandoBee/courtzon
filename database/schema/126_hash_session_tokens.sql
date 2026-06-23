-- 126: Hash session tokens in DB (security fix C1)
-- Session tokens are currently stored as plaintext. A DB leak would expose
-- all active sessions. This migration adds a hash column, backfills from
-- existing plaintext, and drops the plaintext columns.

-- Step 1: Add session_token_hash column
ALTER TABLE user_sessions
  ADD COLUMN session_token_hash CHAR(64) NOT NULL DEFAULT '';

-- Step 2: Backfill from existing plaintext session_token
UPDATE user_sessions SET session_token_hash = SHA2(session_token, 256) WHERE session_token_hash = '' AND session_token IS NOT NULL AND session_token != '';

-- Step 3: Add index for hash lookup
CREATE INDEX idx_sessions_token_hash ON user_sessions (session_token_hash);

-- Step 4: Drop plaintext session_token column
ALTER TABLE user_sessions DROP COLUMN session_token;

-- Step 5: Drop plaintext refresh_token column (refresh_token_hash already exists and is used)
ALTER TABLE user_sessions DROP COLUMN refresh_token;
