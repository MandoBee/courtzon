import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Input } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import { useCan } from '../../../hooks/useCan';
import { Can } from '../../../permissions/Can';
import { localToday } from '../../../utils/dateRange';
import { formatPrice } from '../../../utils/currency';

// ── R3 — Recurring Booking management (responsible users only) ────────────
// Builds a weekly recurring series ON BEHALF OF ONE PLAYER. The wizard:
//   definition → preview (full occurrence matrix + conflicts + alternatives)
//   → admin resolution (alternative court → same-day alternative time → skip)
//   → summary → confirm (server re-checks availability; TOCTOU-safe).
//
// ── R5-B — ONE card payment for the WHOLE series ──────────────────────────
// After the series exists, the same screen collects a single card payment
// against the backend's AUTHORITATIVE series total. The browser sends only the
// series id (plus a return URL): it never sends an amount, a player, a
// currency or a reference, and it never computes the price. On return from the
// gateway the backend read is authoritative — the URL is not.
//
// The PLAYER owns the payment (`payment_transactions.user_id`); the operator is
// only recorded on `booking_series.created_by` and the audit log.

type PlayerOption = { userId: number; fullName: string; email: string; phone: string };
type Resolution = { action: 'book' | 'skip'; courtId?: number; startTime?: string; endTime?: string };

const WEEKDAY_LABELS: { n: number; label: string }[] = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 7, label: 'Sun' },
];

export default function RecurringBookingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { can } = useCan();
  const qc = useQueryClient();
  const authorized = can('org.bookings.manage') || can('admin.bookings.update-status');

  const createdId = searchParams.get('created');
  // R5-B — the gateway appends nothing, we set `payment=return` in returnUrl so
  // the browser coming back from checkout is distinguishable from a plain reload.
  // It is a UI HINT only: the payment state is always read from the backend.
  const paidReturn = searchParams.get('payment') === 'return';
  const [step, setStep] = useState<'definition' | 'preview' | 'summary'>('definition');

  // Definition
  const [playerSearch, setPlayerSearch] = useState('');
  const [player, setPlayer] = useState<PlayerOption | null>(null);
  const [branchId, setBranchId] = useState<string>('');
  const [resourceId, setResourceId] = useState<string>('');
  const [weekdays, setWeekdays] = useState<number[]>([1, 4]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('20:00');

  // Preview + resolutions
  const [preview, setPreview] = useState<any>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleWeekday = (n: number) =>
    setWeekdays((ws) => (ws.includes(n) ? ws.filter((w) => w !== n) : [...ws, n].sort((a, b) => a - b)));

  const playerQuery = useQuery({
    queryKey: ['recurring-players', playerSearch],
    queryFn: () => api.get('/admin/recurring/players', { params: { search: playerSearch } }).then((r) => r.data.data),
    enabled: !!authorized && playerSearch.trim().length > 0,
  });

  const branchesQuery = useQuery({
    queryKey: ['recurring-branches'],
    queryFn: () => api.get('/branches?sportId=').then((r) => r.data.data || []),
    enabled: !!authorized,
  });

  const resourcesQuery = useQuery({
    queryKey: ['recurring-resources', branchId],
    queryFn: () => api.get(`/branches/${branchId}/resources`).then((r) => r.data.data || []),
    enabled: !!authorized && !!branchId,
  });

  const definitionReady =
    !!player && !!branchId && !!resourceId && weekdays.length > 0 && !!startDate && !!endDate &&
    endDate >= startDate && !!startTime && !!endTime && endTime !== startTime;

  const previewMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/recurring/preview', {
        branchId: Number(branchId), resourceId: Number(resourceId), weekdays,
        startDate, endDate, startTime, endTime,
      }).then((r) => r.data),
    onSuccess: (data) => {
      setPreview(data);
      setSubmitError(null);
      setStep('preview');
      showToast(`Preview generated: ${data.count} occurrence(s)${data.containsBeforeDay8 ? ' — includes dates before Day 8 (start ' + data.allowedStartDate + ' or later)' : ''}`, data.containsBeforeDay8 ? 'warning' : 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Preview failed', 'error'),
  });

  const setResolution = (date: string, res: Resolution) =>
    setResolutions((r) => ({ ...r, [date]: res }));

  const occurrenceDecision = (date: string): { status: string; chosen: Resolution } => {
    const occ = preview?.occurrences?.find((o: any) => o.date === date);
    const res = resolutions[date] || { action: 'book' as const };
    return { status: occ?.status ?? 'available', chosen: res };
  };

  const conflictingDates = useMemo(
    () => (preview?.occurrences || []).filter((o: any) => o.status === 'conflict').map((o: any) => o.date),
    [preview],
  );
  const skippedCount = useMemo(
    () => Object.values(resolutions).filter((r) => r.action === 'skip').length,
    [resolutions],
  );
  const selectedCount = useMemo(() => {
    const total = preview?.count ?? 0;
    return total - skippedCount;
  }, [preview, skippedCount]);

  // Cancel the entire proposed series → back to definition with nothing created.
  const cancelSeries = () => {
    setPreview(null);
    setResolutions({});
    setSubmitError(null);
    setStep('definition');
    showToast('Series creation cancelled; nothing was created.', 'info');
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const resolutionsPayload = (preview?.occurrences || [])
        .map((o: any) => ({ date: o.date, res: resolutions[o.date] }))
        .filter((x: any) => x.res && (x.res.action === 'skip' || x.res.courtId || (x.res.startTime && x.res.endTime)))
        .map((x: any) => ({
          occurrenceDate: x.date,
          action: x.res.action,
          courtId: x.res.courtId,
          startTime: x.res.startTime,
          endTime: x.res.endTime,
        }));
      return api.post('/admin/recurring', {
        branchId: Number(branchId), resourceId: Number(resourceId), weekdays,
        startDate, endDate, startTime, endTime,
        playerUserId: player!.userId,
        idempotencyKey: `recur-${player!.userId}-${branchId}-${resourceId}-${startDate}-${endDate}-${weekdays.join('')}`,
        resolutions: resolutionsPayload,
      }).then((r) => r.data);
    },
    onSuccess: (data) => {
      showToast(`Recurring series created with ${data.occurrenceCount} booking(s) for ${player?.fullName ?? player?.userId}.`, 'success');
      qc.invalidateQueries({ queryKey: ['admin', 'recurring', 'list'] });
      // Prevent browser Back from returning to the wizard / stale state.
      navigate(`/admin/recurring?created=${data.seriesId}`, { replace: true });
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || 'Series creation failed';
      setSubmitError(message);
      showToast(message, 'error');
      // TOCTOU / conflict → force a fresh authoritative preview for re-resolution.
      setStep('preview');
    },
  });

  // R5-B — strip the `payment=return` marker from the URL once the authoritative
  // read has been rendered, so a browser refresh / Back never re-fires the return
  // toast. `{ replace: true }` keeps the payment return out of the history stack.
  const handlePaymentReturnHandled = () => {
    navigate(`/admin/recurring?created=${createdId}`, { replace: true });
  };

  if (!authorized) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-4">Recurring Booking</h1>
        <p className="text-sm text-[var(--color-error)]">You are not authorized to manage recurring reservations.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Recurring Reservation</h1>
        <Link to="/admin/bookings" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">← All Bookings</Link>
      </div>

      {createdId && (
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-primary-bg)] border border-[var(--color-border)] text-sm">
          Series <strong>#{createdId}</strong> created. Collect the single card payment for the whole series below —
          the backend confirms every eligible occurrence once the payment succeeds.
        </div>
      )}

      {step === 'definition' && (
        <section className="space-y-5 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5">
          {/* 1. Player */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">1. Player (booking owner)</label>
            <Input placeholder="Search player by name / email / phone…" value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} />
            {playerSearch.trim() && (
              <div className="mt-2 divide-y divide-[var(--color-border)]">
                {playerQuery.data?.length === 0 && <p className="text-xs text-[var(--color-text-muted)] py-1">No players found.</p>}
                {(playerQuery.data || []).slice(0, 8).map((p: PlayerOption) => (
                  <button key={p.userId} type="button" onClick={() => { setPlayer(p); setPlayerSearch(p.fullName); }}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded-[var(--radius-sm)] ${player?.userId === p.userId ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'hover:bg-[var(--color-bg)]'}`}>
                    {p.fullName} — {p.email || p.phone}
                  </button>
                ))}
              </div>
            )}
            {player && <p className="text-xs text-[var(--color-text-muted)] mt-1">Operator: you (audited). Owner: {player.fullName}.</p>}
          </div>

          {/* 2. Branch */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">2. Branch</label>
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setResourceId(''); }}
              className="cz-form-control w-full">
              <option value="">Select branch…</option>
              {(branchesQuery.data || []).map((b: any) => (
                <option key={b.id} value={String(b.id)}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* 3. Court */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">3. Court / Resource</label>
            <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} className="cz-form-control w-full">
              <option value="">Select court…</option>
              {(resourcesQuery.data || []).filter((r: any) => r.is_active).map((r: any) => (
                <option key={r.id} value={String(r.id)}>{r.name} {r.sport_name ? `• ${r.sport_name}` : ''}</option>
              ))}
            </select>
          </div>

          {/* 4–5. Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">4. Start date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">End date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Recurring reservations only run from Day 8 onward (branch-local). Days 1–7 are reserved for player bookings.</p>

          {/* 5. Weekdays */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Weekdays</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((w) => (
                <button key={w.n} type="button" onClick={() => toggleWeekday(w.n)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${weekdays.includes(w.n) ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text)]'}`}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* 6. Times */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Start time</label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">End time</label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <Button onClick={() => previewMutation.mutate()} disabled={!definitionReady || previewMutation.isPending}>
            {previewMutation.isPending ? 'Generating…' : 'Generate Preview'}
          </Button>
          {!definitionReady && (
            <p className="text-xs text-[var(--color-text-muted)]">Complete player, branch, court, dates, weekdays and times to preview.</p>
          )}
        </section>
      )}

      {step === 'preview' && preview && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Preview — {preview.count} occurrence(s) · {preview.timezone}
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep('definition')}>← Edit</Button>
              <Button variant="danger" onClick={cancelSeries}>Cancel entire series</Button>
            </div>
          </div>

          {preview.containsBeforeDay8 && (
            <p className="text-sm text-[var(--color-warning)]">Warning: this range includes dates before Day 8 (allowed from {preview.allowedStartDate} onward) — creation will be rejected until resolved.</p>
          )}

          {submitError && <p className="text-sm text-[var(--color-error)] border border-[var(--color-error)] rounded-[var(--radius-md)] p-3">{submitError}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Weekday</th>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Court</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {(preview.occurrences || []).map((occ: any) => {
                  const decision = occurrenceDecision(occ.date);
                  const reqTime = `${occ.startTime}–${occ.endTime}`;
                  return (
                    <tr key={occ.date} className="border-b border-[var(--color-border)] align-top">
                      <td className="py-2 pr-3 font-medium">{occ.date}</td>
                      <td className="py-2 pr-3">{WEEKDAY_LABELS.find((w) => w.n === occ.weekday)?.label}</td>
                      <td className="py-2 pr-3">{reqTime}</td>
                      <td className="py-2 pr-3">#{resourceId}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${occ.status === 'available' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error)]'}`}>
                          {occ.status === 'available' ? 'AVAILABLE' : 'CONFLICT'}
                        </span>
                      </td>
                      <td className="py-2">
                        {occ.status === 'available' ? (
                          <span className="text-xs text-[var(--color-text-muted)]">booked as requested</span>
                        ) : (
                          <ResolutionPicker occ={occ} value={resolutions[occ.date]} onChange={(r) => setResolution(occ.date, r)} />
                        )}
                        {decision.chosen.action === 'skip' && (
                          <p className="text-xs text-[var(--color-error)] mt-1">Cancelled — no booking will be created.</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Alternative-before-cancel rule hint */}
          <div className="text-xs text-[var(--color-text-muted)]">
            Conflict rule: existing bookings are never overwritten. The system suggests — first alternative courts, then same-day alternative times; you decide. “No alternative” occurrences can only be cancelled or trigger a full-series cancel.
          </div>

          <div className="flex items-center justify-between bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4">
            <div className="text-sm">
              <p><strong>{selectedCount}</strong> occurrence(s) will be booked · <strong>{skippedCount}</strong> cancelled by resolution</p>
              {conflictingDates.length > 0 && !Object.values(resolutions).some((r) => r.action === 'skip') && (
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Resolve every conflicting occurrence (alternative court/time or cancel) before confirming.</p>
              )}
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={selectedCount === 0 || createMutation.isPending}>
              {createMutation.isPending ? 'Confirming…' : `Confirm & Create (${selectedCount})`}
            </Button>
          </div>
        </section>
      )}

      {authorized && <SeriesDirectory createdId={createdId ? Number(createdId) : null} paidReturn={paidReturn} onPaymentReturnHandled={handlePaymentReturnHandled} />}
    </div>
  );
}

function ResolutionPicker({ occ, value, onChange }: { occ: any; value?: Resolution; onChange: (r: Resolution) => void }) {
  const hasCourts = (occ.alternativeCourts || []).length > 0;
  const hasTimes = (occ.alternativeTimes || []).length > 0;
  const noneAvailable = !hasCourts && !hasTimes;
  const current = value || (noneAvailable ? { action: 'skip' as const } : { action: 'book' as const });

  return (
    <div className="space-y-2">
      {hasCourts && (
        <div>
          <p className="text-xs font-medium text-[var(--color-text)] mb-1">Alternative court (requested time kept):</p>
          <div className="flex flex-wrap gap-1.5">
            {(occ.alternativeCourts as any[]).map((c: any) => (
              <button key={c.courtId} type="button" onClick={() => onChange({ action: 'book', courtId: c.courtId })}
                className={`px-2 py-1 rounded-[var(--radius-sm)] text-xs border ${current.courtId === c.courtId ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
                Court {c.courtId} {c.name || ''}
              </button>
            ))}
          </div>
        </div>
      )}
      {!hasCourts && hasTimes && (
        <div>
          <p className="text-xs font-medium text-[var(--color-text)] mb-1">Same-day alternative times (same court):</p>
          <div className="flex flex-wrap gap-1.5">
            {(occ.alternativeTimes as any[]).map((t: any) => (
              <button key={`${t.startTime}-${t.endTime}`} type="button" onClick={() => onChange({ action: 'book', startTime: t.startTime, endTime: t.endTime })}
                className={`px-2 py-1 rounded-[var(--radius-sm)] text-xs border ${current.startTime === t.startTime ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
                {t.startTime}–{t.endTime}
              </button>
            ))}
          </div>
        </div>
      )}
      {noneAvailable && <p className="text-xs text-[var(--color-error)]">No alternative is available for this date.</p>}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={current.action === 'skip'} onChange={(e) => onChange(e.target.checked ? { action: 'skip' } : { action: 'book' })} />
        Cancel this occurrence (no booking)
      </label>
    </div>
  );
}

// ── R4 — Recurring series directory: status, occurrences, cancellation ─────
// ── R5-B — + the single card-payment step for the whole series ──────────────
function SeriesDirectory({
  createdId,
  paidReturn,
  onPaymentReturnHandled,
}: {
  createdId: number | null;
  paidReturn: boolean;
  onPaymentReturnHandled: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  // R5-B — after creation (and after a gateway return) the operator lands
  // directly on the series they are being asked to pay for.
  const [selectedId, setSelectedId] = useState<number | null>(createdId);
  useEffect(() => { if (createdId) setSelectedId(createdId); }, [createdId]);
  const today = localToday();

  const listQuery = useQuery({
    queryKey: ['admin', 'recurring', 'list'],
    queryFn: () => api.get('/admin/recurring').then((r) => r.data.data || []),
  });

  const detailQuery = useQuery({
    queryKey: ['admin', 'recurring', selectedId],
    queryFn: () => api.get(`/admin/recurring/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
    // A gateway return must never be judged from a cached read.
    refetchOnWindowFocus: !!paidReturn,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      api.post(`/admin/recurring/${id}/cancel`, { reason: 'recurring_series_cancelled' }).then((r) => r.data),
    onSuccess: (data) => {
      showToast(`Series #${data.seriesId} cancelled — ${data.cancelledCount} future booking(s) cancelled.`, 'success');
      qc.invalidateQueries({ queryKey: ['admin', 'recurring', 'list'] });
      setSelectedId(null);
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Series cancellation failed', 'error'),
  });

  const confirmCancel = (id: number) => {
    if (window.confirm('Cancel this recurring series? Only future, not-yet-completed occurrences will be cancelled. This cannot be undone.')) {
      cancelMutation.mutate(id);
    }
  };

  return (
    <section className="space-y-4 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">Recurring Series</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Weekdays</th>
              <th className="py-2 pr-3">Range</th>
              <th className="py-2 pr-3">Times</th>
              <th className="py-2">Player</th>
            </tr>
          </thead>
          <tbody>
            {(listQuery.data || []).length === 0 && (
              <tr><td colSpan={6} className="py-3 text-xs text-[var(--color-text-muted)]">No recurring series yet.</td></tr>
            )}
            {(listQuery.data || []).map((s: any) => (
              <tr key={s.seriesId} className="border-b border-[var(--color-border)]">
                <td className="py-2 pr-3">
                  <button type="button" onClick={() => setSelectedId(s.seriesId)} className="text-[var(--color-primary)] hover:underline">
                    #{s.seriesId}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <StatusChip status={s.status} />
                </td>
                <td className="py-2 pr-3">{s.weekdays.map((w: number) => WEEKDAY_LABELS.find((x) => x.n === w)?.label).join(', ')}</td>
                <td className="py-2 pr-3">{s.startDate} → {s.endDate}</td>
                <td className="py-2 pr-3">{s.startTime}–{s.endTime}</td>
                <td className="py-2">{s.createdBy === undefined ? '' : `#${s.createdBy}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Series #{selectedId} — occurrences</h3>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedId(null)}>Close</Button>
              {detailQuery.data?.status === 'active' && (
                <Button variant="danger" size="sm" onClick={() => confirmCancel(selectedId)} disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Series'}
                </Button>
              )}
            </div>
          </div>

          {detailQuery.data && (
            <SeriesPaymentPanel
              series={detailQuery.data}
              paidReturn={paidReturn && createdId === selectedId}
              onPaymentReturnHandled={onPaymentReturnHandled}
            />
          )}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                <th className="py-1.5 pr-3">Date</th>
                <th className="py-1.5 pr-3">Time</th>
                <th className="py-1.5 pr-3">Period</th>
                <th className="py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {(detailQuery.data?.occurrences || []).map((o: any) => {
                const isPast = o.date < today;
                return (
                  <tr key={o.bookingId} className="border-b border-[var(--color-border)]">
                    <td className="py-1.5 pr-3">{o.date}</td>
                    <td className="py-1.5 pr-3">{o.startTime}–{o.endTime}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${isPast ? 'bg-[var(--color-bg)] text-[var(--color-text-muted)]' : 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]'}`}>
                        {isPast ? 'past' : 'future'}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <StatusChip bookingStatus={o.status} />
                      {o.status === 'cancelled' && <span className="text-xs text-[var(--color-text-muted)] ml-1">{isPast ? '(independent cancel preserved)' : '(cancelled)'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {detailQuery.data?.occurrences?.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)]">No occurrences recorded (skipped occurrences are not created as bookings).</p>
          )}
        </div>
      )}
    </section>
  );
}

// ── R5-B — the CARD payment step: ONE payment for the WHOLE series ──────────
// Everything rendered here comes from the backend's authoritative read. The
// component never computes a price, never sends an amount, and never treats the
// browser's return from the gateway as proof of payment — the gateway redirect
// only tells us to re-read.
type SeriesDetail = {
  seriesId: number;
  playerUserId: number | null;
  occurrenceCount: number;
  /** Pre-tax subtotal — retained for backward compatibility (R5-A/R5-B). */
  seriesTotal: number;
  /** R5-C1 — authoritative series economics from the backend read. */
  seriesSubtotal: number;
  seriesTax: number;
  seriesGross: number;
  status: string;
  occurrences: any[];
  payment: {
    paymentId: number | null;
    status: string | null;
    amount: number;
    currency: string;
    paymentMethod: string | null;
    gatewayProvider: string | null;
    gatewayReference: string | null;
    paidAt: string | null;
  };
};

/** `payment_transactions.payment_status` values that mean "not yet settled". */
const SERIES_PAYMENT_IN_FLIGHT = new Set(['created', 'pending', 'processing']);
const SERIES_PAYMENT_TERMINAL_FAILURE = new Set(['failed', 'cancelled', 'expired', 'refunded']);

function SeriesPaymentPanel({
  series,
  paidReturn,
  onPaymentReturnHandled,
}: {
  series: SeriesDetail;
  paidReturn: boolean;
  onPaymentReturnHandled: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const payment = series.payment;
  const currency = payment?.currency || 'EGP';
  const status = payment?.status ?? null;
  const isInFlight = !!status && SERIES_PAYMENT_IN_FLIGHT.has(status);
  const isFailed = !!status && SERIES_PAYMENT_TERMINAL_FAILURE.has(status);
  const isPaid = status === 'paid';
  // A cancelled / completed series can never take money again.
  const seriesAcceptsPayment = series.status === 'active' || series.status === 'paused';

  // ── Gateway return ───────────────────────────────────────────────────────
  // Runs once per return. The outcome is read from the BACKEND, never from the
  // URL, so a bookmarked or hand-edited return link cannot fake a success.
  const returnHandled = useRef(false);
  useEffect(() => {
    if (!paidReturn || returnHandled.current) return;
    returnHandled.current = true;
    // Re-read the authoritative state before judging it.
    qc.invalidateQueries({ queryKey: ['admin', 'recurring', series.seriesId] });
    if (isPaid) {
      showToast(`Payment received — series #${series.seriesId} occurrences confirmed.`, 'success');
    } else if (isInFlight) {
      showToast('Returned from the gateway. The payment is still processing — this screen will update automatically.', 'info');
    } else {
      showToast('Returned from the gateway. The payment did not complete — see the payment status below.', 'warning');
    }
    // Drop the marker so a refresh does not replay the toast.
    onPaymentReturnHandled();
  }, [paidReturn, isPaid, isInFlight, series.seriesId, qc, showToast, onPaymentReturnHandled]);

  const collectMutation = useMutation({
    mutationFn: () =>
      api
        .post(`/admin/recurring/${series.seriesId}/pay`, {
          // ONLY the return URL. No amount, no player, no reference — the
          // backend resolves all of it from persisted state and rejects the
          // request outright if this screen ever tries to send more.
          returnUrl: `${window.location.origin}/admin/recurring?created=${series.seriesId}&payment=return`,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin', 'recurring', series.seriesId] });
      qc.invalidateQueries({ queryKey: ['admin', 'recurring', 'list'] });
      if (data?.paymentUrl) {
        // Canonical hosted-checkout redirect — the same flow the marketplace
        // cart and the single-booking payment use. No new payment screen.
        window.location.href = data.paymentUrl;
        return;
      }
      if (data?.alreadyCharged) {
        // Idempotent replay: the row already exists, so NO second gateway
        // transaction was created and there is no new URL to send anyone to.
        showToast(
          isPaid
            ? 'This series is already paid — no second payment was created.'
            : 'A payment already exists for this series and is still in flight — no second payment was created.',
          isPaid ? 'info' : 'warning',
        );
        return;
      }
      showToast('Payment session created. Waiting for the gateway confirmation.', 'success');
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || 'Could not start the series payment';
      showToast(message, 'error');
    },
  });

  return (
    <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--color-text)]">Series payment — one card payment for all occurrences</h4>
        <Can permission="bookings.recurring.payment-status">
          <span
            className={`px-2 py-0.5 rounded-full text-xs ${
              isPaid
                ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                : isFailed
                  ? 'bg-[var(--color-error-bg)] text-[var(--color-error)]'
                  : isInFlight
                    ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
            }`}
          >
            {status ? status.toUpperCase() : 'NOT STARTED'}
          </span>
        </Can>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2 md:grid-cols-4">
        <div>
          <dt className="text-xs text-[var(--color-text-muted)]">Player (pays / owns the payment)</dt>
          <dd className="font-medium text-[var(--color-text)]">
            {series.playerUserId ? `#${series.playerUserId}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-text-muted)]">Occurrences covered</dt>
          <dd className="font-medium text-[var(--color-text)]">{series.occurrenceCount}</dd>
        </div>
        <Can permission="bookings.recurring.series-total">
          {/* R5-C1 — the money values are ALL rendered verbatim from the backend's
              authoritative read. The browser never computes tax or totals, never
              multiplies occurrences, and never sends an amount. `seriesGross` is
              the exact amount the gateway will charge (subtotal + tax). */}
          <div>
            <dt className="text-xs text-[var(--color-text-muted)]">Subtotal (authoritative)</dt>
            <dd className="font-medium text-[var(--color-text)]">{formatPrice(series.seriesSubtotal, currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-muted)]">Tax (authoritative)</dt>
            <dd className="font-medium text-[var(--color-text)]">{formatPrice(series.seriesTax, currency)}</dd>
          </div>
        </Can>
        <div>
          <dt className="text-xs text-[var(--color-text-muted)]">Total to pay (authoritative)</dt>
          <dd className="font-medium text-[var(--color-text)]">
            <Can permission="bookings.recurring.series-total">
              {formatPrice(series.seriesGross, currency)}
            </Can>
          </dd>
        </div>
      </dl>

      <div className="text-xs text-[var(--color-text-muted)]">
        Payment method: <strong className="text-[var(--color-text)]">Card</strong> (single gateway transaction for the
        whole series). You are recorded as the operator; the player is the payment owner.
      </div>

      {isPaid && (
        <p className="text-xs text-[var(--color-success-text)]">
          Payment #{payment?.paymentId} settled{payment?.paidAt ? ` at ${new Date(payment.paidAt).toLocaleString()}` : ''}
          {payment?.gatewayReference ? ` · gateway ref ${payment.gatewayReference}` : ''}. Every eligible occurrence was
          confirmed by the backend; already-confirmed, completed, cancelled and past occurrences were left untouched.
        </p>
      )}
      {isInFlight && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Payment #{payment?.paymentId} is awaiting gateway confirmation. Eligible occurrences are confirmed automatically
          the moment it succeeds. A repeat click never creates a second payment.
        </p>
      )}
      {isFailed && (
        <p className="text-xs text-[var(--color-error)]">
          Payment #{payment?.paymentId} is {status}. Eligible pending occurrences were cancelled by the backend; completed,
          past, already-cancelled and already-paid occurrences were preserved. Exactly one payment is allowed per series, so
          it cannot be re-charged here.
        </p>
      )}
      {!seriesAcceptsPayment && (
        <p className="text-xs text-[var(--color-text-muted)]">
          This series is {series.status} and cannot take a payment.
        </p>
      )}

      <Can permission="bookings.recurring.collect-payment">
        {!isPaid && !isFailed && seriesAcceptsPayment && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => collectMutation.mutate()}
              disabled={collectMutation.isPending}
            >
              {collectMutation.isPending
                ? 'Starting checkout…'
                : isInFlight
                  ? 'Re-check payment status'
                  : 'Collect card payment'}
            </Button>
            {isInFlight && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'recurring', series.seriesId] })}
              >
                Refresh status
              </Button>
            )}
          </div>
        )}
      </Can>
    </section>
  );
}

function StatusChip({ status, bookingStatus }: { status?: string; bookingStatus?: string }) {
  const value = bookingStatus || status || 'unknown';
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'active', cls: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' },
    paused: { label: 'paused', cls: 'bg-[var(--color-warning)] text-white' },
    completed: { label: 'completed', cls: 'bg-[var(--color-bg)] text-[var(--color-text-muted)]' },
    cancelled: { label: 'cancelled', cls: 'bg-[var(--color-error-bg)] text-[var(--color-error)]' },
    pending: { label: 'booked', cls: 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]' },
    no_show: { label: 'no-show', cls: 'bg-[var(--color-error-bg)] text-[var(--color-error)]' },
    expired: { label: 'expired', cls: 'bg-[var(--color-bg)] text-[var(--color-text-muted)]' },
  };
  const m = map[value] || { label: value, cls: 'bg-[var(--color-bg)] text-[var(--color-text)]' };
  return <span className={`px-2 py-0.5 rounded-full text-xs ${m.cls}`}>{m.label}</span>;
}