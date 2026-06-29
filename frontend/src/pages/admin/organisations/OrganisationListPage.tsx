import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import OrganisationForm from '../../../components/organisations/OrganisationForm';
import { Can } from '../../../permissions/Can';
import type { ApiData, PaginatedResult } from '../../../types/api';
import type { Country, OrganisationSummary, OrganisationType } from '../../../types/admin/common';
import { EntityImage, CountryFlag } from '../../../components/ui';

const PAGE_SIZES = [10, 20, 30, 50];
export default function OrganisationListPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [verifiedFilter, setVerifiedFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const isCreate = window.location.pathname.endsWith('/new');
  const isEdit = Boolean(id);
  const [showForm, setShowForm] = useState(isCreate || isEdit);
  const [editId, setEditId] = useState<number | null>(isEdit ? Number(id) : null);

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    navigate('/admin/organisations', { replace: true });
  };

  const { data: orgTypes } = useQuery({
    queryKey: ['organisation-types'],
    queryFn: () => api.get<ApiData<OrganisationType[]>>('/organisation-types').then((r) => r.data.data),
  });

  const { data: countries } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get<ApiData<Country[]>>('/countries').then((r) => r.data.data),
  });

  const queryParams = new URLSearchParams();
  if (typeFilter !== 'all') queryParams.set('typeId', typeFilter);
  if (countryFilter !== 'all') queryParams.set('countryId', countryFilter);
  if (ratingFilter !== 'all') queryParams.set('ratingMin', ratingFilter);
  if (verifiedFilter !== 'all') queryParams.set('verified', verifiedFilter);
  if (activeFilter !== 'all') queryParams.set('active', activeFilter);
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'organisations', queryParams.toString()],
    queryFn: () =>
      api
        .get<PaginatedResult<OrganisationSummary>>(
          `/organisations?${queryParams.toString()}`,
        )
        .then((r) => r.data),
  });

  const organisations = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const verifyMutation = useMutation({
    mutationFn: ({ id, isVerified }: { id: number; isVerified: boolean }) => api.put(`/organisations/${id}`, { isVerified }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'organisations'] }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/organisations/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'organisations'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/organisations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organisations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    },
  });

  const filtered = useMemo(() => {
    if (!search) return organisations;
    return organisations.filter((org) =>
      org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.slug.toLowerCase().includes(search.toLowerCase())
    );
  }, [organisations, search]);

  const actCountries = (countries || []).filter((c) => c.is_active);

  const ratingOptions = [
    { value: 'all', label: 'All Ratings' },
    { value: '1', label: '★ 1+' },
    { value: '2', label: '★ 2+' },
    { value: '3', label: '★ 3+' },
    { value: '4', label: '★ 4+' },
    { value: '5', label: '★ 5' },
  ];

  const resetFilters = () => {
    setSearch('');
    setCountryFilter('all');
    setTypeFilter('all');
    setRatingFilter('all');
    setVerifiedFilter('all');
    setActiveFilter('all');
    setPage(1);
  };

  return (
    <div>
      {showForm && (
        <OrganisationForm orgId={editId} context="admin" onClose={closeForm} />
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Organisations</h1>
        <Can permission="organisations.create">
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditId(null); navigate('/admin/organisations/new', { replace: true }); }}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium"
            >
              + New Organisation
            </button>
          )}
        </Can>
      </div>

      {!showForm && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or slug..."
                className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-md)] border text-sm" />
            </div>
            <div className="flex items-center gap-1">
              {countryFilter !== 'all' && (
                <CountryFlag
                  countryCode={actCountries.find((c) => c.id === Number(countryFilter))?.iso_code}
                  countryName={actCountries.find((c) => c.id === Number(countryFilter))?.name}
                  size={20}
                />
              )}
              <select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-[var(--radius-md)] border text-sm">
                <option value="all">All Countries</option>
                {actCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-[var(--radius-md)] border text-sm">
              <option value="all">All Types</option>
              {orgTypes?.map((t) => <option key={t.id} value={t.id}>{t.name || t.slug}</option>)}
            </select>
            <select value={ratingFilter} onChange={(e) => { setRatingFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-[var(--radius-md)] border text-sm">
              {ratingOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={verifiedFilter} onChange={(e) => { setVerifiedFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-[var(--radius-md)] border text-sm">
              <option value="all">Verification</option>
              <option value="true">Verified</option>
              <option value="false">Pending</option>
            </select>
            <select value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-[var(--radius-md)] border text-sm">
              <option value="all">Status</option>
              <option value="true">Active</option>
              <option value="false">Suspended</option>
            </select>
            <button onClick={resetFilters} className="px-3 py-2 text-xs border rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Reset
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center min-h-[30vh]">
              <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-[var(--color-bg)]">
                      <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Organisation</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Country</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Type</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Rating</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Verified</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Active</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((org) => (
                      <tr key={org.id} className={`border-b hover:bg-[var(--color-bg)] ${!org.is_active ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <EntityImage src={org.logo_url} name={org.name} className="w-8 h-8 rounded-full text-sm" />
                            <div>
                              <div className="text-sm font-medium text-[var(--color-text)]">{org.name}</div>
                              <div className="text-xs text-[var(--color-text-muted)] font-mono">{org.slug}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {org.country_iso ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <CountryFlag countryCode={org.country_iso} countryName={org.country_name} size={24} />
                              <span className="text-[10px] text-[var(--color-text-muted)]">{org.country_name}</span>
                            </div>
                          ) : <span className="text-[var(--color-text-muted)]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">{org.org_type_slug || '—'}</td>
                        <td className="px-4 py-3 text-center text-sm">
                          {(org.rating_avg ?? 0) > 0 ? <span className="text-amber-600">★ {Number(org.rating_avg).toFixed(1)}</span> : <span className="text-[var(--color-text-muted)]">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Can permission="organisations.table.is-verified">
                            <Can permission="organisations.verify" fallback={
                              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${org.is_verified ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>
                                {org.is_verified ? 'Verified' : 'Pending'}
                              </span>
                            }>
                              <button onClick={() => verifyMutation.mutate({ id: org.id, isVerified: !org.is_verified })}
                                className={`px-2 py-0.5 text-xs rounded-full font-medium cursor-pointer border transition-colors ${org.is_verified ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-green-300 hover:opacity-80' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] border-yellow-300 hover:bg-yellow-200'}`}>
                                {org.is_verified ? 'Verified' : 'Pending'}
                              </button>
                            </Can>
                          </Can>
                        </td>
                        <td className="px-4 py-3">
                          <Can permission="organisations.table.is-active">
                            <Can permission="organisations.edit" fallback={
                              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${org.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'}`}>
                                {org.is_active ? 'Active' : 'Suspended'}
                              </span>
                            }>
                              <button onClick={() => toggleActiveMutation.mutate({ id: org.id, isActive: !org.is_active })}
                                className={`px-2 py-0.5 text-xs rounded-full font-medium cursor-pointer border transition-colors ${org.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-green-300 hover:opacity-80' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] border-red-300 hover:bg-red-200'}`}>
                                {org.is_active ? 'Active' : 'Suspended'}
                              </button>
                            </Can>
                          </Can>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Can permission="organisations.edit">
                              <button onClick={() => { setEditId(org.id); setShowForm(true); navigate(`/admin/organisations/${org.id}`, { replace: true }); }}
                                className="text-xs px-2 py-1 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-border)]">Edit</button>
                            </Can>
                            <Link to={`/admin/organisations/${org.id}/branches`}
                              className="text-xs px-2 py-1 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20">Branches</Link>
                            <Can permission="organisations.delete">
                              <button onClick={() => { if (confirm(`Delete "${org.name}"?`)) deleteMutation.mutate(org.id); }}
                                className="text-xs px-2 py-1 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80">Delete</button>
                            </Can>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No organisations found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
                    <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                      className="px-2 py-1 text-xs border rounded bg-[var(--color-surface)]">
                      {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-30">Previous</button>
                    <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages || 1}</span>
                    <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}
                      className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-30">Next</button>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">{total} total</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
