import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import api from '../../services/api';
import BranchAccessControl from '../../components/branches/BranchAccessControl';
import { EntityImage } from '../../components/ui';

interface StorefrontBranch {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  city?: string | null;
  address_line1?: string | null;
  access_type: string;
  rating_avg?: number | null;
  opening_time?: string | null;
  closing_time?: string | null;
}

interface Storefront {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  org_type_slug?: string | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  is_verified?: boolean | number;
  branches: StorefrontBranch[];
}

export default function OrgStorefrontPage() {
  const { orgId } = useParams();

  const { data: org, isLoading, isError } = useQuery<Storefront>({
    queryKey: ['org-storefront', orgId],
    queryFn: () => api.get(`/organisations/${orgId}/storefront`).then((r) => r.data),
    enabled: !!orgId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !org) {
    return (
      <div className="text-center py-24 text-sm text-[var(--color-text-muted)]">
        This facility could not be found.
        <div className="mt-4">
          <Link to="/browse" className="text-[var(--color-primary)] hover:underline">← Back to facilities</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/browse" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">← Back to facilities</Link>

      {/* Cover + header */}
      <div className="mt-3 rounded-[var(--radius-lg)] overflow-hidden bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
        <div className="h-40 sm:h-56 relative overflow-hidden bg-[var(--color-primary)]/10">
          <EntityImage
            src={org.cover_url}
            name={org.name}
            className="absolute inset-0 w-full h-full rounded-none text-5xl"
          />
        </div>
        <div className="px-5 pb-5">
          <div className="flex items-end gap-4 -mt-10">
            <div className="w-20 h-20 rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] flex items-center justify-center overflow-hidden ring-4 ring-[var(--color-surface)]">
              <EntityImage src={org.logo_url} name={org.name} className="w-full h-full rounded-[var(--radius-lg)] text-3xl" />
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-[var(--color-text)]">{org.name}</h1>
                {org.is_verified ? (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)]">✓ Verified</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-[var(--color-text-muted)]">
                {org.org_type_slug && <span className="capitalize">{org.org_type_slug.replace(/[-_]/g, ' ')}</span>}
                {org.rating_avg != null && Number(org.rating_avg) > 0 && (
                  <span>★ {Number(org.rating_avg).toFixed(1)}{org.rating_count ? ` (${org.rating_count})` : ''}</span>
                )}
              </div>
            </div>
          </div>

          {org.description && (
            <p className="mt-4 text-sm text-[var(--color-text)] whitespace-pre-line">{org.description}</p>
          )}

          {/* Contact */}
          {(org.phone || org.email || org.website) && (
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {org.phone && (
                <a href={`tel:${org.phone}`} className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">📞 {org.phone}</a>
              )}
              {org.email && (
                <a href={`mailto:${org.email}`} className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">✉️ {org.email}</a>
              )}
              {org.website && (
                <a href={org.website} target="_blank" rel="noreferrer" className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">🌐 Website</a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Branches */}
      <h2 className="mt-8 mb-4 text-lg font-semibold text-[var(--color-text)]">Locations & facilities</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {org.branches?.map((branch) => (
          <Link
            key={branch.id}
            to={`/branches/${branch.id}/resources`}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 hover:shadow-[var(--shadow-md)] transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-primary)]/10 flex items-center justify-center text-lg">📍</div>
              <div>
                <h3 className="font-medium text-[var(--color-text)]">{branch.name}</h3>
                <p className="text-xs text-[var(--color-text-muted)]">{branch.city || branch.address_line1 || 'Location TBD'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                branch.access_type === 'open' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                branch.access_type === 'restricted' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
                'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
              }`}>
                {branch.access_type}
              </span>
              {branch.rating_avg != null && Number(branch.rating_avg) > 0 && (
                <span className="text-xs text-[var(--color-text-muted)]">★ {Number(branch.rating_avg).toFixed(1)}</span>
              )}
              {branch.opening_time && branch.closing_time && (
                <span className="text-xs text-[var(--color-text-muted)]">🕐 {branch.opening_time}–{branch.closing_time}</span>
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
        {(!org.branches || org.branches.length === 0) && (
          <div className="col-span-full text-center py-12 text-sm text-[var(--color-text-muted)]">
            This facility has no bookable locations yet.
          </div>
        )}
      </div>
    </div>
  );
}
