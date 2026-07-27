import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { getErrorMessage } from '../../utils/errors';
import { SkeletonRow } from '../../components/ui/Skeleton';
import api from '../../services/api';

export default function DeviceManagementPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const { data: devices, isLoading } = useQuery({
    queryKey: ['my', 'devices'],
    queryFn: () => api.get('/my/devices').then((r) => r.data?.data || r.data || []),
  });

  const deviceList: any[] = Array.isArray(devices) ? devices : [];

  const removeMutation = useMutation({
    mutationFn: (deviceId: number) => api.delete(`/my/devices/${deviceId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my', 'devices'] });
      showToast(t('player.device_removed'));
      setConfirmId(null);
    },
    onError: (err) => {
      showToast(getErrorMessage(err, t('player.device_remove_error')), 'error');
      setConfirmId(null);
    },
  });

  const deviceIcon = (type?: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('mobile') || t.includes('phone') || t.includes('ios') || t.includes('android')) return '📱';
    if (t.includes('tablet') || t.includes('ipad')) return '📟';
    if (t.includes('mac') || t.includes('laptop')) return '💻';
    return '🖥️';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-[var(--color-border)] rounded animate-pulse" />
        <SkeletonRow count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.device_management')}</h1>

      {deviceList.length === 0 ? (
        <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
          {t('player.no_devices')}
        </div>
      ) : (
        <div className="space-y-2">
          {deviceList.map((d: any) => (
            <div key={d.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{deviceIcon(d.device_type || d.type || d.os)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {d.device_name || d.name || `${d.device_type || d.type || t('player.unknown_device')}`}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {[d.os, d.browser, d.device_type || d.type].filter(Boolean).join(' · ')}
                  </p>
                  {d.last_active || d.lastActive ? (
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {t('player.last_active')}: {new Date(d.last_active || d.lastActive).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
                <Can permission="profile.devices.remove">
                  {confirmId === d.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => removeMutation.mutate(d.id)}
                        disabled={removeMutation.isPending}
                        className="px-2.5 py-1.5 text-xs font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                      >
                        {t('common.confirm')}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="px-2.5 py-1.5 text-xs font-medium border border-[var(--color-border)] rounded-[var(--radius-md)]"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(d.id)}
                      className="px-3 py-1.5 text-xs font-medium text-[var(--color-error)] border border-[var(--color-error)]/30 rounded-[var(--radius-md)] hover:bg-[var(--color-error)]/10 transition-colors"
                    >
                      {t('common.remove')}
                    </button>
                  )}
                </Can>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
