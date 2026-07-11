import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { formatDateTime } from '../../utils/formatDate';
import { socketService } from '../../services/socket';

type Tab = 'discover' | 'applied' | 'joined' | 'dismissed' | 'history';
type SortMode = 'date' | 'nearest';

const TABS: { key: Tab; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'applied', label: 'Applied' },
  { key: 'joined', label: 'Joined' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'history', label: 'History' },
];

const DISMISSED_KEY = 'cz_dismissed_matches';

function getDismissedIds(): number[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; }
}
function addDismissedId(id: number) {
  const ids = getDismissedIds();
  if (!ids.includes(id)) { ids.push(id); localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)); }
}
function removeDismissedId(id: number) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(getDismissedIds().filter((i) => i !== id)));
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface MatchRow {
  id: number;
  type: string;
  status: string;
  sport_name: string;
  resource_name: string;
  branch_name: string;
  organisation_name: string;
  latitude: number | null;
  longitude: number | null;
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
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dismissedIds, setDismissedIds] = useState<number[]>(getDismissedIds);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['public-matches'] });
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
  if (sortMode === 'nearest' && userCoords) {
    queryParams.lat = String(userCoords.lat);
    queryParams.lng = String(userCoords.lng);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['public-matches', queryParams],
    queryFn: () => api.get('/matches', { params: queryParams }).then((r) => r.data.data),
  });

  const joinMutation = useMutation({
    mutationFn: (matchId: number) => api.post(`/matches/${matchId}/join`),
    onSuccess: () => { showToast('Joined! Awaiting approval.'); queryClient.invalidateQueries({ queryKey: ['public-matches'] }); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to join', 'error'),
  });

  const withdrawMutation = useMutation({
    mutationFn: (matchId: number) => api.post(`/matches/${matchId}/withdraw`),
    onSuccess: () => { showToast('Application withdrawn', 'info'); queryClient.invalidateQueries({ queryKey: ['public-matches'] }); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to withdraw', 'error'),
  });

  const rawMatches: MatchRow[] = data || [];

  const matchesWithDistance = useMemo(() =>
    rawMatches.map((m) => ({
      ...m,
      distance_km: userCoords && m.latitude && m.longitude
        ? haversineKm(userCoords.lat, userCoords.lng, m.latitude, m.longitude)
        : null,
    })),
  [rawMatches, userCoords]);

  const isExpired = (m: MatchRow) =>
    m.status === 'closed' || m.status === 'cancelled' || m.status === 'completed' || m.status === 'void'
    || (m.deadline && new Date(m.deadline) < new Date());

  const toggleDismiss = useCallback((matchId: number, dismissed: boolean) => {
    if (dismissed) { removeDismissedId(matchId); setDismissedIds((prev) => prev.filter((id) => id !== matchId)); }
    else { addDismissedId(matchId); setDismissedIds((prev) => [...prev, matchId]); }
  }, []);

  const filtered = useMemo(() => {
    const dismissed = dismissedIds;
    let list = matchesWithDistance.filter((m) => {
      switch (tab) {
        case 'discover': return !m.join_request_status && !m.is_participant && m.status === 'open' && !isExpired(m) && !dismissed.includes(m.id);
        case 'applied': return m.join_request_status === 'submitted' && !isExpired(m);
        case 'joined': return !!m.is_participant;
        case 'dismissed': return dismissed.includes(m.id) && m.status === 'open' && !isExpired(m) && !m.join_request_status && !m.is_participant;
        case 'history': return isExpired(m) || m.join_request_status === 'rejected' || m.join_request_status === 'withdrawn' || m.join_request_status === 'auto_rejected';
        default: return false;
      }
    });
    if (sortMode === 'nearest') {
      list.sort((a, b) => (a.distance_km ?? 99999) - (b.distance_km ?? 99999));
    } else {
      list.sort((a, b) => new Date((a.booking_date || '').slice(0, 10) + 'T' + (a.start_time || '00:00')).getTime() - new Date((b.booking_date || '').slice(0, 10) + 'T' + (b.start_time || '00:00')).getTime());
    }
    return list;
  }, [matchesWithDistance, tab, dismissedIds, sortMode]);

  const counts = useMemo(() => ({
    discover: matchesWithDistance.filter((m) => !m.join_request_status && !m.is_participant && m.status === 'open' && !isExpired(m) && !dismissedIds.includes(m.id)).length,
    applied: matchesWithDistance.filter((m) => m.join_request_status === 'submitted' && !isExpired(m)).length,
    joined: matchesWithDistance.filter((m) => !!m.is_participant).length,
    dismissed: matchesWithDistance.filter((m) => dismissedIds.includes(m.id) && m.status === 'open' && !isExpired(m)).length,
    history: matchesWithDistance.filter((m) => isExpired(m) || m.join_request_status === 'rejected' || m.join_request_status === 'withdrawn' || m.join_request_status === 'auto_rejected').length,
  }), [matchesWithDistance, dismissedIds]);

  if (isLoading) return <p className="text-[var(--color-text-muted)]">Loading matches...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-4">Matches</h1>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]" />
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
          <option value="date">Sort by Date</option>
          <option value="nearest">Sort by Nearest</option>
        </select>
        {sortMode === 'nearest' && !userCoords && (
          <span className="text-xs text-[var(--color-text-muted)]">Enable location for distance sorting</span>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              tab === t.key
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}>{t.label} ({counts[t.key]})</button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((match) => {
          const joinerCount = Math.max(0, match.participant_count);
          return (
          <div key={match.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-medium text-[var(--color-text)] truncate">{match.resource_name}</h3>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)] shrink-0">Public</span>
                  {match.auto_accept === 1 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)] shrink-0">Auto-accept</span>
                  )}
                </div>

                <p className="text-sm text-[var(--color-text-muted)] truncate">
                  {match.organisation_name} · {match.branch_name}
                  {(match as any).distance_km != null && Number((match as any).distance_km) < 99999 && (
                    <span> · {Number((match as any).distance_km).toFixed(0)} km</span>
                  )}
                </p>

                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-[var(--color-text-muted)]">
                  <span>📅 {new Date((match.booking_date || '').slice(0, 10)).toLocaleDateString('en-GB')}</span>
                  <span>⏰ {match.start_time?.slice(0, 5)} - {match.end_time?.slice(0, 5)}</span>
                  <span>👥 {joinerCount}/{Math.max(0, match.max_players - 1)}</span>
                </div>

                <div className="flex flex-wrap gap-2 mt-2 text-xs text-[var(--color-text-muted)]">
                  {match.target_gender && match.target_gender !== 'any' && <span className="capitalize">👤 {match.target_gender}</span>}
                  {match.min_age && match.max_age && <span>🎂 {match.min_age}-{match.max_age} yrs</span>}
                  {match.target_level_name && <span>🎯 {match.target_level_name}</span>}
                  {match.deadline && <span>⏳ Until {formatDateTime(match.deadline)}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4 shrink-0">
                {tab === 'discover' && (
                  <>
                    <button onClick={() => joinMutation.mutate(match.id)} disabled={joinMutation.isPending}
                      className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">Join</button>
                    <button onClick={() => toggleDismiss(match.id, false)}
                      className="px-2 py-1.5 text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] rounded-[var(--radius-md)] hover:text-[var(--color-text)]" title="Dismiss">✕</button>
                  </>
                )}
                {tab === 'applied' && (
                  <>
                    <span className="text-xs text-[var(--color-warning)] font-medium">Awaiting approval</span>
                    <button onClick={() => withdrawMutation.mutate(match.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)] hover:opacity-90">Withdraw</button>
                  </>
                )}
                {tab === 'joined' && (
                  <Link to={`/matches/${match.id}`}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">View</Link>
                )}
                {tab === 'dismissed' && (
                  <button onClick={() => toggleDismiss(match.id, true)}
                    className="px-3 py-1.5 text-xs font-medium border border-[var(--color-primary)] text-[var(--color-primary)] rounded-[var(--radius-md)] hover:bg-[var(--color-primary)]/10">Undo</button>
                )}
                {tab === 'history' && (
                  <span className="text-xs text-[var(--color-text-muted)]">{match.status}</span>
                )}
              </div>
            </div>
          </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">No matches in this tab</div>
        )}
      </div>
    </div>
  );
}
