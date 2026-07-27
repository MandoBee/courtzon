import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function OrgTournamentsPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['org-tournaments', orgId],
    queryFn: () => api.get(`/org/${orgId}/tournaments`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;

  const items: any[] = tournaments || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Tournaments</h1>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No tournaments found.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((t: any) => (
            <div key={t.id} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[var(--color-text)]">{t.name}</p>
                  {t.format && <p className="text-xs text-[var(--color-text-muted)]">{t.format}</p>}
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  t.status === 'running' || t.status === 'active'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : t.status === 'completed'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    : t.status === 'registration_open'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>{t.status}</span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-text-muted)]">
                {t.start_date && <span>Start: {new Date(t.start_date).toLocaleDateString()}</span>}
                {t.end_date && <span>End: {new Date(t.end_date).toLocaleDateString()}</span>}
                <span>Registered: {t.registered_count || 0}</span>
                {t.max_players && <span>Max: {t.max_players}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
