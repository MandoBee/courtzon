import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Modal } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';

interface Template {
  id: number; code: string; notification_type_id: number; name: string; description: string | null;
  event_name: string; locale: string; title_template: string; body_template: string | null;
  content_format: string; status: string; version: number; is_default: boolean;
  is_active: boolean; variables: Record<string, any> | null; created_at: string; updated_at: string;
}

export default function TemplatesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['templates', page, search, statusFilter],
    queryFn: () => api.get('/admin/templates', { params: { page, limit, q: search || undefined, status: statusFilter || undefined } }).then(r => r.data),
  });

  const { data: notifTypes } = useQuery({
    queryKey: ['notification-types-list'],
    queryFn: () => api.get('/admin/notification-types', { params: { page: 1, limit: 100 } }).then(r => r.data?.data || []),
  });

  const templates: Template[] = data?.data || [];
  const pagination = data?.pagination || { total: 0, page: 1, limit, totalPages: 0 };

  const createMut = useMutation({
    mutationFn: (d: any) => api.post('/admin/templates', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); setShowForm(false); showToast(t('templates.created')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('common.error'), 'error'),
  });

  const updateMut = useMutation({
    mutationFn: (d: any) => api.put(`/admin/templates/${d.id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); setShowForm(false); setEditing(null); showToast(t('templates.updated')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('common.error'), 'error'),
  });

  const publishMut = useMutation({
    mutationFn: (id: number) => api.post(`/admin/templates/${id}/publish`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); showToast(t('templates.published')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('common.error'), 'error'),
  });

  const archiveMut = useMutation({
    mutationFn: (id: number) => api.post(`/admin/templates/${id}/archive`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); showToast(t('templates.archived')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('common.error'), 'error'),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      code: fd.get('code') as string,
      notification_type_id: Number(fd.get('notification_type_id')),
      name: fd.get('name') as string,
      description: fd.get('description') as string || undefined,
      locale: fd.get('locale') as string,
      title_template: fd.get('title_template') as string,
      body_template: fd.get('body_template') as string || undefined,
      content_format: 'handlebars',
      is_active: fd.get('is_active') === 'on',
    };
    if (editing) updateMut.mutate({ id: editing.id, ...data });
    else createMut.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('templates.title')}</h1>
        <Can permission="notification_templates.create">
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90">{t('templates.create')}</button>
        </Can>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input placeholder={t('templates.search_placeholder')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl w-64" />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
          <option value="">{t('templates.filter_all_statuses')}</option>
          <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? <SkeletonRow count={5} /> : templates.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">{t('templates.empty')}</div>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('templates.name')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('templates.event')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('templates.locale')}</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('templates.status')}</th>
              <th className="px-4 py-3 text-center font-medium text-[var(--color-text-muted)]">{t('templates.version')}</th>
              <th className="px-4 py-3 text-center font-medium text-[var(--color-text-muted)]">{t('common.actions')}</th>
            </tr></thead>
            <tbody>{templates.map(tmpl => (
              <tr key={tmpl.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]">
                <td className="px-4 py-3 font-medium">{tmpl.name || tmpl.event_name}</td>
                <td className="px-4 py-3 font-mono text-xs">{tmpl.event_name}</td>
                <td className="px-4 py-3">{tmpl.locale}</td>
                <td className="px-4 py-3"><StatusBadge status={tmpl.status} /></td>
                <td className="px-4 py-3 text-center">v{tmpl.version}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Can permission="notification_templates.update"><button onClick={() => { setEditing(tmpl); setShowForm(true); }} className="text-xs text-[var(--color-primary)] hover:underline">{t('common.edit')}</button></Can>
                    {tmpl.status === 'draft' && <Can permission="notification_templates.publish"><button onClick={() => publishMut.mutate(tmpl.id)} className="text-xs text-green-600 hover:underline">{t('templates.publish')}</button></Can>}
                    {tmpl.status === 'published' && <Can permission="notification_templates.update"><button onClick={() => archiveMut.mutate(tmpl.id)} className="text-xs text-amber-600 hover:underline">{t('templates.archive')}</button></Can>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 text-sm rounded ${page === p ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text)]'}`}>{p}</button>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? t('templates.edit_title') : t('templates.create_title')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('templates.code')}</label>
              <input name="code" defaultValue={editing?.code || ''} required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('templates.notification_type')}</label>
              <select name="notification_type_id" defaultValue={editing?.notification_type_id || ''} required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
                <option value="">{t('templates.select_type')}</option>
                {(notifTypes || []).map((nt: any) => <option key={nt.id} value={nt.id}>{nt.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('templates.name')}</label>
              <input name="name" defaultValue={editing?.name || ''} required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('templates.locale')}</label>
              <select name="locale" defaultValue={editing?.locale || 'en'} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
                <option value="en">English</option><option value="ar">العربية</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('templates.description')}</label>
            <textarea name="description" defaultValue={editing?.description || ''} rows={2} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('templates.title_template')}</label>
            <input name="title_template" defaultValue={editing?.title_template || ''} required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('templates.body_template')}</label>
            <textarea name="body_template" defaultValue={editing?.body_template || ''} rows={3} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl font-mono" />
          </div>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} className="rounded" /> {t('templates.is_active')}</label>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">{t('common.cancel')}</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">{editing ? t('common.update') : t('common.create')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', published: 'bg-green-100 text-green-700', archived: 'bg-amber-100 text-amber-700' };
  return <span className={`px-2 py-0.5 text-xs rounded-full ${colors[status] || ''}`}>{status}</span>;
}
