import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { formatPrice } from '../../utils/currency';
import { localTodayString } from '../../utils/formatDate';
import { useAuthStore } from '../../store/auth.store';

export default function CoachBookingPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const today = localTodayString();
  const [sessionDate, setSessionDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [selectedOrgId, setSelectedOrgId] = useState<number | ''>(searchParams.get('orgId') ? Number(searchParams.get('orgId')) : '');
  const preselectedOrg = searchParams.get('orgId');

  const { data: coach } = useQuery({
    queryKey: ['coach', id],
    queryFn: () => api.get(`/coaches/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: agreements } = useQuery({
    queryKey: ['coach-agreements', id],
    queryFn: () => api.get(`/coaches/${id}/agreements`).then((r) => r.data?.data || []),
    enabled: !!id,
  });

  useEffect(() => {
    if (preselectedOrg && agreements && !agreements.some((a: any) => a.organisation_id === Number(preselectedOrg))) {
      setSelectedOrgId('');
      showToast('This organisation has not accepted the coach yet', 'warning');
    }
  }, [preselectedOrg, agreements, showToast]);

  const effectiveRate = selectedOrgId && agreements
    ? (agreements.find((a: any) => a.organisation_id === selectedOrgId)?.hourly_rate || coach?.hourly_rate)
    : coach?.hourly_rate;
  const effectiveRateNum = effectiveRate ? Number(effectiveRate) : 0;

  const bookMutation = useMutation({
    mutationFn: (data: any) => api.post('/coaches/sessions', data),
    onSuccess: () => {
      showToast('Coach session booked successfully!');
      navigate('/coaches/sessions/me');
    },
    onError: (err) => {
      showToast('Booking failed: ' + (err as any).message, 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionDate || !startTime) return;
    if (sessionDate < today) {
      showToast('Session date cannot be in the past', 'error');
      return;
    }
    const endTime = addMinutes(startTime, duration);
    bookMutation.mutate({
      playerId: user?.id,
      organisationId: selectedOrgId || undefined,
      startTime: `${sessionDate}T${startTime}`,
      endTime: `${sessionDate}T${endTime}`,
      price: effectiveRateNum ? effectiveRateNum * (duration / 60) : 0,
      currencyCode: coach?.currency_code || user?.defaultCurrency || 'USD',
    });
  };

  const durationsArr: number[] = Array.isArray(coach?.session_durations)
    ? coach.session_durations
    : typeof coach?.session_durations === 'string'
      ? JSON.parse(coach.session_durations)
      : [30, 60, 90, 120];

  return (
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Book a Session with {coach?.name || 'Coach'}</h1>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 space-y-4">
        <Can permission="coaches.book.date">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Date</label>
            <input
              type="date"
              value={sessionDate}
              min={today}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
            />
          </div>
        </Can>
        <Can permission="coaches.book.time">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Start Time</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
          </div>
        </Can>
        <Can permission="coaches.book.organisation">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Organisation</label>
            <select value={selectedOrgId} disabled={!!preselectedOrg} onChange={(e) => setSelectedOrgId(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm disabled:opacity-60 disabled:cursor-not-allowed">
              <option value="">-- No organisation --</option>
              {(agreements || []).map((a: any) => (
                <option key={a.organisation_id} value={a.organisation_id}>{a.organisation_name}</option>
              ))}
            </select>
          </div>
        </Can>
        <Can permission="coaches.book.duration">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
            >
              {durationsArr.map((d: number) => (
                  <option key={d} value={d}>{d < 60 ? `${d} min` : d === 60 ? '1 hour' : `${d / 60} hours`}</option>
                ))}
              </select>
            </div>
          </Can>
          <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-[var(--color-text-muted)]">
                Session Fee{selectedOrgId && effectiveRate !== coach?.hourly_rate ? ' (org rate)' : ''}
              </span>
              <span className="font-medium">
                {effectiveRateNum ? formatPrice(effectiveRateNum * (duration / 60)) : '—'}
              </span>
            </div>
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Rate</span>
              <span>{effectiveRateNum ? formatPrice(effectiveRateNum) + '/hr' : '—'}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={bookMutation.isPending}
              className="flex-1 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50"
            >
              {bookMutation.isPending ? 'Booking...' : 'Confirm Booking'}
            </button>
            <button type="button" onClick={() => navigate('/coaches')} className="px-4 py-2.5 border rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Cancel
            </button>
          </div>
          {bookMutation.isError && (
            <p className="text-sm text-[var(--color-error)]">{(bookMutation.error as any)?.message || 'Booking failed'}</p>
          )}
        </div>
      </form>
    );
  }

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
