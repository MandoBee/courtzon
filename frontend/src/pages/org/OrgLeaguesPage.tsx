import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function OrgLeaguesPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data: leagues, isLoading } = useQuery({
    queryKey: ['org-leagues', orgId],
    queryFn: () => api.get(`/org/${orgId}/leagues`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;

  const items: any[] = leagues || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Leagues</h1>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No leagues found.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((l: any) => (
            <div key={l.id} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[var(--color-text)]">{l.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {l.season_name}{l.division ? ` · ${l.division}` : ''}
                  </p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  l.status === 'running' || l.status === 'active'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : l.status === 'completed'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>{l.status}</span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-text-muted)]">
                {l.season_start && <span>Start: {new Date(l.season_start).toLocaleDateString()}</span>}
                {l.season_end && <span>End: {new Date(l.season_end).toLocaleDateString()}</span>}
                <span>Teams: {l.team_count || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
