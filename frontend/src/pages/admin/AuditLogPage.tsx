import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';

const entityTypes = ['booking', 'order', 'organisation', 'payment', 'product', 'resource', 'user'];
const actionTypes = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'LOGIN', 'order.create'];

const actionColors: Record<string, string> = {
  CREATE: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  UPDATE: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  DELETE: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  APPROVE: 'bg-purple-100 text-purple-700',
  LOGIN: 'bg-[var(--color-border)] text-[var(--color-text)]',
};

function getActionColor(action: string): string {
  return actionColors[action] || 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]';
}

export default function AuditLogPage() {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [page, setPage] = useState(1);

  const { data, isFetching } = useQuery({
    queryKey: ['audit-logs', entityType, action, actorId, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (entityType) params.set('entityType', entityType);
      if (action) params.set('action', action);
      if (actorId) params.set('actorId', actorId);
      params.set('page', String(page));
      params.set('limit', '30');
      return api.get(`/admin/audit-logs?${params}`).then((r: any) => r.data);
    },
  });

  const revertMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/admin/revert/${id}`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
  });

  const handleRevert = (logId: number) => {
    const reason = prompt('Reason for reverting this action:');
    if (reason) revertMutation.mutate({ id: logId, reason });
  };

  const logs = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 30;
  const totalPages = Math.ceil(total / limit) || 1;

  const resetFilters = () => {
    setEntityType('');
    setAction('');
    setActorId('');
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Audit Log</h1>
        <span className="text-sm text-[var(--color-text-muted)]">{total} total entries</span>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Entity Type</label>
            <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }}
              className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[140px]">
              <option value="">All</option>
              {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Action</label>
            <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
              className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[140px]">
              <option value="">All</option>
              {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Actor ID</label>
            <input type="number" placeholder="e.g. 1" value={actorId} onChange={e => { setActorId(e.target.value); setPage(1); }}
              className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-24" />
          </div>
          <button onClick={resetFilters}
            className="px-4 py-2 border rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-bg)]">
            Clear
          </button>
          {isFetching && <span className="text-xs text-[var(--color-text-muted)]">Loading...</span>}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-[var(--color-bg)]/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--color-text-muted)]">
                    {new Date(log.created_at).toLocaleString('en-GB')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-[var(--color-text)]">{log.entity_type}</span>
                    {log.entity_id && <span className="text-[var(--color-text-muted)]"> #{log.entity_id}</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text)]">
                    {log.actor_name || <span className="text-[var(--color-text-muted)]">User #{log.actor_id}</span>}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {log.reason && <p className="text-xs text-[var(--color-warning)] mb-1">Reason: {log.reason}</p>}
                    <div className="flex gap-2">
                      {log.before_state && (
                        <details className="text-xs text-[var(--color-text-muted)]">
                          <summary className="cursor-pointer hover:text-[var(--color-text)]">Before</summary>
                          <pre className="mt-1 p-2 bg-[var(--color-bg)] bg-[var(--color-bg)] rounded overflow-x-auto max-h-32 overflow-y-auto text-[10px]">
                            {JSON.stringify(JSON.parse(typeof log.before_state === 'string' ? log.before_state : '{}'), null, 2)}
                          </pre>
                        </details>
                      )}
                      {log.after_state && (
                        <details className="text-xs text-[var(--color-text-muted)]">
                          <summary className="cursor-pointer hover:text-[var(--color-text)]">After</summary>
                          <pre className="mt-1 p-2 bg-[var(--color-bg)] bg-[var(--color-bg)] rounded overflow-x-auto max-h-32 overflow-y-auto text-[10px]">
                            {JSON.stringify(JSON.parse(typeof log.after_state === 'string' ? log.after_state : '{}'), null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => handleRevert(log.id)}
                      disabled={revertMutation.isPending}
                      className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-50">
                      Revert
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-[var(--color-text-muted)]">
                    No audit logs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > limit && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="px-4 py-2 border rounded-[var(--radius-md)] text-sm disabled:opacity-50 hover:bg-[var(--color-surface)]">
            Previous
          </button>
          <span className="text-sm text-[var(--color-text-muted)]">
            Page {page} of {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="px-4 py-2 border rounded-[var(--radius-md)] text-sm disabled:opacity-50 hover:bg-[var(--color-surface)]">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
