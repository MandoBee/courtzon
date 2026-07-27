import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { EntityImage } from '../../../components/ui';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRow } from '../../../components/ui/Skeleton';

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const membershipBadge = (status: string | null) => {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    expired: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    none: 'bg-gray-100 text-gray-500',
  };
  return colors[status || 'none'] || 'bg-gray-100 text-gray-500';
};

export default function CustomerListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'crm', 'customers', page, pageSize, debouncedSearch],
    queryFn: () => api.get('/admin/crm/customers', { params: { page, limit: pageSize, search: debouncedSearch || undefined } }).then((r: any) => r.data),
  });

  const customers = data?.data || [];
  const total = data?.total || 0;

  if (isLoading) return <SkeletonRow count={5} />;

  return (
    <Can permission="crm.customers.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Customers</h1>
          <input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, email, phone..."
            className="w-72 px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Email</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Phone</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Bookings</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Orders</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Membership</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c: any) => (
                <tr key={c.id} className="hover:bg-[var(--color-bg)]/30 cursor-pointer" onClick={() => navigate(`/admin/crm/customers/${c.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <EntityImage src={c.avatar_url} name={c.full_name || c.email || '?'} className="w-8 h-8 rounded-full text-sm" />
                      <span className="font-medium text-[var(--color-text)]">{c.full_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-center font-mono text-[var(--color-text)]">{c.total_bookings ?? 0}</td>
                  <td className="px-4 py-3 text-center font-mono text-[var(--color-text)]">{c.total_orders ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${membershipBadge(c.membership_status)}`}>{c.membership_status || 'None'}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">
                    {c.last_activity ? new Date(c.last_activity).toLocaleDateString('en-GB') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!customers.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No customers found</p>}
        </div>

        <div className="mt-4">
          <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
        </div>
      </div>
    </Can>
  );
}
