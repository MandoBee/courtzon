-- Remove ON UPDATE CURRENT_TIMESTAMP from user_sessions.expires_at.
--
-- Root cause of unexpected 401 responses:
--   The auth middleware touches `last_activity_at` on every authenticated request.
--   Because `expires_at` carried `ON UPDATE CURRENT_TIMESTAMP`, MySQL silently reset
--   `expires_at` to "now" on that same UPDATE, so the next request failed the
--   `expires_at > NOW()` validity check — sessions were effectively single-request.
--
-- After this change `expires_at` is only written when a session is created,
-- when a refresh token is issued (session rotation), or when a lifetime is
-- intentionally extended. `last_activity_at` keeps updating on activity.

ALTER TABLE `user_sessions`
  MODIFY `expires_at` timestamp NOT NULL DEFAULT current_timestamp();

-- DOWN: restore the buggy column definition
-- ALTER TABLE `user_sessions`
--   MODIFY `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp();
