import { useTranslation } from '../../../i18n';

/** Exact backend-contract values (do NOT drift from GskConfigurationSchema). */
export type GskOrdering = 'seed' | 'points' | 'rank';
export type GskKnockoutStart = 'round_of_16' | 'quarterfinals' | 'semifinals' | 'final' | 'first_valid_round';
export type GskSeeding = 'manual' | 'automatic';

export interface GskConfigValue {
  format: 'group_stage_knockout';
  groupStage: {
    groupCount: number;
    participantsPerGroup: number;
    format: 'round_robin';
    qualification: { topPerGroup: number; bestThirdPlaces: number; ordering: GskOrdering };
  };
  knockout: {
    startingRound: GskKnockoutStart;
    seeding: GskSeeding;
    separateGroupWinners: boolean;
    preventSameGroupRematch: boolean;
    allowByes: boolean;
  };
}

export const DEFAULT_GSK_CONFIG: GskConfigValue = {
  format: 'group_stage_knockout',
  groupStage: {
    groupCount: 8,
    participantsPerGroup: 4,
    format: 'round_robin',
    qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' },
  },
  knockout: {
    startingRound: 'round_of_16',
    seeding: 'automatic',
    separateGroupWinners: true,
    preventSameGroupRematch: true,
    allowByes: false,
  },
};

const START_SIZE: Record<Exclude<GskKnockoutStart, 'first_valid_round'>, number> = {
  round_of_16: 16,
  quarterfinals: 8,
  semifinals: 4,
  final: 2,
};

export interface GskValidity {
  error?: string;
  qualified: number;
  groupSlots: number;
  kompat: 'valid' | 'byes' | 'invalid';
}

/** Frontend structure guard (mirrors the backend schema). Backend stays authoritative. */
export function validateGskConfig(v: GskConfigValue): GskValidity {
  const g = v.groupStage;
  const q = g.qualification;
  const errors: string[] = [];
  if (!Number.isInteger(g.groupCount) || g.groupCount < 1) errors.push('groupCount');
  if (!Number.isInteger(g.participantsPerGroup) || g.participantsPerGroup < 2) errors.push('participantsPerGroup');
  if (!Number.isInteger(q.topPerGroup) || q.topPerGroup < 1 || q.topPerGroup > g.participantsPerGroup) errors.push('topPerGroup');
  if (!Number.isInteger(q.bestThirdPlaces) || q.bestThirdPlaces < 0 || q.bestThirdPlaces > g.groupCount) errors.push('bestThirdPlaces');
  if (errors.length) {
    return { error: `gsk.invalid.${errors[0]}`, qualified: 0, groupSlots: 0, kompat: 'invalid' };
  }
  const groupSlots = g.groupCount * g.participantsPerGroup;
  const qualified = g.groupCount * q.topPerGroup + q.bestThirdPlaces;
  if (qualified < 2) return { error: 'gsk.invalid.qualified', qualified, groupSlots, kompat: 'invalid' };

  let size = 0;
  if (v.knockout.startingRound === 'first_valid_round') {
    size = Math.pow(2, Math.ceil(Math.log2(Math.max(qualified, 2))));
  } else {
    size = START_SIZE[v.knockout.startingRound];
  }
  let kompat: GskValidity['kompat'];
  if (qualified > size) kompat = 'invalid';
  else if (qualified === size) kompat = 'valid';
  else {
    kompat = v.knockout.allowByes && qualified > size / 2 ? 'byes' : 'invalid';
  }
  const error = kompat === 'invalid' ? 'gsk.invalid.knockout_size' : undefined;
  return { error, qualified, groupSlots, kompat };
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const inputCls = 'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)]';
const field = 'flex flex-col gap-1';
const labelCls = (text: string) => text;

export function GskConfiguration({ value, onChange }: { value: GskConfigValue; onChange: (v: GskConfigValue) => void }) {
  const { t } = useTranslation();
  const v: GskConfigValue = value ?? DEFAULT_GSK_CONFIG;
  const validity = validateGskConfig(v);
  const g = v.groupStage;
  const set = (patch: Partial<GskConfigValue>) => onChange({ ...v, ...patch });
  const setG = (patch: Partial<GskConfigValue['groupStage']>) => set({ ...v, groupStage: { ...g, ...patch } });
  const setQ = (patch: Partial<typeof g.qualification>) => setG({ ...g, qualification: { ...g.qualification, ...patch } });
  const setK = (patch: Partial<GskConfigValue['knockout']>) => set({ ...v, knockout: { ...v.knockout, ...patch } });

  const section = 'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3';
  const heading = 'text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]';

  return (
    <div className="space-y-4" data-testid="gsk-config">
      {/* ── Group Stage ── */}
      <section className={section}>
        <h3 className={heading}>{t('tournaments.wizard.gskui.section.groups', 'Group Stage')}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={field}>
            <label htmlFor="gsk-group-count">{labelCls(t('tournaments.wizard.gskui.groupCount', 'Number of Groups'))}</label>
            <input id="gsk-group-count" type="number" min={1} value={g.groupCount}
              onChange={(e) => setG({ ...g, groupCount: num(e.target.value, 1) })} className={inputCls} />
          </div>
          <div className={field}>
            <label htmlFor="gsk-per-group">{labelCls(t('tournaments.wizard.gskui.perGroup', 'Participants per Group'))}</label>
            <input id="gsk-per-group" type="number" min={2} value={g.participantsPerGroup}
              onChange={(e) => setG({ ...g, participantsPerGroup: num(e.target.value, 2) })} className={inputCls} />
          </div>
          <div className={field}>
            <label htmlFor="gsk-group-format">{labelCls(t('tournaments.wizard.gskui.groupFormat', 'Group Format'))}</label>
            <select id="gsk-group-format" value="round_robin" disabled className={inputCls}>
              <option value="round_robin">{t('tournaments.formats.round_robin', 'Round Robin')}</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          {t('tournaments.wizard.gskui.groupHint', 'Total participants = groups × participants per group.')}
        </p>
      </section>

      {/* ── Qualification ── */}
      <section className={section}>
        <h3 className={heading}>{t('tournaments.wizard.gskui.section.qualification', 'Qualification')}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={field}>
            <label htmlFor="gsk-top">{labelCls(t('tournaments.wizard.gskui.topPerGroup', 'Top participants per group'))}</label>
            <input id="gsk-top" type="number" min={1} max={g.participantsPerGroup} value={g.qualification.topPerGroup}
              onChange={(e) => setQ({ topPerGroup: num(e.target.value, 1) })} className={inputCls} />
          </div>
          <div className={field}>
            <label htmlFor="gsk-third">{labelCls(t('tournaments.wizard.gskui.bestThird', 'Best third places'))}</label>
            <input id="gsk-third" type="number" min={0} max={g.groupCount} value={g.qualification.bestThirdPlaces}
              onChange={(e) => setQ({ bestThirdPlaces: num(e.target.value, 0) })} className={inputCls} />
            <p className="text-[11px] text-[var(--color-text-muted)]">{t('tournaments.wizard.gskui.thirdHint', 'Additional qualifiers on top of the per-group top places')}</p>
          </div>
          <div className={field}>
            <label htmlFor="gsk-ordering">{labelCls(t('tournaments.wizard.gskui.ordering', 'Qualification ordering'))}</label>
            <select id="gsk-ordering" value={g.qualification.ordering} onChange={(e) => setQ({ ordering: e.target.value as GskOrdering })} className={inputCls}>
              {(['seed', 'points', 'rank'] as const).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* ── Knockout ── */}
      <section className={section}>
        <h3 className={heading}>{t('tournaments.wizard.gskui.section.knockout', 'Knockout')}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={field}>
            <label htmlFor="gsk-round">{labelCls(t('tournaments.wizard.gskui.startingRound', 'Starting round'))}</label>
            <select id="gsk-round" value={v.knockout.startingRound} onChange={(e) => setK({ startingRound: e.target.value as GskKnockoutStart })} className={inputCls}>
              {(['round_of_16', 'quarterfinals', 'semifinals', 'final', 'first_valid_round'] as const).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className={field}>
            <label htmlFor="gsk-seeding">{labelCls(t('tournaments.wizard.gskui.seeding', 'Seeding'))}</label>
            <select id="gsk-seeding" value={v.knockout.seeding} onChange={(e) => setK({ seeding: e.target.value as GskSeeding })} className={inputCls}>
              <option value="automatic">automatic</option>
              <option value="manual">manual</option>
            </select>
          </div>
          {(['separateGroupWinners', 'preventSameGroupRematch', 'allowByes'] as const).map((key) => (
            <label key={key} className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={v.knockout[key]} onChange={(e) => setK({ [key]: e.target.checked })} className="rounded border-[var(--color-border)] text-[var(--color-primary)]" />
              {t(`tournaments.wizard.gskui.${key}`, key)}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          {t('tournaments.wizard.gskui.playInHint', 'Play-in rounds are not supported yet and are not configurable.')}
        </p>
      </section>

      {/* ── Live summary + validation ── */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 space-y-2" data-testid="gsk-preview">
        <p className={heading}>{t('tournaments.wizard.gskui.summary', 'Summary')}</p>
        <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Groups</dt><dd>{g.groupCount} × {g.participantsPerGroup}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Total participants</dt><dd>{validity.groupSlots}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Qualified</dt><dd>{validity.qualified} ({g.qualification.topPerGroup} per group{validity.qualified > 0 ? ` + ${g.qualification.bestThirdPlaces || 0} thirds` : ''})</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--color-text-muted)]">Knockout</dt><dd>{v.knockout.startingRound}</dd></div>
        </dl>
        {validity.error ? (
          <p className="text-xs text-[var(--color-error)]" role="alert">{t(validity.error, validity.error)}</p>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]" data-testid="gsk-valid">
            {t('tournaments.wizard.gskui.valid', 'Valid configuration.')}
          </p>
        )}
      </div>
    </div>
  );
}