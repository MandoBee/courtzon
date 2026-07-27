import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';

export default function OrgBranchesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: branches, isLoading } = useQuery({
    queryKey: ['org-branches-manage', orgId],
    queryFn: () => api.get(`/org/${orgId}/branches/manage`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;

  const items: any[] = branches || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Branches</h1>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No branches found.</p>
      ) : (
        <div className="grid gap-4">
          {items.map((b: any) => (
            <div key={b.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-bg)] transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{b.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {b.courts_count || 0} court{(b.courts_count || 0) !== 1 ? 's' : ''}
                      {b.assigned_sports ? ` · ${b.assigned_sports}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                    {b.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-[var(--color-text-muted)] text-lg">{expandedId === b.id ? '−' : '+'}</span>
                </div>
              </button>

              {expandedId === b.id && (
                <div className="px-4 pb-4 border-t border-[var(--color-border)] pt-3 space-y-3">
                  {(b.address || b.city) && (
                    <p className="text-sm text-[var(--color-text)]">{b.address}{b.city ? `, ${b.city}` : ''}</p>
                  )}
                  {b.phone && <p className="text-sm"><span className="text-[var(--color-text-muted)]">Phone:</span> {b.phone}</p>}
                  {b.email && <p className="text-sm"><span className="text-[var(--color-text-muted)]">Email:</span> {b.email}</p>}
                  {(b.opening_time || b.closing_time) && (
                    <p className="text-sm">
                      <span className="text-[var(--color-text-muted)]">Hours:</span>{' '}
                      {b.opening_time ? b.opening_time.slice(0, 5) : '—'} – {b.closing_time ? b.closing_time.slice(0, 5) : '—'}
                    </p>
                  )}
                  {b.managers && b.managers.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Managers</p>
                      <div className="flex flex-wrap gap-2">
                        {b.managers.map((m: any) => (
                          <span key={m.id} className="text-xs bg-[var(--color-bg)] px-2 py-1 rounded-md text-[var(--color-text)]">
                            {m.full_name || m.email}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {b.amenities && b.amenities.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Amenities</p>
                      <div className="flex flex-wrap gap-1.5">
                        {b.amenities.map((a: string, i: number) => (
                          <span key={i} className="text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
