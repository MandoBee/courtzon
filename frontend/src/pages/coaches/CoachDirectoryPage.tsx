import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { SkeletonRow } from '../../components/ui';

const SPORTS = ['Tennis', 'Padel', 'Football', 'Basketball', 'Squash', 'Badminton'];

export default function CoachDirectoryPage() {
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, sportFilter]);

  const params = new URLSearchParams({ limit: '20', page: String(page) });
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (sportFilter) params.set('sportId', sportFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['coaches', debouncedSearch, sportFilter, page],
    queryFn: () => api.get(`/coaches?${params.toString()}`).then((r) => r.data),
  });

  const coaches = data?.data || [];
  const totalPages = data?.pagination?.totalPages || 1;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Coaches</h1>
        {user?.isCoach && (
          <Link
            to="/coaches/profile"
            className="text-sm px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] font-medium"
          >
            My Coach Profile
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">🔍</span>
          <input
            type="text"
            placeholder="Search coaches by name, bio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
          />
        </div>
        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
        >
          <option value="">All Sports</option>
          {SPORTS.map((s) => (
            <option key={s} value={s.toLowerCase()}>{s}</option>
          ))}
        </select>
      </div>

      {isLoading && <SkeletonRow count={6} />}

      {!isLoading && coaches.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg text-[var(--color-text-muted)]">No coaches found</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Try adjusting your search or filters.</p>
        </div>
      )}

      {!isLoading && coaches.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coaches.map((c: any) => (
              <Link
                key={c.id}
                to={`/coaches/${c.id}`}
                className="block bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-lg font-bold text-[var(--color-primary)]">
                    {c.full_name?.charAt(0) || 'C'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--color-text)] truncate">{c.full_name}</p>
                    {c.experience_years > 0 && (
                      <p className="text-xs text-[var(--color-text-muted)]">{c.experience_years} years experience</p>
                    )}
                  </div>
                  {c.is_available && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-[var(--color-success)]" title="Available" />
                  )}
                </div>
                {c.bio && <p className="text-sm text-[var(--color-text-muted)] line-clamp-2 mb-3">{c.bio}</p>}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {c.hourly_rate && (
                      <span className="font-medium text-[var(--color-primary)]">{formatPrice(Number(c.hourly_rate))}/hr</span>
                    )}
                    {c.rating_avg > 0 && (
                      <span className="text-xs text-[var(--color-text-muted)]">★ {Number(c.rating_avg).toFixed(1)}</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-primary)] font-medium">View Profile →</span>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
