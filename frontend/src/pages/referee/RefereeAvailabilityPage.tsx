import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { SkeletonRow } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);

export default function RefereeAvailabilityPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: availability, isLoading } = useQuery({
    queryKey: ['referee-availability'],
    queryFn: () => api.get('/referee/availability').then((r) => r.data),
  });

  const [weeklySlots, setWeeklySlots] = useState<Record<string, string[]>>({});
  const [blackoutDate, setBlackoutDate] = useState('');
  const [blackoutReason, setBlackoutReason] = useState('');

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put('/referee/availability', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referee-availability'] });
      showToast(t('referee.availability.updated', 'Availability updated'));
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error', 'Something went wrong'), 'error'),
  });

  const blackoutMutation = useMutation({
    mutationFn: (data: any) => api.post('/referee/availability/blackouts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referee-availability'] });
      showToast(t('referee.availability.blackout_added', 'Blackout date added'));
      setBlackoutDate('');
      setBlackoutReason('');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error', 'Something went wrong'), 'error'),
  });

  const toggleSlot = (day: string, hour: string) => {
    setWeeklySlots((prev) => {
      const slots = prev[day] ? [...prev[day]] : [];
      const idx = slots.indexOf(hour);
      if (idx >= 0) slots.splice(idx, 1);
      else slots.push(hour);
      return { ...prev, [day]: slots.sort() };
    });
  };

  const handleSave = () => {
    updateMutation.mutate({ weeklySlots: weeklySlots });
  };

  const initData = availability?.weeklySlots || availability?.weekly_slots || {};

  if (isLoading) return <div className="py-8"><SkeletonRow count={6} /></div>;

  return (
    <div className="space-y-5 md:space-y-6 pb-4 max-w-4xl">
      <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
        {t('referee.availability.title', 'Availability')}
      </h1>

      <Can permission="referee.availability.manage">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">
            {t('referee.availability.weekly_schedule', 'Weekly Schedule')}
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-1.5 text-left text-[var(--color-text-muted)] font-medium">{t('referee.availability.day', 'Day')}</th>
                  {HOURS.map((h) => (
                    <th key={h} className="p-1.5 text-center text-[var(--color-text-muted)] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day} className="border-t border-[var(--color-border)]">
                    <td className="p-1.5 font-medium text-[var(--color-text)] whitespace-nowrap">{day}</td>
                    {HOURS.map((hour) => {
                      const active = (weeklySlots[day] || initData[day] || []).includes(hour);
                      return (
                        <td key={hour} className="p-0.5">
                          <button
                            onClick={() => toggleSlot(day, hour)}
                            className={`w-full h-6 rounded-[var(--radius-sm)] text-[10px] transition-colors ${
                              active
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'
                            }`}
                          >
                            {active ? '✓' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="mt-3 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
          >
            {updateMutation.isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </button>
        </div>
      </Can>

      <Can permission="referee.availability.manage">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            {t('referee.availability.blackout_dates', 'Blackout Dates')}
          </h2>

          {(availability?.blackouts || []).map((b: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-sm text-[var(--color-text)] border-b border-[var(--color-border)] pb-2">
              <span>{b.date} {b.reason ? `— ${b.reason}` : ''}</span>
            </div>
          ))}
          {(!availability?.blackouts || availability.blackouts.length === 0) && (
            <p className="text-sm text-[var(--color-text-muted)]">{t('referee.availability.no_blackouts', 'No blackout dates')}</p>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <input
              type="date"
              value={blackoutDate}
              onChange={(e) => setBlackoutDate(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)]"
            />
            <input
              value={blackoutReason}
              onChange={(e) => setBlackoutReason(e.target.value)}
              placeholder={t('referee.availability.reason_placeholder', 'Reason (optional)')}
              className="flex-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)]"
            />
            <button
              onClick={() => blackoutMutation.mutate({ date: blackoutDate, reason: blackoutReason })}
              disabled={!blackoutDate || blackoutMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
            >
              {t('referee.availability.add_blackout', 'Add')}
            </button>
          </div>
        </div>
      </Can>
    </div>
  );
}
