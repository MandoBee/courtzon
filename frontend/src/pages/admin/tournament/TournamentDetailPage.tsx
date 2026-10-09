import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Modal } from '../../../components/ui/Modal';
import { GeneratedRules } from '../../../components/tournaments/GeneratedRules';
import { PrizeList } from '../../../components/tournaments/PrizeList';
import SponsorList from '../../../components/tournaments/SponsorList';
import CompetitionManager from '../../../components/tournaments/CompetitionManager';
import { tournamentApi, orgTournamentApi, tournamentRefundApi } from '../../../services/tournament';
import { MatchDetailsDrawer } from '../../../components/tournaments/MatchDetailsDrawer';
import { TournamentBracket } from '../../../components/tournaments/TournamentBracket';
import { TournamentPrintView } from '../../../components/tournaments/TournamentPrintView';
import { TournamentHero, type HubAction, type HubKpi, type HubPhase } from '../../../components/tournaments/hub/TournamentHero';
import { TournamentTabs, panelId, tabId, type HubTabItem } from '../../../components/tournaments/hub/TournamentTabs';
import { GskGroupsView, GskQualificationView, GskKnockoutView, type GskQualificationResultLike } from '../../../components/tournaments/hub/GskCompetitionViews';
import { MatchesManager } from '../../../components/tournaments/hub/MatchesManager';
import TournamentParticipantsPage from './TournamentParticipantsPage';
import TournamentDrawPage from './TournamentDrawPage';
import { useAuthStore } from '../../../store/auth.store';
import { useCan } from '../../../hooks/useCan';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

import { TOURNAMENT_STATUS_COLORS as STATUS_COLORS, TOURNAMENT_REG_STATUS_COLORS as REG_STATUS_COLORS } from '../../../components/tournaments/statusBadges';

type HubTab = 'overview' | 'participants' | 'competition' | 'matches' | 'standings' | 'finances' | 'settings';
type CompetitionSubTab = 'categories' | 'groups' | 'qualification' | 'draw' | 'bracket' | 'knockout';

/** Derived visual phase index — from the REAL lifecycle status only. No new statuses. */
const PHASE_INDEX: Record<string, number> = {
  draft: 0,
  published: 1,
  registration_open: 1,
  registration_closed: 2,
  running: 3,
  completed: 4,
  cancelled: 4,
  archived: 4,
};

export type TournamentDetailContextMode = 'admin' | 'org';

interface Props {
  mode?: TournamentDetailContextMode;
  orgId?: string;
}

/**
 * ONE SHARED Tournament Hub — the single coherent management surface for the
 * Super Admin workbench and the Org Admin portal. Renders identically; only the
 * API, permissions and query keys are tenant/context aware.
 *
 * Hub sections (navigation, NOT permission bypasses — every action inside stays
 * individually gated by its EXACT backend permission):
 *   Overview · Participants · Competition · Matches · Standings · Finances · Settings
 *
 * All pre-existing routes (participants / draw / schedule / matches / awards /
 * bracket-types) remain untouched and fully functional. This page reuses the
 * existing participant/draw components instead of rewriting them.
 */
export default function TournamentDetailPage({ mode = 'admin', orgId }: Props) {
  const { id } = useParams<{ id: string }>();
  const tournamentId = Number(id);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();
  // Requirement 9 — the current-player highlight comes from the existing auth
  // store user id. No new backend field is introduced.
  const user = useAuthStore((s) => s.user);
  const { can } = useCan();

  const isOrg = mode === 'org';
  const api = isOrg && orgId ? orgTournamentApi : tournamentApi;
  const keyRoot = isOrg ? `org-${orgId}-tournament` : 'tournament';
  const perms = isOrg
    ? { page: 'org.tournaments.view' as string, update: 'org.tournaments.update' as string }
    : { page: 'admin-tournaments.view' as string, update: 'tournament.update' as string };
  // Backend-exact action permissions (do not expose an action the backend rejects).
  const publishPerm = isOrg ? 'org.tournaments.publish' : 'tournament.publish';
  const archivePerm = isOrg ? 'org.tournaments.delete' : 'tournament.delete';
  const registerPerm = isOrg ? 'org.tournaments.register' : 'tournament.register';
  const financePerm = isOrg ? 'org.finance.position.view' : 'financial.reconcile';

  // G11.3 — organisation official: pending registration refund requests
  // (financial.reconcile). Org-scoped; cross-org enforced server-side.
  const { data: refundRequests, isLoading: loadingRefunds, isError: refundsError, refetch: refetchRefunds } = useQuery({
    queryKey: ['tournament-refund-requests', orgId],
    queryFn: () => tournamentRefundApi.listOrgRequests(orgId!, 'pending').then((r) => r.data || []),
    enabled: Boolean(isOrg && orgId),
  });
  const approveRefund = useMutation({
    mutationFn: (requestId: number) => tournamentRefundApi.approve(orgId!, requestId),
    onSuccess: () => { showToast('Refund approved and executed', 'success'); qc.invalidateQueries({ queryKey: ['tournament-refund-requests', orgId] }); },
    onError: (e: any) => showToast(getErrorMessage(e) || 'Approval failed', 'error'),
  });
  const rejectRefund = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) => tournamentRefundApi.reject(orgId!, requestId, reason),
    onSuccess: () => { showToast('Refund request rejected', 'success'); qc.invalidateQueries({ queryKey: ['tournament-refund-requests', orgId] }); },
    onError: (e: any) => showToast(getErrorMessage(e) || 'Rejection failed', 'error'),
  });

  // Phase 2 — READ-ONLY tournament finances (authorized admin/org financial users only).
  const { data: finances, isLoading: loadingFinances, isError: financesError, refetch: refetchFinances } = useQuery({
    queryKey: ['tournament-finances', isOrg ? `org-${orgId}` : 'admin', tournamentId],
    queryFn: async () => (isOrg && orgId ? orgTournamentApi.getFinances(orgId, tournamentId) : tournamentApi.getFinances(tournamentId)),
    enabled: !!tournamentId,
  });

  const [activeTab, setActiveTab] = useState<HubTab>('overview');
  const [compTab, setCompTab] = useState<CompetitionSubTab>('groups');
  const [detailsMatch, setDetailsMatch] = useState<TournamentMatchNode | null>(null);
  // Step 3F — shared result record for the universal Drawer (ResultSummaryView reuse).
  const [detailsResult, setDetailsResult] = useState<unknown>(null);
  const [printRequested, setPrintRequested] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerPlayerId, setRegisterPlayerId] = useState('');
  const [registerTeamId, setRegisterTeamId] = useState('');
  const [groupSize, setGroupSize] = useState(4);
  const [advanceCount, setAdvanceCount] = useState(2);
  const [nameDraft, setNameDraft] = useState('');

  // TUX-03 Phase 1 — keep the last successful qualification result at the hub
  // level so it survives a Competition sub-tab switch while the hub stays
  // mounted. The result still comes from the authoritative server response.
  const [qualificationResult, setQualificationResult] = useState<GskQualificationResultLike | null>(null);

  const getT = (fn: (...args: any[]) => any, ...a: any[]) =>
    isOrg && orgId ? fn(orgId, ...a) : fn(...a);

  const { data: tournament, isLoading: loadingT, isError: tournamentError, error: tournamentQueryError, refetch: refetchTournament } = useQuery({
    queryKey: [keyRoot, tournamentId],
    queryFn: () => getT(api.getTournament, tournamentId),
  });

  // Step 4B — GSK detection + authoritative stages + competition refresh.
  const isGsk = (tournament as any)?.format === 'group_stage_knockout';
  const managePerm = isOrg ? 'org.tournaments.manage' : 'tournament.manage';
  // Authoritative result-action permission: the bracket "Record Result" gate
  // requires `org.tournaments.result.manage` (org) / `tournament.result.manage`.
  const resultPerm = isOrg ? 'org.tournaments.result.manage' : 'tournament.result.manage';
  const { data: stages, isLoading: loadingStages, isError: stagesError, refetch: refetchStages } = useQuery({
    queryKey: [`${keyRoot}-stages`, tournamentId],
    queryFn: () => getT((api as any).getStages, tournamentId),
    enabled: !!tournamentId && isGsk,
  });
  const groupStage = (Array.isArray(stages) ? stages : []).find((s: any) => s.progression_format === 'round_robin') ?? null;
  const knockoutStage = (Array.isArray(stages) ? stages : []).find((s: any) => s.progression_format === 'knockout') ?? null;
  const refreshCompetition = () => {
    qc.invalidateQueries({ queryKey: [`${keyRoot}-groups`, tournamentId] });
    qc.invalidateQueries({ queryKey: [`${keyRoot}-matches`, tournamentId] });
    qc.invalidateQueries({ queryKey: [`${keyRoot}-standings`, tournamentId] });
    qc.invalidateQueries({ queryKey: [`${keyRoot}-stages`, tournamentId] });
  };
  const generateGskGroupsMutation = useMutation({
    mutationFn: () => (isOrg && orgId ? orgTournamentApi.generateGskGroups(orgId, tournamentId, Number(groupStage?.id)) : tournamentApi.generateGskGroups(tournamentId, Number(groupStage?.id))),
    onSuccess: () => { showToast(t('tournaments.groups_generated'), 'success'); refreshCompetition(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const { data: groups, isLoading: loadingG, isError: groupsError, refetch: refetchGroups } = useQuery({
    queryKey: [`${keyRoot}-groups`, tournamentId],
    queryFn: () => getT(api.getGroups, tournamentId),
    enabled: activeTab === 'competition',
  });

  // The SHARED bracket tab, the administrative matches table and the Hub KPIs
  // read the SAME query (same query key → one fetch, no duplicate request).
  const { data: matches, isLoading: loadingM, isError: matchesError, refetch: refetchMatches } = useQuery({
    queryKey: [`${keyRoot}-matches`, tournamentId],
    queryFn: () => getT(api.getMatches, tournamentId),
    enabled: !!tournamentId,
  });

  const { data: standings, isLoading: loadingS, isError: standingsError, refetch: refetchStandings } = useQuery({
    queryKey: [`${keyRoot}-standings`, tournamentId],
    queryFn: () => getT(api.getStandings, tournamentId),
    enabled: activeTab === 'standings' || (activeTab === 'competition' && isGsk),
  });

  const { data: registrations, isLoading: loadingR, isError: registrationsError, refetch: refetchRegistrations } = useQuery({
    queryKey: [`${keyRoot}-registrations`, tournamentId],
    queryFn: () => getT(api.getRegistrations, tournamentId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ action }: { action: string }) => getT((api as any)[action], tournamentId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [keyRoot, tournamentId] }); showToast(t('tournaments.status_updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const registerMutation = useMutation({
    mutationFn: () => getT(api.register, tournamentId, registerTeamId ? Number(registerTeamId) : undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`${keyRoot}-registrations`, tournamentId] }); setShowRegisterModal(false); setRegisterPlayerId(''); setRegisterTeamId(''); showToast(t('tournaments.player_registered')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const cancelRegMutation = useMutation({
    mutationFn: (regId: number) => getT(api.cancelRegistration, regId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`${keyRoot}-registrations`, tournamentId] }); showToast(t('tournaments.registration_cancelled')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const confirmRegMutation = useMutation({
    mutationFn: (regId: number) => getT(api.confirmRegistration, regId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`${keyRoot}-registrations`, tournamentId] }); showToast(t('tournaments.registration_confirmed')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const generateGroupsMutation = useMutation({
    mutationFn: () => getT(api.generateGroups, tournamentId, groupSize, advanceCount),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`${keyRoot}-groups`, tournamentId] }); showToast(t('tournaments.groups_generated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  // Settings — rename reuses the EXISTING update endpoint (backend `tournament.update`
  // / `org.tournaments.update`). No new API, no locked-field edits.
  const renameMutation = useMutation({
    mutationFn: () => getT(api.updateTournament, tournamentId, { name: nameDraft.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [keyRoot, tournamentId] }); showToast(t('tournaments.hub.renamed', 'Tournament updated'), 'success'); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  useEffect(() => {
    if (tournament?.name) setNameDraft(tournament.name);
  }, [tournament?.name]);

  const matchList: TournamentMatchNode[] = Array.isArray(matches) ? (matches as TournamentMatchNode[]) : [];
  const participantList = (Array.isArray(registrations) ? (registrations as any[]) : []).map((r: any) => ({
    id: r.id,
    player_id: r.player_id ?? null,
    player_name: r.player_name ?? r.player?.name ?? null,
    seed_rank: r.seed_rank ?? null,
    status: r.status ?? null,
  }));

  const printBracket = () => {
    setPrintRequested(true);
    setTimeout(() => {
      window.print();
      setPrintRequested(false);
    }, 50);
  };

  // ── Hub tab availability — organizational, but Finances/Settings still require
  //    their exact backend read/update permission. ──
  const hubTabs: HubTabItem[] = useMemo(() => {
    const all: Array<HubTabItem & { perm?: string }> = [
      { id: 'overview', label: t('tournaments.hub.overview', 'Overview') },
      { id: 'participants', label: t('tournaments.hub.participants', 'Participants') },
      { id: 'competition', label: t('tournaments.hub.competition', 'Competition') },
      { id: 'matches', label: t('tournaments.hub.matches', 'Matches') },
      { id: 'standings', label: t('tournaments.hub.standings', 'Standings') },
      { id: 'finances', label: t('tournaments.hub.finances', 'Finances'), perm: financePerm },
      { id: 'settings', label: t('tournaments.hub.settings', 'Settings'), perm: perms.update },
    ];
    return all.filter((x) => !x.perm || can(x.perm)).map(({ id, label }) => ({ id, label }));
  }, [t, can, financePerm, perms.update]);

  const effectiveTab: HubTab = hubTabs.some((x) => x.id === activeTab) ? activeTab : 'overview';

  const competitionTabs: HubTabItem[] = useMemo(() => {
    const tabs: HubTabItem[] = [];
    if (isOrg && orgId) tabs.push({ id: 'categories', label: t('tournaments.hub.categories', 'Categories') });
    if (isGsk) {
      tabs.push({ id: 'groups', label: t('tournaments.hub.groups', 'Groups') });
      tabs.push({ id: 'qualification', label: t('tournaments.hub.qualification', 'Qualification') });
      tabs.push({ id: 'draw', label: t('tournaments.hub.draw', 'Draw') });
      tabs.push({ id: 'knockout', label: t('tournaments.hub.knockout', 'Knockout') });
    } else {
      tabs.push({ id: 'groups', label: t('tournaments.hub.groups', 'Groups') });
      tabs.push({ id: 'draw', label: t('tournaments.hub.draw', 'Draw') });
      tabs.push({ id: 'bracket', label: t('tournaments.hub.bracket', 'Bracket') });
    }
    return tabs;
  }, [isOrg, orgId, t, isGsk]);

  if (loadingT) return <div className="p-6"><SkeletonRow count={3} /></div>;
  // F-02 — a failed fetch must not masquerade as an empty/blank Hub shell.
  // The backend responds HTTP 404 for a missing tournament; transport/server
  // failures carry no status, so a genuine not-found is preserved while
  // network/server errors always offer Retry.
  if (tournamentError) {
    if ((tournamentQueryError as unknown as { response?: { status?: number } })?.response?.status === 404) {
      return <div className="p-6 text-center text-sm text-[var(--color-text-muted)]">Tournament not found.</div>;
    }
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-[var(--color-error)]">Unable to load tournament.</p>
        <button onClick={() => refetchTournament()}
          className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          {t('common.retry', 'Retry')}
        </button>
      </div>
    );
  }

  const status = tournament?.status as string | undefined;

  // ── Lifecycle-aware primary action (only valid transitions; only permitted). ──
  const runLifecycle = (action: string) => statusMutation.mutate({ action });
  let primary: HubAction | null = null;
  if (tournament) {
    if (status === 'draft' && can(publishPerm)) {
      primary = { key: 'publish', label: t('tournaments.action.publish', 'Publish'), onAct: () => runLifecycle('publish'), pending: statusMutation.isPending };
    } else if (status === 'published' && can(perms.update)) {
      primary = { key: 'openRegistration', label: t('tournaments.action.open_reg', 'Open Registration'), onAct: () => runLifecycle('openRegistration'), pending: statusMutation.isPending };
    } else if (status === 'registration_open' && can(perms.update)) {
      primary = { key: 'closeRegistration', label: t('tournaments.action.close_reg', 'Close Registration'), onAct: () => runLifecycle('closeRegistration'), pending: statusMutation.isPending };
    } else if (status === 'registration_closed') {
      primary = { key: 'prepare', label: t('tournaments.hub.prepare', 'Prepare Competition'), onAct: () => setActiveTab('competition') };
    } else if (status === 'running') {
      primary = { key: 'live', label: t('tournaments.hub.manageLive', 'Manage Live Tournament'), onAct: () => setActiveTab('matches') };
    } else if (status === 'completed') {
      primary = { key: 'results', label: t('tournaments.hub.viewResults', 'View Results'), onAct: () => setActiveTab('standings') };
    } else if (status === 'cancelled' || status === 'archived') {
      primary = { key: 'view', label: t('tournaments.hub.view', 'View Tournament'), onAct: () => setActiveTab('overview') };
    }
  }

  // ── Secondary actions: remaining VALID lifecycle transitions + Edit + Print. ──
  const secondary: HubAction[] = [];
  if (tournament) {
    const pushLifecycle = (key: string, label: string, perm: string, tone?: HubAction['tone']) => {
      if (can(perm)) secondary.push({ key, label, onAct: () => runLifecycle(key), pending: statusMutation.isPending, tone });
    };
    if (status === 'registration_closed') pushLifecycle('start', t('tournaments.action.start', 'Start Tournament'), perms.update);
    if (status === 'running') {
      pushLifecycle('complete', t('tournaments.action.complete', 'Complete Tournament'), perms.update);
      pushLifecycle('cancel', t('tournaments.action.cancel', 'Cancel Tournament'), perms.update, 'danger');
    }
    if (status === 'completed' || status === 'cancelled') {
      pushLifecycle('archive', t('tournaments.action.archive', 'Archive'), archivePerm);
    }
    if (can(perms.update)) {
      secondary.push({ key: 'edit', label: t('tournaments.hub.settings', 'Settings'), onAct: () => setActiveTab('settings') });
    }
    if (matchList.length > 0) {
      secondary.push({ key: 'print', label: t('tournamentBracket.printTitle', 'Print bracket'), onAct: printBracket });
    }
  }

  const phases: HubPhase[] = [
    { key: 'setup', label: t('tournaments.hub.phase.setup', 'Setup') },
    { key: 'registration', label: t('tournaments.hub.phase.registration', 'Registration') },
    { key: 'draw', label: t('tournaments.hub.phase.draw', 'Draw & Groups') },
    { key: 'live', label: t('tournaments.hub.phase.live', 'Live') },
    { key: 'completed', label: t('tournaments.hub.phase.completed', 'Completed') },
  ];
  const phaseIndex = PHASE_INDEX[status ?? 'draft'] ?? 0;

  const completedMatches = matchList.filter((m: any) => m.status === 'completed').length;
  const kpis: HubKpi[] = [
    { key: 'participants', label: t('tournaments.hub.kpi.participants', 'Participants'), value: registrationsError ? '—' : (registrations ?? []).length },
    { key: 'capacity', label: t('tournaments.hub.kpi.capacity', 'Capacity'), value: tournament?.max_participants ?? tournament?.max_players ?? '—' },
    { key: 'matches', label: t('tournaments.hub.kpi.matches', 'Matches'), value: matchesError ? '—' : matchList.length },
    { key: 'completed', label: t('tournaments.hub.kpi.completed', 'Completed'), value: matchesError ? '—' : completedMatches },
  ];

  const meta = [
    tournament?.sport_name ? { label: t('tournaments.sport'), value: tournament.sport_name } : null,
    tournament?.category ? { label: t('tournaments.category'), value: tournament.category } : null,
    tournament?.format ? { label: t('tournaments.format'), value: tournament.format } : null,
    tournament?.start_date ? { label: t('tournaments.start_date'), value: String(tournament.start_date).slice(0, 10) } : null,
    tournament?.venue?.name ? { label: t('tournaments.venue'), value: tournament.venue.name } : null,
    tournament?.entry_fee != null ? { label: t('tournaments.entry_fee', 'Entry fee'), value: `${tournament.entry_fee} ${tournament.currency_code ?? ''}`.trim() } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const backTo = isOrg ? `/org/${orgId}/tournaments` : '/admin/tournament/list';
  const awardsPath = `/admin/tournament/list/${tournamentId}/awards`;

  const panelProps = (tab: HubTab) => ({
    role: 'tabpanel' as const,
    id: panelId('cz-hub', tab),
    'aria-labelledby': tabId('cz-hub', tab),
    className: 'cz-hub-panel space-y-6',
  });

  return (
    <Can permission={perms.page}>
      <div className="space-y-5">
        <TournamentHero
          name={tournament?.name ?? ''}
          statusLabel={status ? t(`tournaments.status.${status}`) : ''}
          statusClass={status ? STATUS_COLORS[status] : ''}
          meta={meta}
          kpis={kpis}
          phases={phases}
          phaseIndex={phaseIndex}
          primary={primary}
          secondary={secondary}
          backLabel={t('tournaments.hub.back', 'Tournaments')}
          onBack={() => navigate(backTo)}
          progressLabel={t('tournaments.hub.progress', 'Tournament progress')}
          moreLabel={t('tournaments.hub.more', 'More')}
        />

        <TournamentTabs
          tabs={hubTabs}
          active={effectiveTab}
          onChange={(id) => setActiveTab(id as HubTab)}
          ariaLabel={t('tournaments.hub.sections', 'Tournament sections')}
        />

        {/* ── OVERVIEW ── */}
        {effectiveTab === 'overview' && (
          <div {...panelProps('overview')}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
                <h3 className="font-semibold text-[var(--color-text)]">{t('tournaments.details.general')}</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: t('tournaments.code'), value: tournament?.code },
                    { label: t('tournaments.format'), value: tournament?.format },
                    { label: t('tournaments.category'), value: tournament?.category },
                    { label: t('tournaments.sport'), value: tournament?.sport_name },
                    { label: t('tournaments.organisation'), value: tournament?.organisation_name },
                    { label: t('tournaments.max_players'), value: tournament?.max_players },
                    { label: t('tournaments.type'), value: tournament?.type },
                    { label: t('tournaments.venue'), value: tournament?.venue?.name || '-' },
                    { label: t('tournaments.start_date'), value: tournament?.start_date?.slice(0, 10) },
                    { label: t('tournaments.end_date'), value: tournament?.end_date?.slice(0, 10) },
                    { label: t('tournaments.daily_playing'), value: (tournament?.daily_start_time && tournament?.daily_end_time) ? `${String(tournament.daily_start_time).slice(0, 5)} – ${String(tournament.daily_end_time).slice(0, 5)}` : '-' },
                    { label: t('tournaments.registration_deadline'), value: tournament?.registration_deadline?.slice(0, 10) },
                    { label: t('tournaments.payment_methods'), value: (Array.isArray(tournament?.effective_registration_payment_methods) ? tournament.effective_registration_payment_methods : []).join(' + ') || '-' },
                  ].map((f) => (
                    <div key={f.label}>
                      <p className="text-xs text-[var(--color-text-muted)]">{f.label}</p>
                      <p className="font-medium">{f.value || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
                <h3 className="font-semibold text-[var(--color-text)]">{t('tournaments.details.description')}</h3>
                <p className="text-sm whitespace-pre-wrap text-[var(--color-text)]">{tournament?.description || '-'}</p>
              </div>
              <div className="md:col-span-2">
                <GeneratedRules
                  rules={tournament?.rules}
                  title={t('tournaments.details.rules')}
                  empty={<p className="text-sm text-[var(--color-text-muted)]">{t('tournaments.details.rules_empty')}</p>}
                />
              </div>
              <div className="md:col-span-2">
                <PrizeList prizes={tournament?.prizes} legacyDescription={tournament?.prize_description} />
              </div>
              <div className="md:col-span-2">
                <SponsorList sponsors={tournament?.sponsors} showAmount />
              </div>
            </div>
          </div>
        )}

        {/* ── PARTICIPANTS ── */}
        {effectiveTab === 'participants' && (
          <div {...panelProps('participants')}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('tournaments.registrations')}</h2>
                <Can permission={registerPerm}>
                  <button onClick={() => setShowRegisterModal(true)}
                    className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 text-xs font-medium text-white">
                    {t('tournaments.register_player')}
                  </button>
                </Can>
              </div>
              {loadingR ? <SkeletonRow count={3} /> : registrationsError ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <p className="text-sm text-[var(--color-error)]">Unable to load registrations.</p>
                  <button onClick={() => refetchRegistrations()}
                    className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-[var(--color-text-muted)]">
                        <th className="px-4 py-3 text-left">{t('tournaments.player')}</th>
                        <th className="px-4 py-3 text-left">{t('tournaments.team')}</th>
                        <th className="px-4 py-3 text-left">{t('tournaments.status')}</th>
                        <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(registrations ?? []).map((r: any) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                          <td className="px-4 py-3">{r.player_name || r.player?.name || '-'}</td>
                          <td className="px-4 py-3 text-xs">{r.team_name || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${REG_STATUS_COLORS[r.status] || ''}`}>
                              {t(`tournaments.reg_status.${r.status}`)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.status === 'registered' && (
                              <Can permission={registerPerm}>
                                <button onClick={() => confirmRegMutation.mutate(r.id)}
                                  className="mr-1 rounded border border-green-200 px-2 py-1 text-[10px] text-green-600 hover:bg-green-50">
                                  {t('tournaments.confirm')}
                                </button>
                              </Can>
                            )}
                            {['registered', 'confirmed'].includes(r.status) && (
                              <Can permission={registerPerm}>
                                <button onClick={() => { if (window.confirm(t('tournaments.confirm_cancel_reg'))) cancelRegMutation.mutate(r.id); }}
                                  className="rounded border border-red-200 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50">
                                  {t('tournaments.cancel')}
                                </button>
                              </Can>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Existing participant / seeding / waitlist / replacement surface, reused as-is. */}
            <TournamentParticipantsPage mode={mode} orgId={orgId} />
          </div>
        )}

        {/* ── COMPETITION ── */}
        {effectiveTab === 'competition' && (
          <div {...panelProps('competition')}>
            <TournamentTabs
              tabs={competitionTabs}
              active={competitionTabs.some((x) => x.id === compTab) ? compTab : 'groups'}
              onChange={(id) => setCompTab(id as CompetitionSubTab)}
              ariaLabel={t('tournaments.hub.competition_sections', 'Competition sections')}
              idPrefix="cz-hub-comp"
            />

            {compTab === 'categories' && isOrg && orgId && (
              <Can permission="org.tournaments.view">
                <CompetitionManager orgId={orgId} tournamentId={tournamentId} />
              </Can>
            )}

            {compTab === 'groups' && (isGsk ? (
              <div className="space-y-3">
                <Can permission={managePerm}>
                  <button
                    type="button"
                    onClick={() => generateGskGroupsMutation.mutate()}
                    disabled={!groupStage || groupsError || (groups ?? []).length > 0 || generateGskGroupsMutation.isPending}
                    className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
                    data-testid="gsk-generate-groups"
                  >
                    {generateGskGroupsMutation.isPending ? t('common.loading') : t('tournaments.generate_groups')}
                  </button>
                </Can>
                {groupsError ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                    <p className="text-sm text-[var(--color-error)]">Unable to load groups.</p>
                    <button onClick={() => refetchGroups()}
                      className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                      {t('common.retry', 'Retry')}
                    </button>
                  </div>
                ) : standingsError ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                    <p className="text-sm text-[var(--color-error)]">Unable to load standings.</p>
                    <button onClick={() => refetchStandings()}
                      className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                      {t('common.retry', 'Retry')}
                    </button>
                  </div>
                ) : (
                  <GskGroupsView groups={groups ?? []} standings={standings ?? []} loading={loadingG} />
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Can permission={perms.update}>
                  <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div>
                      <label className="text-xs text-[var(--color-text-muted)]">{t('tournaments.group_size')}</label>
                      <input type="number" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))}
                        className="w-20 rounded border px-2 py-1 text-sm" min={2} />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-muted)]">{t('tournaments.advance_count')}</label>
                      <input type="number" value={advanceCount} onChange={(e) => setAdvanceCount(Number(e.target.value))}
                        className="w-20 rounded border px-2 py-1 text-sm" min={1} />
                    </div>
                    <button onClick={() => generateGroupsMutation.mutate()}
                      disabled={groupsError || generateGroupsMutation.isPending}
                      className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-sm text-white disabled:opacity-50">
                      {t('tournaments.generate_groups')}
                    </button>
                  </div>
                </Can>
                {loadingG ? <SkeletonRow count={3} /> : groupsError ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                    <p className="text-sm text-[var(--color-error)]">Unable to load groups.</p>
                    <button onClick={() => refetchGroups()}
                      className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                      {t('common.retry', 'Retry')}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {(groups ?? []).map((g: any) => (
                      <div key={g.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                        <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">{g.name}</h4>
                        <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                          {(g.players ?? g.members ?? g.participants ?? []).map((p: any) => (
                            <div key={p.id} className="flex justify-between">
                              <span>{p.name || p.full_name || p.player_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {compTab === 'draw' && (
              <TournamentDrawPage mode={mode} orgId={orgId} />
            )}

            {compTab === 'qualification' && isGsk && (
              loadingStages ? <SkeletonRow count={3} /> : stagesError ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <p className="text-sm text-[var(--color-error)]">Unable to load stages.</p>
                  <button onClick={() => refetchStages()}
                    className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              ) : matchesError ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <p className="text-sm text-[var(--color-error)]">Unable to load matches.</p>
                  <button onClick={() => refetchMatches()}
                    className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              ) : (
                <GskQualificationView
                  mode={mode}
                  orgId={orgId}
                  tournamentId={tournamentId}
                  groupStage={groupStage}
                  groupMatches={matchList.filter((m: any) => Number(m.stage_id) === Number(groupStage?.id))}
                  canManage={can(managePerm)}
                  qualifiedResult={qualificationResult}
                  onQualified={setQualificationResult}
                  onDone={refreshCompetition}
                />
              )
            )}

            {compTab === 'knockout' && isGsk && (
              loadingStages ? <SkeletonRow count={3} /> : stagesError ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <p className="text-sm text-[var(--color-error)]">Unable to load stages.</p>
                  <button onClick={() => refetchStages()}
                    className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              ) : matchesError ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <p className="text-sm text-[var(--color-error)]">Unable to load matches.</p>
                  <button onClick={() => refetchMatches()}
                    className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              ) : registrationsError ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <p className="text-sm text-[var(--color-error)]">Unable to load registrations.</p>
                  <button onClick={() => refetchRegistrations()}
                    className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              ) : (
                <GskKnockoutView
                  mode={mode}
                  orgId={orgId}
                  tournamentId={tournamentId}
                  tournamentName={tournament?.name}
                  bracketTypeName={tournament?.bracket_type_name}
                  sportName={tournament?.sport_name}
                  status={tournament?.status}
                  groupStage={groupStage}
                  knockoutStage={knockoutStage}
                  matches={matchList}
                  participants={participantList}
                  currentUserId={user?.id}
                  canManage={can(managePerm)}
                  onMatchClick={setDetailsMatch}
                  onDone={refreshCompetition}
                  footer={(m) => (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setDetailsMatch(m); }}
                      className="text-[10px] text-[var(--color-primary)] hover:underline">
                      {t('tournamentBracket.details', 'Details')}
                    </button>
                  )}
                />
              )
            )}

            {compTab === 'bracket' && !isGsk && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-[var(--color-text)]">
                    {t('tournamentBracket.tabBracket', 'Bracket')}
                  </h3>
                  {matchList.length > 0 && (
                    <button onClick={printBracket} className="cz-no-print text-xs text-[var(--color-primary)] hover:underline">
                      {t('tournamentBracket.printTitle', 'Tournament Bracket')}
                    </button>
                  )}
                </div>
                {loadingM ? <SkeletonRow count={5} />
                  : matchesError ? <p className="py-8 text-center text-sm text-[var(--color-error)]">{t('tournamentBracket.error')}</p>
                  : registrationsError ? (
                    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                      <p className="text-sm text-[var(--color-error)]">Unable to load registrations.</p>
                      <button onClick={() => refetchRegistrations()}
                        className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                        {t('common.retry', 'Retry')}
                      </button>
                    </div>
                  ) : (
                    <TournamentBracket
                      tournament={tournament}
                      matches={matchList}
                      participants={participantList}
                      currentUserId={user?.id}
                      onMatchClick={setDetailsMatch}
                      footer={(m) => (
                        <>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDetailsMatch(m); }}
                            className="text-[10px] text-[var(--color-primary)] hover:underline"
                          >
                            {t('tournamentBracket.details', 'Details')}
                          </button>
                          {can(resultPerm) && m.match_id != null && m.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(`/matches/${m.match_id}/result`); }}
                              className="ml-2 text-[10px] text-[var(--color-primary)] hover:underline"
                            >
                              {t('tournaments.record_result', 'Record Result')}
                            </button>
                          )}
                        </>
                      )}
                    />
                  )}
              </div>
            )}
          </div>
        )}

        {/* ── MATCHES (Step 3C — consolidated tournament-specific management surface) ── */}
        {effectiveTab === 'matches' && (
          <div {...panelProps('matches')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('tournaments.hub.matches', 'Matches')}</h2>
              <Can permission={perms.update}>
                <button
                  onClick={() => navigate(isOrg ? `/org/${orgId}/tournaments/${tournamentId}/schedule` : `/admin/tournament/list/${tournamentId}/schedule`)}
                  className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text)]">
                  {t('tournaments.matches_schedule', 'Matches & Schedule')}
                </button>
              </Can>
            </div>
            <MatchesManager
              tournamentId={tournamentId}
              isOrg={isOrg}
              orgId={orgId}
              matches={(Array.isArray(matches) ? matches : []) as any}
              loading={loadingM}
              error={matchesError}
              onRetry={() => refetchMatches()}
              onDetails={(m) => setDetailsMatch(m as any)}
              onViewResult={(m, record) => { setDetailsMatch(m as any); setDetailsResult(record); }}
              onSchedule={() => navigate(isOrg ? `/org/${orgId}/tournaments/${tournamentId}/schedule` : `/admin/tournament/list/${tournamentId}/schedule`)}
              onOpenResults={() => navigate(isOrg ? `/org/${orgId}/match-results` : '/admin/match-results')}
              onOpenMonitoring={() => navigate(isOrg ? `/org/${orgId}/matches` : '/admin/matches')}
            />
          </div>
        )}

        {/* ── STANDINGS ── */}
        {effectiveTab === 'standings' && (
          <div {...panelProps('standings')}>
            {loadingS ? <SkeletonRow count={5} /> : standingsError ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="text-sm text-[var(--color-error)]">Unable to load standings.</p>
                <button onClick={() => refetchStandings()}
                  className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-[var(--color-text-muted)]">
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">{t('tournaments.player')}</th>
                      <th className="px-4 py-3 text-center">{t('tournaments.standings.p')}</th>
                      <th className="px-4 py-3 text-center">{t('tournaments.standings.w')}</th>
                      <th className="px-4 py-3 text-center">{t('tournaments.standings.l')}</th>
                      <th className="px-4 py-3 text-center">{t('tournaments.standings.pts')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(standings ?? []).map((s: any, i: number) => (
                      <tr key={s.id || i} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-3 text-xs">{s.rank_position ?? i + 1}</td>
                        <td className="px-4 py-3 font-medium">{s.player_name || s.name || (s.registration_id ? `Player #${s.registration_id}` : '-')}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.played ?? (Number(s.wins ?? 0) + Number(s.losses ?? 0) + Number(s.draws ?? 0))}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.won ?? s.wins ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.lost ?? s.losses ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold">{s.points ?? s.pts ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── FINANCES ── */}
        {effectiveTab === 'finances' && (
          <div {...panelProps('finances')}>
            <Can permission={financePerm}>
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
                <h3 className="font-semibold text-[var(--color-text)]">{t('tournaments.finances', 'Tournament Finances')}</h3>
                {loadingFinances ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Loading finances…</p>
                ) : financesError ? (
                  <div>
                    <p className="text-sm text-[var(--color-error)]">Unable to load finances.</p>
                    <button onClick={() => refetchFinances()}
                      className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                      {t('common.retry', 'Retry')}
                    </button>
                  </div>
                ) : finances ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                      <div><p className="text-xs text-[var(--color-text-muted)]">Registration revenue</p><p className="font-medium">{finances?.revenue?.registration?.toFixed?.(2) ?? '—'}</p></div>
                      <div><p className="text-xs text-[var(--color-text-muted)]">Sponsor cash (ledger)</p><p className="font-medium">{finances?.revenue?.sponsorCash?.toFixed?.(2) ?? '—'}</p></div>
                      <div><p className="text-xs text-[var(--color-text-muted)]">Total revenue</p><p className="font-medium">{finances?.revenue?.total?.toFixed?.(2) ?? '—'}</p></div>
                      <div><p className="text-xs text-[var(--color-text-muted)]">Cash prize expense</p><p className="font-medium">{finances?.expenses?.cashPrizes?.toFixed?.(2) ?? '—'}</p></div>
                      <div><p className="text-xs text-[var(--color-text-muted)]">Net result</p><p className={`font-medium ${Number(finances?.net) >= 0 ? 'text-[var(--color-primary)]' : 'text-[var(--color-error)]'}`}>{finances?.net?.toFixed?.(2) ?? '—'}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                      <div><p className="text-xs text-[var(--color-text-muted)]">Commission expense</p><p className="font-medium">{finances?.expenses?.commissionExpense?.toFixed?.(2) ?? '—'}</p></div>
                      <div><p className="text-xs text-[var(--color-text-muted)]">Platform commission (4192)</p><p className="font-medium">{finances?.platform?.commissionRevenue?.toFixed?.(2) ?? '—'}</p></div>
                      <div><p className="text-xs text-[var(--color-text-muted)]">Merchant payable (2202)</p><p className="font-medium">{finances?.platform?.merchantPayable?.toFixed?.(2) ?? '—'}</p></div>
                      <div><p className="text-xs text-[var(--color-text-muted)]">Prize liability (2100)</p><p className="font-medium">{finances?.platform?.prizeLiability?.toFixed?.(2) ?? '—'}</p></div>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Ledger-authoritative (G11 Phase 4): only posted accounting entries are recognized. Court rental, balls, equipment and other expenses are not financially represented and are therefore excluded. Sponsors are record-only — not recognized as revenue.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">No finance data available.</p>
                )}
              </div>
            </Can>

            {!isOrg && (
              <Can permission="tournaments.awards.view">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div>
                    <h3 className="font-semibold text-[var(--color-text)]">{t('tournaments.awards.title', 'Prize Awards')}</h3>
                    <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.hub.awards_hint', 'Grant and refund tournament prize awards.')}</p>
                  </div>
                  <button onClick={() => navigate(awardsPath)}
                    className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-xs font-medium text-[var(--color-text)]">
                    {t('tournaments.hub.open_awards', 'Open awards')}
                  </button>
                </div>
              </Can>
            )}

            {/* G11.3 — org official: pending refund requests (financial.reconcile) */}
            {isOrg && (
              <Can permission={financePerm}>
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
                  <h3 className="font-semibold text-[var(--color-text)]">{t('tournaments.hub.refunds', 'Registration Refund Requests')}</h3>
                  {loadingRefunds ? (
                    <p className="text-xs text-[var(--color-text-muted)]">Loading refund requests…</p>
                  ) : refundsError ? (
                    <div>
                      <p className="text-sm text-[var(--color-error)]">Unable to load refund requests.</p>
                      <button onClick={() => refetchRefunds()}
                        className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                        {t('common.retry', 'Retry')}
                      </button>
                    </div>
                  ) : (!refundRequests || refundRequests.length === 0) ? (
                    <p className="text-xs text-[var(--color-text-muted)]">No pending refund requests.</p>
                  ) : (
                    <div className="space-y-2">
                      {refundRequests.map((r: any) => (
                        <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3">
                          <div className="space-y-0.5 text-xs">
                            <p className="font-medium text-[var(--color-text)]">{r.player_name || `Player #${r.requested_by}`}</p>
                            <p className="text-[var(--color-text-muted)]">Registration #{r.registration_id} · {r.tournamentName}</p>
                            <p className="text-[var(--color-text-muted)]">Reason: {r.reason || '—'}</p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button onClick={() => approveRefund.mutate(r.id)} disabled={approveRefund.isPending}
                              className="min-h-[44px] rounded-[var(--radius-md)] bg-green-600 px-3 text-xs font-medium text-white disabled:opacity-50">
                              Approve &amp; Refund
                            </button>
                            <button onClick={() => { const reason = window.prompt('Rejection reason'); rejectRefund.mutate({ requestId: r.id, reason: reason || '' }); }} disabled={rejectRefund.isPending}
                              className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-error)]">
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Can>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {effectiveTab === 'settings' && (
          <div {...panelProps('settings')}>
            <Can permission={perms.update}>
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
                <h3 className="font-semibold text-[var(--color-text)]">{t('tournaments.hub.identity', 'Tournament identity')}</h3>
                <div>
                  <label htmlFor="hub-name" className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                    {t('tournaments.create.name')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      id="hub-name"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="min-h-[44px] w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm"
                    />
                    <button
                      onClick={() => renameMutation.mutate()}
                      disabled={renameMutation.isPending || !nameDraft.trim() || nameDraft.trim() === tournament?.name}
                      className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {t('common.save', 'Save')}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('tournaments.hub.locked_hint', 'Format, fees and registration dates are locked once registration opens; the draw and matches lock after draw approval. Edit those through the tournament list create/edit flow.')}
                </p>
              </div>
            </Can>

            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
              <h3 className="font-semibold text-[var(--color-text)]">{t('tournaments.hub.configuration', 'Configuration')}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                {[
                  { label: t('tournaments.status'), value: status ? t(`tournaments.status.${status}`) : '-' },
                  { label: t('tournaments.format'), value: tournament?.format },
                  { label: t('tournaments.category'), value: tournament?.category },
                  { label: t('tournaments.sport'), value: tournament?.sport_name },
                  { label: t('tournaments.max_players'), value: tournament?.max_participants ?? tournament?.max_players },
                  { label: t('tournaments.entry_fee', 'Entry fee'), value: tournament?.entry_fee != null ? `${tournament.entry_fee} ${tournament.currency_code ?? ''}`.trim() : '-' },
                  { label: t('tournaments.registration_opens'), value: tournament?.registration_opens?.slice(0, 16) },
                  { label: t('tournaments.registration_closes'), value: tournament?.registration_closes?.slice(0, 16) },
                  { label: t('tournaments.start_date'), value: tournament?.start_date?.slice(0, 10) },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs text-[var(--color-text-muted)]">{f.label}</p>
                    <p className="font-medium">{f.value || '-'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <Modal open={showRegisterModal} onClose={() => setShowRegisterModal(false)}
          title={t('tournaments.register_player')} size="sm">
          <div className="space-y-3">
            <div>
              <label className="block mb-1 text-xs font-medium text-[var(--color-text-muted)]">{t('tournaments.player_id')}</label>
              <input type="number" value={registerPlayerId} onChange={(e) => setRegisterPlayerId(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium text-[var(--color-text-muted)]">{t('tournaments.team_id_optional')}</label>
              <input type="number" value={registerTeamId} onChange={(e) => setRegisterTeamId(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm" />
            </div>
            <button onClick={() => registerMutation.mutate()}
              className="w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white">
              {t('tournaments.register')}
            </button>
          </div>
        </Modal>

        <MatchDetailsDrawer
          open={Boolean(detailsMatch)}
          onClose={() => { setDetailsMatch(null); setDetailsResult(null); }}
          match={detailsMatch}
          resultRecord={detailsResult}
          currentUserId={user?.id}
          matches={matchList}
          onSelectMatch={setDetailsMatch}
        />
      </div>
      {printRequested && tournament && (
        <div className="cz-print-area print-only-area hidden print:block">
          <TournamentPrintView
            tournament={tournament}
            matches={matchList}
            participants={participantList}
            currentUserId={user?.id}
          />
        </div>
      )}
    </Can>
  );
}
