import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academyApi } from '../../../services/academy';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import { getErrorMessage } from '../../../utils/errors';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRow } from '../../../components/ui/Skeleton';

const ATTENDANCE_BADGES: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-amber-100 text-amber-700',
  late: 'bg-blue-100 text-blue-700',
};

export default function AcademyAttendancePage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [sessionFilter, setSessionFilter] = useState('');
  const [showRecord, setShowRecord] = useState(false);
  const [recordForm, setRecordForm] = useState<any>({ group_session_id: '', enrollment_id: '', attendance_status: 'present', notes: '' });

  const queryParams: Record<string, any> = { page, limit: 20 };
  if (sessionFilter) queryParams.group_session_id = Number(sessionFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'academy', 'attendance', queryParams],
    queryFn: () => academyApi.getAttendanceList(queryParams),
  });

  const { data: sessions } = useQuery({
    queryKey: ['admin', 'academy', 'sessions', { limit: 200 }],
    queryFn: () => academyApi.getSessions({ limit: 200 }),
  });

  const recordMutation = useMutation({
    mutationFn: academyApi.recordAttendance,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'attendance'] }); setShowRecord(false); showToast(t('admin.academy.attendance_recorded')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => academyApi.updateAttendance(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'attendance'] }); showToast(t('admin.academy.attendance_updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const records = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('admin.academy.attendance')}</h1>
        <Can permission="attendance.manage">
          <button onClick={() => setShowRecord(!showRecord)}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
            {showRecord ? t('common.cancel') : `+ ${t('admin.academy.record_attendance')}`}
          </button>
        </Can>
      </div>

      {showRecord && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.session')}</label>
              <select value={recordForm.group_session_id} onChange={e => setRecordForm((f: any) => ({ ...f, group_session_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                <option value="">{t('common.select')}</option>
                {sessions?.data?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.group_name || `#${s.group_id}`} - {s.session_date}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.enrollment_id')}</label>
              <input type="number" value={recordForm.enrollment_id} onChange={e => setRecordForm((f: any) => ({ ...f, enrollment_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.attendance_status')}</label>
              <select value={recordForm.attendance_status} onChange={e => setRecordForm((f: any) => ({ ...f, attendance_status: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                {Object.keys(ATTENDANCE_BADGES).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.notes')}</label>
              <input value={recordForm.notes} onChange={e => setRecordForm((f: any) => ({ ...f, notes: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
          </div>
          <button onClick={() => recordMutation.mutate({
            group_session_id: Number(recordForm.group_session_id),
            enrollment_id: Number(recordForm.enrollment_id),
            attendance_status: recordForm.attendance_status,
            notes: recordForm.notes || undefined,
          })} disabled={!recordForm.group_session_id || !recordForm.enrollment_id || recordMutation.isPending}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
            {t('admin.academy.record')}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <select value={sessionFilter} onChange={e => { setSessionFilter(e.target.value); setPage(1); }}
          className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-[var(--color-surface)]">
          <option value="">{t('admin.academy.all_sessions')}</option>
          {sessions?.data?.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.group_name || `#${s.group_id}`} - {s.session_date}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-x-auto">
        {isLoading ? <SkeletonRow count={5} /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-3 py-2">{t('admin.academy.player')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.session_date')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.attendance_status')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.notes')}</th>
                <th className="text-right px-3 py-2">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]">
                  <td className="px-3 py-2 font-medium">{r.player_name || `#${r.enrollment_id}`}</td>
                  <td className="px-3 py-2 text-xs">{r.session_date || '-'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ATTENDANCE_BADGES[r.attendance_status] || ''}`}>{r.attendance_status}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-muted)] max-w-[200px] truncate">{r.notes || '-'}</td>
                  <td className="px-3 py-2 text-right">
                    <Can permission="attendance.manage">
                      <select
                        className="text-[10px] px-1 py-0.5 border rounded"
                        value={r.attendance_status}
                        onChange={e => updateMutation.mutate({ id: r.id, attendance_status: e.target.value })}
                      >
                        {Object.keys(ATTENDANCE_BADGES).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Can>
                  </td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-xs text-[var(--color-text-muted)]">{t('admin.academy.no_attendance')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {total > 20 && (
        <Pagination total={total} page={page} pageSize={20} onPageChange={setPage} onPageSizeChange={() => {}} />
      )}
    </div>
  );
}
