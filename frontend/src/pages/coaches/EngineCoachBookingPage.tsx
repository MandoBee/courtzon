import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { localTodayString } from '../../utils/formatDate';
import { formatPrice } from '../../utils/currency';
import { Button, Card, SkeletonRow } from '../../components/ui';

interface ResourceSlot {
  resourceType: string;
  resourceId: number;
  slot: { startTime: string; endTime: string };
  capabilities: { sportIds: number[]; hourlyRate?: number; currencyCode?: string };
  location: { branchId?: number; branchName?: string; organisationName?: string } | null;
}

interface BookingCandidate {
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  resources: ResourceSlot[];
  totalPrice: number;
  currencyCode?: string;
  score: number;
}

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
  const presetResourceId = searchParams.get('resourceId') ? Number(searchParams.get('resourceId')) : undefined;
  const presetBranchId = searchParams.get('branchId') ? Number(searchParams.get('branchId')) : undefined;

  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(60);
  const [hasSearched, setHasSearched] = useState(false);

  const isCoachFirst = !!presetCoachId && !presetResourceId;
  const isCourtFirst = !!presetResourceId && !presetCoachId;

  const { data: candidates, isLoading: searching, refetch } = useQuery({
    queryKey: ['scheduling-search', presetCoachId, presetResourceId, date, duration],
    queryFn: () =>
      api
        .post('/scheduling/search', {
          date,
          dayOfWeek: getDayOfWeek(date),
          durationMinutes: duration,
          coachId: presetCoachId,
          resourceId: presetResourceId,
          branchId: presetBranchId,
        })
        .then((r) => r.data.data as BookingCandidate[]),
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
      showToast('Booking failed: ' + (err?.response?.data?.message || err.message), 'error');
    },
  });

  const handleBook = (candidate: BookingCandidate) => {
    const coach = candidate.resources.find((r) => r.resourceType === 'coach');
    const court = candidate.resources.find((r) => r.resourceType === 'court');
    if (!coach || !court) return;

    bookMutation.mutate({
      coachId: coach.resourceId,
      resourceId: court.resourceId,
      date: candidate.date,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
    });
  };

  const entryLabel = isCoachFirst ? 'Find a Court' : isCourtFirst ? 'Find a Coach' : 'Find Available Sessions';

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{entryLabel}</h1>
      </div>

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
                      {d < 60 ? `${d} min` : d === 60 ? '1 hour' : `${d / 60} hours`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Can>

          <Button variant="primary" loading={searching} onClick={handleSearch} className="w-full">
            Search Available Sessions
          </Button>
        </div>
      </Card>

      {searching && <SkeletonRow count={3} />}

      {hasSearched && !searching && candidates && candidates.length === 0 && (
        <Card>
          <p className="text-center text-[var(--color-text-muted)] py-8">
            No available sessions found for this date and duration. Try a different date or duration.
          </p>
        </Card>
      )}

      {hasSearched && !searching && candidates && candidates.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            {candidates.length} session{candidates.length !== 1 ? 's' : ''} found
          </p>

          {candidates.map((candidate, idx) => {
            const coach = candidate.resources.find((r) => r.resourceType === 'coach');
            const court = candidate.resources.find((r) => r.resourceType === 'court');

            return (
              <Card key={idx}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      {coach && (
                        <p className="font-medium text-[var(--color-text)]">
                          Coach #{coach.resourceId}
                          {coach.capabilities.hourlyRate ? (
                            <span className="ml-2 text-sm text-[var(--color-text-muted)]">
                              {formatPrice(coach.capabilities.hourlyRate)}/hr
                            </span>
                          ) : null}
                        </p>
                      )}
                      {court && (
                        <p className="text-sm text-[var(--color-text-muted)]">
                          Court #{court.resourceId}
                          {court.location?.branchName ? ` at ${court.location.branchName}` : ''}
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
                    <span>{candidate.startTime} - {candidate.endTime}</span>
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
