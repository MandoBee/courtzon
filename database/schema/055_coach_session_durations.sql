ALTER TABLE coach_profiles
  ADD COLUMN session_durations JSON DEFAULT NULL COMMENT 'Array of available session durations in minutes, e.g. [30,60,90]';
