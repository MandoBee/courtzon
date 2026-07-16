import { useEffect, useRef } from 'react';
import { useLocation, useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { formatISODate } from '../../utils/formatDate';
import api from '../../services/api';

export default function BookingConfirmationPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isOwner = !!(location.state as any)?.qrToken;

  const { data: booking, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get(`/bookings/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const isPending = booking?.booking_status === 'pending';

  useEffect(() => {
    if (!isPending) return;
    const interval = setInterval(() => { refetch(); }, 3000);
    return () => clearInterval(interval);
  }, [isPending, refetch]);

  const qrToken = (location.state as any)?.qrToken || booking?.public_id;

  useEffect(() => {
    if (qrToken && canvasRef.current && !isPending) {
      QRCode.toCanvas(canvasRef.current, qrToken, {
        width: 192,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      });
    }
  }, [qrToken, booking, isPending]);

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-8 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isPending ? 'bg-[var(--color-warning-bg)]' : 'bg-[var(--color-success-bg)]'}`}>
          <span className="text-3xl">{isPending ? '⏳' : '✅'}</span>
        </div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
          {isPending ? 'Booking Pending' : 'Booking Confirmed!'}
        </h1>
        {isPending && (
          <p className="text-sm text-[var(--color-warning-text)] mb-2">
            Your payment is being verified. This should only take a moment.
          </p>
        )}
        <p className="text-sm text-[var(--color-text-muted)] mb-1">
          {booking?.booking_type === 'coach_session' && booking?.coach_name ? (
            <>Coach: <strong className="text-[var(--color-text)]">{booking.coach_name}</strong></>
          ) : (
            <>{booking?.resource_name} at {booking?.branch_name}</>
          )}
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          {formatISODate(booking?.booking_date)} &bull; {booking?.start_time?.slice(0, 5)} - {booking?.end_time?.slice(0, 5)}
        </p>

        {!isPending && qrToken && (
          <div className="bg-white p-4 rounded-[var(--radius-md)] inline-block mb-6">
            <canvas ref={canvasRef} className="mx-auto rounded-[var(--radius-md)]" />
          </div>
        )}

        {!isPending && (
          <p className="text-xs text-[var(--color-text-muted)] mb-6">
            Show this QR code at the facility for check-in.<br />
            It is also saved offline in the app.
          </p>
        )}

        <div className="space-y-2">
          {isOwner ? (
            <>
              <Link
                to="/bookings"
                className="block w-full py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90"
              >
                View My Bookings
              </Link>
              <Link
                to="/browse"
                className="block w-full py-2.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-bg)]"
              >
                Book Another
              </Link>
            </>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="block w-full py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90"
            >
              Back to Matches
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
