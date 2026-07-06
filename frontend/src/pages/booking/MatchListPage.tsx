import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { formatDateTime } from '../../utils/formatDate';
import { formatPrice } from '../../utils/currency';
import { socketService } from '../../services/socket';

type Tab = 'new' | 'accepted' | 'pending' | 'expired';
type SortMode = 'date' | 'nearest';

const TABS: { key: Tab; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'pending', label: 'Pending' },
  { key: 'expired', label: 'Expired' },
];

export default function MatchListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('new');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [filterDate, setFilterDate] = useState('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {} // silently fail
      );
    }
  }, []);

  useEffect(() => {
    const invalidateMatches = () => {
      queryClient.invalidateQueries({ queryKey: ['public-matches'] });
    };
    socketService.on('match:available', invalidateMatches);
    socketService.on('match:removed', invalidateMatches);
    return () => {
      socketService.off('match:available', invalidateMatches);
      socketService.off('match:removed', invalidateMatches);
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
    queryFn: () => api.get('/matches', { params: queryParams }).then((r) => r.data),
  });

  const applyMutation = useMutation({
    mutationFn: (bookingId: number) => api.post(`/bookings/${bookingId}/apply`),
    onSuccess: (res) => {
      showToast(res.data.status === 'accepted'
        ? 'You have joined the match!'
        : 'Application sent! Awaiting approval.');
      queryClient.invalidateQueries({ queryKey: ['public-matches'] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to apply', 'error');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (invitationId: number) => api.delete(`/booking-invitations/${invitationId}`),
    onSuccess: () => {
      showToast('Application cancelled');
      queryClient.invalidateQueries({ queryKey: ['public-matches'] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to cancel', 'error');
    },
  });

  const allMatches = data?.data || [];

  const isExpired = (match: any) =>
    match.is_expired === 1
    || match.is_expired === true
    || (match.deadline && new Date(match.deadline) < new Date());

  const filtered = allMatches.filter((m: any) => {
    switch (tab) {
      case 'accepted':
        return m.invitation_status === 'accepted';
      case 'pending':
        return m.invitation_status === 'pending' && !isExpired(m);
      case 'expired':
        return isExpired(m) && m.invitation_status !== 'accepted';
      default:
        return (!m.invitation_id || m.invitation_status === 'declined') && !isExpired(m);
    }
  });

  const counts = {
    new: allMatches.filter((m: any) => (!m.invitation_id || m.invitation_status === 'declined') && !isExpired(m)).length,
    accepted: allMatches.filter((m: any) => m.invitation_status === 'accepted').length,
    pending: allMatches.filter((m: any) => m.invitation_status === 'pending' && !isExpired(m)).length,
    expired: allMatches.filter((m: any) => isExpired(m) && m.invitation_status !== 'accepted').length,
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
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
        >
          <option value="date">Sort by Date</option>
          <option value="nearest">Sort by Nearest</option>
        </select>
        {sortMode === 'nearest' && !userCoords && (
          <span className="text-xs text-[var(--color-text-muted)]">Enable location for distance sorting</span>
        )}
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
        {filtered.map((match: any) => (
          <div key={match.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-[var(--color-text)]">{match.resource_name}</h3>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)]">
                    Public
                  </span>
                  {match.auto_apply && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)]">
                      Auto-join
                    </span>
                  )}
                  {isExpired(match) && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
                      Expired
                    </span>
                  )}
                </div>

                <p className="text-sm text-[var(--color-text-muted)]">{match.organisation_name} · {match.branch_name}</p>

                <div className="flex gap-4 mt-2 text-xs text-[var(--color-text-muted)]">
                  <span>📅 {new Date(match.booking_date).toLocaleDateString('en-GB')}</span>
                  <span>⏰ {match.start_time?.slice(0, 5)} - {match.end_time?.slice(0, 5)}</span>
                  <span>💰 {formatPrice(Number(match.total_amount), match.currency_code)}</span>
                  {match.distance_km != null && (
                    <span>📍 {Number(match.distance_km).toFixed(0)} km</span>
                  )}
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
                  {match.max_players && (
                    <span>👥 {match.accepted_count || 0}/{match.max_players} joined</span>
                  )}
                  {match.deadline && (
                    <span>⏳ Until {formatDateTime(match.deadline)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4 shrink-0">
                {isExpired(match) ? (
                  match.invitation_status === 'accepted' ? (
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/bookings/${match.id}/confirmation`}
                        className="px-2 py-0.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] hover:opacity-90"
                      >
                        QR
                      </Link>
                      <span className="text-xs text-[var(--color-success)] font-medium">Joined</span>
                    </div>
                  ) : match.invitation_status === 'pending' ? (
                    <span className="text-xs text-[var(--color-text-muted)] font-medium">Expired</span>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)] font-medium">Expired</span>
                  )
                ) : match.invitation_id ? (
                  match.invitation_status === 'pending' ? (
                    <>
                      <span className="text-xs text-[var(--color-warning)] font-medium">Pending</span>
                      <button
                        onClick={() => cancelMutation.mutate(match.invitation_id)}
                        className="px-3 py-1.5 text-xs font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)] hover:opacity-90"
                      >
                        Cancel
                      </button>
                    </>
                  ) : match.invitation_status === 'accepted' ? (
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/bookings/${match.id}/confirmation`}
                        className="px-2 py-0.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] hover:opacity-90"
                      >
                        QR
                      </Link>
                      <span className="text-xs text-[var(--color-success)] font-medium">Joined</span>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)] font-medium">Declined</span>
                  )
                ) : (
                  <button
                    onClick={() => applyMutation.mutate(match.id)}
                    disabled={applyMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                  >
                    Apply
                  </button>
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
