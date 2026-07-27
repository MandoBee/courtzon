import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { EntityImage } from '../../components/ui';

export default function OrgRefereesPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data: referees, isLoading } = useQuery({
    queryKey: ['org-referees', orgId],
    queryFn: () => api.get(`/org/${orgId}/referees`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;

  const items: any[] = referees || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Referees</h1>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No referees found.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((r: any) => (
            <div key={r.id} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)] flex items-center gap-4">
              <EntityImage src={r.avatar_url} name={r.full_name || 'Referee'} className="w-10 h-10 rounded-full text-sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--color-text)]">{r.full_name || '—'}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                {r.sport_name && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Sport: {r.sport_name}</p>}
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                r.referee_status === 'active' || r.referee_status === 'approved'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>
                {r.referee_status || 'unknown'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
