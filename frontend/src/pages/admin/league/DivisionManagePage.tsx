import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Modal } from '../../../components/ui/Modal';
import { leagueApi } from '../../../services/league';

export default function DivisionManagePage() {
  const { id } = useParams<{ id: string }>();
  const leagueId = Number(id);
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editDiv, setEditDiv] = useState<any>(null);
  const [form, setForm] = useState({ name: '', tier: 1, capacity: 8, advance_count: 1, relegation_count: 1 });
  const [promoteCount, setPromoteCount] = useState(1);
  const [relegateCount, setRelegateCount] = useState(1);
  const [actionDivId, setActionDivId] = useState<number | null>(null);

  const { data: divisions, isLoading } = useQuery({
    queryKey: ['league-divisions', leagueId],
    queryFn: () => leagueApi.getDivisions(leagueId),
  });

  const createMutation = useMutation({
    mutationFn: () => leagueApi.createDivision(leagueId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-divisions', leagueId] }); setShowForm(false); setForm({ name: '', tier: 1, capacity: 8, advance_count: 1, relegation_count: 1 }); showToast(t('admin.league.division.created')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: () => leagueApi.updateDivision(editDiv.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-divisions', leagueId] }); setShowForm(false); setEditDiv(null); setForm({ name: '', tier: 1, capacity: 8, advance_count: 1, relegation_count: 1 }); showToast(t('admin.league.division.updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const promoteMutation = useMutation({
    mutationFn: () => leagueApi.promote(actionDivId!, promoteCount),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-divisions', leagueId] }); setActionDivId(null); setPromoteCount(1); showToast(t('admin.league.division.promoted')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const relegateMutation = useMutation({
    mutationFn: () => leagueApi.relegate(actionDivId!, relegateCount),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-divisions', leagueId] }); setActionDivId(null); setRelegateCount(1); showToast(t('admin.league.division.relegated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const divList = Array.isArray(divisions) ? divisions : [];

  function openCreate() {
    setEditDiv(null);
    setForm({ name: '', tier: 1, capacity: 8, advance_count: 1, relegation_count: 1 });
    setShowForm(true);
  }

  function openEdit(d: any) {
    setEditDiv(d);
    setForm({ name: d.name, tier: d.tier ?? 1, capacity: d.capacity ?? 8, advance_count: d.advance_count ?? 1, relegation_count: d.relegation_count ?? 1 });
    setShowForm(true);
  }

  return (
    <Can permission="admin-leagues.view">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.league.divisions')}</h1>
          <Can permission="leagues.edit">
            <button onClick={openCreate}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('admin.league.division.new')}
            </button>
          </Can>
        </div>

        {isLoading ? <SkeletonRow count={3} /> : (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-[var(--color-text-muted)]">
                  <th className="text-left px-4 py-3">{t('admin.league.division.name')}</th>
                  <th className="text-center px-4 py-3">{t('admin.league.division.tier')}</th>
                  <th className="text-center px-4 py-3">{t('admin.league.division.capacity')}</th>
                  <th className="text-center px-4 py-3">{t('admin.league.division.advance_count')}</th>
                  <th className="text-center px-4 py-3">{t('admin.league.division.relegation_count')}</th>
                  <th className="text-right px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {divList.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
                )}
                {divList.map((d: any) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-center text-xs">{d.tier ?? '-'}</td>
                    <td className="px-4 py-3 text-center text-xs">{d.capacity ?? '-'}</td>
                    <td className="px-4 py-3 text-center text-xs">{d.advance_count ?? '-'}</td>
                    <td className="px-4 py-3 text-center text-xs">{d.relegation_count ?? '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Can permission="leagues.edit">
                          <button onClick={() => { setActionDivId(d.id); setPromoteCount(d.advance_count ?? 1); }}
                            className="text-[10px] px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50">
                            {t('admin.league.division.promote')}
                          </button>
                          <button onClick={() => { setActionDivId(d.id); setRelegateCount(d.relegation_count ?? 1); }}
                            className="text-[10px] px-2 py-1 rounded border border-amber-200 text-amber-600 hover:bg-amber-50">
                            {t('admin.league.division.relegate')}
                          </button>
                          <button onClick={() => openEdit(d)}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                            {t('common.edit')}
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Modal open={actionDivId !== null && !!promoteMutation.isIdle && !!relegateMutation.isIdle && (
          !document.querySelector('[data-promote-modal]') ? true : false
        )} onClose={() => setActionDivId(null)} title={t('admin.league.division.promote')} size="sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.division.promote_count')}</label>
              <input type="number" value={promoteCount} onChange={(e) => setPromoteCount(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" min={1} />
            </div>
            <button onClick={() => promoteMutation.mutate()}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('admin.league.division.promote')}
            </button>
          </div>
        </Modal>

        <Modal open={actionDivId !== null} onClose={() => setActionDivId(null)} title={t('admin.league.division.relegate_action')} size="sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.division.relegate_count')}</label>
              <input type="number" value={relegateCount} onChange={(e) => setRelegateCount(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" min={1} />
            </div>
            <button onClick={() => relegateMutation.mutate()}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('admin.league.division.relegate')}
            </button>
          </div>
        </Modal>

        <Modal open={showForm} onClose={() => { setShowForm(false); setEditDiv(null); }}
          title={editDiv ? t('admin.league.division.edit') : t('admin.league.division.new')} size="sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.division.name')}</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.division.tier')}</label>
              <input type="number" value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" min={1} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.division.capacity')}</label>
              <input type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" min={1} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.division.advance_count')}</label>
              <input type="number" value={form.advance_count} onChange={(e) => setForm((f) => ({ ...f, advance_count: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.league.division.relegation_count')}</label>
              <input type="number" value={form.relegation_count} onChange={(e) => setForm((f) => ({ ...f, relegation_count: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" min={0} />
            </div>
            <button onClick={() => (editDiv ? updateMutation : createMutation).mutate()}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {editDiv ? t('common.save') : t('admin.league.division.create')}
            </button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}
