import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Card, Badge, Spinner } from '../../../components/ui';

export default function OrganisationSecurityPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'security', 'organisations'],
    queryFn: () => api.get('/admin/security/organisations').then(r => r.data?.data ?? []),
  });

  if (isLoading) return <Spinner size="lg" />;

  const orgs = data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Organisation Security Overview</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Per-organisation security posture</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Organisation</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Admins</th>
                <th className="px-4 py-3 font-medium">Locked Users</th>
                <th className="px-4 py-3 font-medium">Failed Logins (7d)</th>
                <th className="px-4 py-3 font-medium">Audit Actions (7d)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orgs.map((o: any) => (
                <tr key={o.id} className="hover:bg-[var(--color-bg)]/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-[var(--color-text)] font-medium">{o.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{o.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    {o.is_verified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Unverified</Badge>}
                    {!o.is_active && <Badge variant="danger" className="ml-1">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{o.admin_count}</td>
                  <td className="px-4 py-3">
                    <span className={o.locked_users > 0 ? 'text-[var(--color-error-text)] font-medium' : 'text-[var(--color-text)]'}>{o.locked_users}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={o.failed_logins_7d > 10 ? 'text-[var(--color-error-text)] font-medium' : 'text-[var(--color-text)]'}>{o.failed_logins_7d}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{o.audit_actions_7d}</td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-[var(--color-text-muted)]">No organisations found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
