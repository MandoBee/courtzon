import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import BookingModal from '../../components/booking/BookingModal';
import ManageApplicantsPopup from '../../components/booking/ManageApplicantsPopup';
import { Skeleton, SkeletonList } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';

const PAGE_SIZES = [10, 20, 30, 50];

export default function MyBookingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [manageBookingId, setManageBookingId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<'date' | 'nearest'>('date');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const queryParams = new URLSearchParams({ status: statusFilter, page: String(page), limit: String(limit) });
  if (sortMode === 'nearest' && userCoords) {
    queryParams.set('sortBy', 'nearest');
    queryParams.set('lat', String(userCoords.lat));
    queryParams.set('lng', String(userCoords.lng));
  }

  const { data, isLoading } = useQuery({
    queryKey: sortMode === 'nearest' && userCoords
      ? ['my-bookings', statusFilter, page, limit, sortMode, userCoords.lat, userCoords.lng]
      : ['my-bookings', statusFilter, page, limit, sortMode],
    queryFn: () => api.get(`/bookings?${queryParams.toString()}`).then((r) => r.data),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (sortMode === 'nearest' && !userCoords && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, [sortMode, userCoords]);

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/bookings/${id}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      setCancellingId(null);
      setCancelReason('');
    },
  });

  const bookings = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const statusCounts: Record<string, number> = data?.statusCounts || {};

  const statusColors: Record<string, string> = {
    confirmed: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
    pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
    cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
    checked_in: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
    completed: 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] text-[var(--color-text-muted)]',
    no_show: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  };

  const filterStatuses = ['', 'confirmed', 'pending', 'checked_in', 'completed', 'cancelled'];

  const statusLabel = (s: string) => {
    if (!s) {
      const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      return `All (${total})`;
    }
    const name = s.replace(/_/g, ' ');
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} (${statusCounts[s] || 0})`;
  };

  const filterSelectClass =
    'px-3 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton width={200} height={28} />
        <SkeletonList count={5} itemHeight={72} />
      </div>
    );
  }

  return (
    <div>
      <BookingModal open={showBooking} onClose={() => setShowBooking(false)} />
      <ManageApplicantsPopup
        open={!!manageBookingId}
        bookingId={manageBookingId || 0}
        onClose={() => setManageBookingId(null)}
      />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('booking.my_bookings')}</h1>
        <button onClick={() => setShowBooking(true)} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
          {t('booking.new_booking')}
        </button>
      </div>

      <div className="hidden md:flex gap-2 mb-4 flex-wrap">
        {filterStatuses.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              statusFilter === s
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {statusLabel(s)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filter by status"
          className={`md:hidden ${filterSelectClass}`}
        >
          {filterStatuses.map((s) => (
            <option key={s || 'all'} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select
          value={sortMode}
          onChange={(e) => { setSortMode(e.target.value as 'date' | 'nearest'); setPage(1); }}
          className={filterSelectClass}
        >
          <option value="date">{t('booking.sort_date')}</option>
          <option value="nearest">{t('booking.sort_nearest')}</option>
        </select>
        {sortMode === 'nearest' && !userCoords && (
          <span className="text-xs text-[var(--color-text-muted)]">{t('booking.enable_location')}</span>
        )}
      </div>

      <div className="space-y-3">
        {bookings.map((booking: any) => (
          <div key={booking.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-xs text-[var(--color-text-muted)] truncate min-w-0 flex-1">
                {booking.organisation_name} · {booking.branch_name}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {booking.booking_type === 'public_match' && (booking.booking_status === 'confirmed' || booking.booking_status === 'pending') && (
                  <button
                    onClick={() => setManageBookingId(booking.id)}
                    className="px-2.5 py-1 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 whitespace-nowrap"
                  >
                    {t('common.manage')}
                  </button>
                )}
                {(booking.booking_status === 'confirmed' || booking.booking_status === 'checked_in') && (
                  <>
                    <Link
                      to={`/bookings/${booking.id}/confirmation`}
                      state={{ qrToken: booking.public_id }}
                      className="text-xs font-medium text-[var(--color-info)] hover:underline"
                    >
                      {t('booking.qr_action')}
                    </Link>
                    {booking.booking_status === 'confirmed' && (
                      <button
                        onClick={() => setCancellingId(cancellingId === booking.id ? null : booking.id)}
                        className="text-xs font-medium text-[var(--color-error)] hover:underline"
                      >
                        {t('booking.cancel_action')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
              <h3 className="font-semibold text-base text-[var(--color-text)] leading-snug">{booking.resource_name}</h3>
              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[booking.booking_status] || ''}`}>
                {booking.booking_status}
              </span>
              {booking.booking_type === 'public_match' && (
                <>
                  <span className="text-xs font-semibold text-[var(--color-info)]">Public</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    👥 {booking.accepted_count || 0}/{booking.applied_count || 0}
                  </span>
                </>
              )}
              {booking.booking_type === 'private_match' && (
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">Private</span>
              )}
            </div>

            <div className="flex items-center gap-2.5 text-xs text-[var(--color-text)] overflow-x-auto pb-0.5">
              <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                <span aria-hidden>📅</span>
                {new Date(booking.booking_date).toLocaleDateString('en-GB')}
              </span>
              <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                <span aria-hidden>⏰</span>
                {booking.start_time?.slice(0, 5)}–{booking.end_time?.slice(0, 5)}
              </span>
              <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap font-semibold text-[var(--color-primary)]">
                <span aria-hidden>💰</span>
                {formatPrice(Number(booking.total_amount), booking.currency_code)}
              </span>
              {booking.distance_km != null && (
                <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap text-[var(--color-text-muted)]">
                  <span aria-hidden>📍</span>
                  {Number(booking.distance_km).toFixed(0)} km
                </span>
              )}
            </div>

            {cancellingId === booking.id && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={t('booking.cancel_reason')}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => cancelMutation.mutate({ id: booking.id, reason: cancelReason })}
                    disabled={!cancelReason || cancelMutation.isPending}
                    className="px-3 py-1.5 bg-[var(--color-error)] text-white text-xs rounded-[var(--radius-md)] disabled:opacity-50"
                  >
                    {t('booking.confirm_cancel')}
                  </button>
                  <button onClick={() => setCancellingId(null)} className="px-3 py-1.5 border text-xs rounded-[var(--radius-md)]">
                    {t('common.back')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {bookings.length === 0 && (
          <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
            {t('booking.empty')}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">{t('common.rows')}</span>
            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 text-xs border rounded bg-[var(--color-surface)]">
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-30">{t('common.previous')}</button>
            <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages || 1}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-30">{t('common.next')}</button>
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">{total} total</span>
        </div>
      )}
    </div>
  );
}
