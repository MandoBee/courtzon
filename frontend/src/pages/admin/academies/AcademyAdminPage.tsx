import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { getErrorMessage } from '../../../utils/errors';
import type { PaginatedResult } from '../../../types/api';

interface AcademyRow {
  id: number;
  name: string;
  organisation_name?: string | null;
  sport_name?: string | null;
  is_active: boolean;
}

interface AcademyEditForm {
  name?: string;
  is_active?: boolean;
}

export default function AcademyAdminPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AcademyEditForm>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin-academies', page],
    queryFn: () =>
      api
        .get<PaginatedResult<AcademyRow>>(`/admin/academies?page=${page}&limit=20`)
        .then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: AcademyEditForm & { id: number }) => api.put(`/academies/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-academies'] }); setEditId(null); showToast('Updated!'); },
    onError: (err) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/academies/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-academies'] }); showToast('Deleted!'); },
    onError: (err) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text)]">Academies (Admin)</h1>
      {editId && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name</label>
              <input value={form.name || ''} onChange={e => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border bg-white text-sm" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active
              </label>
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
              <th className="text-center px-3 py-2">Active</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-4 text-xs text-[var(--color-text-muted)]">Loading...</td></tr>}
            {data?.data?.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-[var(--color-bg)] text-[var(--color-text)]">
                <td className="px-3 py-2 font-medium">{a.name}</td>
                <td className="px-3 py-2 text-xs">{a.organisation_name || '-'}</td>
                <td className="px-3 py-2 text-xs">{a.sport_name || '-'}</td>
                <td className="px-3 py-2 text-center"><span className={`inline-block w-2 h-2 rounded-full ${a.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`} /></td>
                <td className="px-3 py-2 text-right">
                  <Can permission="academies.edit">
                    <button onClick={() => { setEditId(a.id); setForm({ name: a.name, is_active: !!a.is_active }); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)] mr-1">Edit</button>
                  </Can>
                  <Can permission="academies.delete">
                    <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(a.id); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80">Delete</button>
                  </Can>
                </td>
              </tr>
            ))}
            {data?.data?.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-xs text-[var(--color-text-muted)]">No academies.</td></tr>}
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
