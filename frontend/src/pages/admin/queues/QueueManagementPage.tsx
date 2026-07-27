import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useCan } from '../../../hooks/useCan';
import { useToast } from '../../../components/ui/Toast';

const STATUS_COLORS: Record<string, string> = {
  waiting: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
  delayed: 'bg-amber-100 text-amber-800',
  paused: 'bg-purple-100 text-purple-800',
};

export default function QueueManagementPage() {
  const { can } = useCan();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [jobStatusFilter, setJobStatusFilter] = useState('failed');
  const [jobPage, setJobPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: queuesData, isLoading: queuesLoading } = useQuery({
    queryKey: ['admin-queues'],
    queryFn: () => api.get('/admin/queues').then((r) => r.data),
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const jobQueryKey = ['admin-queue-jobs', selectedQueue, jobStatusFilter, jobPage];
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: jobQueryKey,
    queryFn: () => {
      if (!selectedQueue) return { data: [], pagination: { page: 1, limit: 20, total: 0 } };
      return api.get(`/admin/queues/${selectedQueue}/jobs?status=${jobStatusFilter}&page=${jobPage}&limit=20`).then((r) => r.data);
    },
    enabled: !!selectedQueue,
  });

  const queues = queuesData?.data || [];
  const jobs = jobsData?.data || [];
  const pagination = jobsData?.pagination || { page: 1, limit: 20, total: 0 };
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  const retryMutation = useMutation({
    mutationFn: ({ queueName, jobId }: { queueName: string; jobId: string }) =>
      api.post(`/admin/queues/${queueName}/jobs/${jobId}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-queues'] });
      showToast('Job retried');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to retry job', 'error'),
  });

  const drainMutation = useMutation({
    mutationFn: (queueName: string) => api.post(`/admin/queues/${queueName}/drain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queues'] });
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] });
      showToast('Queue drained');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to drain queue', 'error'),
  });

  const pauseMutation = useMutation({
    mutationFn: (queueName: string) => api.post(`/admin/queues/${queueName}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queues'] });
      showToast('Queue paused');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to pause queue', 'error'),
  });

  const resumeMutation = useMutation({
    mutationFn: (queueName: string) => api.post(`/admin/queues/${queueName}/resume`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queues'] });
      showToast('Queue resumed');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to resume queue', 'error'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Queue Management</h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (5s)
        </label>
      </div>

      {queuesLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {queues.map((q: any) => (
            <div
              key={q.name}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${selectedQueue === q.name ? 'ring-2 ring-[var(--color-primary)]' : 'hover:border-[var(--color-primary)]'}`}
              onClick={() => { setSelectedQueue(q.name); setJobPage(1); }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg capitalize">{q.name}</h3>
                {q.error && <span className="text-xs text-red-500">{q.error}</span>}
              </div>
              {q.counts ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 rounded p-2">
                    <div className="text-lg font-bold">{q.counts.waiting}</div>
                    <div className="text-xs text-gray-500">Waiting</div>
                  </div>
                  <div className="bg-green-50 rounded p-2">
                    <div className="text-lg font-bold">{q.counts.active}</div>
                    <div className="text-xs text-gray-500">Active</div>
                  </div>
                  <div className="bg-gray-100 rounded p-2">
                    <div className="text-lg font-bold">{q.counts.completed}</div>
                    <div className="text-xs text-gray-500">Completed</div>
                  </div>
                  <div className="bg-red-50 rounded p-2">
                    <div className="text-lg font-bold">{q.counts.failed}</div>
                    <div className="text-xs text-gray-500">Failed</div>
                  </div>
                  <div className="bg-amber-50 rounded p-2">
                    <div className="text-lg font-bold">{q.counts.delayed}</div>
                    <div className="text-xs text-gray-500">Delayed</div>
                  </div>
                  <div className="bg-purple-50 rounded p-2">
                    <div className="text-lg font-bold">{q.counts.paused}</div>
                    <div className="text-xs text-gray-500">Paused</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-500">Error loading counts</p>
              )}
              {can('queue.manage') && selectedQueue === q.name && (
                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <button
                    onClick={(e) => { e.stopPropagation(); drainMutation.mutate(q.name); }}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Drain
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); pauseMutation.mutate(q.name); }}
                    className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                  >
                    Pause
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); resumeMutation.mutate(q.name); }}
                    className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                  >
                    Resume
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedQueue && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold capitalize">{selectedQueue} Queue Jobs</h2>
            <select
              value={jobStatusFilter}
              onChange={(e) => { setJobStatusFilter(e.target.value); setJobPage(1); }}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="failed">Failed</option>
              <option value="waiting">Waiting</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="delayed">Delayed</option>
              <option value="all">All</option>
            </select>
          </div>

          {jobsLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin h-6 w-6 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface)] border-b">
                  <tr>
                    <th className="text-left px-4 py-3">ID</th>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Attempts</th>
                    <th className="text-left px-4 py-3">Timestamp</th>
                    <th className="text-left px-4 py-3">Error</th>
                    {can('queue.manage') && <th className="text-left px-4 py-3">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr><td colSpan={can('queue.manage') ? 7 : 6} className="px-4 py-8 text-center text-gray-400">No jobs found</td></tr>
                  ) : (
                    jobs.map((job: any) => (
                      <tr key={job.id} className="border-b hover:bg-[var(--color-bg)]">
                        <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                        <td className="px-4 py-3">{job.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[job.status] || ''}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{job.attempts}/{job.maxAttempts}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {job.timestamp ? new Date(job.timestamp).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3 max-w-[200px] truncate text-xs text-red-600" title={job.failedReason || ''}>
                          {job.failedReason || '-'}
                        </td>
                        {can('queue.manage') && (
                          <td className="px-4 py-3">
                            {job.status === 'failed' && (
                              <button
                                onClick={() => retryMutation.mutate({ queueName: selectedQueue, jobId: job.id })}
                                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              >
                                Retry
                              </button>
                            )}
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
                disabled={jobPage <= 1}
                onClick={() => setJobPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border rounded disabled:opacity-50 text-sm"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm">
                Page {pagination.page} of {totalPages}
              </span>
              <button
                disabled={jobPage >= totalPages}
                onClick={() => setJobPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50 text-sm"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
