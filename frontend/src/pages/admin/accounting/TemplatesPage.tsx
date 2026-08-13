import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { getErrorMessage } from '../../../utils/errors';

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

interface TemplateLineDraft {
  l3_parent_code: string;
  code: string;
  name: string;
  account_type: string;
  normal_side: string;
  description: string;
}

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense', 'contra_asset', 'contra_liability', 'contra_equity', 'contra_revenue', 'contra_expense'] as const;

const emptyLine = (): TemplateLineDraft => ({ l3_parent_code: '', code: '', name: '', account_type: 'asset', normal_side: 'debit', description: '' });

export default function TemplatesPage() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [applyOrgId, setApplyOrgId] = useState('');
  const [preview, setPreview] = useState<PreviewLine[] | null>(null);
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [createMode, setCreateMode] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [tplForm, setTplForm] = useState({ name: '', templateKey: '', description: '' });
  const [tplLines, setTplLines] = useState<TemplateLineDraft[]>([emptyLine()]);
  const [l3Options, setL3Options] = useState<{ code: string; name: string }[]>([]);

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

  const { data: accounts } = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: () => api.get('/admin/accounting/accounts').then(r => r.data.data || r.data),
  });

  useEffect(() => {
    const accs = Array.isArray(accounts) ? accounts : accounts?.data || [];
    setL3Options(
      accs
        .filter((a: any) => a.level === 3 && a.organisation_id === null)
        .map((a: any) => ({ code: a.code, name: a.name })),
    );
  }, [accounts]);

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

  const createTplMut = useMutation({
    mutationFn: () => api.post('/admin/accounting/templates', {
      name: tplForm.name,
      templateKey: tplForm.templateKey,
      description: tplForm.description,
      lines: tplLines.map((l, i) => ({
        l3_parent_code: l.l3_parent_code,
        code: l.code,
        name: l.name,
        account_type: l.account_type,
        normal_side: l.normal_side,
        is_postable: 1,
        description: l.description,
        display_order: i * 10,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting', 'templates'] });
      setCreateMode(false);
      showToast('Template created!');
    },
    onError: (e: any) => showToast(getErrorMessage(e), 'error'),
  });

  const updateTplMut = useMutation({
    mutationFn: () => api.put(`/admin/accounting/templates/${selectedId}`, {
      name: tplForm.name,
      description: tplForm.description,
      lines: tplLines.map((l, i) => ({
        l3_parent_code: l.l3_parent_code,
        code: l.code,
        name: l.name,
        account_type: l.account_type,
        normal_side: l.normal_side,
        is_postable: 1,
        description: l.description,
        display_order: i * 10,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting', 'templates'] });
      qc.invalidateQueries({ queryKey: ['accounting', 'template', selectedId] });
      setEditMode(false);
      showToast('Template updated!');
    },
    onError: (e: any) => showToast(getErrorMessage(e), 'error'),
  });

  const startCreate = () => {
    setCreateMode(true); setEditMode(false); setSelectedId(null); setPreview(null);
    setTplForm({ name: '', templateKey: '', description: '' });
    setTplLines([emptyLine()]);
  };

  const startEdit = () => {
    setEditMode(true); setCreateMode(false);
    setTplForm({ name: selected?.name || '', templateKey: selected?.template_key || '', description: selected?.description || '' });
    setTplLines(lines.length ? lines.map(l => ({
      l3_parent_code: l.l3_parent_code, code: l.code, name: l.name,
      account_type: l.account_type, normal_side: l.normal_side, description: l.description || '',
    })) : [emptyLine()]);
  };

  const updateTplLine = (idx: number, field: keyof TemplateLineDraft, value: string) => {
    setTplLines(prev => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };
  const addTplLine = () => setTplLines(prev => [...prev, emptyLine()]);
  const removeTplLine = (idx: number) => { if (tplLines.length > 1) setTplLines(prev => prev.filter((_, i) => i !== idx)); };

  const canSave = () => {
    if (!tplForm.name.trim()) return false;
    if (createMode && !tplForm.templateKey.trim()) return false;
    return tplLines.every(l => l.l3_parent_code && l.code.trim() && l.name.trim());
  };

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
              <button onClick={startCreate}
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

            {(createMode || editMode) && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4 space-y-4">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">
                  {createMode ? 'Create Template' : 'Edit Template'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                    <input value={tplForm.name} onChange={e => setTplForm({ ...tplForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                  </div>
                  {createMode && (
                    <div>
                      <label className="block text-xs text-[var(--color-text-muted)] mb-1">Template Key *</label>
                      <input value={tplForm.templateKey} onChange={e => setTplForm({ ...tplForm, templateKey: e.target.value })}
                        placeholder="e.g. sports_club_custom"
                        className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                    </div>
                  )}
                  <div className={createMode ? 'md:col-span-2' : ''}>
                    <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
                    <input value={tplForm.description} onChange={e => setTplForm({ ...tplForm, description: e.target.value })}
                      className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">Accounts</h3>
                    <Button type="button" variant="ghost" onClick={addTplLine}>+ Add Account</Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                          <th className="text-left px-2 py-1.5">L3 Parent</th>
                          <th className="text-left px-2 py-1.5">Code</th>
                          <th className="text-left px-2 py-1.5">Name</th>
                          <th className="text-left px-2 py-1.5">Type</th>
                          <th className="text-left px-2 py-1.5">Side</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tplLines.map((l, idx) => (
                          <tr key={idx} className="border-b border-[var(--color-border)]">
                            <td className="px-2 py-1.5">
                              <select value={l.l3_parent_code} onChange={e => updateTplLine(idx, 'l3_parent_code', e.target.value)}
                                className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                                <option value="">Select L3 parent...</option>
                                {l3Options.map(o => <option key={o.code} value={o.code}>[{o.code}] {o.name}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input value={l.code} onChange={e => updateTplLine(idx, 'code', e.target.value)}
                                placeholder="CODE"
                                className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs font-mono" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input value={l.name} onChange={e => updateTplLine(idx, 'name', e.target.value)}
                                placeholder="Account name"
                                className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs" />
                            </td>
                            <td className="px-2 py-1.5">
                              <select value={l.account_type} onChange={e => updateTplLine(idx, 'account_type', e.target.value)}
                                className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <select value={l.normal_side} onChange={e => updateTplLine(idx, 'normal_side', e.target.value)}
                                className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                                <option value="debit">Debit</option>
                                <option value="credit">Credit</option>
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <button type="button" onClick={() => removeTplLine(idx)} disabled={tplLines.length <= 1}
                                className="text-xs text-[var(--color-error)] disabled:opacity-30">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button onClick={() => createMode ? createTplMut.mutate() : updateTplMut.mutate()}
                    loading={createTplMut.isPending || updateTplMut.isPending}
                    disabled={!canSave()}>
                    {createMode ? 'Create' : 'Save'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setCreateMode(false); setEditMode(false); }}>
                    Cancel
                  </Button>
                </div>
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
                      <button onClick={startEdit}
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
