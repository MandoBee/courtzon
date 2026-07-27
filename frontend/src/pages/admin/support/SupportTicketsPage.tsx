import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useCan } from '../../../hooks/useCan';
import { useToast } from '../../../components/ui/Toast';
import SupportTicketDetail from './SupportTicketDetail';

const STATUS_BADGES: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  waiting_on_customer: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

const PRIORITY_BADGES: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-red-100 text-red-800',
};

const CATEGORY_BADGES: Record<string, string> = {
  general: 'bg-gray-100 text-gray-800',
  billing: 'bg-green-100 text-green-800',
  technical: 'bg-blue-100 text-blue-800',
  account: 'bg-purple-100 text-purple-800',
  feature_request: 'bg-teal-100 text-teal-800',
  other: 'bg-gray-100 text-gray-800',
};

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-lg px-4 py-3 ${color}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );
}

export default function SupportTicketsPage() {
  const { can } = useCan();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const queryParams = new URLSearchParams();
  if (statusFilter) queryParams.set('status', statusFilter);
  if (categoryFilter) queryParams.set('category', categoryFilter);
  if (priorityFilter) queryParams.set('priority', priorityFilter);
  if (search) queryParams.set('search', search);
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['admin-support-tickets', queryParams.toString()],
    queryFn: () => api.get(`/admin/support/tickets?${queryParams.toString()}`).then((r) => r.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin-support-stats'],
    queryFn: () => api.get('/admin/support/stats').then((r) => r.data),
  });

  const tickets = ticketsData?.data || [];
  const pagination = ticketsData?.pagination || { page: 1, limit: 20, total: 0 };
  const stats = statsData?.data || { byStatus: {}, byCategory: {}, byPriority: {} };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, string> }) =>
      api.put(`/admin/support/tickets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-support-stats'] });
      showToast('Ticket updated');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to update ticket', 'error'),
  });

  const STATUSES = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];
  const CATEGORIES = ['general', 'billing', 'technical', 'account', 'feature_request', 'other'];
  const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

  const handleStatusQuickChange = (id: number, status: string) => {
    updateMutation.mutate({ id, data: { status } });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Support Tickets</h1>

      {can('support.tickets.view') && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {STATUSES.map((s) => (
            <StatCard
              key={s}
              label={s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              count={stats.byStatus[s] || 0}
              color={STATUS_BADGES[s] || 'bg-gray-100'}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search subject..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[200px]"
        />
      </div>

      {ticketsLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Subject</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Priority</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Organisation</th>
                <th className="text-left px-4 py-3 font-medium">Assignee</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                {can('support.tickets.manage') && <th className="text-left px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr><td colSpan={can('support.tickets.manage') ? 8 : 7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No tickets found</td></tr>
              ) : (
                tickets.map((ticket: any) => (
                  <tr
                    key={ticket.id}
                    className="border-b hover:bg-[var(--color-bg)] cursor-pointer"
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <td className="px-4 py-3 font-medium">{ticket.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_BADGES[ticket.category] || ''}`}>
                        {ticket.category?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_BADGES[ticket.priority] || ''}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGES[ticket.status] || ''}`}>
                        {ticket.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{ticket.organisation_name || '-'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{ticket.assignee_name || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(ticket.created_at).toLocaleDateString()}</td>
                    {can('support.tickets.manage') && (
                      <td className="px-4 py-3">
                        <select
                          value={ticket.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleStatusQuickChange(ticket.id, e.target.value)}
                          className="border rounded px-2 py-1 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm">
            Page {pagination.page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {selectedTicketId && (
        <SupportTicketDetail
          ticketId={selectedTicketId}
          onClose={() => { setSelectedTicketId(null); queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] }); }}
        />
      )}
    </div>
  );
}
