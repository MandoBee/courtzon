import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Modal } from '../../../components/ui/Modal';
import { GeneratedRules } from '../../../components/tournaments/GeneratedRules';
import { PrizeList } from '../../../components/tournaments/PrizeList';
import { tournamentApi, orgTournamentApi } from '../../../services/tournament';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-blue-100 text-blue-700',
  registration_open: 'bg-green-100 text-green-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

const REG_STATUS_COLORS: Record<string, string> = {
  registered: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  withdrawn: 'bg-red-100 text-red-700',
  disqualified: 'bg-gray-100 text-gray-700',
};

const MATCH_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  walkover: 'bg-purple-100 text-purple-700',
};

type TabId = 'overview' | 'groups' | 'matches' | 'standings';

export type TournamentDetailContextMode = 'admin' | 'org';

interface Props {
  mode?: TournamentDetailContextMode;
  orgId?: string;
}

/**
 * ONE SHARED tournament detail screen (overview / groups / matches / standings
 * tabs + registration management). Renders identically in the Super Admin
 * workbench and the Org Admin portal; only the API, permissions and query keys
 * are tenant/context aware.
 */
export default function TournamentDetailPage({ mode = 'admin', orgId }: Props) {
  const { id } = useParams<{ id: string }>();
  const tournamentId = Number(id);
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const isOrg = mode === 'org';
  const api = isOrg && orgId ? orgTournamentApi : tournamentApi;
  const keyRoot = isOrg ? `org-${orgId}-tournament` : 'tournament';
  const perms = isOrg
    ? { page: 'org.tournaments.view' as string, edit: 'org.tournaments.update' as string, register: 'org.tournaments.register' as string }
    : { page: 'admin-tournaments.view' as string, edit: 'tournaments.edit' as string, register: 'tournaments.edit' as string };

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerPlayerId, setRegisterPlayerId] = useState('');
  const [registerTeamId, setRegisterTeamId] = useState('');
  const [groupSize, setGroupSize] = useState(4);
  const [advanceCount, setAdvanceCount] = useState(2);

  const getT = (fn: (...args: any[]) => any, ...a: any[]) =>
    isOrg && orgId ? fn(orgId, ...a) : fn(...a);

  const { data: tournament, isLoading: loadingT } = useQuery({
    queryKey: [keyRoot, tournamentId],
    queryFn: () => getT(api.getTournament, tournamentId),
  });

  const { data: groups, isLoading: loadingG } = useQuery({
    queryKey: [`${keyRoot}-groups`, tournamentId],
    queryFn: () => getT(api.getGroups, tournamentId),
    enabled: activeTab === 'groups',
  });

  const { data: matches, isLoading: loadingM } = useQuery({
    queryKey: [`${keyRoot}-matches`, tournamentId],
    queryFn: () => getT(api.getMatches, tournamentId),
    enabled: activeTab === 'matches',
  });

  const { data: standings, isLoading: loadingS } = useQuery({
    queryKey: [`${keyRoot}-standings`, tournamentId],
    queryFn: () => getT(api.getStandings, tournamentId),
    enabled: activeTab === 'standings',
  });

  const { data: registrations, isLoading: loadingR } = useQuery({
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

  if (loadingT) return <div className="p-6"><SkeletonRow count={3} /></div>;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: t('tournaments.tab.overview') },
    { id: 'groups', label: t('tournaments.tab.groups') },
    { id: 'matches', label: t('tournaments.tab.matches') },
    { id: 'standings', label: t('tournaments.tab.standings') },
  ];

  return (
    <Can permission={perms.page}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{tournament?.name}</h1>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[tournament?.status] || ''}`}>
              {t(`tournaments.status.${tournament?.status}`)}
            </span>
          </div>
          <div className="flex gap-2">
            {[
              { key: 'publish', from: ['draft'] },
              { key: 'openRegistration', from: ['published'], label: 'open_reg' },
              { key: 'closeRegistration', from: ['registration_open'], label: 'close_reg' },
              { key: 'start', from: ['registration_closed'] },
              { key: 'complete', from: ['running'] },
              { key: 'cancel', from: ['published', 'registration_open', 'registration_closed', 'running'] },
              { key: 'archive', from: ['completed', 'cancelled'] },
            ].filter((a) => a.from.includes(tournament?.status)).map((a) => (
              <Can key={a.key} permission={perms.edit}>
                <button onClick={() => statusMutation.mutate({ action: a.key })}
                  className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
                  {t(`tournaments.action.${a.label || a.key}`)}
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
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3">
              <h3 className="font-semibold text-[var(--color-text)]">{t('tournaments.details.description')}</h3>
              <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{tournament?.description || '-'}</p>
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
          </div>
        )}

        {activeTab === 'groups' && (
          <div className="space-y-4">
            <Can permission={perms.edit}>
              <div className="flex items-center gap-3 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                <div>
                  <label className="text-xs text-[var(--color-text-muted)]">{t('tournaments.group_size')}</label>
                  <input type="number" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))}
                    className="w-20 px-2 py-1 border rounded text-sm" min={2} />
                </div>
                <div>
                  <label className="text-xs text-[var(--color-text-muted)]">{t('tournaments.advance_count')}</label>
                  <input type="number" value={advanceCount} onChange={(e) => setAdvanceCount(Number(e.target.value))}
                    className="w-20 px-2 py-1 border rounded text-sm" min={1} />
                </div>
                <button onClick={() => generateGroupsMutation.mutate()}
                  className="mt-4 px-4 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm">
                  {t('tournaments.generate_groups')}
                </button>
              </div>
            </Can>
            {loadingG ? <SkeletonRow count={3} /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(groups ?? []).map((g: any) => (
                  <div key={g.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                    <h4 className="font-semibold text-sm text-[var(--color-text)] mb-2">{g.name}</h4>
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
        )}

        {activeTab === 'matches' && (
          <div>
            {loadingM ? <SkeletonRow count={5} /> : (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-[var(--color-text-muted)]">
                      <th className="text-left px-4 py-3">{t('tournaments.match.round')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.match_no')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.player1')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.player2')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.court')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.referee')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.status')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.score')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(matches ?? []).map((m: any) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-3 text-xs">{m.round ?? '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{m.match_number ?? m.match_no ?? '-'}</td>
                        <td className="px-4 py-3">{m.player1_name || m.player1?.name || (m.player1_id ? `Player #${m.player1_id}` : '-')}</td>
                        <td className="px-4 py-3">{m.player2_name || m.player2?.name || (m.player2_id ? `Player #${m.player2_id}` : '-')}</td>
                        <td className="px-4 py-3 text-xs">{m.court_name || m.resource_name || '-'}</td>
                        <td className="px-4 py-3 text-xs">{m.referee_name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${MATCH_STATUS_COLORS[m.status] || ''}`}>
                            {t(`tournaments.match_status.${m.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{m.score_summary || m.score || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'standings' && (
          <div>
            {loadingS ? <SkeletonRow count={5} /> : (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-[var(--color-text-muted)]">
                      <th className="text-left px-4 py-3">#</th>
                      <th className="text-left px-4 py-3">{t('tournaments.player')}</th>
                      <th className="text-center px-4 py-3">{t('tournaments.standings.p')}</th>
                      <th className="text-center px-4 py-3">{t('tournaments.standings.w')}</th>
                      <th className="text-center px-4 py-3">{t('tournaments.standings.l')}</th>
                      <th className="text-center px-4 py-3">{t('tournaments.standings.pts')}</th>
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

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('tournaments.registrations')}</h2>
            <Can permission={perms.register}>
              <button onClick={() => setShowRegisterModal(true)}
                className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
                {t('tournaments.register_player')}
              </button>
            </Can>
          </div>
          {loadingR ? <SkeletonRow count={3} /> : (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-[var(--color-text-muted)]">
                    <th className="text-left px-4 py-3">{t('tournaments.player')}</th>
                    <th className="text-left px-4 py-3">{t('tournaments.team')}</th>
                    <th className="text-left px-4 py-3">{t('tournaments.status')}</th>
                    <th className="text-right px-4 py-3">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(registrations ?? []).map((r: any) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                      <td className="px-4 py-3">{r.player_name || r.player?.name || '-'}</td>
                      <td className="px-4 py-3 text-xs">{r.team_name || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${REG_STATUS_COLORS[r.status] || ''}`}>
                          {t(`tournaments.reg_status.${r.status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === 'registered' && (
                          <Can permission={perms.register}>
                            <button onClick={() => confirmRegMutation.mutate(r.id)}
                              className="text-[10px] px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50 mr-1">
                              {t('tournaments.confirm')}
                            </button>
                          </Can>
                        )}
                        {['registered', 'confirmed'].includes(r.status) && (
                          <Can permission={perms.register}>
                            <button onClick={() => { if (window.confirm(t('tournaments.confirm_cancel_reg'))) cancelRegMutation.mutate(r.id); }}
                              className="text-[10px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
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

        <Modal open={showRegisterModal} onClose={() => setShowRegisterModal(false)}
          title={t('tournaments.register_player')} size="sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('tournaments.player_id')}</label>
              <input type="number" value={registerPlayerId} onChange={(e) => setRegisterPlayerId(e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('tournaments.team_id_optional')}</label>
              <input type="number" value={registerTeamId} onChange={(e) => setRegisterTeamId(e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            </div>
            <button onClick={() => registerMutation.mutate()}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('tournaments.register')}
            </button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}