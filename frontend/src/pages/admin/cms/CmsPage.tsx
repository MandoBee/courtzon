import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { EntityImage } from '../../../components/ui';

type Tab = 'pages' | 'blocks' | 'media' | 'contacts' | 'blogs';

const BLOCK_TYPES = [
  { value: 'hero', label: 'Hero Banner' },
  { value: 'features', label: 'Features Grid' },
  { value: 'cta', label: 'Call to Action' },
  { value: 'text', label: 'Rich Text' },
  { value: 'team', label: 'Team Members' },
  { value: 'faq', label: 'FAQ Accordion' },
  { value: 'contact_form', label: 'Contact Form' },
  { value: 'stats', label: 'Statistics' },
  { value: 'testimonials', label: 'Testimonials' },
  { value: 'blog_preview', label: 'Blog Preview (Dynamic)' },
  { value: 'pricing', label: 'Pricing Plans (Dynamic)' },
  { value: 'steps', label: 'Steps / How It Works' },
];

function onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }

export default function CmsPage() {
  const [tab, setTab] = useState<Tab>('pages');
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [selectedPageTitle, setSelectedPageTitle] = useState('');

  const switchToBlocks = (pageId: number, title: string) => {
    setSelectedPageId(pageId);
    setSelectedPageTitle(title);
    setTab('blocks');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">CMS Manager</h1>
      </div>
      <div className="flex gap-1 mb-6 bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-1 w-fit shadow-[var(--shadow-sm)]">
        {(['pages', 'media', 'contacts', 'blogs'] as Tab[]).map((t: any) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors capitalize ${
              tab === t ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
            }`}>{t === 'blocks' ? 'Blocks' : t}</button>
        ))}
      </div>
      {tab === 'pages' && <PagesManager switchToBlocks={switchToBlocks} />}
      {tab === 'blocks' && selectedPageId && (
        <BlockManager pageId={selectedPageId} pageTitle={selectedPageTitle} back={() => setTab('pages')} />
      )}
      {tab === 'blocks' && !selectedPageId && (
        <div className="text-center py-12 text-[var(--color-text-muted)]">Select a page first from the Pages tab.</div>
      )}
      {tab === 'media' && <MediaManager />}
      {tab === 'contacts' && <ContactsManager />}
      {tab === 'blogs' && <BlogsManager />}
    </div>
  );
}

// ── Pages Manager ──
function PagesManager({ switchToBlocks }: { switchToBlocks: (id: number, title: string) => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [form, setForm] = useState({ slug: '', title: '', content: '', metaTitle: '', metaDescription: '', isHomepage: false, pageTemplate: '' });

  const { data: pages } = useQuery<any[]>({ queryKey: ['admin', 'cms-pages'], queryFn: () => api.get('/cms/pages').then(r => r.data.data) });
  const createMut = useMutation({ mutationFn: (d: any) => api.post('/cms/pages', d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-pages'] }); resetForm(); showToast('Created successfully!'); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: any) => api.put(`/cms/pages/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-pages'] }); resetForm(); showToast('Updated successfully!'); } });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.delete(`/cms/pages/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-pages'] }); showToast('Deleted!'); } });
  const publishMut = useMutation({ mutationFn: ({ id, publish }: { id: number; publish: boolean }) => api.patch(`/cms/pages/${id}/publish`, { publish }), onSuccess: (_data: any, variables: any) => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-pages'] }); showToast(variables.publish ? 'Published!' : 'Unpublished!'); } });
  const reorderMut = useMutation({ mutationFn: (pageIds: number[]) => api.put('/cms/pages/reorder', { pageIds }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-pages'] }); } });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ slug: '', title: '', content: '', metaTitle: '', metaDescription: '', isHomepage: false, pageTemplate: '' }); };
  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({ slug: p.slug, title: p.title, content: p.content || '', metaTitle: p.meta_title || '', metaDescription: p.meta_description || '', isHomepage: !!p.is_homepage, pageTemplate: p.page_template || '' });
    setShowForm(true);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { slug: form.slug, title: form.title, content: form.content, metaTitle: form.metaTitle || undefined, metaDescription: form.metaDescription || undefined, isHomepage: form.isHomepage, pageTemplate: form.pageTemplate || undefined };
    if (editingId) updateMut.mutate({ id: editingId, data: payload });
    else createMut.mutate(payload);
  };

  const handleDrop = (targetId: number) => {
    if (!dragId || dragId === targetId || !pages) return;
    const ordered = pages.map(p => p.id);
    const fromIdx = ordered.indexOf(dragId);
    const toIdx = ordered.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, dragId);
    reorderMut.mutate(ordered);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-text-muted)]">{pages?.length || 0} page(s)</p>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">+ New Page</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Page' : 'New Page'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Title</label>
              <Can permission="cms.edit.title">
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }))} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Slug</label>
              <Can permission="cms.edit.key">
                <input value={form.slug} readOnly className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm text-[var(--color-text-muted)]" />
              </Can>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Content (HTML / rich text for standalone pages)</label>
            <Can permission="cms.edit.content">
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={5} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm font-mono" />
            </Can>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Meta Title</label>
              <input value={form.metaTitle} onChange={e => setForm(f => ({ ...f, metaTitle: e.target.value }))} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Meta Description</label>
              <input value={form.metaDescription} onChange={e => setForm(f => ({ ...f, metaDescription: e.target.value }))} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isHomepage} onChange={e => setForm(f => ({ ...f, isHomepage: e.target.checked }))} />
                <span className="text-xs text-[var(--color-text-muted)]">Set as Homepage</span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">{editingId ? 'Update' : 'Create'}</button>
            <button type="button" onClick={resetForm} className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              <th className="px-2 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium w-56"></th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {pages?.map((p: any) => (
              <tr key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragOver={onDragOver}
                onDragEnd={() => setDragId(null)}
                onDrop={() => handleDrop(p.id)}
                className={`hover:bg-[var(--color-bg)]/30 cursor-grab active:cursor-grabbing transition-opacity ${editingId === p.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'} ${dragId === p.id ? 'opacity-30' : ''}`}>
                <td className="px-2 py-3 text-[var(--color-text-muted)] text-lg select-none cursor-grab active:cursor-grabbing" title="Drag to reorder">⠿</td>
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">{p.title}{p.is_homepage ? ' 🏠' : ''}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">/{p.slug}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.is_published ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>{p.is_published ? 'Published' : 'Draft'}</span></td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(p.updated_at).toLocaleDateString('en-GB')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => switchToBlocks(p.id, p.title)} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] text-[var(--color-info-text)] hover:bg-[var(--color-info-bg)]">Blocks</button>
                    <button onClick={() => openEdit(p)} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">Edit</button>
                    <button onClick={() => publishMut.mutate({ id: p.id, publish: !p.is_published })} className={`text-xs px-2.5 py-1 border rounded-[var(--radius-md)] ${p.is_published ? 'text-[var(--color-warning-text)]' : 'text-[var(--color-success-text)]'}`}>{p.is_published ? 'Unpub' : 'Pub'}</button>
                    <button onClick={() => { if (confirm(`Delete "${p.title}"?`)) deleteMut.mutate(p.id); }} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)]">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Block Manager ──
function BlockManager({ pageId, pageTitle, back }: { pageId: number; pageTitle: string; back: () => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [blockType, setBlockType] = useState('text');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [contentJson, setContentJson] = useState('{}');

  const queryKey = ['admin', 'cms-blocks', pageId];
  const { data: blocks } = useQuery<any[]>({ queryKey, queryFn: () => api.get(`/cms/pages/${pageId}/blocks`).then(r => r.data.data) });
  const createMut = useMutation({ mutationFn: (d: any) => api.post('/cms/blocks', d), onSuccess: () => { queryClient.invalidateQueries({ queryKey }); resetForm(); showToast('Created successfully!'); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: any) => api.put(`/cms/blocks/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey }); resetForm(); showToast('Updated successfully!'); } });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.delete(`/cms/blocks/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey }); showToast('Deleted!'); } });
  const reorderMut = useMutation({ mutationFn: (blockIds: number[]) => api.put(`/cms/pages/${pageId}/blocks/reorder`, { blockIds }), onSuccess: () => { queryClient.invalidateQueries({ queryKey }); } });

  const resetForm = () => { setShowForm(false); setEditingId(null); setBlockType('text'); setTitle(''); setSubtitle(''); setContentJson('{}'); };
  const openEdit = (b: any) => {
    setEditingId(b.id);
    setBlockType(b.block_type);
    setTitle(b.title || '');
    setSubtitle(b.subtitle || '');
    setContentJson(b.content || '{}');
    setShowForm(true);
  };

  const getExampleJson = (type: string) => {
    switch (type) {
      case 'hero': return JSON.stringify({ heading: 'Welcome', subheading: 'Best platform', ctaText: 'Get Started', ctaLink: '/register', backgroundImage: '' }, null, 2);
      case 'features': return JSON.stringify({ columns: 3, features: [{ icon: 'booking', title: 'Easy Booking', description: 'Book courts easily' }, { icon: '🏆', title: 'Tournaments', description: 'Join events' }] }, null, 2);
      case 'cta': return JSON.stringify({ text: 'Ready?', buttonText: 'Join Now', buttonLink: '/register' }, null, 2);
      case 'text': return JSON.stringify({ html: '<p>Your content here...</p>' }, null, 2);
      case 'team': return JSON.stringify({ members: [{ name: 'John', role: 'CEO', bio: '' }] }, null, 2);
      case 'faq': return JSON.stringify({ items: [{ question: 'How?', answer: 'Easy!' }] }, null, 2);
      case 'stats': return JSON.stringify({ stats: [{ label: 'Users', value: '10k+' }] }, null, 2);
      case 'testimonials': return JSON.stringify({ testimonials: [{ name: 'Jane', quote: 'Great!' }] }, null, 2);
      case 'contact_form': return '{}';
      case 'blog_preview': return '{}';
      case 'pricing': return '{}';
      case 'steps': return JSON.stringify({ steps: [{ icon: '1', title: 'Step 1', description: 'Description' }, { icon: '2', title: 'Step 2', description: 'Description' }, { icon: '3', title: 'Step 3', description: 'Description' }] }, null, 2);
      default: return '{}';
    }
  };

  const handleTypeChange = (type: string) => {
    setBlockType(type);
    if (!editingId) setContentJson(getExampleJson(type));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let content: any;
    try { content = JSON.parse(contentJson); } catch { return alert('Invalid JSON in content field'); }
    const payload = { pageId, blockType, blockKey: `${blockType}_${Date.now()}`, title: title || null, subtitle: subtitle || null, content, sortOrder: blocks?.length || 0 };
    if (editingId) updateMut.mutate({ id: editingId, data: payload });
    else createMut.mutate(payload);
  };

  const handleBlockDrop = (targetId: number) => {
    if (!dragId || dragId === targetId || !blocks) return;
    const ordered = blocks.map(b => b.id);
    const fromIdx = ordered.indexOf(dragId);
    const toIdx = ordered.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, dragId);
    reorderMut.mutate(ordered);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={back} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">&larr; Back to Pages</button>
        <span className="text-[var(--color-text-muted)]">/</span>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{pageTitle} — Blocks</h2>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-text-muted)]">{blocks?.length || 0} block(s)</p>
        <Can permission="cms.create">
          <button onClick={() => { resetForm(); setContentJson(getExampleJson('text')); setShowForm(true); }} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">+ Add Block</button>
        </Can>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Block' : 'New Block'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Block Type</label>
              <select value={blockType} onChange={e => handleTypeChange(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                {BLOCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Title</label>
              <Can permission="cms.edit.title">
                <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Subtitle</label>
              <input value={subtitle} onChange={e => setSubtitle(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[var(--color-text-muted)]">Content (JSON)</label>
              <button type="button" onClick={() => setContentJson(getExampleJson(blockType))} className="text-xs text-[var(--color-primary)] hover:underline">Reset to example</button>
            </div>
            <Can permission="cms.edit.content">
              <textarea value={contentJson} onChange={e => setContentJson(e.target.value)} rows={10} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm font-mono" />
            </Can>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">{editingId ? 'Update' : 'Create'}</button>
            <button type="button" onClick={resetForm} className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {blocks?.map((b: any, i: number) => (
          <div key={b.id}
            draggable
            onDragStart={() => setDragId(b.id)}
            onDragOver={onDragOver}
            onDragEnd={() => setDragId(null)}
            onDrop={() => handleBlockDrop(b.id)}
            className={`bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 flex items-center justify-between cursor-grab active:cursor-grabbing transition-opacity ${dragId === b.id ? 'opacity-30' : ''}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[var(--color-text-muted)] text-lg select-none shrink-0" title="Drag to reorder">⠿</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-[var(--color-info-bg)] text-[var(--color-info-text)] rounded-full font-medium shrink-0">{b.block_type}</span>
                  <span className="text-sm font-medium text-[var(--color-text)] truncate">{b.title || '(no title)'}</span>
                  <span className="text-xs text-[var(--color-text-muted)] shrink-0">#{i + 1}</span>
                </div>
                {b.subtitle && <p className="text-xs text-[var(--color-text-muted)] mt-1">{b.subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-3">
              <button onClick={() => openEdit(b)} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">Edit</button>
              <button onClick={() => { if (confirm('Delete this block?')) deleteMut.mutate(b.id); }} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)]">Del</button>
            </div>
          </div>
        ))}
        {(!blocks || blocks.length === 0) && (
          <p className="text-center text-[var(--color-text-muted)] py-8 text-sm">No blocks yet. Click "Add Block" to build this page.</p>
        )}
      </div>
    </div>
  );
}

// ── Media Manager ──
function MediaManager() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const queryKey = ['admin', 'cms-media'];
  const { data: media } = useQuery<any[]>({ queryKey, queryFn: () => api.get('/cms/media').then(r => r.data.data) });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.delete(`/cms/media/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey }); showToast('Deleted!'); } });
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mediaType', 'image');
      formData.append('category', 'cms');
      await api.post('/cms/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      showToast(getErrorMessage(err, 'Upload failed'), 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-text-muted)]">{media?.length || 0} media file(s)</p>
        <label className={`px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
          {uploading ? 'Uploading...' : '+ Upload Image'}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {media?.map((m: any) => (
          <div key={m.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden group">
            <div className="aspect-square bg-[var(--color-border)] flex items-center justify-center overflow-hidden">
              <EntityImage
                src={m.thumbnail_url || m.url}
                name={m.alt_text || m.original_name || 'Media'}
                className="w-full h-full rounded-none text-2xl"
              />
            </div>
            <div className="p-2">
              <p className="text-xs text-[var(--color-text-muted)] truncate" title={m.original_name}>{m.original_name}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-[var(--color-text-muted)]">{m.width}x{m.height} · {m.media_type}</span>
                <button onClick={() => { if (confirm('Delete this image?')) deleteMut.mutate(m.id); }} className="text-[10px] text-red-500 hover:underline">Del</button>
              </div>
            </div>
          </div>
        ))}
        {(!media || media.length === 0) && (
          <div className="col-span-full text-center text-[var(--color-text-muted)] py-12 text-sm">No images uploaded yet.</div>
        )}
      </div>
    </div>
  );
}

// ── Contacts Manager ──
function ContactsManager() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const queryKey = ['admin', 'cms-contacts'];
  const { data: submissions } = useQuery<any[]>({ queryKey, queryFn: () => api.get('/cms/contacts').then(r => r.data.data) });
  const readMut = useMutation({ mutationFn: (id: number) => api.patch(`/cms/contacts/${id}/read`), onSuccess: () => { queryClient.invalidateQueries({ queryKey }); showToast('Marked as read!'); } });

  return (
    <div>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">{submissions?.length || 0} submission(s)</p>
      {(!submissions || submissions.length === 0) ? (
        <p className="text-center text-[var(--color-text-muted)] py-12 text-sm">No contact submissions yet.</p>
      ) : (
        <div className="space-y-3">
          {submissions.map((s: any) => (
            <div key={s.id} className={`bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 ${!s.is_read ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20' : 'border-[var(--color-border)]'}`}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--color-text)]">{s.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{s.email}</span>
                  {s.phone && <span className="text-xs text-[var(--color-text-muted)]">{s.phone}</span>}
                  {s.country_name && <span className="text-xs text-[var(--color-text-muted)]">{s.country_name}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {!s.is_read && <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">New</span>}
                  {s.email_sent_at && <span className="text-xs text-emerald-600">Emailed</span>}
                  {s.email_error && <span className="text-xs text-red-600" title={s.email_error}>Email failed</span>}
                  <span className="text-xs text-[var(--color-text-muted)]">{new Date(s.created_at).toLocaleString('en-GB')}</span>
                  {!s.is_read && (
                    <button onClick={() => readMut.mutate(s.id)} className="text-xs text-blue-600 hover:underline">Mark read</button>
                  )}
                </div>
              </div>
              {s.subject && <p className="text-xs text-[var(--color-text-muted)] mb-1"><strong>Subject:</strong> {s.subject}</p>}
              {s.referral_source && (
                <p className="text-xs text-[var(--color-text-muted)] mb-2">
                  <strong>Source:</strong> {s.referral_source}
                  {s.referral_other ? ` — ${s.referral_other}` : ''}
                </p>
              )}
              <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{s.message}</p>
              {s.attachments?.length > 0 && (
                <ul className="mt-3 text-xs text-[var(--color-text-muted)] space-y-1">
                  {s.attachments.map((a: any) => (
                    <li key={a.upload_id}>
                      <a href={a.file_path} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                        {a.original_name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Blogs Manager ──
function BlogsManager() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ slug: '', title: '', excerpt: '', content: '', coverImage: '' });

  const { data: blogs } = useQuery<any[]>({ queryKey: ['admin', 'cms-blogs'], queryFn: () => api.get('/cms/blogs').then(r => r.data.data) });
  const createMut = useMutation({ mutationFn: (d: any) => api.post('/cms/blogs', d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-blogs'] }); resetForm(); showToast('Created successfully!'); }, onError: (err) => showToast(getErrorMessage(err, 'Failed to create blog'), 'error') });
  const updateMut = useMutation({ mutationFn: ({ id, data }: any) => api.put(`/cms/blogs/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-blogs'] }); resetForm(); showToast('Updated successfully!'); }, onError: (err) => showToast(getErrorMessage(err, 'Failed to update blog'), 'error') });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.delete(`/cms/blogs/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-blogs'] }); showToast('Deleted!'); } });
  const publishMut = useMutation({ mutationFn: ({ id, publish }: { id: number; publish: boolean }) => api.patch(`/cms/blogs/${id}/publish`, { publish }), onSuccess: (_data: any, variables: any) => { queryClient.invalidateQueries({ queryKey: ['admin', 'cms-blogs'] }); showToast(variables.publish ? 'Published!' : 'Unpublished!'); } });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ slug: '', title: '', excerpt: '', content: '', coverImage: '' }); };
  const openEdit = (b: any) => {
    setEditingId(b.id);
    setForm({ slug: b.slug, title: b.title, excerpt: b.excerpt || '', content: b.content || '', coverImage: b.cover_image || '' });
    setShowForm(true);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { slug: form.slug, title: form.title, excerpt: form.excerpt || undefined, content: form.content, coverImage: form.coverImage || undefined };
    if (editingId) updateMut.mutate({ id: editingId, data: payload });
    else createMut.mutate(payload);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-text-muted)]">{blogs?.length || 0} blog post(s)</p>
        <Can permission="cms.blog.create">
          <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">+ New Post</button>
        </Can>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Post' : 'New Blog Post'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Title</label>
              <Can permission="cms.blog.edit.title">
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }))} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Slug</label>
              <Can permission="cms.blog.edit.slug">
                <input value={form.slug} readOnly className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm text-[var(--color-text-muted)]" />
              </Can>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Cover Image URL</label>
            <input value={form.coverImage} onChange={e => setForm(f => ({ ...f, coverImage: e.target.value }))} placeholder="https://..." className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Excerpt</label>
            <input value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Brief summary..." className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
          </div>
          <div className="mb-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Content (HTML)</label>
            <Can permission="cms.blog.edit.content">
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={12} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm font-mono" />
            </Can>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">{editingId ? 'Update' : 'Create'}</button>
            <button type="button" onClick={resetForm} className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Author</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium w-56"></th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {blogs?.map((b: any) => (
              <tr key={b.id} className={`hover:bg-[var(--color-bg)]/30 ${editingId === b.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                  <div className="flex items-center gap-2">
                    {b.cover_image && <img src={b.cover_image} alt="" className="w-8 h-8 rounded object-cover" />}
                    {b.title}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">/{b.slug}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{b.author_name || '—'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.is_published ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>{b.is_published ? 'Published' : 'Draft'}</span></td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(b.created_at).toLocaleDateString('en-GB')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(b)} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">Edit</button>
                    <Can permission="cms.blog.publish">
                      <button onClick={() => publishMut.mutate({ id: b.id, publish: !b.is_published })} className={`text-xs px-2.5 py-1 border rounded-[var(--radius-md)] ${b.is_published ? 'text-[var(--color-warning-text)]' : 'text-[var(--color-success-text)]'}`}>{b.is_published ? 'Unpub' : 'Pub'}</button>
                    </Can>
                    <Can permission="cms.blog.delete">
                      <button onClick={() => { if (confirm(`Delete "${b.title}"?`)) deleteMut.mutate(b.id); }} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)]">Del</button>
                    </Can>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!blogs || blogs.length === 0) && (
          <p className="text-center text-[var(--color-text-muted)] py-8 text-sm">No blog posts yet. Click "New Post" to get started.</p>
        )}
      </div>
    </div>
  );
}
