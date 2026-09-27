import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Input } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import { useCan } from '../../../hooks/useCan';

// ── R3 — Recurring Booking management (responsible users only) ────────────
// Builds a weekly recurring series ON BEHALF OF ONE PLAYER. The wizard:
//   definition → preview (full occurrence matrix + conflicts + alternatives)
//   → admin resolution (alternative court → same-day alternative time → skip)
//   → summary → confirm (server re-checks availability; TOCTOU-safe).
// No payment in this group. Backend is authoritative for everything.

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
  const authorized = can('org.bookings.manage') || can('admin.bookings.update-status');

  const createdId = searchParams.get('created');
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
          Series <strong>#{createdId}</strong> created. Recurring payment is not part of this group.
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