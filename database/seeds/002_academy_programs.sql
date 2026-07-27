-- ============================================================================
-- Seed data: Sample Academy Programs (Sprint 6)
-- ============================================================================
-- These are sample programs for demonstration and testing.
-- They require that academy_programs table exists (migration 061).
-- ============================================================================

INSERT INTO academy_programs (code, name, description, category, level, season, capacity, price, currency, price_type, status, is_public) VALUES
('TENNIS-BEG-2026Q1', 'Tennis Beginners Q1 2026', 'Introductory tennis program for beginners', 'Tennis', 'Beginner', '2026 Q1', 20, 0.00, 'USD', 'FREE', 'published', 1),
('TENNIS-INT-2026Q1', 'Tennis Intermediate Q1 2026', 'Intermediate tennis program for players with basic skills', 'Tennis', 'Intermediate', '2026 Q1', 16, 299.00, 'USD', 'FIXED', 'published', 1),
('TENNIS-ADV-2026Q1', 'Tennis Advanced Q1 2026', 'Advanced tennis program for competitive players', 'Tennis', 'Advanced', '2026 Q1', 12, 599.00, 'USD', 'FIXED', 'draft', 1),
('SQUASH-BEG-2026Q1', 'Squash Beginners Q1 2026', 'Introduction to squash fundamentals', 'Squash', 'Beginner', '2026 Q1', 16, 199.00, 'USD', 'FIXED', 'published', 1),
('PADEL-BEG-2026Q1', 'Padel Beginners Q1 2026', 'Learn padel from scratch', 'Padel', 'Beginner', '2026 Q1', 24, 0.00, 'USD', 'FREE', 'published', 1),
('PADEL-INT-2026Q1', 'Padel Intermediate Q1 2026', 'Improve your padel game', 'Padel', 'Intermediate', '2026 Q1', 20, 249.00, 'USD', 'MEMBERS_ONLY', 'published', 1),
('BADMINTON-BEG-2026Q1', 'Badminton Beginners Q1 2026', 'Badminton basics for new players', 'Badminton', 'Beginner', '2026 Q1', 20, 0.00, 'USD', 'FREE', 'published', 1),
('BADMINTON-INT-2026Q1', 'Badminton Intermediate Q1 2026', 'Intermediate badminton training', 'Badminton', 'Intermediate', '2026 Q1', 16, 179.00, 'USD', 'FIXED', 'open', 1),
('FOOTBALL-YOUTH-2026Q1', 'Youth Football Academy Q1 2026', 'Youth football development program', 'Football', 'Youth', '2026 Q1', 30, 399.00, 'USD', 'FIXED', 'running', 1),
('FOOTBALL-ELITE-2026Q1', 'Elite Football Program Q1 2026', 'Elite-level football training', 'Football', 'Advanced', '2026 Q1', 18, 999.00, 'USD', 'FIXED', 'draft', 0);
