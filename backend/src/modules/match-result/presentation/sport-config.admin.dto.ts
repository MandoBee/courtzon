import { z } from 'zod';

/**
 * Phase A — Super Admin sport-format / rule-set management DTOs.
 *
 * ONLY the columns that exist on `sport_formats` are exposed:
 *   format_type, players_per_side, roster_size (+ slug/name/description/
 *   is_default/is_active). No unsupported field is ever accepted or invented.
 */

export const AdminFormatParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const AdminSportParamsSchema = z.object({
  sportId: z.coerce.number().int().positive(),
});

export const AdminRuleSetParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const AdminFormatRuleSetParamsSchema = z.object({
  formatId: z.coerce.number().int().positive(),
});

export const AdminFormatListQuerySchema = z.object({
  sportId: z.coerce.number().int().positive().optional(),
});

const FormatTypeSchema = z.enum(['singles', 'doubles', 'team']);

const FormatMetadataShape = {
  name: z.string().trim().min(1).max(120).optional(),
  formatType: FormatTypeSchema.optional(),
  playersPerSide: z.coerce.number().int().min(1).max(100).nullable().optional(),
  rosterSize: z.coerce.number().int().min(1).max(200).nullable().optional(),
  description: z.string().trim().max(255).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
};

/** Create a new format under an existing sport. `slug` is required at creation. */
export const FormatCreateBodySchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'slug must be lowercase letters, digits and single underscores'),
    ...FormatMetadataShape,
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const FormatUpdateBodySchema = z.object({ ...FormatMetadataShape }).strict();

/**
 * Create a new immutable rule-set VERSION for a format. `rules` is the canonical
 * scoring configuration; `standingsRules` is the optional standings criteria.
 * Both are validated by the shared rules engine (assertScoringConfiguration).
 */
export const RuleSetCreateBodySchema = z
  .object({
    name: z.string().trim().max(120).nullable().optional(),
    rules: z.record(z.string(), z.unknown()),
    standingsRules: z.record(z.string(), z.unknown()).nullable().optional(),
    isDefault: z.boolean().optional(),
    /** Explicit activation. Omitted → first version auto-activates, later versions are drafts. */
    isActive: z.boolean().optional(),
  })
  .strict();

/**
 * Update a rule-set version. `rules`/`standingsRules` are ONLY accepted while the
 * version is unreferenced by history — the service returns 409 otherwise.
 */
export const RuleSetUpdateBodySchema = z
  .object({
    name: z.string().trim().max(120).nullable().optional(),
    rules: z.record(z.string(), z.unknown()).optional(),
    standingsRules: z.record(z.string(), z.unknown()).nullable().optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
