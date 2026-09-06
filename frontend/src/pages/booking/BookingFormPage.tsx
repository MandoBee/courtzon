import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { Button, Input, Card } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { useTranslation } from '../../i18n';
import { localToday } from '../../utils/dateRange';
import { useResourceRoom } from '../../realtime/useResourceRoom';
import { useState, useEffect } from 'react';
import { formatPrice } from '../../utils/currency';

const BookingSchema = z.object({
  bookingDate: z.string().min(1, 'Date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  paymentMethod: z.enum(['cash', 'card']),
  notes: z.string().optional(),
});

type BookingForm = z.infer<typeof BookingSchema>;

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 0 ? 7 : d.getDay();
}

function durationFromWindow(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export default function BookingFormPage() {
  const { resourceId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const today = localToday();
  const presetCoachId = searchParams.get('coachId') ? Number(searchParams.get('coachId')) : null;

  // Unified "Book a Coach" flow (Flow B): when arriving from a coach profile the
  // coach is pre-selected; it stays selected only while the coach is eligible at
  // the chosen court/branch for the chosen time, otherwise the booking falls back
  // to court-only with a notice.
  const [coachId, setCoachId] = useState<number | null>(presetCoachId);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<BookingForm>({
    resolver: zodResolver(BookingSchema),
    defaultValues: {
      bookingDate: searchParams.get('date') || today,
      startTime: searchParams.get('startTime') || '',
      endTime: searchParams.get('endTime') || '',
      paymentMethod: 'cash',
    },
  });

  const date = watch('bookingDate');
  const startTime = watch('startTime');
  const endTime = watch('endTime');

  useResourceRoom(resourceId ? Number(resourceId) : null);

  const { data: resource } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => api.get(`/resources/${resourceId}`).then((r) => r.data),
    enabled: !!resourceId,
  });

  const { data: slotsData } = useQuery({
    queryKey: ['resource-slots', resourceId, date],
    queryFn: () => api.get(`/resources/${resourceId}/slots?date=${date}`).then((r) => r.data.data),
    enabled: !!resourceId && !!date,
  });

  // Orchestrated coach session booking (Flow B): when a coach is selected, the
  // court + coach are booked together via the scheduling engine, which derives
  // the coach session duration from the court slot duration and enforces the
  // branch coach policy + the coach's service locations.
  const coachBookingMutation = useMutation({
    mutationFn: (data: any) => api.post('/scheduling/book', data),
    onSuccess: (res) => {
      showToast('Court booked with coach session!');
      navigate(`/bookings/${res.data.bookingId}/confirmation`);
    },
    onError: (err) => {
      showToast((err as any)?.response?.data?.message || 'Booking failed', 'error');
    },
  });

  const coachCandidates = useQuery({
    queryKey: ['scheduling-search-resource', resourceId, date, startTime, endTime],
    queryFn: () =>
      api.post('/scheduling/search', {
        date,
        dayOfWeek: getDayOfWeek(date),
        durationMinutes: durationFromWindow(startTime, endTime),
        resourceId: Number(resourceId),
      }).then((r) => r.data.data),
    enabled: !!resource && !!date && !!startTime && !!endTime,
  });

  // Keep the pre-selected coach only while it is eligible at the chosen court
  // and time; otherwise fall back to court-only booking.
  useEffect(() => {
    if (!presetCoachId) return;
    if (coachCandidates.data && coachCandidates.data.length > 0) {
      const eligible = coachCandidates.data.some((candidate: any) => {
        const coachRes = candidate.resources?.find((r: any) => r.resourceType === 'coach');
        return coachRes?.resourceId === presetCoachId;
      });
      if (!eligible && coachId === presetCoachId) {
        setCoachId(null);
        showToast('The requested coach is not available at this branch for the chosen time.', 'warning');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachCandidates.data, presetCoachId]);

  const bookingMutation = useMutation({
    mutationFn: (data: any) => api.post('/bookings', data),
    onSuccess: (res) => {
      showToast(t('booking.success.created'));
      navigate(`/bookings/${res.data.id}/confirmation`, { state: { qrToken: res.data.qrToken } });
    },
    onError: (err) => {
      showToast(t('booking.error.creation_failed') + ': ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
    },
  });

  const onSubmit = (data: BookingForm) => {
    if (!resource) return;
    if (coachId) {
      // Orchestrated coach+session booking — duration derived from the court slot.
      coachBookingMutation.mutate({
        coachId,
        resourceId: Number(resourceId),
        date: data.bookingDate,
        startTime: data.startTime,
        endTime: data.endTime,
        paymentMethod: data.paymentMethod,
      });
      return;
    }
    bookingMutation.mutate({
      branchId: resource.branch_id,
      resourceId: Number(resourceId),
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: data.endTime,
      paymentMethod: data.paymentMethod,
      notes: data.notes || '',
    });
  };

  const slots: { slot_start: string; slot_end: string; status: string }[] = slotsData || [];

  const renderSlotButtons = () => {
    const available = slots.filter((s) => s.status === 'available');
    if (!available.length) return <p className="text-sm text-[var(--color-text-muted)]">No slots available</p>;
    return (
      <div className="flex flex-wrap gap-2">
        {available.map((slot) => {
          const isSelected = startTime === slot.slot_start;
          return (
            <button
              key={slot.slot_start}
              type="button"
              onClick={() => {
                setValue('startTime', slot.slot_start);
                setValue('endTime', slot.slot_end);
                setCoachId(null);
              }}
              className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] border transition-colors ${
                isSelected
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]'
              }`}
            >
              {slot.slot_start} - {slot.slot_end}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-2xl">
      <Link to={resource ? `/branches/${resource.branch_id}/resources` : '/browse'} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-4 inline-block">
        ← Back
      </Link>

      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">
        Book: {resource?.name || 'Resource'}
      </h1>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Can permission="bookings.create.date">
            <Input
              label="Select Date"
              type="date"
              {...register('bookingDate')}
              min={today}
              onChange={(e) => { setValue('bookingDate', e.target.value); setValue('startTime', ''); setValue('endTime', ''); }}
              error={errors.bookingDate?.message}
            />
          </Can>

          <Can permission="bookings.create.start-time">
            {date && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Select Time</label>
                {renderSlotButtons()}
                {errors.startTime && <p className="mt-1 text-sm text-[var(--color-error)]">{errors.startTime.message}</p>}
              </div>
            )}
          </Can>

          <Can permission="coaches.book">
            {date && startTime && endTime && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Add a Coach (optional)</label>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">Book a coach session with this court. The session duration matches your selected court time. Only coaches available at this branch are shown.</p>
                {coachCandidates.isLoading ? (
                  <p className="text-sm text-[var(--color-text-muted)]">Loading coaches...</p>
                ) : coachCandidates.isError ? (
                  <p className="text-sm text-[var(--color-error)]">Could not load coaches for this branch.</p>
                ) : coachCandidates.data && coachCandidates.data.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">No coaches available at this branch for the selected time.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCoachId(null)}
                      className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] border transition-colors ${
                        coachId === null ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)]'
                      }`}
                    >
                      Court only
                    </button>
                    {(coachCandidates.data || []).map((candidate: any) => {
                      const coachRes = candidate.resources?.find((r: any) => r.resourceType === 'coach');
                      return (
                        <button
                          key={coachRes?.resourceId}
                          type="button"
                          onClick={() => setCoachId(coachRes?.resourceId)}
                          className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] border transition-colors ${
                            coachId === coachRes?.resourceId ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)]'
                          }`}
                        >
                          {coachRes?.capabilities?.name || candidate.coachName || `Coach #${coachRes?.resourceId}`}
                          {coachRes?.capabilities?.hourlyRate && (
                            <span className="ml-1 text-xs opacity-80">{formatPrice(Number(coachRes.capabilities.hourlyRate))}/hr</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Can>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Payment Method</label>
            <div className="flex gap-3">
              {['cash', 'card'].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setValue('paymentMethod', method as any)}
                  className={`px-4 py-2 text-sm rounded-[var(--radius-md)] border transition-colors ${
                    watch('paymentMethod') === method
                      ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text)]'
                  }`}
                >
                  {method.charAt(0).toUpperCase() + method.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <Can permission="bookings.create.notes">
            <Input
              label="Notes (optional)"
              tag="textarea"
              {...register('notes')}
              rows={2}
            />
          </Can>

          {bookingMutation.isError && (
            <p className="text-sm text-[var(--color-error)]">
              {(bookingMutation.error as any)?.response?.data?.message || 'Booking failed'}
            </p>
          )}

          <Button
            type="submit"
            disabled={!startTime}
            loading={coachId ? coachBookingMutation.isPending : bookingMutation.isPending}
            className="w-full"
          >
            {coachId ? `Confirm Booking with Coach` : 'Confirm Booking'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
