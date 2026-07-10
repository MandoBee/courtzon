import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { formatDateTime } from '../../utils/formatDate';
import ManageApplicantsPopup from '../../components/booking/ManageApplicantsPopup';

export default function MatchLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showApplicants, setShowApplicants] = useState(false);

  const { data: match, isLoading } = useQuery({
    queryKey: ['match', id],
    queryFn: () => api.get(`/matches/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/matches/${id}/join`),
    onSuccess: () => {
      showToast('Joined! Awaiting approval.');
      queryClient.invalidateQueries({ queryKey: ['match', id] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to join', 'error');
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => api.post(`/matches/${id}/withdraw`),
    onSuccess: () => {
      showToast('Application withdrawn', 'info');
      queryClient.invalidateQueries({ queryKey: ['match', id] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to withdraw', 'error');
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/matches/${id}/close`),
    onSuccess: () => {
      showToast('Applications closed', 'success');
      queryClient.invalidateQueries({ queryKey: ['match', id] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to close', 'error');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/matches/${id}/cancel`),
    onSuccess: () => {
      showToast('Match cancelled', 'warning');
      navigate('/matches');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to cancel', 'error');
    },
  });

  if (isLoading) return <p className="text-[var(--color-text-muted)]">Loading...</p>;
  if (!match) return <p className="text-[var(--color-text-muted)]">Match not found</p>;

  const participants = match.participants_json ? JSON.parse(match.participants_json) : [];
  const isCreator = false;

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
      full: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
      closed: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
      in_progress: 'bg-[var(--color-primary-bg)] text-[var(--color-primary-text)]',
      completed: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
      cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
    };
    return `px-2 py-0.5 text-xs rounded-full ${colors[status] || ''}`;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{match.resource_name}</h1>
        <span className={getStatusBadge(match.status)}>{match.status}</span>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-2">Match Details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-[var(--color-text-muted)]">Sport:</span> {match.sport_name}</div>
          <div><span className="text-[var(--color-text-muted)]">Venue:</span> {match.organisation_name}</div>
          <div><span className="text-[var(--color-text-muted)]">Branch:</span> {match.branch_name}</div>
          <div><span className="text-[var(--color-text-muted)]">Date:</span> {new Date(match.booking_date).toLocaleDateString('en-GB')}</div>
          <div><span className="text-[var(--color-text-muted)]">Time:</span> {match.start_time?.slice(0, 5)} - {match.end_time?.slice(0, 5)}</div>
          <div><span className="text-[var(--color-text-muted)]">Capacity:</span> {match.participant_count}/{match.max_players}</div>
          {match.auto_accept === 1 && <div><span className="text-[var(--color-success-text)]">Auto-accept enabled</span></div>}
          {match.deadline && <div><span className="text-[var(--color-text-muted)]">Deadline:</span> {formatDateTime(match.deadline)}</div>}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-2">Participants ({participants.length})</h2>
        {participants.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No participants yet. Be the first to join!</p>
        ) : (
          <div className="space-y-2">
            {participants.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]"></span>
                <span className="text-[var(--color-text)]">
                  {p.role === 'host' ? 'Host' : 'Player'} (ID: {p.userId})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {match.status === 'open' && !isCreator && (
          <button
            onClick={() => joinMutation.mutate()}
            disabled={joinMutation.isPending}
            className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
          >
            Join Match
          </button>
        )}
        {match.status === 'open' && (
          <button
            onClick={() => withdrawMutation.mutate()}
            disabled={withdrawMutation.isPending}
            className="px-4 py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] hover:bg-[var(--color-surface-muted)]"
          >
            Withdraw
          </button>
        )}
        {isCreator && (
          <>
            <button
              onClick={() => setShowApplicants(true)}
              className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90"
            >
              Manage Applicants
            </button>
            {match.status === 'open' && (
              <button
                onClick={() => closeMutation.mutate()}
                className="px-4 py-2 text-sm font-medium border border-[var(--color-warning)] text-[var(--color-warning)] rounded-[var(--radius-md)] hover:bg-[var(--color-warning)]/10"
              >
                Close Applications
              </button>
            )}
            <button
              onClick={() => { if (confirm('Cancel this match?')) cancelMutation.mutate(); }}
              className="px-4 py-2 text-sm font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)] hover:opacity-90"
            >
              Cancel Match
            </button>
          </>
        )}
      </div>

      <ManageApplicantsPopup
        open={showApplicants}
        bookingId={Number(id)}
        onClose={() => setShowApplicants(false)}
      />
    </div>
  );
}
