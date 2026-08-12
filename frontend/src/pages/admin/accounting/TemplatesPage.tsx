import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Template {
  id: number;
  template_key: string;
  name: string;
  description: string;
  scope: 'system' | 'organization';
  is_active: number;
  organisation_id: number | null;
}

interface TemplateLine {
  id: number;
  l3_parent_code: string;
  code: string;
  name: string;
  account_type: string;
  normal_side: string;
  is_postable: number;
  description: string;
  display_order: number;
}

interface PreviewLine {
  template_line_id: number;
  l3_parent_code: string;
  proposed_code: string;
  name: string;
  account_type: string;
  normal_side: string;
  is_postable: boolean;
  already_exists: boolean;
  status: 'skipped' | 'will_create';
}

export default function TemplatesPage() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [applyOrgId, setApplyOrgId] = useState('');
  const [preview, setPreview] = useState<PreviewLine[] | null>(null);
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [createMode, setCreateMode] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    api.get('/organisations?limit=200').then(r => {
      const d = r.data?.data ?? r.data ?? [];
      if (Array.isArray(d)) setOrgs(d.map((o: any) => ({ id: o.id, name: o.name ?? o.organisationName ?? '' })));
    }).catch(() => {});
  }, []);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['accounting', 'templates'],
    queryFn: () => api.get('/admin/accounting/templates').then(r => r.data.data || r.data),
  });

  const { data: selectedTemplate } = useQuery({
    queryKey: ['accounting', 'template', selectedId],
    queryFn: () => api.get(`/admin/accounting/templates/${selectedId}`).then(r => r.data.data || r.data),
    enabled: !!selectedId,
  });

  const handlePreview = async () => {
    if (!applyOrgId) { showToast('Select an organization first', 'warning'); return; }
    const r = await api.get('/admin/accounting/templates/preview', { params: { templateId: selectedId, organisationId: applyOrgId } });
    setPreview(r.data.data || r.data);
  };

  const applyMut = useMutation({
    mutationFn: () => api.post('/admin/accounting/templates/apply', { templateId: selectedId, organisationId: Number(applyOrgId) }),
    onSuccess: (r: any) => {
      const d = r.data.data;
      showToast(`Created ${d.created} accounts, skipped ${d.skipped} existing`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ['accounting', 'accounts'] });
    },
    onError: (e: any) => { showToast(e?.response?.data?.message || 'Apply failed', 'error'); },
  });

  if (isLoading) return <Spinner />;

  const tmpls: Template[] = Array.isArray(templates) ? templates : [];
  const selected: any = selectedTemplate || null;
  const lines: TemplateLine[] = selected?.lines || [];

  return (
    <Can permission="accounting.templates.view">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Account Templates</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template List */}
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Templates</h2>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {tmpls.map(t => (
                <button key={t.id} onClick={() => { setSelectedId(t.id); setCreateMode(false); setEditMode(false); setPreview(null); }}
                  className={`w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors ${
                    selectedId === t.id ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)] hover:bg-[var(--color-bg)]'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${t.scope === 'system' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {t.scope}
                    </span>
                    <span className="truncate">{t.name}</span>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{t.template_key}</div>
                </button>
              ))}
            </div>
            <Can permission="accounting.templates.manage">
              <button onClick={() => { setCreateMode(true); setEditMode(false); setSelectedId(null); setPreview(null); }}
                className="mt-3 w-full text-sm px-3 py-2 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/30">
                + Create Template
              </button>
            </Can>
          </div>

          {/* Template Detail */}
          <div className="lg:col-span-2 space-y-4">
            {!selected && !createMode && !editMode && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-8 text-center text-[var(--color-text-muted)] text-sm">
                Select a template to view details
              </div>
            )}

            {selected && !createMode && !editMode && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--color-text)]">{selected.name}</h2>
                    <p className="text-xs text-[var(--color-text-muted)]">Key: {selected.template_key} | Scope: {selected.scope}</p>
                  </div>
                  {selected.scope !== 'system' && (
                    <Can permission="accounting.templates.manage">
                      <button onClick={() => setEditMode(true)}
                        className="text-xs px-3 py-1.5 border rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                        Edit
                      </button>
                    </Can>
                  )}
                </div>
                {selected.description && <p className="text-sm text-[var(--color-text-muted)]">{selected.description}</p>}

                {/* Template Lines */}
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Accounts ({lines.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">L3 Parent</th>
                          <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Code</th>
                          <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Name</th>
                          <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Type</th>
                          <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Side</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {lines.map((line, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5 text-[var(--color-text-muted)] font-mono">{line.l3_parent_code}</td>
                            <td className="px-2 py-1.5 text-[var(--color-text)] font-mono">{line.code}</td>
                            <td className="px-2 py-1.5 text-[var(--color-text)]">{line.name}</td>
                            <td className="px-2 py-1.5 text-[var(--color-text-muted)] capitalize">{line.account_type.replace(/_/g, ' ')}</td>
                            <td className="px-2 py-1.5 text-[var(--color-text-muted)]">{line.normal_side}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Apply Template */}
                <Can permission="accounting.templates.manage">
                  <div className="border-t border-[var(--color-border)] pt-4">
                    <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Apply Template</h3>
                    <div className="flex items-center gap-3 flex-wrap">
                      <select value={applyOrgId} onChange={e => setApplyOrgId(e.target.value)}
                        className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[200px]">
                        <option value="">Select Organization</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <button onClick={handlePreview} disabled={!selectedId || !applyOrgId}
                        className="text-xs px-3 py-2 border rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40">
                        Preview
                      </button>
                      <button onClick={() => applyMut.mutate()}
                        disabled={!selectedId || !applyOrgId || applyMut.isPending}
                        className="text-xs px-3 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-40">
                        {applyMut.isPending ? 'Applying...' : 'Apply'}
                      </button>
                    </div>
                  </div>
                </Can>

                {/* Preview */}
                {preview && (
                  <div className="border-t border-[var(--color-border)] pt-4">
                    <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Preview</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">L3</th>
                            <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Code</th>
                            <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Name</th>
                            <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {preview.map((p, i) => (
                            <tr key={i} className={p.already_exists ? 'opacity-50' : ''}>
                              <td className="px-2 py-1.5 text-[var(--color-text-muted)] font-mono">{p.l3_parent_code}</td>
                              <td className="px-2 py-1.5 text-[var(--color-text)] font-mono">{p.proposed_code}</td>
                              <td className="px-2 py-1.5 text-[var(--color-text)]">{p.name}</td>
                              <td className="px-2 py-1.5">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${p.status === 'will_create' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                  {p.status === 'will_create' ? 'Will create' : 'Exists (skip)'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Can>
  );
}
