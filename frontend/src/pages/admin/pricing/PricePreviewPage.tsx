import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { pricingApi } from '../../../services/pricing';
import { Skeleton } from '../../../components/ui/Skeleton';

export default function PricePreviewPage() {
  const [form, setForm] = useState({ resourceId: 1, date: new Date().toISOString().split('T')[0], startTime: '10:00', endTime: '11:00', expectedOccupancy: '' });

  const preview = useMutation({
    mutationFn: (data: any) => pricingApi.preview(data),
  });

  const handlePreview = () => {
    preview.mutate({
      resourceId: form.resourceId,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      expectedOccupancy: form.expectedOccupancy ? Number(form.expectedOccupancy) : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">Price Preview & Simulator</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Booking Parameters</h2>
          <div className="space-y-3">
            <div><label className="text-xs text-[var(--color-text-muted)]">Resource ID</label><input type="number" value={form.resourceId} onChange={e => setForm({...form, resourceId: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Date</label><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-[var(--color-text-muted)]">Start</label><input type="time" value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
              <div><label className="text-xs text-[var(--color-text-muted)]">End</label><input type="time" value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            </div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Expected Occupancy (0.0 – 1.0)</label><input type="number" step="0.1" min="0" max="1" value={form.expectedOccupancy} onChange={e => setForm({...form, expectedOccupancy: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <button onClick={handlePreview} disabled={preview.isPending} className="w-full btn-primary">
              {preview.isPending ? 'Calculating...' : 'Preview Price'}
            </button>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Price Breakdown</h2>
          {preview.isPending ? (
            <div className="space-y-3"><Skeleton height={20} /><Skeleton height={20} /><Skeleton height={20} /></div>
          ) : preview.data ? (
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
                <span className="text-sm text-[var(--color-text-muted)]">Base Price</span>
                <span className="text-sm font-medium">EGP {preview.data.basePrice}</span>
              </div>
              {(preview.data.breakdown || []).slice(1).map((step: any, i: number) => (
                <div key={i} className="flex justify-between py-1">
                  <div>
                    <p className="text-sm text-[var(--color-text)]">{step.label}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{step.ruleName}</p>
                  </div>
                  <span className={`text-sm font-medium ${step.outputAmount > step.inputAmount ? 'text-red-600' : 'text-green-600'}`}>
                    EGP {step.outputAmount}
                  </span>
                </div>
              ))}
              <div className="flex justify-between py-3 border-t-2 border-[var(--color-primary)] mt-2">
                <span className="text-base font-bold text-[var(--color-text)]">Final Price</span>
                <span className="text-base font-bold text-[var(--color-primary)]">EGP {preview.data.finalPrice}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-8">Enter parameters and click Preview Price</p>
          )}
        </div>
      </div>
    </div>
  );
}
