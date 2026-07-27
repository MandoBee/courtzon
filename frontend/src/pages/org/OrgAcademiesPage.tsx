import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function OrgAcademiesPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data: programs, isLoading } = useQuery({
    queryKey: ['org-academies', orgId],
    queryFn: () => api.get(`/org/${orgId}/academies`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;

  const items: any[] = programs || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Academy Programs</h1>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No academy programs found.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((p: any) => (
            <div key={p.id} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[var(--color-text)]">{p.name}</p>
                  {p.category_name && <p className="text-xs text-[var(--color-text-muted)]">{p.category_name}</p>}
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  p.status === 'published' || p.status === 'running'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : p.status === 'draft'
                    ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>{p.status}</span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-text-muted)]">
                {p.capacity && <span>Capacity: {p.capacity}</span>}
                <span>Enrolled: {p.enrolled_count || 0}</span>
                {(p.waiting_count || 0) > 0 && <span>Waiting: {p.waiting_count}</span>}
                {p.price && <span>Price: {p.price} {p.currency || ''}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
