import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import type { PaginatedResult } from '../../../types/api';

interface TournamentRow {
  id: number;
  name: string;
  status: string;
  organisation_name?: string | null;
  sport_name?: string | null;
  start_date?: string | null;
}

interface TournamentEditForm {
  name?: string;
  status?: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-[var(--color-border)] text-[var(--color-text-muted)]', open: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  in_progress: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]', completed: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]', cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
};

export default function TournamentAdminPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<TournamentEditForm>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tournaments', page, statusFilter],
    queryFn: () => {
      let url = `/admin/tournaments?page=${page}&limit=20`;
      if (statusFilter) url += `&status=${statusFilter}`;
      return api.get<PaginatedResult<TournamentRow>>(url).then((r) => r.data);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: TournamentEditForm & { id: number }) => api.put(`/tournaments/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tournaments'] }); setEditId(null); showToast('Updated!'); },
    onError: (err) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/tournaments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tournaments'] }); showToast('Deleted!'); },
    onError: (err) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text)]">Tournaments (Admin)</h1>
      <div className="flex gap-2">
        {['', 'draft', 'open', 'in_progress', 'completed', 'cancelled'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-xs rounded-[var(--radius-md)] border ${statusFilter === s ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {editId && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Status</label>
              <select value={form.status || ''} onChange={e => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border bg-white text-sm">
                <option value="">No change</option>
                {['draft', 'open', 'in_progress', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name</label>
              <input value={form.name || ''} onChange={e => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border bg-white text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateMutation.mutate({ id: editId, ...form })}
              className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">Update</button>
            <button onClick={() => setEditId(null)} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Org</th>
              <th className="text-left px-3 py-2">Sport</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Start</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-4 text-xs text-[var(--color-text-muted)]">Loading...</td></tr>}
            {data?.data?.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-[var(--color-bg)] text-[var(--color-text)]">
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="px-3 py-2 text-xs">{t.organisation_name || '-'}</td>
                <td className="px-3 py-2 text-xs">{t.sport_name || '-'}</td>
                <td className="px-3 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status] || ''}`}>{t.status}</span></td>
                <td className="px-3 py-2 text-xs">{t.start_date?.slice(0, 10) || '-'}</td>
                <td className="px-3 py-2 text-right">
                  <Can permission="tournaments.edit">
                    <button onClick={() => { setEditId(t.id); setForm({ name: t.name, status: t.status }); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)] mr-1">Edit</button>
                  </Can>
                  <Can permission="tournaments.delete">
                    <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(t.id); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80">Delete</button>
                  </Can>
                </td>
              </tr>
            ))}
            {data?.data?.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-xs text-[var(--color-text-muted)]">No tournaments.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.total > data.limit && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Prev</button>
          <span className="px-2 py-1 text-xs text-[var(--color-text-muted)]">Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
          <button disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
