import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import api from '../../../services/api';
import { Card, Badge, Spinner } from '../../../components/ui';
import { getChartColor } from '../../../theme/chart-colors';

export default function UploadSecurityPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'security', 'uploads'],
    queryFn: () => api.get('/admin/security/uploads').then(r => r.data?.data ?? {}),
  });

  const { data: recent } = useQuery({
    queryKey: ['admin', 'security', 'uploads', 'recent'],
    queryFn: () => api.get('/admin/security/uploads/recent').then(r => r.data?.data ?? []),
  });

  if (isLoading) return <Spinner size="lg" />;

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Upload Security Monitoring</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Upload volume & security activity (7 days)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Total Uploads</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{stats?.total ?? 0}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Total Storage</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{formatBytes(stats?.totalBytes)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">File Types</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{stats?.byType?.length ?? 0}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Uploads by MIME Type</h3>
          {stats?.byType?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={stats.byType} dataKey="count" nameKey="mime_type" cx="50%" cy="50%" outerRadius={80} label={({ percent }: { percent?: number }) => `${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {stats.byType.map((_: any, i: number) => (
                    <Cell key={i} fill={getChartColor(i)} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-[var(--color-text-muted)] text-center py-10">No upload data</p>}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Uploads by Entity</h3>
          {stats?.byEntity?.length > 0 ? (
            <div className="space-y-2">
              {stats.byEntity.map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-[var(--color-border)] pb-2">
                  <span className="text-[var(--color-text)] capitalize">{e.entity_type}</span>
                  <Badge variant="info">{e.count} files</Badge>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No entity data</p>}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Recent Uploads</h3>
        {recent?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((u: any) => (
                  <tr key={u.id} className="hover:bg-[var(--color-bg)]/50">
                    <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(u.created_at).toLocaleString('en-GB')}</td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text)] max-w-[200px] truncate">{u.original_name}</td>
                    <td className="px-4 py-3"><Badge variant="info">{u.mime_type}</Badge></td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{formatBytes(u.file_size)}</td>
                    <td className="px-4 py-3 text-xs"><span className="capitalize">{u.entity_type}</span> #{u.entity_id}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.processing_status === 'ready' ? 'success' : u.processing_status === 'failed' ? 'danger' : 'warning'}>
                        {u.processing_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No recent uploads</p>}
      </Card>
    </div>
  );
}
