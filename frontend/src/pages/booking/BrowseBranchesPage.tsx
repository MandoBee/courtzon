import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import BranchAccessControl from '../../components/branches/BranchAccessControl';

export default function BrowseBranchesPage() {
  const navigate = useNavigate();
  const { data: orgs } = useQuery({
    queryKey: ['organisations'],
    queryFn: () => api.get('/organisations').then((r) => r.data.data),
  });

  const { data: branches } = useQuery({
    queryKey: ['all-branches'],
    queryFn: () => {
      if (!orgs?.length) return [];
      return Promise.all(
        orgs.map((org: any) =>
          api.get(`/organisations/${org.id}/branches`).then((r) =>
            (r.data.data as any[]).map((b) => ({ ...b, _org: { id: org.id, name: org.name } }))
          )
        )
      ).then((results) => results.flat());
    },
    enabled: !!orgs?.length,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Browse Facilities</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches?.map((branch: any) => (
          <Link
            key={branch.id}
            to={`/branches/${branch.id}/resources`}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 hover:shadow-[var(--shadow-md)] transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-primary)]/10 flex items-center justify-center text-lg">
                📍
              </div>
              <div>
                <h3 className="font-medium text-[var(--color-text)]">{branch.name}</h3>
                <p className="text-xs text-[var(--color-text-muted)]">{branch.city || 'Location TBD'}</p>
                {branch._org && (
                  <Can permission="organisations.storefront.view">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/organisations/${branch._org.id}`); }}
                      className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                      by {branch._org.name}
                    </button>
                  </Can>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                branch.access_type === 'open' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                branch.access_type === 'restricted' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] dark:bg-yellow-900/30 dark:text-yellow-400' :
                'bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {branch.access_type}
              </span>
              {branch.rating_avg > 0 && (
                <span className="text-xs text-[var(--color-text-muted)]">★ {Number(branch.rating_avg).toFixed(1)}</span>
              )}
            </div>
            {branch.access_type !== 'open' && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--color-text-muted)]">This facility requires approval</span>
                <BranchAccessControl branchId={branch.id} />
              </div>
            )}
          </Link>
        ))}
        {(!branches || branches.length === 0) && (
          <div className="col-span-full text-center py-12 text-sm text-[var(--color-text-muted)]">
            No facilities available yet
          </div>
        )}
      </div>
    </div>
  );
}
