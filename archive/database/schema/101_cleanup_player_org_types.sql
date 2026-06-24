-- Migration 101: Remove player/player-seller org types (we use has_activated_selling flag instead)
USE `courtzon_v2`;

DELETE FROM organisation_types WHERE slug = 'player-seller';
