import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from '../ui';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

interface ManageApplicantsPopupProps {
  open: boolean;
  bookingId: number;
  onClose: () => void;
}

export default function ManageApplicantsPopup({ open, bookingId, onClose }: ManageApplicantsPopupProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['booking-applicants', bookingId],
    queryFn: () => api.get(`/bookings/${bookingId}/applicants`).then((r) => r.data),
    enabled: open && !!bookingId,
  });

  const respondMutation = useMutation({
    mutationFn: ({ invitationId, action }: { invitationId: number; action: 'accepted' | 'declined' }) =>
      api.post(`/booking-invitations/${invitationId}/respond`, { action }),
    onSuccess: (_data, variables) => {
      showToast(variables.action === 'accepted' ? 'Applicant accepted!' : 'Applicant declined', 'success');
      queryClient.invalidateQueries({ queryKey: ['booking-applicants', bookingId] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to respond', 'error');
    },
  });

  const applicants = data?.applicants || [];
  const joined = data?.joined || [];
  const pendingApplicants = applicants.filter((a: any) => a.status === 'pending');
  const declinedApplicants = applicants.filter((a: any) => a.status === 'declined');

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <h2 className="text-xl font-bold text-[var(--color-text)] mb-6">Manage Applicants</h2>

      {isLoading && <p className="text-[var(--color-text-muted)]">Loading...</p>}

      {!isLoading && joined.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
            Joined Players ({joined.length})
          </h3>
          <div className="space-y-2">
            {joined.map((player: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-[var(--color-success-bg)] rounded-lg">
                <div className="w-8 h-8 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center text-sm font-medium text-[var(--color-success-text)] dark:text-green-300">
                  {player.full_name?.[0] || '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{player.full_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {player.gender && <span className="capitalize">{player.gender}</span>}
                    {player.level_name && <span> · {player.level_name}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
        {pendingApplicants.length > 0 ? `Pending Applications (${pendingApplicants.length})` : 'Pending Applications'}
      </h3>

      {!isLoading && pendingApplicants.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] mb-4">No pending applications.</p>
      )}

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {pendingApplicants.map((applicant: any) => (
          <div key={applicant.id} className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--color-surface)] flex items-center justify-center text-sm font-medium text-[var(--color-text)]">
                {applicant.full_name?.[0] || '?'}
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">{applicant.full_name || 'Unknown'}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {applicant.gender && <span className="capitalize">{applicant.gender}</span>}
                  {applicant.level_name && <span> · {applicant.level_name}</span>}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => respondMutation.mutate({ invitationId: applicant.id, action: 'accepted' })}
                disabled={respondMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary)] disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => respondMutation.mutate({ invitationId: applicant.id, action: 'declined' })}
                disabled={respondMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>

      {declinedApplicants.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 mt-4">
            Declined ({declinedApplicants.length})
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {declinedApplicants.map((applicant: any) => (
              <div key={applicant.id} className="flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-200 dark:bg-red-800 flex items-center justify-center text-sm font-medium text-[var(--color-error-text)] dark:text-red-300">
                    {applicant.full_name?.[0] || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{applicant.full_name || 'Unknown'}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {applicant.gender && <span className="capitalize">{applicant.gender}</span>}
                      {applicant.level_name && <span> · {applicant.level_name}</span>}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => respondMutation.mutate({ invitationId: applicant.id, action: 'accepted' })}
                  disabled={respondMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary)] disabled:opacity-50"
                >
                  Re-accept
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-end pt-6 border-t border-[var(--color-border)] mt-4">
        <Button variant="ghost" type="button" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
