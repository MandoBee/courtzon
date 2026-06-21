import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Card, Badge, Spinner } from '../../../components/ui';

export default function RoleAuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'security', 'role-audit'],
    queryFn: () => api.get('/admin/security/role-audit').then(r => r.data?.data ?? []),
  });

  if (isLoading) return <Spinner size="lg" />;

  const logs = data || [];

  const actionColor = (action: string) => {
    if (action.includes('CREATE')) return 'success';
    if (action.includes('DELETE')) return 'danger';
    if (action.includes('UPDATE')) return 'warning';
    return 'info';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Role & Permission Audit</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Recent changes to roles, permissions, and assignments</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-[var(--color-bg)]/50">
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('en-GB')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={actionColor(log.action) as any}>{log.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="capitalize">{log.entity_type}</span>
                    {log.entity_id && <span className="text-[var(--color-text-muted)]"> #{log.entity_id}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {log.full_name || <span className="text-[var(--color-text-muted)]">User #{log.actor_id}</span>}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {log.reason && <p className="text-xs text-amber-600 mb-1">{log.reason}</p>}
                    {log.after_state && (
                      <details className="text-xs text-[var(--color-text-muted)]">
                        <summary className="cursor-pointer hover:text-[var(--color-text)]">View state</summary>
                        <pre className="mt-1 p-2 bg-[var(--color-bg)] bg-[var(--color-bg)] rounded overflow-x-auto max-h-24 text-[10px]">
                          {JSON.stringify(typeof log.after_state === 'string' ? JSON.parse(log.after_state) : log.after_state, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-[var(--color-text-muted)]">No role/permission audit logs found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
