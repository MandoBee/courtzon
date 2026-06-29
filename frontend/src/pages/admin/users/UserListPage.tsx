import { useState, useEffect, useCallback } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '../../../services/api';
import UserEditModal from './UserEditModal';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { EntityImage, CountryFlag } from '../../../components/ui';
import { useTranslation } from '../../../i18n';

const statusColors: Record<string, string> = {
  active: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  suspended: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  banned: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
};

const PAGE_SIZES = [10, 20, 30, 50];

function UserAvatar({ user }: { user: any }) {
  return (
    <EntityImage
      src={user.avatar_url}
      name={user.full_name || user.email || 'User'}
      className="w-8 h-8 rounded-full text-sm"
    />
  );
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function UserListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const debouncedName = useDebounce(nameFilter, 300);
  const debouncedPhone = useDebounce(phoneFilter, 300);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/users/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); showToast('User deleted!'); },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const currentFilters = {
    search: debouncedName || debouncedPhone || undefined,
    country: countryFilter || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
  };

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'users', page, limit, currentFilters],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (currentFilters.search) params.set('search', currentFilters.search);
      if (currentFilters.country) params.set('country', currentFilters.country);
      if (currentFilters.role) params.set('role', currentFilters.role);
      if (currentFilters.status) params.set('status', currentFilters.status);
      return api.get(`/admin/users?${params.toString()}`).then((r: any) => r.data);
    },
    placeholderData: keepPreviousData,
  });

  const { data: countriesData } = useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => api.get('/countries').then((r: any) => r.data.data),
    staleTime: 60000,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.get('/roles').then((r: any) => r.data.data),
    staleTime: 60000,
  });

  const users = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const countries = countriesData || [];
  const roles = rolesData || [];

  const handleFilterChange = useCallback((setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  }, []);

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.users.title')}</h1>
        {isFetching && <span className="text-xs text-[var(--color-text-muted)]">Loading...</span>}
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
           <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/30">
              <th className="px-4 py-2">
                <input value={nameFilter} onChange={(e: any) => handleFilterChange(setNameFilter, e.target.value)}
                  placeholder={t('admin.users.filter_name')} className="w-full px-2 py-1.5 text-xs border rounded bg-[var(--color-surface)] font-normal" />
              </th>
              <th className="px-4 py-2">
                <select value={countryFilter} onChange={(e: any) => handleFilterChange(setCountryFilter, e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded bg-[var(--color-surface)] font-normal">
                  <option value="">{t('common.all')}</option>
                  {countries.filter((c: any) => c.is_active).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((c: any) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </th>
              <th className="px-4 py-2">
                <input value={phoneFilter} onChange={(e: any) => handleFilterChange(setPhoneFilter, e.target.value)}
                  placeholder={t('admin.users.filter_phone')} className="w-full px-2 py-1.5 text-xs border rounded bg-[var(--color-surface)] font-normal" />
              </th>
              <th className="px-4 py-2">
                <select value={roleFilter} onChange={(e: any) => handleFilterChange(setRoleFilter, e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded bg-[var(--color-surface)] font-normal">
                  <option value="">{t('common.all')}</option>
                  {roles.map((r: any) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </th>
              <th className="px-4 py-2">
                <select value={statusFilter} onChange={(e: any) => handleFilterChange(setStatusFilter, e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded bg-[var(--color-surface)] font-normal">
                  <option value="">{t('common.all')}</option>
                  <option value="active">{t('common.active')}</option>
                  <option value="suspended">Suspended</option>
                  <option value="banned">Banned</option>
                </select>
              </th>
              <th className="px-4 py-2" />
              <th className="px-4 py-2" />
            </tr>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Country</th>
              <th className="text-left px-4 py-3 font-medium">{t('admin.users.column_phone')}</th>
              <th className="text-left px-4 py-3 font-medium">{t('admin.users.column_roles')}</th>
              <th className="text-left px-4 py-3 font-medium">{t('admin.users.column_status')}</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              <th className="text-left px-4 py-3 font-medium">{t('admin.users.column_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={u} />
                    <span className="font-medium text-[var(--color-text)]">{u.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">
                  {u.country_iso
                    ? <CountryFlag countryCode={u.country_iso} countryName={u.country_name} size={20} className="mr-1" />
                    : u.country_flag && <span className="mr-1">{u.country_flag}</span>}
                  {u.country_name || '—'}
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{u.phone_number || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{u.role_names || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[u.account_status] || ''}`}>{u.account_status}</span>
                    {u.has_activated_selling === 1 && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">Selling</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(u.created_at).toLocaleDateString('en-GB')}</td>
                <td className="px-4 py-3">
                    <Can permission="users.edit">
                    <button onClick={() => setEditingUserId(u.id)}
                      className="px-3 py-1 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors mr-1">
                      {t('admin.users.edit')}
                    </button>
                  </Can>
                  <Can permission="users.delete">
                    <button onClick={() => { if (confirm(t('admin.users.delete_confirm', { name: u.full_name }))) deleteMutation.mutate(u.id); }}
                      className="px-3 py-1 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80 transition-colors">
                      {t('common.delete')}
                    </button>
                  </Can>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
          <select value={limit} onChange={(e: any) => handleLimitChange(Number(e.target.value))}
            className="px-2 py-1 text-xs border rounded bg-[var(--color-surface)]">
            {PAGE_SIZES.map((s: any) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setPage((p: any) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-30">{t('common.previous')}</button>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages || 1}</span>
          <button onClick={() => setPage((p: any) => p + 1)} disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-30">{t('common.next')}</button>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">{total} total</span>
      </div>

      {editingUserId !== null && (
        <UserEditModal userId={editingUserId} onClose={() => { setEditingUserId(null); queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); }} />
      )}
    </div>
  );
}
