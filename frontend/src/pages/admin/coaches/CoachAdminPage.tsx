import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

export default function CoachAdminPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-coaches', page],
    queryFn: () => api.get(`/admin/coaches?page=${page}&limit=20`).then((r: any) => r.data),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/coaches/${id}/verify`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-coaches'] }); showToast('Coach verified!'); },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/coaches/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-coaches'] }); showToast('Toggled!'); },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/coaches/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-coaches'] }); showToast('Deleted!'); },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const approveMutation = useMutation({
    mutationFn: (userId: number) => api.patch(`/admin/users/${userId}/coach/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-coaches'] }); showToast('Coach application approved!'); },
    onError: (err: any) => showToast('Failed to approve: ' + getErrorMessage(err), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (userId: number) => api.patch(`/admin/users/${userId}/coach/reject`, { reason: '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-coaches'] }); showToast('Coach application rejected.'); },
    onError: (err: any) => showToast('Failed to reject: ' + getErrorMessage(err), 'error'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text)]">Coaches (Admin)</h1>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-center px-3 py-2">Status</th>
              <th className="text-center px-3 py-2">Rating</th>
              <th className="text-center px-3 py-2">Verified</th>
              <th className="text-center px-3 py-2">Available</th>
              <th className="text-left px-3 py-2">Experience</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-4 text-xs text-[var(--color-text-muted)]">Loading...</td></tr>}
            {data?.data?.map((c: any) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-[var(--color-bg)] text-[var(--color-text)]">
                <td className="px-3 py-2 font-medium">{c.full_name || '-'}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{c.email || '-'}</td>
                <td className="px-3 py-2 text-center">
                  {c.coach_status === 'pending' ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] font-medium">Pending</span>
                  ) : c.coach_status === 'approved' ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success-text)] font-medium">Active</span>
                  ) : c.coach_status === 'rejected' ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] font-medium">Rejected</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text-muted)] font-medium">None</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-xs">{c.rating_avg ? `${Number(c.rating_avg).toFixed(1)} (${c.rating_count})` : '-'}</td>
                <td className="px-3 py-2 text-center"><span className={`inline-block w-2 h-2 rounded-full ${c.is_verified ? 'bg-[var(--color-success)]' : 'bg-yellow-300'}`} /></td>
                <td className="px-3 py-2 text-center"><span className={`inline-block w-2 h-2 rounded-full ${c.is_available ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`} /></td>
                <td className="px-3 py-2 text-xs">{c.experience_years ? `${c.experience_years} yrs` : '-'}</td>
                <td className="px-3 py-2 text-right">
                  {c.coach_status === 'pending' && (
                    <Can permission="coaches.approve">
                      <button onClick={() => approveMutation.mutate(c.user_id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:opacity-80 mr-1">Approve</button>
                      <button onClick={() => { if (confirm('Reject this coach application?')) rejectMutation.mutate(c.user_id); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80 mr-1">Reject</button>
                    </Can>
                  )}
                  {!c.is_verified && c.coach_status === 'approved' && (
                    <Can permission="coaches.verify">
                      <button onClick={() => verifyMutation.mutate(c.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:opacity-80 mr-1">Verify</button>
                    </Can>
                  )}
                  <Can permission="coaches.toggle">
                    <button onClick={() => toggleMutation.mutate(c.id)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)] mr-1">{c.is_available ? 'Disable' : 'Enable'}</button>
                  </Can>
                  <Can permission="coaches.delete">
                    <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(c.id); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80">Delete</button>
                  </Can>
                </td>
              </tr>
            ))}
            {data?.data?.length === 0 && <tr><td colSpan={8} className="text-center py-4 text-xs text-[var(--color-text-muted)]">No coaches.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.total > data.limit && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Prev</button>
          <span className="px-2 py-1 text-xs text-[var(--color-text-muted)]">Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
          <button disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
