import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Modal } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';

interface NotificationType {
  id: number;
  code: string;
  event_key: string;
  name: string;
  description: string | null;
  category: string;
  priority: string;
  default_channels: string[];
  icon: string | null;
  enabled: boolean;
  requires_action: boolean;
  system_managed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface NotificationTypeFormData {
  code: string;
  event_key: string;
  name: string;
  description?: string;
  category: string;
  priority: string;
  default_channels: string[];
  icon?: string;
  enabled: boolean;
  requires_action: boolean;
  system_managed: boolean;
  sort_order: number;
}

export default function NotificationTypesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NotificationType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationType | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['notification-types', page, search, categoryFilter],
    queryFn: () => api.get('/admin/notification-types', {
      params: { page, limit, q: search || undefined, category: categoryFilter || undefined },
    }).then(r => r.data),
  });

  const { data: optionsData } = useQuery({
    queryKey: ['notification-types-options'],
    queryFn: () => api.get('/admin/notification-types/options').then(r => r.data),
    staleTime: 300000,
  });

  const types: NotificationType[] = data?.data || [];
  const pagination = data?.pagination || { total: 0, page: 1, limit, totalPages: 0 };
  const categories = optionsData?.categories || [];

  const createMutation = useMutation({
    mutationFn: (form: NotificationTypeFormData) => api.post('/admin/notification-types', form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notification-types'] }); setShowForm(false); showToast(t('notification_types.created')); },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...form }: NotificationTypeFormData & { id: number }) => api.put(`/admin/notification-types/${id}`, form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notification-types'] }); setShowForm(false); setEditing(null); showToast(t('notification_types.updated')); },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/notification-types/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notification-types'] }); setDeleteTarget(null); showToast(t('notification_types.deleted')); },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (type: NotificationType) => { setEditing(type); setShowForm(true); };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: NotificationTypeFormData = {
      code: (form.get('code') as string) || '',
      event_key: (form.get('event_key') as string) || '',
      name: (form.get('name') as string) || '',
      description: form.get('description') as string || undefined,
      category: (form.get('category') as string) || 'system',
      priority: (form.get('priority') as string) || 'normal',
      default_channels: Array.from(form.getAll('channels')) as string[],
      icon: form.get('icon') as string || undefined,
      enabled: form.get('enabled') === 'on',
      requires_action: form.get('requires_action') === 'on',
      system_managed: (editing?.system_managed ?? form.get('system_managed') === 'on'),
      sort_order: Number(form.get('sort_order')) || 0,
    };
    if (editing) updateMutation.mutate({ id: editing.id, ...data });
    else createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('notification_types.title')}</h1>
        <Can permission="notification_types.create">
          <button onClick={openCreate} className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90">
            {t('notification_types.create')}
          </button>
        </Can>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder={t('notification_types.search_placeholder')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-64"
        />
        <select
          value={categoryFilter}
          onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">{t('notification_types.filter_all_categories')}</option>
          {categories.map((cat: string) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <SkeletonRow count={5} />
      ) : types.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">{t('notification_types.empty')}</div>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('notification_types.icon')}</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('notification_types.code')}</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('notification_types.event_key')}</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('notification_types.name')}</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('notification_types.category')}</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('notification_types.priority')}</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">{t('notification_types.channels')}</th>
                <th className="px-4 py-3 text-center font-medium text-[var(--color-text-muted)]">{t('notification_types.enabled')}</th>
                <th className="px-4 py-3 text-center font-medium text-[var(--color-text-muted)]">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {types.map(type => (
                <tr key={type.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]">
                  <td className="px-4 py-3 text-lg">{type.icon || '🔔'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{type.code}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">{type.event_key}</td>
                  <td className="px-4 py-3 font-medium">{type.name}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-bg)] border border-[var(--color-border)]">{type.category}</span></td>
                  <td className="px-4 py-3"><PriorityBadge priority={type.priority} /></td>
                  <td className="px-4 py-3"><ChannelBadges channels={type.default_channels} /></td>
                  <td className="px-4 py-3 text-center">{type.enabled ? '✅' : '❌'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Can permission="notification_types.update">
                        <button onClick={() => openEdit(type)} className="text-xs text-[var(--color-primary)] hover:underline">{t('common.edit')}</button>
                      </Can>
                      <Can permission="notification_types.delete">
                        <button onClick={() => setDeleteTarget(type)} className="text-xs text-[var(--color-error)] hover:underline">{t('common.delete')}</button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 text-sm rounded ${page === p ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text)] hover:bg-[var(--color-border)]'}`}>{p}</button>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? t('notification_types.edit_title') : t('notification_types.create_title')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('notification_types.code')}</label>
              <input name="code" defaultValue={editing?.code || ''} required disabled={editing?.system_managed} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('notification_types.event_key')}</label>
              <input name="event_key" defaultValue={editing?.event_key || ''} required disabled={editing?.system_managed} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl disabled:opacity-50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('notification_types.name')}</label>
            <input name="name" defaultValue={editing?.name || ''} required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('notification_types.description')}</label>
            <textarea name="description" defaultValue={editing?.description || ''} rows={2} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('notification_types.category')}</label>
              <select name="category" defaultValue={editing?.category || 'system'} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
                {categories.map((cat: string) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('notification_types.priority')}</label>
              <select name="priority" defaultValue={editing?.priority || 'normal'} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
                {['low', 'normal', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('notification_types.sort_order')}</label>
              <input name="sort_order" type="number" defaultValue={editing?.sort_order || 0} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('notification_types.default_channels')}</label>
            <div className="flex gap-4">
              {['in_app', 'push', 'email', 'sms'].map(ch => (
                <label key={ch} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="channels" value={ch} defaultChecked={editing?.default_channels?.includes(ch)} className="rounded" /> {ch}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={editing?.enabled ?? true} className="rounded" /> {t('notification_types.enabled')}
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="requires_action" defaultChecked={editing?.requires_action || false} className="rounded" /> {t('notification_types.requires_action')}
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)]">{t('common.cancel')}</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90">
              {editing ? t('common.update') : t('common.create')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('common.confirm')} size="sm">
        <p className="text-sm text-[var(--color-text)] mb-4">{t('notification_types.delete_confirm', { name: deleteTarget?.name || '' })}</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">{t('common.cancel')}</button>
          <button onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-error)] text-white">{t('common.delete')}</button>
        </div>
      </Modal>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = { low: 'bg-gray-100 text-gray-600', normal: 'bg-blue-100 text-blue-700', high: 'bg-amber-100 text-amber-700', critical: 'bg-red-100 text-red-700' };
  return <span className={`px-2 py-0.5 text-xs rounded-full ${colors[priority] || 'bg-gray-100 text-gray-600'}`}>{priority}</span>;
}

function ChannelBadges({ channels }: { channels: string[] }) {
  return <div className="flex gap-1 flex-wrap">{channels.map(ch => <span key={ch} className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-bg)] border border-[var(--color-border)]">{ch}</span>)}</div>;
}
