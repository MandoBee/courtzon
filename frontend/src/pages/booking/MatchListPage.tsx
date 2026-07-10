import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { formatDateTime } from '../../utils/formatDate';
import { socketService } from '../../services/socket';

type Tab = 'discover' | 'applied' | 'joined' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'applied', label: 'Applied' },
  { key: 'joined', label: 'Joined' },
  { key: 'history', label: 'History' },
];

interface MatchRow {
  id: number;
  type: string;
  status: string;
  sport_name: string;
  resource_name: string;
  branch_name: string;
  organisation_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  auto_accept: number;
  max_players: number;
  participant_count: number;
  target_gender: string | null;
  min_age: number | null;
  max_age: number | null;
  target_level_name: string | null;
  deadline: string | null;
  invitation_id: number | null;
  invitation_status: string | null;
  join_request_id: number | null;
  join_request_status: string | null;
  is_participant: number;
}

export default function MatchListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('discover');
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['public-matches'] });
    };
    socketService.on('match:available', invalidate);
    socketService.on('match:updated', invalidate);
    socketService.on('match:removed', invalidate);
    return () => {
      socketService.off('match:available', invalidate);
      socketService.off('match:updated', invalidate);
      socketService.off('match:removed', invalidate);
    };
  }, [queryClient]);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['public-matches'] });
  }, [tab, queryClient]);

  const queryParams: Record<string, string> = {};
  if (filterDate) queryParams.date = filterDate;

  const { data, isLoading } = useQuery({
    queryKey: ['public-matches', queryParams],
    queryFn: () => api.get('/matches', { params: queryParams }).then((r) => r.data.data),
  });

  const joinMutation = useMutation({
    mutationFn: (matchId: number) => api.post(`/matches/${matchId}/join`),
    onSuccess: () => {
      showToast('Joined! Awaiting approval.');
      queryClient.invalidateQueries({ queryKey: ['public-matches'] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to join', 'error');
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: (matchId: number) => api.post(`/matches/${matchId}/withdraw`),
    onSuccess: () => {
      showToast('Application withdrawn', 'info');
      queryClient.invalidateQueries({ queryKey: ['public-matches'] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to withdraw', 'error');
    },
  });

  const allMatches: MatchRow[] = data || [];

  const isExpired = (m: MatchRow) =>
    m.status === 'closed' || m.status === 'cancelled' || m.status === 'completed' || m.status === 'void'
    || (m.deadline && new Date(m.deadline) < new Date());

  const filtered = allMatches.filter((m) => {
    switch (tab) {
      case 'discover':
        return !m.join_request_status && !m.is_participant
          && m.status === 'open' && !isExpired(m);
      case 'applied':
        return m.join_request_status === 'submitted' && !isExpired(m);
      case 'joined':
        return !!m.is_participant;
      case 'history':
        return isExpired(m) || m.join_request_status === 'rejected'
          || m.join_request_status === 'withdrawn' || m.join_request_status === 'auto_rejected';
      default:
        return false;
    }
  });

  const counts = {
    discover: allMatches.filter((m) => !m.join_request_status && !m.is_participant && m.status === 'open' && !isExpired(m)).length,
    applied: allMatches.filter((m) => m.join_request_status === 'submitted' && !isExpired(m)).length,
    joined: allMatches.filter((m) => !!m.is_participant).length,
    history: allMatches.filter((m) => isExpired(m) || m.join_request_status === 'rejected' || m.join_request_status === 'withdrawn' || m.join_request_status === 'auto_rejected').length,
  };

  if (isLoading) return <p className="text-[var(--color-text-muted)]">Loading matches...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-4">Matches</h1>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              tab === t.key
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((match) => (
          <div key={match.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-[var(--color-text)]">{match.resource_name}</h3>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)]">Public</span>
                  {match.auto_accept === 1 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)]">Auto-accept</span>
                  )}
                </div>

                <p className="text-sm text-[var(--color-text-muted)]">{match.organisation_name} · {match.branch_name}</p>

                <div className="flex gap-4 mt-2 text-xs text-[var(--color-text-muted)]">
                  <span>📅 {new Date(match.booking_date).toLocaleDateString('en-GB')}</span>
                  <span>⏰ {match.start_time?.slice(0, 5)} - {match.end_time?.slice(0, 5)}</span>
                  <span>👥 {match.participant_count}/{match.max_players}</span>
                </div>

                <div className="flex flex-wrap gap-2 mt-2 text-xs text-[var(--color-text-muted)]">
                  {match.target_gender && match.target_gender !== 'any' && (
                    <span className="capitalize">👤 {match.target_gender}</span>
                  )}
                  {match.min_age && match.max_age && (
                    <span>🎂 {match.min_age}-{match.max_age} yrs</span>
                  )}
                  {match.target_level_name && (
                    <span>🎯 {match.target_level_name}</span>
                  )}
                  {match.deadline && (
                    <span>⏳ Until {formatDateTime(match.deadline)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4 shrink-0">
                {tab === 'discover' && (
                  <button
                    onClick={() => joinMutation.mutate(match.id)}
                    disabled={joinMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                  >
                    Join
                  </button>
                )}
                {tab === 'applied' && (
                  <>
                    <span className="text-xs text-[var(--color-warning)] font-medium">Awaiting approval</span>
                    <button
                      onClick={() => withdrawMutation.mutate(match.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)] hover:opacity-90"
                    >
                      Withdraw
                    </button>
                  </>
                )}
                {tab === 'joined' && (
                  <Link
                    to={`/matches/${match.id}`}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90"
                  >
                    View
                  </Link>
                )}
                {tab === 'history' && (
                  <span className="text-xs text-[var(--color-text-muted)]">{match.status}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
            No matches in this tab
          </div>
        )}
      </div>
    </div>
  );
}
