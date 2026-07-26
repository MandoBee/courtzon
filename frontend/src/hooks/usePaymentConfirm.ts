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
  const _refStart = useRef(Date.now());

  const confirm = useCallback(async (paymentId: number): Promise<ConfirmResult> => {
    _refStart.current = Date.now();
    stoppedRef.current = false;
    setState('confirming');
    console.log(`[TRACE][React][+0ms][${new Date(_refStart.current).toISOString()}] [usePaymentConfirm:${paymentId}] ENTRY — state=confirming`);

    // Step 1: Call POST /payments/confirm (verifies with Paymob)
    try {
      console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] AXIOS POST /payments/confirm START`);
      const res = await api.post('/payments/confirm', { paymentId });
      const data = res.data;
      console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] AXIOS POST /payments/confirm DONE confirmed=${data.confirmed} paymentStatus=${data.paymentStatus} idempotent=${data.idempotent}`);

      if (data.confirmed) {
        console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] → CONFIRMED immediately`);
        setState('confirmed');
        setResult(data);
        return { confirmed: true, state: 'confirmed', data };
      }

      if (data.paymentStatus === 'paid') {
        console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] → CONFIRMED via paymentStatus=paid`);
        setState('confirmed');
        setResult(data);
        return { confirmed: true, state: 'confirmed', data };
      }
    } catch (err: any) {
      console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] AXIOS POST FAILED msg=${err?.message} — falling back to polling`);
    }

    // Step 2: Poll GET /payments/status/:id (up to 15s)
    setState('polling');
    console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] state=polling — starting 15-iteration poll`);
    const maxAttempts = 15;
    const intervalMs = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      if (stoppedRef.current) {
        console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] STOPPED by reset at iteration ${i}`);
        setState('idle');
        return { confirmed: false, state: 'idle' };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] POLL iteration=${i + 1}/${maxAttempts}`);
        const res = await api.get(`/payments/status/${paymentId}`);
        const status = res.data?.paymentStatus;
        console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] POLL_RESULT iteration=${i + 1} status=${status}`);
        if (status === 'paid') {
          console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] → CONFIRMED via poll at iteration ${i + 1}`);
          setState('confirmed');
          setResult(res.data);
          return { confirmed: true, state: 'confirmed', data: res.data };
        }
        if (status === 'failed') {
          console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] → FAILED via poll at iteration ${i + 1}`);
          setState('failed');
          return { confirmed: false, state: 'failed' };
        }
      } catch {
        console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] POLL iteration=${i + 1} FAILED — retrying`);
      }
    }

    // Step 3: Timed out — webhook will complete the process
    console.log(`[TRACE][React][+${Date.now() - _refStart.current}ms][${new Date().toISOString()}] [usePaymentConfirm:${paymentId}] TIMEOUT after ${maxAttempts} polls`);
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
