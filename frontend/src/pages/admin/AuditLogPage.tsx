import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { ExportButton } from '../../components/ui/ExportButton';
import { SkeletonRow } from '../../components/ui/Skeleton';

const ENTITY_TYPES = ['booking', 'order', 'organisation', 'payment', 'product', 'resource', 'user', 'role', 'permission', 'membership', 'tournament', 'academy'];
const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'SYNC'];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700', UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700', APPROVE: 'bg-indigo-100 text-indigo-700',
  REJECT: 'bg-red-100 text-red-700', LOGIN: 'bg-gray-100 text-gray-600',
  LOGOUT: 'bg-gray-100 text-gray-600', SYNC: 'bg-purple-100 text-purple-700',
};

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ entityType: '', action: '', actorId: '', dateFrom: '', dateTo: '', search: '' });
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const params: any = { page, limit: 30 };
  if (filters.entityType) params.entityType = filters.entityType;
  if (filters.action) params.action = filters.action;
  if (filters.actorId) params.actorId = filters.actorId;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', page, filters],
    queryFn: () => api.get('/admin/audit-logs', { params }).then(r => r.data),
  });

  const logs = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Audit Center</h1>
        <ExportButton data={logs} filename={`audit-logs-page-${page}`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div><label className="text-xs text-[var(--color-text-muted)]">Entity</label>
          <select value={filters.entityType} onChange={e => setFilters({...filters, entityType: e.target.value})} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
            <option value="">All</option>{ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div><label className="text-xs text-[var(--color-text-muted)]">Action</label>
          <select value={filters.action} onChange={e => setFilters({...filters, action: e.target.value})} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
            <option value="">All</option>{ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div><label className="text-xs text-[var(--color-text-muted)]">Actor ID</label><input value={filters.actorId} onChange={e => setFilters({...filters, actorId: e.target.value})} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg w-24" /></div>
        <div><label className="text-xs text-[var(--color-text-muted)]">From</label><input type="date" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
        <div><label className="text-xs text-[var(--color-text-muted)]">To</label><input type="date" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {isLoading ? <SkeletonRow count={5} /> : logs.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No audit logs found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                <th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Actor</th><th className="text-left px-4 py-3">Action</th><th className="text-left px-4 py-3">Entity</th><th className="text-left px-4 py-3">ID</th><th className="text-left px-4 py-3">Description</th>
              </tr></thead>
              <tbody>{logs.map((log: any) => (
                <tr key={log.id} onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                  className={`border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-bg)] ${selectedLog?.id === log.id ? 'bg-[var(--color-primary)]/5' : ''}`}>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs">{log.full_name || `User #${log.actor_id}`}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>{log.action}</span></td>
                  <td className="px-4 py-3 text-xs capitalize">{log.entity_type}</td>
                  <td className="px-4 py-3 text-xs font-mono">{log.entity_id}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] max-w-[200px] truncate">{log.reason || log.action}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Diff viewer for selected log */}
      {selectedLog && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Change Details — {selectedLog.action} on {selectedLog.entity_type} #{selectedLog.entity_id}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">Before</h4>
              <pre className="text-xs bg-[var(--color-bg)] p-3 rounded-lg overflow-x-auto max-h-60">{JSON.stringify(selectedLog.before_state ? (typeof selectedLog.before_state === 'string' ? JSON.parse(selectedLog.before_state) : selectedLog.before_state) : null, null, 2) || '—'}</pre>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">After</h4>
              <pre className="text-xs bg-[var(--color-bg)] p-3 rounded-lg overflow-x-auto max-h-60">{JSON.stringify(selectedLog.after_state ? (typeof selectedLog.after_state === 'string' ? JSON.parse(selectedLog.after_state) : selectedLog.after_state) : null, null, 2) || '—'}</pre>
            </div>
          </div>
          {selectedLog.reason && <div><span className="text-xs text-[var(--color-text-muted)]">Reason:</span><p className="text-sm mt-1">{selectedLog.reason}</p></div>}
          {selectedLog.ip_address && <div><span className="text-xs text-[var(--color-text-muted)]">IP:</span><p className="text-sm mt-1">{selectedLog.ip_address}</p></div>}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-lg disabled:opacity-30">Previous</button>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-lg disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}
