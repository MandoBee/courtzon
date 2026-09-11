import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { academyApi, type AcademyConflictAlternative, type AcademyGroupSessionRow, type AcademySchedule } from '../../../services/academy';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import { getErrorMessage } from '../../../utils/errors';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRow } from '../../../components/ui/Skeleton';

const WEEKDAYS: Array<{ code: string; label: string }> = [
  { code: 'mon', label: 'M' }, { code: 'tue', label: 'T' }, { code: 'wed', label: 'W' },
  { code: 'thu', label: 'T' }, { code: 'fri', label: 'F' }, { code: 'sat', label: 'S' }, { code: 'sun', label: 'S' },
];

const SCHEDULE_STATUS_BADGES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  archived: 'bg-gray-100 text-gray-500',
};

const HOLD_BADGES: Record<string, string> = {
  pending_court: 'bg-blue-100 text-blue-700',
  conflict: 'bg-red-100 text-red-700',
  pending_expired: 'bg-amber-100 text-amber-700',
  deferred: 'bg-gray-100 text-gray-500',
  resolved: 'bg-green-100 text-green-700',
};

function parseWeekdays(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  return String(raw ?? '').split(',').filter(Boolean);
}

function emptyForm() {
  return {
    name: '', group_id: '', weekdays: ['mon'] as string[], start_date: '', end_date: '',
    local_start_time: '10:00', local_end_time: '11:00', branch_id: '', preferred_court_id: '',
    pending_priority_minutes: 1440,
  };
}

export default function AcademySchedulesPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [resolveTarget, setResolveTarget] = useState<AcademyGroupSessionRow | null>(null);
  const [alternatives, setAlternatives] = useState<AcademyConflictAlternative[]>([]);
  const [resolvingAlt, setResolvingAlt] = useState<string>('');

  const groupsQuery = useQuery({
    queryKey: ['admin', 'academy', 'groups', { limit: 500 }],
    queryFn: () => academyApi.getGroups({ page: 1, limit: 500 }),
  });
  const groups = groupsQuery.data?.data ?? [];

  const { data: branches } = useQuery({
    queryKey: ['admin', 'branches', form.organisation_id],
    queryFn: () => api.get(`/organisations/${form.organisation_id}/branches`).then((r) => r.data?.data ?? []),
    enabled: !!form.organisation_id,
  });
  const { data: courts } = useQuery({
    queryKey: ['admin', 'academy', 'schedule', 'courts', form.branch_id],
    queryFn: () => api.get('/resources').then((r) => r.data?.data ?? []),
    enabled: !!form.branch_id,
  });

  const scheduleParams: Record<string, any> = { page, limit: 20 };
  if (statusFilter !== 'all') scheduleParams.status = statusFilter;

  const schedulesQuery = useQuery({
    queryKey: ['admin', 'academy', 'schedules', scheduleParams],
    queryFn: () => academyApi.getSchedules(scheduleParams),
  });

  const sessionsQuery = useQuery({
    queryKey: ['admin', 'academy', 'schedules', 'sessions', selectedId, sessionsPage],
    queryFn: () => academyApi.getScheduleSessions(selectedId as number, { page: sessionsPage, limit: 50 }),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: academyApi.createSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'schedules'] });
      setShowForm(false); setEditId(null); setForm(emptyForm());
      showToast(t('admin.academy.schedule_created'));
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => academyApi.updateSchedule(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'schedules'] });
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'schedules', 'sessions'] });
      setShowForm(false); setEditId(null); setForm(emptyForm());
      showToast(t('admin.academy.schedule_updated'));
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const previewMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => academyApi.previewScheduleChange(id, d),
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const regenerateMutation = useMutation({
    mutationFn: academyApi.regenerateSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'schedules'] });
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'schedules', 'sessions'] });
      showToast(t('admin.academy.schedule_regenerated'));
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const resyncMutation = useMutation({
    mutationFn: academyApi.resyncSchedule,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'schedules', 'sessions'] });
      showToast(t('admin.academy.schedule_resynced'));
      const map = new Map<number, AcademyConflictAlternative[]>();
      for (const ev of res.evaluations ?? []) {
        if (ev.sessionId && ev.alternatives?.length) map.set(Number(ev.sessionId), ev.alternatives);
      }
      setAlternativesMap(map);
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });
  const [alternativesMap, setAlternativesMap] = useState<Map<number, AcademyConflictAlternative[]>>(new Map());

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: any) => academyApi.setScheduleStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'schedules'] });
      showToast(t('admin.academy.schedule_status_updated'));
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ sessionId, decision }: any) => academyApi.resolveSession(sessionId, decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'schedules', 'sessions'] });
      setResolveTarget(null); setAlternatives([]); setResolvingAlt('');
      showToast(t('admin.academy.schedule_resolved'));
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  function resetForm() { setForm(emptyForm()); }

  function openEdit(s: AcademySchedule) {
    setEditId(s.id);
    const group = groups.find((g: any) => Number(g.id) === Number(s.group_id));
    setForm({
      name: s.name ?? '', group_id: String(s.group_id), weekdays: parseWeekdays(s.weekdays),
      start_date: s.start_date, end_date: s.end_date,
      local_start_time: s.local_start_time, local_end_time: s.local_end_time,
      branch_id: String(s.branch_id ?? (group?.branch_id ?? '')), preferred_court_id: String(s.preferred_court_id ?? ''),
      organisation_id: group?.organisation_id ? String(group.organisation_id) : (s.organisation_id ? String(s.organisation_id) : ''),
      pending_priority_minutes: s.pending_priority_minutes,
    });
    setShowForm(true);
  }

  async function handleSubmit() {
    const data = {
      ...form,
      group_id: Number(form.group_id),
      branch_id: form.branch_id ? Number(form.branch_id) : null,
      preferred_court_id: form.preferred_court_id ? Number(form.preferred_court_id) : null,
      pending_priority_minutes: Number(form.pending_priority_minutes) || 1440,
    };
    if (!data.group_id) { showToast('Group is required', 'error'); return; }
    if (!data.branch_id) { showToast('Branch is required', 'error'); return; }
    if (!data.start_date || !data.end_date || data.start_date > data.end_date) { showToast('Invalid date range', 'error'); return; }
    if (data.local_start_time >= data.local_end_time) { showToast('Invalid time window', 'error'); return; }

    for (const s of data.weekdays) {
      if (!['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(s)) { showToast('Invalid weekday', 'error'); return; }
    }

    if (editId) {
      try {
        const preview = await previewMutation.mutateAsync({ id: editId, ...data });
        if ((preview.affected ?? 0) > 0) {
          const ok = window.confirm(`Affected sessions: ${preview.affected}. Apply this change?`);
          if (!ok) return;
        }
      } catch (e) { showToast(getErrorMessage(e), 'error'); return; }
      updateMutation.mutate({ id: editId, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  function toggleWeekday(code: string) {
    setForm((f: any) => {
      const has = f.weekdays.includes(code);
      return { ...f, weekdays: has ? f.weekdays.filter((w: string) => w !== code) : [...f.weekdays, code] };
    });
  }

  function openResolve(s: AcademyGroupSessionRow) {
    setResolveTarget(s);
    setAlternatives(alternativesMap.get(Number(s.id)) ?? []);
    setResolvingAlt('');
  }

  function doResolve(type: 'keep' | 'release' | 'apply_alternative') {
    if (!resolveTarget) return;
    const decision: any = { type };
    if (type === 'apply_alternative') {
      const alt = alternatives.find((a) => `${a.court_id}|${a.session_date}|${a.start_time}` === resolvingAlt);
      if (!alt) { showToast('Select an alternative slot', 'error'); return; }
      decision.alternative = { court_id: alt.court_id, session_date: alt.session_date, start_time: alt.start_time, end_time: alt.end_time };
    }
    resolveMutation.mutate({ sessionId: resolveTarget.id, decision });
  }

  const schedules = schedulesQuery.data?.data ?? [];
  const total = schedulesQuery.data?.total ?? 0;
  const sessions = sessionsQuery.data?.data ?? [];
  const sessionsTotal = sessionsQuery.data?.total ?? 0;

  const selectedSchedule = useMemo(() => schedules.find((s: any) => Number(s.id) === Number(selectedId)), [schedules, selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('admin.academy.schedules')}</h1>
        <Can permission="academy.schedule.manage">
          <button onClick={() => { setEditId(null); resetForm(); setShowForm(!showForm); }}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
            {showForm ? t('common.cancel') : `+ ${t('admin.academy.new_schedule')}`}
          </button>
        </Can>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_group')} *</label>
              <select value={form.group_id} onChange={(e) => {
                const g = groups.find((x: any) => Number(x.id) === Number(e.target.value));
                setForm((f: any) => ({ ...f, group_id: e.target.value, branch_id: g?.branch_id ? String(g.branch_id) : f.branch_id, organisation_id: g?.organisation_id ? String(g.organisation_id) : f.organisation_id }));
              }} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                <option value="">{t('common.select')}</option>
                {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name} ({g.program_name || `Program #${g.program_id}`})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_name')}</label>
              <input value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_start_date')} *</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f: any) => ({ ...f, start_date: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_end_date')} *</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((f: any) => ({ ...f, end_date: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_time')} *</label>
              <div className="flex items-center gap-1">
                <input type="time" value={form.local_start_time} onChange={(e) => setForm((f: any) => ({ ...f, local_start_time: e.target.value }))}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
                <span className="text-xs text-[var(--color-text-muted)]">→</span>
                <input type="time" value={form.local_end_time} onChange={(e) => setForm((f: any) => ({ ...f, local_end_time: e.target.value }))}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_branch')} *</label>
              <select value={form.branch_id} onChange={(e) => setForm((f: any) => ({ ...f, branch_id: e.target.value, preferred_court_id: '' }))}
                disabled={!form.branch_id && !form.organisation_id} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white disabled:opacity-50">
                <option value="">{t('common.select')}</option>
                {(branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_court')}</label>
              <select value={form.preferred_court_id} onChange={(e) => setForm((f: any) => ({ ...f, preferred_court_id: e.target.value }))}
                disabled={!form.branch_id} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white disabled:opacity-50">
                <option value="">{t('common.select')}</option>
                {(courts || []).filter((c: any) => Number(c.branch_id) === Number(form.branch_id)).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_priority_minutes')}</label>
              <input type="number" min={30} max={10080} step={15} value={form.pending_priority_minutes}
                onChange={(e) => setForm((f: any) => ({ ...f, pending_priority_minutes: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.schedule_weekdays')} *</label>
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAYS.map((w) => (
                  <button key={w.code} type="button" onClick={() => toggleWeekday(w.code)}
                    title={w.code}
                    className={`w-8 h-8 rounded-full text-xs font-semibold border ${form.weekdays.includes(w.code) ? 'bg-[var(--color-primary)] text-white border-transparent' : 'bg-white text-[var(--color-text-muted)]'}`}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={!form.group_id || !form.start_date || !form.end_date || !form.weekdays.length || createMutation.isPending || updateMutation.isPending}
              className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
              {editId ? t('common.update') : t('common.create')}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }}
              className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-[var(--color-surface)]">
          <option value="all">All Statuses</option>
          {Object.keys(SCHEDULE_STATUS_BADGES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-x-auto">
        {schedulesQuery.isLoading ? <SkeletonRow count={5} /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-3 py-2">{t('admin.academy.schedule_name')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.schedule_group')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.schedule_weekdays')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.schedule_window')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.schedule_court')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.schedule_status')}</th>
                <th className="text-right px-3 py-2">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s: any) => (
                <tr key={s.id} className={`border-b last:border-0 hover:bg-[var(--color-bg)] ${Number(s.id) === Number(selectedId) ? 'bg-[var(--color-primary)]/5' : ''}`}>
                  <td className="px-3 py-2">
                    <button onClick={() => { setSelectedId(Number(s.id)); setSessionsPage(1); }} className="font-medium text-left hover:underline">
                      {s.name || `Schedule #${s.id}`}
                    </button>
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {[`${s.start_date} → ${s.end_date}`, s.timezone].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{s.group_name || `Group #${s.group_id}`}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{s.program_name || ''}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex gap-0.5 justify-center">
                      {parseWeekdays(s.weekdays).map((w: string) => (
                        <span key={w} className="w-4 h-4 rounded-full text-[9px] grid place-items-center bg-[var(--color-border)]">{w[0].toUpperCase()}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs">{s.local_start_time}–{s.local_end_time}</td>
                  <td className="px-3 py-2 text-center text-xs">{s.preferred_court_name || s.preferred_court_id || '-'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${SCHEDULE_STATUS_BADGES[s.status] || ''}`}>{s.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                    <Can permission="academy.schedule.manage">
                      <button onClick={() => openEdit(s)} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] hover:opacity-80">{t('common.edit')}</button>
                      <button onClick={() => regenerateMutation.mutate(s.id)} disabled={s.status !== 'active' || regenerateMutation.isPending}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:opacity-80 disabled:opacity-40" title="Regenerate future sessions">
                        {t('admin.academy.schedule_regenerate')}
                      </button>
                      <button onClick={() => resyncMutation.mutate(s.id)} disabled={resyncMutation.isPending}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 hover:opacity-80">
                        {t('admin.academy.schedule_resync')}
                      </button>
                      {s.status === 'active'
                        ? <button onClick={() => statusMutation.mutate({ id: s.id, status: 'paused' })} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:opacity-80">{t('admin.academy.schedule_pause')}</button>
                        : s.status === 'paused' && <button onClick={() => statusMutation.mutate({ id: s.id, status: 'active' })} className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:opacity-80">{t('admin.academy.schedule_resume')}</button>}
                    </Can>
                  </td>
                </tr>
              ))}
              {schedules.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-xs text-[var(--color-text-muted)]">{t('admin.academy.schedule_no_rows')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {total > 20 && (
        <Pagination total={total} page={page} pageSize={20} onPageChange={setPage} onPageSizeChange={() => {}} />
      )}

      {selectedSchedule && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <h2 className="text-sm font-bold text-[var(--color-text)]">
              {t('admin.academy.schedule_sessions_title')} — {selectedSchedule.name || `#${selectedSchedule.id}`}
            </h2>
            <button onClick={() => setSelectedId(null)} className="text-xs text-[var(--color-text-muted)] hover:underline">{t('common.cancel')}</button>
          </div>
          <div className="overflow-x-auto">
            {sessionsQuery.isLoading ? <SkeletonRow count={4} /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-[var(--color-text-muted)]">
                    <th className="text-left px-3 py-2">{t('admin.academy.session_date')}</th>
                    <th className="text-center px-3 py-2">{t('admin.academy.schedule_window')}</th>
                    <th className="text-center px-3 py-2">{t('admin.academy.schedule_court')}</th>
                    <th className="text-center px-3 py-2">{t('admin.academy.schedule_hold_status')}</th>
                    <th className="text-right px-3 py-2">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s: AcademyGroupSessionRow) => (
                    <tr key={s.id} className={`border-b last:border-0 hover:bg-[var(--color-bg)] ${s.reservation_status === 'pending_court' ? 'bg-blue-50/40' : s.reservation_status === 'conflict' ? 'bg-red-50/40' : ''}`}>
                      <td className="px-3 py-2 font-mono text-xs">{s.session_date}</td>
                      <td className="px-3 py-2 text-center font-mono text-xs">
                        {s.start_time}–{s.end_time}
                        {(s.original_session_date && s.original_session_date !== s.session_date) && (
                          <div className="text-[10px] text-[var(--color-text-muted)]">orig {s.original_session_date} {s.original_start_time}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-xs">{s.court_name || s.court_id || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${HOLD_BADGES[s.reservation_status ?? ''] || 'bg-gray-50 text-gray-500'}`}>
                          {s.reservation_status ? t(`admin.academy.schedule_hold_${s.reservation_status}`) : t('admin.academy.schedule_hold_resolved')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(s.reservation_status === 'pending_court' || s.reservation_status === 'conflict' || s.reservation_status === 'pending_expired' || s.reservation_status === 'deferred') && (
                          <Can permission="academy.schedule.resolve">
                            <button onClick={() => openResolve(s)} className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-primary)] text-white hover:opacity-80">
                              {t('admin.academy.schedule_resolve')}
                            </button>
                          </Can>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-xs text-[var(--color-text-muted)]">{t('admin.academy.schedule_no_rows')}</td></tr>}
                </tbody>
              </table>
            )}
          </div>
          {sessionsTotal > 50 && (
            <div className="p-2">
              <Pagination total={sessionsTotal} page={sessionsPage} pageSize={50} onPageChange={setSessionsPage} onPageSizeChange={() => {}} />
            </div>
          )}
        </div>
      )}

      {resolveTarget && (
        <div className="fixed inset-0 z-[70] bg-black/40 grid place-items-center p-4" onClick={() => setResolveTarget(null)}>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">{t('admin.academy.schedule_resolve')} — session #{resolveTarget.id}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {resolveTarget.session_date} {resolveTarget.start_time}–{resolveTarget.end_time} · {resolveTarget.court_name || `Court #${resolveTarget.court_id}`}
            </p>
            {resolveTarget.reservation_status === 'conflict' && (
              <div className="text-xs text-red-600 bg-red-50 rounded p-2">
                {(resolveTarget.conflict_metadata as any)?.reason ? String((resolveTarget.conflict_metadata as any).reason) : 'slot conflict'}
              </div>
            )}

            {alternatives.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Alternative slot</label>
                <select value={resolvingAlt} onChange={(e) => setResolvingAlt(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                  <option value="">{t('common.select')}</option>
                  {alternatives.map((a) => (
                    <option key={`${a.court_id}|${a.session_date}|${a.start_time}`} value={`${a.court_id}|${a.session_date}|${a.start_time}`}>
                      {a.session_date} {a.start_time}–{a.end_time} · {a.court_name || `Court #${a.court_id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => doResolve('keep')} disabled={resolveMutation.isPending}
                className="px-3 py-1.5 bg-green-600 text-white rounded-[var(--radius-md)] text-xs font-medium">
                {t('admin.academy.schedule_resolve_keep')}
              </button>
              <button onClick={() => doResolve('apply_alternative')} disabled={!resolvingAlt || resolveMutation.isPending}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-40">
                {t('admin.academy.schedule_resolve_alternative')}
              </button>
              <button onClick={() => doResolve('release')} disabled={resolveMutation.isPending}
                className="px-3 py-1.5 bg-red-100 text-red-700 rounded-[var(--radius-md)] text-xs font-medium">
                {t('admin.academy.schedule_resolve_release')}
              </button>
              <button onClick={() => setResolveTarget(null)} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
            </div>
            {resolveTarget.reservation_status === 'pending_court' && (
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {resolveTarget.pending_expires_at ? `Pending auto-expiry: ${new Date(resolveTarget.pending_expires_at).toLocaleString()}` : 'Priority hold'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}