import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Card, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';

interface DeadLetter {
  id: number;
  notificationId: number | null;
  userId: number;
  channel: string;
  payload: Record<string, any>;
  errorMessage: string;
  failedAttempts: number;
  lastErrorAt: string;
}

interface DeadLettersResponse {
  data: DeadLetter[];
}

export default function AdminDeadLettersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'notifications', 'dead-letters'],
    queryFn: () =>
      api.get('/admin/notifications/dead-letters').then((r) => {
        const body = r.data as DeadLettersResponse;
        return body;
      }),
    refetchInterval: 30000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => api.put(`/admin/notifications/dead-letters/${id}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'dead-letters'] });
      showToast('Dead letter resolved');
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Resolve failed', 'error'),
  });

  const deadLetters = data?.data || [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Dead Letter Queue</h1>
        <span className="text-sm text-[var(--color-text-muted)]">
          {deadLetters.length} unresolved
        </span>
      </div>

      {isLoading ? (
        <Spinner />
      ) : deadLetters.length === 0 ? (
        <Card>
          <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">
            No dead letters. All notifications are being delivered successfully.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {deadLetters.map((dl) => (
            <Card key={dl.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/10 text-red-600 font-medium">
                      {dl.channel}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      User #{dl.userId} · {dl.failedAttempts} failed attempt{dl.failedAttempts !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[var(--color-text)] mb-0.5">
                    {dl.errorMessage}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] font-mono truncate" title={JSON.stringify(dl.payload)}>
                    Payload: {JSON.stringify(dl.payload).slice(0, 200)}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Last error: {new Date(dl.lastErrorAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resolveMutation.mutate(dl.id)}
                  loading={resolveMutation.isPending}
                >
                  Resolve
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
