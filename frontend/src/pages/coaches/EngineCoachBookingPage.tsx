import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { localTodayString } from '../../utils/formatDate';
import { formatPrice } from '../../utils/currency';
import { Button, Card, SkeletonRow } from '../../components/ui';

const DURATIONS = [30, 60, 90, 120];

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 0 ? 7 : d.getDay();
}

export default function EngineCoachBookingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const today = localTodayString();

  const presetCoachId = searchParams.get('coachId') ? Number(searchParams.get('coachId')) : undefined;
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(60);
  const [hasSearched, setHasSearched] = useState(false);

  const { data: coach } = useQuery({
    queryKey: ['coach', presetCoachId],
    queryFn: () => api.get(`/coaches/${presetCoachId}`).then((r) => r.data),
    enabled: !!presetCoachId,
  });

  const { data: candidates, isLoading: searching, refetch } = useQuery({
    queryKey: ['scheduling-search', presetCoachId, date, duration],
    queryFn: () =>
      api.post('/scheduling/search', {
        date,
        dayOfWeek: getDayOfWeek(date),
        durationMinutes: duration,
        coachId: presetCoachId,
      }).then((r) => r.data.data),
    enabled: false,
  });

  const handleSearch = () => {
    if (date < today) {
      showToast('Date cannot be in the past', 'error');
      return;
    }
    setHasSearched(true);
    refetch();
  };

  const bookMutation = useMutation({
    mutationFn: (payload: { coachId: number; resourceId: number; date: string; startTime: string; endTime: string }) =>
      api.post('/scheduling/book', payload),
    onSuccess: (res) => {
      showToast('Coach session booked successfully!');
      navigate(`/bookings/${res.data.bookingId}/confirmation`);
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Booking failed', 'error');
    },
  });

  const handleBook = (candidate: any) => {
    const coachRes = candidate.resources?.find((r: any) => r.resourceType === 'coach');
    const courtRes = candidate.resources?.find((r: any) => r.resourceType === 'court');
    if (!coachRes || !courtRes) return;
    bookMutation.mutate({
      coachId: coachRes.resourceId,
      resourceId: courtRes.resourceId,
      date: candidate.date,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">Book a Coach Session</h1>
      </div>

      {coach && (
        <Link
          to={`/coaches/${presetCoachId}`}
          className="block bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 hover:shadow-[var(--shadow-md)] transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-lg font-bold text-[var(--color-primary)]">
              {coach.full_name?.charAt(0) || 'C'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--color-text)] truncate">{coach.full_name}</p>
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mt-0.5">
                {coach.hourly_rate && <span>{formatPrice(Number(coach.hourly_rate))}/hr</span>}
                {coach.experience_years > 0 && <span>· {coach.experience_years} yrs</span>}
                {coach.rating_avg > 0 && <span>· ★ {Number(coach.rating_avg).toFixed(1)}</span>}
              </div>
            </div>
            <span className="text-xs text-[var(--color-primary)]">View Profile →</span>
          </div>
        </Link>
      )}

      <Card>
        <div className="space-y-4">
          <Can permission="coaches.book.date">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d < 60 ? `${d} min` : d === 60 ? '1 hour' : `${d / 2} hours`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Can>

          <Button variant="primary" loading={searching} onClick={handleSearch} className="w-full">
            {presetCoachId ? 'Find Available Courts' : 'Search Available Sessions'}
          </Button>
        </div>
      </Card>

      {searching && <SkeletonRow count={3} />}

      {hasSearched && !searching && candidates?.length === 0 && (
        <Card>
          <p className="text-center text-[var(--color-text-muted)] py-8">
            No available sessions found. Try a different date or duration.
          </p>
        </Card>
      )}

      {hasSearched && !searching && candidates && candidates.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            {candidates.length} session{candidates.length !== 1 ? 's' : ''} found
          </p>
          {candidates.map((candidate: any, idx: number) => {
            const coachRes = candidate.resources?.find((r: any) => r.resourceType === 'coach');
            const courtRes = candidate.resources?.find((r: any) => r.resourceType === 'court');
            return (
              <Card key={idx}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-[var(--color-text)]">
                        {coach?.full_name || `Coach`}
                        {coachRes?.capabilities?.hourlyRate && (
                          <span className="ml-2 text-sm text-[var(--color-text-muted)]">
                            {formatPrice(coachRes.capabilities.hourlyRate)}/hr
                          </span>
                        )}
                      </p>
                      {courtRes?.location?.branchName && (
                        <p className="text-sm text-[var(--color-text-muted)] mt-1">
                          🎾 {courtRes.location.branchName}
                          {courtRes.location.organisationName ? ` · ${courtRes.location.organisationName}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[var(--color-primary)]">
                        {formatPrice(candidate.totalPrice)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <span>{candidate.date}</span>
                    <span>·</span>
                    <span>{candidate.startTime?.slice(0, 5)} - {candidate.endTime?.slice(0, 5)}</span>
                    <span>·</span>
                    <span>{duration} min</span>
                  </div>

                  <Can permission="coaches.book.date">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={bookMutation.isPending}
                      onClick={() => handleBook(candidate)}
                      className="w-full"
                    >
                      Book This Session
                    </Button>
                  </Can>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
