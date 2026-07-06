import { useState, useCallback, useRef } from 'react';
import api from '../services/api';

type ConfirmState = 'idle' | 'confirming' | 'polling' | 'confirmed' | 'pending' | 'failed' | 'timeout';

interface ConfirmResult {
  confirmed: boolean;
  pending?: boolean;
  state: ConfirmState;
  data?: any;
}

export function usePaymentConfirm() {
  const [state, setState] = useState<ConfirmState>('idle');
  const [result, setResult] = useState<any>(null);
  const stoppedRef = useRef(false);

  const confirm = useCallback(async (paymentId: number): Promise<ConfirmResult> => {
    stoppedRef.current = false;
    setState('confirming');

    // Step 1: Call POST /payments/confirm (verifies with Paymob)
    try {
      const res = await api.post('/payments/confirm', { paymentId });
      const data = res.data;

      if (data.confirmed) {
        setState('confirmed');
        setResult(data);
        return { confirmed: true, state: 'confirmed', data };
      }

      if (data.paymentStatus === 'paid') {
        setState('confirmed');
        setResult(data);
        return { confirmed: true, state: 'confirmed', data };
      }
    } catch {
      // confirm endpoint failed — fall back to polling
    }

    // Step 2: Poll GET /payments/status/:id (up to 15s)
    setState('polling');
    const maxAttempts = 15;
    const intervalMs = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      if (stoppedRef.current) {
        setState('idle');
        return { confirmed: false, state: 'idle' };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await api.get(`/payments/status/${paymentId}`);
        const status = res.data?.paymentStatus;
        if (status === 'paid') {
          setState('confirmed');
          setResult(res.data);
          return { confirmed: true, state: 'confirmed', data: res.data };
        }
        if (status === 'failed') {
          setState('failed');
          return { confirmed: false, state: 'failed' };
        }
      } catch {
        // retry
      }
    }

    // Step 3: Timed out — webhook will complete the process
    setState('timeout');
    return { confirmed: false, pending: true, state: 'timeout' };
  }, []);

  const reset = useCallback(() => {
    stoppedRef.current = true;
    setState('idle');
    setResult(null);
  }, []);

  return { state, result, confirm, reset };
}
