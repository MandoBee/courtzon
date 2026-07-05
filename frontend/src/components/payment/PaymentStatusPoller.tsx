import { useEffect, useRef } from 'react';
import api from '../../services/api';

interface PollPaymentStatusProps {
  endpoint: string;
  field?: string;
  paidValue?: string;
  interval?: number;
  timeout?: number;
  onPaid: (data?: any) => void;
  onTimeout: () => void;
  isComplete?: (data: any) => boolean;
}

export default function PaymentStatusPoller({
  endpoint,
  field = 'payment_status',
  paidValue = 'paid',
  interval = 1500,
  timeout = 90000,
  onPaid,
  onTimeout,
  isComplete,
}: PollPaymentStatusProps) {
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    let attempts = 0;
    const maxAttempts = Math.ceil(timeout / interval);

    const tick = async () => {
      if (stoppedRef.current) return;
      attempts++;
      if (attempts > maxAttempts) {
        stoppedRef.current = true;
        onTimeout();
        return;
      }
      try {
        const res = await api.get(endpoint);
        const data = res.data;

        if (isComplete) {
          if (isComplete(data)) {
            stoppedRef.current = true;
            onPaid(data);
            return;
          }
        } else {
          const status = typeof data === 'object' ? data[field] : data;
          if (status && status !== 'unpaid' && status !== 'pending') {
            stoppedRef.current = true;
            onPaid(data);
            return;
          }
        }
      } catch {
        // ignore polling errors
      }
      if (!stoppedRef.current) {
        setTimeout(tick, interval);
      }
    };

    tick();
    return () => { stoppedRef.current = true; };
  }, [endpoint, field, paidValue, interval, timeout, onPaid, onTimeout, isComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 text-center space-y-3">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-[var(--color-text-muted)]">Confirming payment...</p>
      </div>
    </div>
  );
}
