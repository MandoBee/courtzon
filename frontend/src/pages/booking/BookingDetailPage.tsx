import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { formatPrice } from '../../utils/currency';
import { useToast } from '../../components/ui/Toast';
import { useTranslation } from '../../i18n';
import ManageApplicantsPopup from '../../components/booking/ManageApplicantsPopup';

function calcDuration(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return '';
  const [sh, sm] = startTime.slice(0, 5).split(':').map(Number);
  const [eh, em] = endTime.slice(0, 5).split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const statusColors: Record<string, string> = {
  confirmed: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  pending_payment: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  checked_in: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  completed: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
  cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  no_show: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
};

const paymentStatusColors: Record<string, string> = {
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  paid: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  refunded: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  partially_refunded: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  failed: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  penalty: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
};

const paymentMethodLabels: Record<string, string> = {
  wallet: 'Wallet',
  card: 'Credit/Debit Card',
  cash: 'Cash',
  cod: 'Cash on Delivery',
  bank_transfer: 'Bank Transfer',
  online: 'Online Payment',
};

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [manageBookingId, setManageBookingId] = useState<number | null>(null);

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get(`/bookings/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/bookings/${id}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
      showToast(t('booking.cancel_success') || 'Booking cancelled');
      setShowCancel(false);
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || err?.message || 'Cancel failed', 'error');
    },
  });

  if (isLoading) return <p className="text-[var(--color-text-muted)]">Loading...</p>;
  if (!booking) return <p className="text-[var(--color-text-muted)]">Booking not found</p>;

  const canCancel = booking.booking_status === 'confirmed' || booking.booking_status === 'pending' || booking.booking_status === 'pending_payment';
  const isPublicMatch = booking.booking_type === 'public_match';
  const duration = calcDuration(booking.start_time, booking.end_time);
  const hasRefund = Number(booking.refunded_amount) > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <ManageApplicantsPopup open={!!manageBookingId} bookingId={manageBookingId || 0} onClose={() => setManageBookingId(null)} />

      <button onClick={() => navigate(-1)} className="text-sm text-[var(--color-primary)] hover:underline mb-4 inline-block">
        ← {t('common.back') || 'Back'}
      </button>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-xl font-bold text-[var(--color-text)]">{booking.resource_name}</h1>
          <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${statusColors[booking.booking_status] || ''}`}>
            {booking.booking_status?.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-6">
          <div>
            <p className="text-[var(--color-text-muted)] text-xs">{t('booking.type') || 'Type'}</p>
            <p className="text-[var(--color-text)] font-medium capitalize">{booking.booking_type?.replace(/_/g, ' ') || '—'}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)] text-xs">{t('common.branch') || 'Branch'}</p>
            <p className="text-[var(--color-text)] font-medium">{booking.branch_name}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)] text-xs">{t('common.date') || 'Date'}</p>
            <p className="text-[var(--color-text)] font-medium">{formatISODate(booking.booking_date)}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)] text-xs">{t('common.time') || 'Time'}</p>
            <p className="text-[var(--color-text)] font-medium">
              {booking.start_time?.slice(0, 5)} – {booking.end_time?.slice(0, 5)}
              {duration ? ` (${duration})` : ''}
            </p>
          </div>
          {booking.organisation_name && (
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">{t('common.organisation') || 'Organisation'}</p>
              <p className="text-[var(--color-text)] font-medium">{booking.organisation_name}</p>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] pt-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t('booking.financial_details') || 'Payment & Financial Details'}</h2>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">{t('booking.total_amount') || 'Total'}</p>
              <p className="text-[var(--color-text)] font-semibold text-base">
                {formatPrice(Number(booking.total_amount))}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">{t('booking.payment_method') || 'Payment Method'}</p>
              <p className="text-[var(--color-text)] font-medium">
                {paymentMethodLabels[booking.payment_method] || booking.payment_method || '—'}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">{t('booking.payment_status') || 'Payment Status'}</p>
              <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${paymentStatusColors[booking.payment_status] || ''}`}>
                {booking.payment_status?.replace(/_/g, ' ') || '—'}
              </span>
            </div>
            {hasRefund && (
              <div>
                <p className="text-[var(--color-text-muted)] text-xs">{t('booking.refunded_amount') || 'Refunded'}</p>
                <p className="text-[var(--color-info)] font-medium">
                  {formatPrice(Number(booking.refunded_amount))}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <>
              {showCancel ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    className="flex-1 px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]"
                    placeholder={t('booking.cancel_reason') || 'Reason (optional)'}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                  <button
                    onClick={() => cancelMutation.mutate(cancelReason)}
                    disabled={cancelMutation.isPending}
                    className="px-4 py-2 text-sm bg-[var(--color-error)] text-white rounded-[var(--radius-md)] disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? '...' : (t('booking.cancel_confirm') || 'Confirm Cancel')}
                  </button>
                  <button
                    onClick={() => setShowCancel(false)}
                    className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)]"
                  >
                    {t('common.cancel') || 'Cancel'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancel(true)}
                  className="px-4 py-2 text-sm border border-[var(--color-error)] text-[var(--color-error)] rounded-[var(--radius-md)] hover:bg-[var(--color-error-bg)]"
                >
                  {t('booking.cancel_booking') || 'Cancel Booking'}
                </button>
              )}
            </>
          )}

          <Link
            to={`/bookings/${id}/confirmation`}
            state={{ qrToken: booking.public_id }}
            className="px-4 py-2 text-sm bg-[var(--color-info)] text-white rounded-[var(--radius-md)] hover:opacity-90"
          >
            {t('booking.qr_action') || 'QR Code'}
          </Link>

          {isPublicMatch && (booking.booking_status === 'confirmed' || booking.booking_status === 'pending') && (
            <button
              onClick={() => setManageBookingId(Number(id))}
              className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90"
            >
              {t('common.manage') || 'Manage'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
