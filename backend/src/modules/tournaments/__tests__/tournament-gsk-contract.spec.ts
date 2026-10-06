import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GskConfigurationSchema,
  CreateStageSchema,
  type GskConfigurationInput,
} from '../presentation/tournament.dto.js';

const here = dirname(fileURLToPath(import.meta.url));

const valid: GskConfigurationInput = {
  format: 'group_stage_knockout',
  groupStage: {
    groupCount: 8,
    participantsPerGroup: 4,
    format: 'round_robin',
    qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'seed' },
  },
  knockout: {
    startingRound: 'round_of_16',
    seeding: 'automatic',
    separateGroupWinners: true,
    preventSameGroupRematch: true,
    allowByes: false,
  },
};

describe('GskConfigurationSchema — Step 3B-1 data contract', () => {
  it('accepts a valid GSK configuration', () => {
    expect(() => GskConfigurationSchema.parse(valid)).not.toThrow();
  });

  it('rejects groupCount < 1', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, groupStage: { ...valid.groupStage, groupCount: 0 } })).toThrow();
  });

  it('rejects participantsPerGroup < 2', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, groupStage: { ...valid.groupStage, participantsPerGroup: 1 } })).toThrow();
  });

  it('rejects topPerGroup < 1', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, groupStage: { ...valid.groupStage, qualification: { ...valid.groupStage.qualification, topPerGroup: 0 } } })).toThrow();
  });

  it('rejects topPerGroup > participantsPerGroup', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, groupStage: { ...valid.groupStage, participantsPerGroup: 4, qualification: { ...valid.groupStage.qualification, topPerGroup: 5 } } })).toThrow();
  });

  it('rejects bestThirdPlaces < 0', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, groupStage: { ...valid.groupStage, qualification: { ...valid.groupStage.qualification, bestThirdPlaces: -1 } } })).toThrow();
  });

  it('rejects bestThirdPlaces > groupCount', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, groupStage: { ...valid.groupStage, groupCount: 8, qualification: { ...valid.groupStage.qualification, bestThirdPlaces: 9 } } })).toThrow();
  });

  it('rejects an invalid knockout starting round', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, knockout: { ...valid.knockout, startingRound: 'playoff_everything' as any } })).toThrow();
  });

  it('rejects an invalid seeding value', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, knockout: { ...valid.knockout, seeding: 'random' as any } })).toThrow();
  });

  it('rejects an invalid boolean / config shape', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, knockout: { ...valid.knockout, allowByes: 'yes' as any } })).toThrow();
    expect(() => GskConfigurationSchema.parse({ ...valid, format: 'knockout' as any })).toThrow();
  });

  it('accepts a permissible playInRounds', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, knockout: { ...valid.knockout, allowByes: true, playInRounds: 2 } })).not.toThrow();
  });

  it('rejects a negative playInRounds', () => {
    expect(() => GskConfigurationSchema.parse({ ...valid, knockout: { ...valid.knockout, playInRounds: -1 } })).toThrow();
  });
});

describe('CreateStageSchema — config is additive and backward-compatible', () => {
  it('accepts a stage carrying a valid GSK config', () => {
    expect(() => CreateStageSchema.parse({ progression_format: 'group_stage_knockout', config: valid })).not.toThrow();
  });

  it('existing knockout stages remain valid with config NULL', () => {
    expect(() => CreateStageSchema.parse({ progression_format: 'knockout' })).not.toThrow();
    expect(() => CreateStageSchema.parse({ progression_format: 'knockout', config: null })).not.toThrow();
  });

  it('existing round_robin stages remain valid with config NULL', () => {
    expect(() => CreateStageSchema.parse({ progression_format: 'round_robin' })).not.toThrow();
    expect(() => CreateStageSchema.parse({ progression_format: 'round_robin', config: null })).not.toThrow();
  });

  it('rejects a stage config that is not a valid GSK shape', () => {
    expect(() => CreateStageSchema.parse({ progression_format: 'round_robin', config: { nope: true } as any })).toThrow();
  });
});

describe('Step 3B-1 schema artifacts — migration + baseline', () => {
  const repoRoot = resolve(here, '../../../../..');
  const migration = readFileSync(resolve(repoRoot, 'database/migrations/195_tournament_gsk_config.sql'), 'utf8');
  const baseline = readFileSync(resolve(repoRoot, 'database/baseline/001_courtzon_v3.sql'), 'utf8');

  it('migration adds tournament_stages.config JSON (nullable)', () => {
    expect(migration).toContain('ADD COLUMN `config` json DEFAULT NULL');
  });

  it('migration adds the defensive fk_tm_group FK', () => {
    expect(migration).toContain('CONSTRAINT `fk_tm_group`');
    expect(migration).toContain('REFERENCES `tournament_groups` (`id`) ON DELETE SET NULL');
  });

  it('baseline reflects the same column + constraint', () => {
    expect(baseline).toContain('`config` json DEFAULT NULL');
    expect(baseline).toContain('CONSTRAINT `fk_tm_group` FOREIGN KEY (`group_id`) REFERENCES `tournament_groups` (`id`) ON DELETE SET NULL');
  });
});