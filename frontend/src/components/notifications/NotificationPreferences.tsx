import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../ui/Toast';
import api from '../../services/api';

const CATEGORIES = [
  { slug: 'bookings', label: 'Booking Notifications' },
  { slug: 'payments', label: 'Payment Notifications' },
  { slug: 'marketplace', label: 'Marketplace Notifications' },
  { slug: 'system', label: 'System Notifications' },
];

const CHANNELS = ['in_app', 'email', 'push', 'sms'] as const;

export default function NotificationPreferences() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [quietHours, setQuietHours] = useState({ enabled: false, start: '22:00', end: '08:00' });
  const [prefs, setPrefs] = useState<Record<string, Record<string, boolean>>>({});

  const savePrefs = useMutation({
    mutationFn: () => api.put('/notification-preferences', { preferences: prefs, quietHours }),
    onSuccess: () => { showToast('Preferences saved!', 'success'); qc.invalidateQueries({ queryKey: ['notification-preferences'] }); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  const toggle = (cat: string, channel: string) => {
    setPrefs(p => ({
      ...p,
      [cat]: { ...(p[cat] || {}), [channel]: !(p[cat]?.[channel] ?? true) },
    }));
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-6">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">Notification Preferences</h2>

      {/* Category × Channel matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--color-border)]">
            <th className="text-left px-3 py-2 text-xs text-[var(--color-text-muted)]">Category</th>
            {CHANNELS.map(ch => <th key={ch} className="text-center px-3 py-2 text-xs text-[var(--color-text-muted)] capitalize">{ch.replace('_', ' ')}</th>)}
          </tr></thead>
          <tbody>{CATEGORIES.map(cat => (
            <tr key={cat.slug} className="border-b border-[var(--color-border)] last:border-0">
              <td className="px-3 py-3 text-sm text-[var(--color-text)]">{cat.label}</td>
              {CHANNELS.map(ch => (
                <td key={ch} className="text-center px-3 py-3">
                  <button onClick={() => toggle(cat.slug, ch)}
                    className={`w-5 h-5 rounded border-2 transition-colors ${(prefs[cat.slug]?.[ch] ?? true) ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
                    {(prefs[cat.slug]?.[ch] ?? true) && <span className="text-white text-xs flex items-center justify-center">✓</span>}
                  </button>
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Quiet hours */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Quiet Hours</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={quietHours.enabled} onChange={e => setQuietHours({...quietHours, enabled: e.target.checked})} className="rounded" />
          Enable quiet hours
        </label>
        {quietHours.enabled && (
          <div className="grid grid-cols-2 gap-3 max-w-xs">
            <div><label className="text-xs text-[var(--color-text-muted)]">From</label><input type="time" value={quietHours.start} onChange={e => setQuietHours({...quietHours, start: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">To</label><input type="time" value={quietHours.end} onChange={e => setQuietHours({...quietHours, end: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
          </div>
        )}
      </div>

      <button onClick={() => savePrefs.mutate()} disabled={savePrefs.isPending} className="btn-primary text-sm">{savePrefs.isPending ? 'Saving...' : 'Save Preferences'}</button>
    </div>
  );
}
