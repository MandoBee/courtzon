import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { Button, Input, Card } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

const BookingSchema = z.object({
  bookingDate: z.string().min(1, 'Date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  paymentMethod: z.enum(['cash', 'card', 'online']),
  notes: z.string().optional(),
});

type BookingForm = z.infer<typeof BookingSchema>;

export default function BookingFormPage() {
  const { resourceId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

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

  const bookingMutation = useMutation({
    mutationFn: (data: any) => api.post('/bookings', data),
    onSuccess: (res) => {
      showToast('Booking created successfully!');
      navigate(`/bookings/${res.data.id}/confirmation`, { state: { qrToken: res.data.qrToken } });
    },
    onError: (err) => {
      showToast('Booking failed: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
    },
  });

  const onSubmit = (data: BookingForm) => {
    if (!resource) return;
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

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Payment Method</label>
            <div className="flex gap-3">
              {['cash', 'card', 'online'].map((method) => (
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
            loading={bookingMutation.isPending}
            className="w-full"
          >
            Confirm Booking
          </Button>
        </form>
      </Card>
    </div>
  );
}
