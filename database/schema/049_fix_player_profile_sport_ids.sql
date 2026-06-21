-- Fix stale player_profiles.main_sport_id values
-- The dynamic seed generated sport IDs 1-11 but actual sports table has IDs 19-34
-- This migration maps the old sport IDs to the correct current IDs by name

UPDATE player_profiles
SET main_sport_id = CASE main_sport_id
    WHEN 1 THEN (SELECT id FROM sports WHERE name = 'Football')
    WHEN 2 THEN (SELECT id FROM sports WHERE name = 'Padel')
    WHEN 3 THEN (SELECT id FROM sports WHERE name = 'Tennis')
    WHEN 4 THEN (SELECT id FROM sports WHERE name = 'Basketball')
    WHEN 5 THEN NULL
    WHEN 6 THEN (SELECT id FROM sports WHERE name = 'Swimming')
    WHEN 7 THEN (SELECT id FROM sports WHERE name = 'Boxing')
    WHEN 8 THEN (SELECT id FROM sports WHERE name = 'Martial Arts')
    WHEN 9 THEN (SELECT id FROM sports WHERE name = 'Volleyball')
    WHEN 10 THEN (SELECT id FROM sports WHERE name = 'Yoga')
    WHEN 11 THEN (SELECT id FROM sports WHERE name = 'Gym & Fitness')
END
WHERE main_sport_id IS NOT NULL
  AND main_sport_id NOT IN (SELECT id FROM sports);
