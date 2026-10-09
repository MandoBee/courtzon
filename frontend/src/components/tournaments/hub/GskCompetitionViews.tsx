import { useMutation } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { tournamentApi, orgTournamentApi } from '../../../services/tournament';
import { TournamentBracket } from '../TournamentBracket';
import { PlayerAvatar } from '../PlayerAvatar';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

type Mode = 'admin' | 'org';

/**
 * Step 4B — GSK competition views for the organizer/admin Tournament Hub.
 * Reuses the authoritative standings API and the ONE shared TournamentBracket.
 */

const card = 'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const th = 'px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]';

export function GskGroupsView({ groups, standings, loading, highlightRegistrationId, qualifyTop }: { groups: any[]; standings: any[]; loading?: boolean; highlightRegistrationId?: number; qualifyTop?: number }) {
  const { t } = useTranslation();
  if (loading) return <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>;
  if (!groups.length) {
    return <p data-testid="gsk-groups-empty" className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]">{t('tournaments.hub.gsk.noGroups', 'Groups have not been generated yet. Generate groups from the competition actions.')}</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="gsk-groups">
      {groups.map((g: any) => {
        const rows = (standings || [])
          .filter((s: any) => Number(s.group_id) === Number(g.id))
          .sort((a: any, b: any) => (a.rank_position ?? 0) - (b.rank_position ?? 0));
        // Organizer Hub rows carry per-group `advance_count`; the public read
        // model does not, so it supplies the shared qualification `qualifyTop`.
        const advance = Number(g.advance_count ?? qualifyTop ?? 0);
        return (
          <section key={g.id} className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[var(--color-text)]">{t('tournaments.hub.gsk.group', 'Group')} {g.name}</h4>
              <span className="text-xs text-[var(--color-text-muted)]">{rows.length} {t('tournaments.hub.gsk.participants', 'participants')}</span>
            </div>
            {rows.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.hub.gsk.noStandings', 'Standings unavailable yet.')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className={th}>#</th>
                      <th className={th}>{t('tournaments.player', 'Player')}</th>
                      <th className={th}>P</th><th className={th}>W</th><th className={th}>D</th><th className={th}>L</th>
                      <th className={th}>{t('tournaments.standings.pts', 'Pts')}</th>
                      <th className={th}>GF</th><th className={th}>GA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s: any) => {
                      const qualified = advance > 0 && Number(s.rank_position) <= advance;
                      const isMe = highlightRegistrationId != null && Number(s.registration_id) === Number(highlightRegistrationId);
                      return (
                        <tr
                          key={s.id ?? s.registration_id ?? `${g.id}-${s.rank_position}`}
                          data-current-player={isMe ? 'true' : undefined}
                          aria-current={isMe ? 'true' : undefined}
                          className={`border-b border-[var(--color-border)] last:border-0${isMe ? ' bg-[var(--color-primary-bg)]' : ''}`}
                        >
                          <td className="px-2 py-2">{s.rank_position ?? '-'}</td>
                          <td className="px-2 py-2">
                            <span className="flex items-center gap-2">
                              <PlayerAvatar name={s.player_name || s.name || ''} />
                              <span className="font-medium text-[var(--color-text)]">{s.player_name || s.name || '-'}</span>
                              {isMe && (
                                <span className="rounded-full border border-[var(--color-primary)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-primary)]" data-testid="gsk-current-player">
                                  {t('tournaments.hub.gsk.you', 'You')}
                                </span>
                              )}
                              {qualified && (
                                <span className="rounded-full bg-[var(--color-success-bg)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-success-text)]">
                                  {t('tournaments.hub.gsk.q', 'Q')}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-2">{s.played ?? (Number(s.wins ?? 0) + Number(s.draws ?? 0) + Number(s.losses ?? 0))}</td>
                          <td className="px-2 py-2">{s.wins ?? 0}</td>
                          <td className="px-2 py-2">{s.draws ?? 0}</td>
                          <td className="px-2 py-2">{s.losses ?? 0}</td>
                          <td className="px-2 py-2 font-bold">{s.points ?? 0}</td>
                          <td className="px-2 py-2">{s.games_won ?? 0}</td>
                          <td className="px-2 py-2">{s.games_lost ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The qualification result shape returned by the backend `POST .../qualify`
 * lifecycle route and cached by the hub (TUX-03 Phase 1). The `qualified` rows
 * are the authoritative server-computed list — never derived in the frontend.
 */
export interface GskQualificationResultLike {
  qualified?: unknown[];
  totalQualified?: number;
}

export function GskQualificationView({ mode, orgId, tournamentId, groupStage, groupMatches, canManage, onDone, qualifiedResult, onQualified }: {
  mode: Mode; orgId?: string; tournamentId: number; groupStage: any | null; groupMatches: any[]; canManage: boolean; onDone: () => void; qualifiedResult?: GskQualificationResultLike | null; onQualified?: (result: GskQualificationResultLike) => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const api: any = mode === 'org' && orgId ? orgTournamentApi : tournamentApi;
  const run = (fn: (...a: any[]) => Promise<any>, ...args: any[]) => (mode === 'org' && orgId ? fn(orgId, ...args) : fn(...args));

  const mutation = useMutation({
    mutationFn: () => run(api.qualifyGsk, tournamentId, Number(groupStage?.id)),
    onSuccess: (data) => {
      showToast(t('tournaments.hub.gsk.qualifiedToast', 'Qualification computed'), 'success');
      // TUX-03 Phase 1 — lift the server result up to the hub so it survives a
      // Competition sub-tab switch; the hub owns the authoritative copy.
      onQualified?.(data as GskQualificationResultLike);
      onDone();
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  if (!groupStage) {
    return <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]" data-testid="gsk-qual-pending">{t('tournaments.hub.gsk.qualPending', 'Qualification pending — generate the Group Stage first.')}</p>;
  }
  const cfg = (groupStage.config?.groupStage?.qualification) ?? {};
  const complete = groupMatches.length > 0 && groupMatches.every((m: any) => m.status === 'completed');
  const result = (qualifiedResult ?? mutation.data) as GskQualificationResultLike | undefined;
  const rows = Array.isArray(result?.qualified) ? result!.qualified! : [];
  const groupCount = Number(groupStage.config?.groupStage?.groupCount ?? 0);

  return (
    <div className="space-y-4" data-testid="gsk-qualification">
      <div className={card}>
        <h4 className="text-sm font-semibold text-[var(--color-text)]">{t('tournaments.hub.gsk.qualRules', 'Qualification rules')}</h4>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {t('tournaments.hub.gsk.qualRuleText', 'Top {{top}} per group{{third}} · ordering: {{ordering}}', {
            top: Number(cfg.topPerGroup ?? 0), third: cfg.bestThirdPlaces ? ` + ${cfg.bestThirdPlaces} best third(s)` : '', ordering: cfg.ordering ?? 'rank',
          })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Can permission={canManage ? (mode === 'org' ? 'org.tournaments.manage' : 'tournament.manage') : '__none__'}>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!complete || mutation.isPending}
              className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
              data-testid="gsk-qualify-button"
            >
              {mutation.isPending ? t('common.loading') : t('tournaments.hub.gsk.runQualification', 'Run Qualification')}
            </button>
          </Can>
          {!complete && (
            <span className="text-xs text-[var(--color-warning-text)]" data-testid="gsk-qual-incomplete">
              {t('tournaments.hub.gsk.qualIncomplete', 'All group matches must be completed before qualification.')}
            </span>
          )}
        </div>
      </div>

      {result && (
        <div className={card} data-testid="gsk-qualified">
          <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
            {t('tournaments.hub.gsk.qualifiedTitle', 'Qualified participants')} · {result.totalQualified ?? rows.length}
          </h4>
          <ul className="space-y-1 text-sm">
            {rows.map((q: any) => (
              <li key={q.participantId} className="flex items-center justify-between border-b border-[var(--color-border)] py-1 last:border-0">
                <span className="text-[var(--color-text)]">#{q.qualificationRank} · {q.participantId}</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {t('tournaments.hub.gsk.group', 'Group')} {groupCount ? String.fromCharCode(64 + (Number(q.groupId) % 100) || 65) : ''} · {q.qualificationType} · rank {q.groupRank}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function GskKnockoutView({ mode, orgId, tournamentId, tournamentName, bracketTypeName, sportName, status,
  groupStage, knockoutStage, matches, participants, currentUserId, canManage, onMatchClick, footer, onDone }: {
  mode: Mode; orgId?: string; tournamentId: number; tournamentName?: string; bracketTypeName?: string; sportName?: string; status?: string;
  groupStage: any | null; knockoutStage: any | null; matches: TournamentMatchNode[]; participants: any[]; currentUserId?: number; canManage: boolean;
  onMatchClick: (m: TournamentMatchNode) => void; footer?: (m: TournamentMatchNode) => any; onDone: () => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const api: any = mode === 'org' && orgId ? orgTournamentApi : tournamentApi;
  const mutation = useMutation({
    mutationFn: () => (mode === 'org' && orgId ? api.generateKnockout(orgId, tournamentId, Number(groupStage?.id)) : api.generateKnockout(tournamentId, Number(groupStage?.id))),
    onSuccess: () => { showToast(t('tournaments.hub.gsk.knockoutToast', 'Knockout stage generated'), 'success'); onDone(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const koMatches = knockoutStage ? matches.filter((m: any) => Number(m.stage_id) === Number(knockoutStage.id)) : [];

  if (!knockoutStage) {
    return (
      <div className="space-y-3" data-testid="gsk-knockout-pending">
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]">
          {t('tournaments.hub.gsk.knockoutPending', 'Knockout stage not generated yet.')}
        </p>
        <Can permission={canManage ? (mode === 'org' ? 'org.tournaments.manage' : 'tournament.manage') : '__none__'}>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!groupStage || mutation.isPending}
            className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
            data-testid="gsk-knockout-button"
          >
            {mutation.isPending ? t('common.loading') : t('tournaments.hub.gsk.generateKnockout', 'Generate Knockout')}
          </button>
        </Can>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="gsk-knockout">
      <h3 className="font-semibold text-[var(--color-text)]">{t('tournamentBracket.tabBracket', 'Bracket')}</h3>
      <TournamentBracket
        tournament={{ id: tournamentId, name: tournamentName, format: 'knockout', bracket_type_name: bracketTypeName, status, sport_name: sportName }}
        matches={koMatches}
        participants={participants}
        currentUserId={currentUserId}
        onMatchClick={onMatchClick}
        footer={footer}
      />
    </div>
  );
}

/**
 * Step 4C — read-only qualification panel shared by the Player and Public
 * surfaces. It NEVER mutates and NEVER fabricates qualifiers: it presents the
 * configured rule and an honest pending/incomplete state. The organizer-only
 * `Run Qualification` action lives in `GskQualificationView` above.
 */
export function GskQualificationPanel({ groupStage, groupMatches, qualified }: {
  groupStage: any | null; groupMatches: any[]; qualified?: any[];
}) {
  const { t } = useTranslation();
  if (!groupStage) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]" data-testid="gsk-qual-pending">
        {t('tournaments.hub.gsk.qualPendingReadonly', 'Qualification pending — the group stage has not been generated yet.')}
      </p>
    );
  }
  const cfg = (groupStage.config?.groupStage?.qualification) ?? {};
  const complete = groupMatches.length > 0 && groupMatches.every((m: any) => m.status === 'completed');
  const rows = Array.isArray(qualified) ? qualified : [];
  return (
    <div className="space-y-4" data-testid="gsk-qualification">
      <div className={card}>
        <h4 className="text-sm font-semibold text-[var(--color-text)]">{t('tournaments.hub.gsk.qualRules', 'Qualification rules')}</h4>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {t('tournaments.hub.gsk.qualRuleText', 'Top {{top}} per group{{third}} · ordering: {{ordering}}', {
            top: Number(cfg.topPerGroup ?? 0),
            third: cfg.bestThirdPlaces ? ` + ${cfg.bestThirdPlaces} best third(s)` : '',
            ordering: cfg.ordering ?? 'rank',
          })}
        </p>
        {!complete && (
          <p className="mt-2 text-xs text-[var(--color-warning-text)]" data-testid="gsk-qual-incomplete">
            {t('tournaments.hub.gsk.qualIncomplete', 'All group matches must be completed before qualification.')}
          </p>
        )}
      </div>
      {rows.length > 0 ? (
        <div className={card} data-testid="gsk-qualified">
          <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
            {t('tournaments.hub.gsk.qualifiedTitle', 'Qualified participants')} · {rows.length}
          </h4>
          <ul className="space-y-1 text-sm">
            {rows.map((q: any) => (
              <li key={q.participantId} className="flex items-center justify-between border-b border-[var(--color-border)] py-1 last:border-0">
                <span className="text-[var(--color-text)]">#{q.qualificationRank} · {q.participantId}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{q.qualificationType} · rank {q.groupRank}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : complete && (
        <p className="text-xs text-[var(--color-text-muted)]" data-testid="gsk-qual-published">
          {t('tournaments.hub.gsk.qualNotPublished', 'The qualified participants will be published by the organiser.')}
        </p>
      )}
    </div>
  );
}

/**
 * Step 4C — read-only knockout panel shared by the Player and Public surfaces.
 * Renders the ONE shared `TournamentBracket` with only the knockout-stage
 * matches. No generation controls, no mutations.
 */
export function GskKnockoutPanel({ tournamentId, tournamentName, bracketTypeName, sportName, status,
  knockoutStage, matches, participants, currentUserId, onMatchClick, footer }: {
  tournamentId: number; tournamentName?: string; bracketTypeName?: string; sportName?: string; status?: string;
  knockoutStage: any | null; matches: TournamentMatchNode[]; participants: any[];
  currentUserId?: number; onMatchClick?: (m: TournamentMatchNode) => void; footer?: (m: TournamentMatchNode) => any;
}) {
  const { t } = useTranslation();
  const koMatches = knockoutStage ? matches.filter((m: any) => Number(m.stage_id) === Number(knockoutStage.id)) : [];
  if (!knockoutStage || koMatches.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]" data-testid="gsk-knockout-pending">
        {t('tournaments.hub.gsk.knockoutPending', 'Knockout stage not generated yet.')}
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="gsk-knockout">
      <TournamentBracket
        tournament={{ id: tournamentId, name: tournamentName, format: 'knockout', bracket_type_name: bracketTypeName, status, sport_name: sportName }}
        matches={koMatches}
        participants={participants}
        currentUserId={currentUserId}
        onMatchClick={onMatchClick}
        footer={footer}
      />
    </div>
  );
}