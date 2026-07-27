import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Modal } from '../../../components/ui/Modal';
import { leagueApi } from '../../../services/league';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  registration_open: 'bg-green-100 text-green-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

const TEAM_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const MATCH_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  walkover: 'bg-purple-100 text-purple-700',
};

type TabId = 'overview' | 'teams' | 'fixtures' | 'standings' | 'statistics';

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const leagueId = Number(id);
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerTeamId, setRegisterTeamId] = useState('');
  const [resultModal, setResultModal] = useState<{ matchId: number; open: boolean }>({ matchId: 0, open: false });
  const [resultData, setResultData] = useState({ score: '', winner_id: '', status: 'completed' });
  const [courtAssign, setCourtAssign] = useState<{ matchId: number; resourceId: string }>({ matchId: 0, resourceId: '' });
  const [refereeAssign, setRefereeAssign] = useState<{ matchId: number; refereeId: string }>({ matchId: 0, refereeId: '' });

  const { data: league, isLoading: loadingL } = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => leagueApi.getLeague(leagueId),
  });

  const { data: teams, isLoading: loadingT } = useQuery({
    queryKey: ['league-teams', leagueId],
    queryFn: () => leagueApi.getTeams(leagueId),
    enabled: activeTab === 'teams',
  });

  const { data: matches, isLoading: loadingM } = useQuery({
    queryKey: ['league-matches', leagueId],
    queryFn: () => leagueApi.getMatches(leagueId),
    enabled: activeTab === 'fixtures',
  });

  const { data: standings, isLoading: loadingS } = useQuery({
    queryKey: ['league-standings', leagueId],
    queryFn: () => leagueApi.getStandings(leagueId),
    enabled: activeTab === 'standings',
  });

  const { data: statistics, isLoading: loadingStats } = useQuery({
    queryKey: ['league-statistics', leagueId],
    queryFn: () => leagueApi.getStatistics(leagueId),
    enabled: activeTab === 'statistics',
  });

  const { data: divisions } = useQuery({
    queryKey: ['league-divisions', leagueId],
    queryFn: () => leagueApi.getDivisions(leagueId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ action }: { action: string }) => (leagueApi as any)[action](leagueId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league', leagueId] }); showToast(t('admin.league.status_updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const registerMutation = useMutation({
    mutationFn: () => leagueApi.registerTeam(leagueId, { team_id: Number(registerTeamId) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-teams', leagueId] }); setShowRegisterModal(false); setRegisterTeamId(''); showToast(t('admin.league.team_registered')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const cancelTeamMutation = useMutation({
    mutationFn: (teamId: number) => leagueApi.cancelTeam(teamId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-teams', leagueId] }); showToast(t('admin.league.team_cancelled')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const confirmTeamMutation = useMutation({
    mutationFn: (teamId: number) => leagueApi.confirmTeam(teamId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-teams', leagueId] }); showToast(t('admin.league.team_confirmed')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const recordResultMutation = useMutation({
    mutationFn: () => leagueApi.recordResult(resultModal.matchId, {
      score: resultData.score,
      winner_id: resultData.winner_id ? Number(resultData.winner_id) : undefined,
      status: resultData.status,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-matches', leagueId] }); setResultModal({ matchId: 0, open: false }); setResultData({ score: '', winner_id: '', status: 'completed' }); showToast(t('admin.league.result_recorded')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const assignCourtMutation = useMutation({
    mutationFn: () => leagueApi.assignCourt(courtAssign.matchId, Number(courtAssign.resourceId)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-matches', leagueId] }); setCourtAssign({ matchId: 0, resourceId: '' }); showToast(t('admin.league.court_assigned')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const assignRefereeMutation = useMutation({
    mutationFn: () => leagueApi.assignReferee(refereeAssign.matchId, Number(refereeAssign.refereeId)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-matches', leagueId] }); setRefereeAssign({ matchId: 0, refereeId: '' }); showToast(t('admin.league.referee_assigned')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const recalculateStandingsMutation = useMutation({
    mutationFn: () => leagueApi.recalculateStandings(leagueId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-standings', leagueId] }); showToast(t('admin.league.standings_recalculated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const recalculateStatsMutation = useMutation({
    mutationFn: () => leagueApi.recalculateStats(leagueId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-statistics', leagueId] }); showToast(t('admin.league.stats_recalculated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  if (loadingL) return <div className="p-6"><SkeletonRow count={3} /></div>;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: t('admin.league.tab.overview') },
    { id: 'teams', label: t('admin.league.tab.teams') },
    { id: 'fixtures', label: t('admin.league.tab.fixtures') },
    { id: 'standings', label: t('admin.league.tab.standings') },
    { id: 'statistics', label: t('admin.league.tab.statistics') },
  ];

  const teamsList = Array.isArray(teams) ? teams : teams?.data ?? [];
  const matchesList = Array.isArray(matches) ? matches : matches?.data ?? [];
  const standingsList = Array.isArray(standings) ? standings : standings?.data ?? [];
  const statsList = Array.isArray(statistics) ? statistics : statistics?.data ?? [];

  return (
    <Can permission="admin-leagues.view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{league?.name}</h1>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[league?.status] || ''}`}>
              {t(`admin.league.status.${league?.status}`)}
            </span>
          </div>
          <div className="flex gap-2">
            {[
              { key: 'publishLeague', from: ['draft'], label: 'publish', permission: 'leagues.edit' },
              { key: 'openRegistration', from: ['published'], label: 'open_reg', permission: 'leagues.edit' },
              { key: 'closeRegistration', from: ['registration_open'], label: 'close_reg', permission: 'leagues.edit' },
              { key: 'startLeague', from: ['registration_closed'], label: 'start', permission: 'leagues.edit' },
              { key: 'completeLeague', from: ['running'], label: 'complete', permission: 'leagues.edit' },
              { key: 'cancelLeague', from: ['published', 'registration_open', 'registration_closed', 'running'], label: 'cancel', permission: 'leagues.edit' },
              { key: 'archiveLeague', from: ['completed', 'cancelled'], label: 'archive', permission: 'leagues.edit' },
            ].filter((a) => a.from.includes(league?.status)).map((a) => (
              <Can key={a.key} permission={a.permission}>
                <button onClick={() => statusMutation.mutate({ action: a.key })}
                  className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
                  {t(`admin.league.action.${a.label}`)}
                </button>
              </Can>
            ))}
          </div>
        </div>

        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === tab.id ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3">
              <h3 className="font-semibold text-[var(--color-text)]">{t('admin.league.details.general')}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: t('admin.league.code'), value: league?.code },
                  { label: t('admin.league.format'), value: league?.format },
                  { label: t('admin.league.season'), value: league?.season_name },
                  { label: t('admin.league.sport'), value: league?.sport_name },
                  { label: t('admin.league.organisation'), value: league?.organisation_name },
                  { label: t('admin.league.max_teams'), value: league?.max_teams },
                  { label: t('admin.league.start_date'), value: league?.start_date?.slice(0, 10) },
                  { label: t('admin.league.end_date'), value: league?.end_date?.slice(0, 10) },
                  { label: t('admin.league.registration_deadline'), value: league?.registration_deadline?.slice(0, 10) },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs text-[var(--color-text-muted)]">{f.label}</p>
                    <p className="font-medium">{f.value || '-'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3">
              <h3 className="font-semibold text-[var(--color-text)]">{t('admin.league.details.description')}</h3>
              <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{league?.description || '-'}</p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3 md:col-span-2">
              <h3 className="font-semibold text-[var(--color-text)]">{t('admin.league.divisions')}</h3>
              {divisions && divisions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-[var(--color-text-muted)]">
                        <th className="text-left px-4 py-3">{t('admin.league.division.name')}</th>
                        <th className="text-center px-4 py-3">{t('admin.league.division.tier')}</th>
                        <th className="text-center px-4 py-3">{t('admin.league.division.capacity')}</th>
                        <th className="text-center px-4 py-3">{t('admin.league.division.advance_count')}</th>
                        <th className="text-center px-4 py-3">{t('admin.league.division.relegation_count')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divisions.map((d: any) => (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                          <td className="px-4 py-3 font-medium">{d.name}</td>
                          <td className="px-4 py-3 text-center text-xs">{d.tier ?? '-'}</td>
                          <td className="px-4 py-3 text-center text-xs">{d.capacity ?? '-'}</td>
                          <td className="px-4 py-3 text-center text-xs">{d.advance_count ?? '-'}</td>
                          <td className="px-4 py-3 text-center text-xs">{d.relegation_count ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('admin.league.teams')}</h2>
              <Can permission="leagues.edit">
                <button onClick={() => setShowRegisterModal(true)}
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
                  {t('admin.league.register_team')}
                </button>
              </Can>
            </div>
            {loadingT ? <SkeletonRow count={3} /> : (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-[var(--color-text-muted)]">
                      <th className="text-left px-4 py-3">{t('admin.league.team_name')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.division')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.status')}</th>
                      <th className="text-right px-4 py-3">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamsList.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
                    )}
                    {teamsList.map((t: any) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-3">{t.team_name || t.name || '-'}</td>
                        <td className="px-4 py-3 text-xs">{t.division_name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${TEAM_STATUS_COLORS[t.status] || ''}`}>
                            {t(`admin.league.team_status.${t.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {t.status === 'pending' && (
                            <Can permission="leagues.edit">
                              <button onClick={() => confirmTeamMutation.mutate(t.id)}
                                className="text-[10px] px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50 mr-1">
                                {t('admin.league.confirm')}
                              </button>
                            </Can>
                          )}
                          {t.status !== 'cancelled' && (
                            <Can permission="leagues.edit">
                              <button onClick={() => { if (window.confirm(t('admin.league.confirm_cancel_team'))) cancelTeamMutation.mutate(t.id); }}
                                className="text-[10px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
                                {t('admin.league.cancel')}
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
        )}

        {activeTab === 'fixtures' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('admin.league.fixtures')}</h2>
              <Can permission="leagues.edit">
                <button onClick={() => {
                  leagueApi.generateFixtures(leagueId).then(() => {
                    qc.invalidateQueries({ queryKey: ['league-matches', leagueId] });
                    showToast(t('admin.league.fixtures_generated'));
                  }).catch((err) => showToast(getErrorMessage(err), 'error'));
                }}
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
                  {t('admin.league.generate_fixtures')}
                </button>
              </Can>
            </div>
            {loadingM ? <SkeletonRow count={5} /> : (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-[var(--color-text-muted)]">
                      <th className="text-left px-4 py-3">{t('admin.league.match.round')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.match.match_no')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.match.home')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.match.away')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.match.court')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.match.referee')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.match.status')}</th>
                      <th className="text-left px-4 py-3">{t('admin.league.match.score')}</th>
                      <th className="text-right px-4 py-3">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchesList.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
                    )}
                    {matchesList.map((m: any) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-3 text-xs">{m.round ?? '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{m.match_number ?? m.match_no ?? '-'}</td>
                        <td className="px-4 py-3">{m.home_team_name || m.team1?.name || '-'}</td>
                        <td className="px-4 py-3">{m.away_team_name || m.team2?.name || '-'}</td>
                        <td className="px-4 py-3 text-xs">
                          {courtAssign.matchId === m.id ? (
                            <div className="flex gap-1">
                              <input type="number" value={courtAssign.resourceId} onChange={(e) => setCourtAssign((prev) => ({ ...prev, resourceId: e.target.value }))}
                                className="w-16 px-1 py-0.5 border rounded text-[10px]" placeholder="ID" />
                              <button onClick={() => assignCourtMutation.mutate()}
                                className="text-[10px] px-1 py-0.5 bg-[var(--color-primary)] text-white rounded">OK</button>
                              <button onClick={() => setCourtAssign({ matchId: 0, resourceId: '' })}
                                className="text-[10px] px-1 py-0.5 border rounded">X</button>
                            </div>
                          ) : (
                            <span>{m.court_name || m.resource_name || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {refereeAssign.matchId === m.id ? (
                            <div className="flex gap-1">
                              <input type="number" value={refereeAssign.refereeId} onChange={(e) => setRefereeAssign((prev) => ({ ...prev, refereeId: e.target.value }))}
                                className="w-16 px-1 py-0.5 border rounded text-[10px]" placeholder="ID" />
                              <button onClick={() => assignRefereeMutation.mutate()}
                                className="text-[10px] px-1 py-0.5 bg-[var(--color-primary)] text-white rounded">OK</button>
                              <button onClick={() => setRefereeAssign({ matchId: 0, refereeId: '' })}
                                className="text-[10px] px-1 py-0.5 border rounded">X</button>
                            </div>
                          ) : (
                            <span>{m.referee_name || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${MATCH_STATUS_COLORS[m.status] || ''}`}>
                            {t(`admin.league.match_status.${m.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{m.score || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Can permission="leagues.edit">
                              <button onClick={() => setCourtAssign({ matchId: m.id, resourceId: '' })}
                                className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                                {t('admin.league.assign_court')}
                              </button>
                              <button onClick={() => setRefereeAssign({ matchId: m.id, refereeId: '' })}
                                className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                                {t('admin.league.assign_referee')}
                              </button>
                              <button onClick={() => { setResultModal({ matchId: m.id, open: true }); setResultData({ score: m.score || '', winner_id: '', status: 'completed' }); }}
                                className="text-[10px] px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50">
                                {t('admin.league.record_result')}
                              </button>
                            </Can>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'standings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('admin.league.standings')}</h2>
              <Can permission="leagues.edit">
                <button onClick={() => recalculateStandingsMutation.mutate()}
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
                  {t('admin.league.recalculate')}
                </button>
              </Can>
            </div>
            {loadingS ? <SkeletonRow count={5} /> : (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-[var(--color-text-muted)]">
                      <th className="text-left px-4 py-3">#</th>
                      <th className="text-left px-4 py-3">{t('admin.league.team_name')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.standings.p')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.standings.w')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.standings.d')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.standings.l')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.standings.gf')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.standings.ga')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.standings.gd')}</th>
                      <th className="text-center px-4 py-3 font-bold">{t('admin.league.standings.pts')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsList.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
                    )}
                    {standingsList.map((s: any, i: number) => (
                      <tr key={s.id || i} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-3 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{s.team_name || s.name}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.played ?? s.p ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.won ?? s.w ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.drawn ?? s.d ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.lost ?? s.l ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.goals_for ?? s.gf ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.goals_against ?? s.ga ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.goal_difference ?? s.gd ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold">{s.points ?? s.pts ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'statistics' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('admin.league.statistics')}</h2>
              <Can permission="leagues.edit">
                <button onClick={() => recalculateStatsMutation.mutate()}
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
                  {t('admin.league.recalculate')}
                </button>
              </Can>
            </div>
            {loadingStats ? <SkeletonRow count={5} /> : (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-[var(--color-text-muted)]">
                      <th className="text-left px-4 py-3">{t('admin.league.statistics.player')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.statistics.matches')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.statistics.goals')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.statistics.assists')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.statistics.yellow_cards')}</th>
                      <th className="text-center px-4 py-3">{t('admin.league.statistics.red_cards')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsList.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
                    )}
                    {statsList.map((s: any) => (
                      <tr key={s.id || s.player_id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-3 font-medium">{s.player_name || s.name}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.matches_played ?? s.matches ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.goals ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.assists ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.yellow_cards ?? '-'}</td>
                        <td className="px-4 py-3 text-center text-xs">{s.red_cards ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <Modal open={showRegisterModal} onClose={() => setShowRegisterModal(false)}
          title={t('admin.league.register_team')} size="sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.team_id')}</label>
              <input type="number" value={registerTeamId} onChange={(e) => setRegisterTeamId(e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            </div>
            <button onClick={() => registerMutation.mutate()}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('admin.league.register')}
            </button>
          </div>
        </Modal>

        <Modal open={resultModal.open} onClose={() => setResultModal({ matchId: 0, open: false })}
          title={t('admin.league.record_result')} size="sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.match.score')}</label>
              <input value={resultData.score} onChange={(e) => setResultData((p) => ({ ...p, score: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" placeholder="e.g. 3-1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.match.winner_id')}</label>
              <input type="number" value={resultData.winner_id} onChange={(e) => setResultData((p) => ({ ...p, winner_id: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.match.status')}</label>
              <select value={resultData.status} onChange={(e) => setResultData((p) => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
                <option value="completed">{t('admin.league.match_status.completed')}</option>
                <option value="walkover">{t('admin.league.match_status.walkover')}</option>
                <option value="cancelled">{t('admin.league.match_status.cancelled')}</option>
              </select>
            </div>
            <button onClick={() => recordResultMutation.mutate()}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('admin.league.save_result')}
            </button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}
