import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from '../ui';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

interface ManageApplicantsPopupProps {
  open: boolean;
  bookingId: number;
  onClose: () => void;
}

interface JoinRequestItem {
  id: number;
  user_id: number;
  full_name: string;
  avatar_url: string | null;
  status: string;
  submitted_at: string;
  rejection_reason: string | null;
}

interface ParticipantItem {
  user_id: number;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

export default function ManageApplicantsPopup({ open, bookingId, onClose }: ManageApplicantsPopupProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['match-applicants', bookingId],
    queryFn: () => api.get(`/matches/${bookingId}/applicants`).then((r) => r.data.data),
    enabled: open && !!bookingId,
  });

  const respondMutation = useMutation({
    mutationFn: ({ requestId, action }: { requestId: number; action: 'approved' | 'rejected' }) =>
      api.post(`/matches/${bookingId}/applicants/${requestId}/${action === 'approved' ? 'approve' : 'reject'}`),
    onSuccess: (_data, variables) => {
      showToast(variables.action === 'approved' ? 'Applicant accepted!' : 'Applicant declined', 'success');
      queryClient.invalidateQueries({ queryKey: ['match-applicants', bookingId] });
      queryClient.invalidateQueries({ queryKey: ['match', String(bookingId)] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to respond', 'error');
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/matches/${bookingId}/close`),
    onSuccess: () => {
      showToast('Applications closed', 'success');
      queryClient.invalidateQueries({ queryKey: ['match-applicants', bookingId] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to close', 'error');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/matches/${bookingId}/cancel`),
    onSuccess: () => {
      showToast('Match cancelled', 'warning');
      onClose();
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to cancel', 'error');
    },
  });

  const joinRequests: JoinRequestItem[] = data?.joinRequests || [];
  const participants: ParticipantItem[] = data?.participants || [];

  const pendingRequests = joinRequests.filter((r: JoinRequestItem) => r.status === 'submitted');
  const declinedRequests = joinRequests.filter((r: JoinRequestItem) => r.status === 'rejected' || r.status === 'auto_rejected');

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <h2 className="text-xl font-bold text-[var(--color-text)] mb-6">Manage Applicants</h2>

      {isLoading && <p className="text-[var(--color-text-muted)]">Loading...</p>}

      {!isLoading && (
        <>
          {participants.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
                Joined Players ({participants.length})
              </h3>
              <div className="space-y-2">
                {participants.map((p: ParticipantItem, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-[var(--color-success-bg)] rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center text-sm font-medium text-[var(--color-success-text)]">
                      {p.full_name?.[0] || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{p.full_name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{p.role === 'host' ? 'Host' : 'Joiner'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
            Pending Applications ({pendingRequests.length})
          </h3>

          {pendingRequests.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)] mb-4">No pending applications.</p>
          )}

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {pendingRequests.map((applicant: JoinRequestItem) => (
              <div key={applicant.id} className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-surface)] flex items-center justify-center text-sm font-medium text-[var(--color-text)]">
                    {applicant.full_name?.[0] || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{applicant.full_name || 'Unknown'}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Applied {new Date(applicant.submitted_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respondMutation.mutate({ requestId: applicant.id, action: 'approved' })}
                    disabled={respondMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary)] disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respondMutation.mutate({ requestId: applicant.id, action: 'rejected' })}
                    disabled={respondMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium bg-[var(--color-error-bg)] text-[var(--color-error-text)] rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>

          {declinedRequests.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
                Declined ({declinedRequests.length})
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {declinedRequests.map((applicant: JoinRequestItem) => (
                  <div key={applicant.id} className="flex items-center gap-3 px-3 py-2 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-red-200 dark:bg-red-800 flex items-center justify-center text-sm font-medium text-[var(--color-error-text)]">
                      {applicant.full_name?.[0] || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{applicant.full_name || 'Unknown'}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {applicant.status === 'rejected' ? 'Rejected' : 'Auto-rejected'}
                        {applicant.rejection_reason && `: ${applicant.rejection_reason}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex justify-between pt-6 border-t border-[var(--color-border)] mt-4">
        <div className="flex gap-2">
          <Button variant="danger" type="button" onClick={() => { if (confirm('Cancel this match?')) cancelMutation.mutate(); }}>
            Cancel Match
          </Button>
          <Button variant="ghost" type="button" onClick={() => closeMutation.mutate()}>
            Close Applications
          </Button>
        </div>
        <Button variant="ghost" type="button" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
