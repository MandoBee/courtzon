import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function OrgVerificationPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['org-verification', orgId],
    queryFn: () => api.get(`/org/${orgId}/verification`).then((r) => r.data),
    enabled: !!orgId,
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;
  if (!data) return <div className="text-[var(--color-text-muted)]">No verification data found.</div>;

  const org = data.org;
  const documents: any[] = data.documents || [];
  const history: any[] = data.history || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Verification</h1>

      <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${
            org.is_verified
              ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
          }`}>
            {org.is_verified ? '✓' : '!'}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {org.is_verified ? 'Verified' : 'Not Verified'}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {org.is_verified
                ? org.verified_at ? `Verified on ${new Date(org.verified_at).toLocaleDateString()}` : 'This organisation is verified'
                : 'This organisation has not been verified yet'}
            </p>
            {org.verification_status && (
              <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                org.verification_status === 'approved'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : org.verification_status === 'pending' || org.verification_status === 'submitted'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              }`}>{org.verification_status}</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No documents uploaded.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between text-sm bg-[var(--color-bg)] rounded-md px-3 py-2">
                <span className="text-[var(--color-text)]">{d.file_name || d.original_name || `Document #${d.id}`}</span>
                {d.created_at && <span className="text-xs text-[var(--color-text-muted)]">{new Date(d.created_at).toLocaleDateString()}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Verification History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No verification history.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between text-sm bg-[var(--color-bg)] rounded-md px-3 py-2">
                <div>
                  <span className="text-[var(--color-text)]">{h.action || h.status || 'Update'}</span>
                  {h.notes && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{h.notes}</p>}
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">{h.created_at ? new Date(h.created_at).toLocaleDateString() : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
