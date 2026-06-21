import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';

export default function OrganisationFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: orgTypes } = useQuery({
    queryKey: ['organisation-types'],
    queryFn: () => api.get('/organisation-types').then((r: any) => r.data.data),
  });

  const { data: countries } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/countries').then((r: any) => r.data.data || r.data),
  });

  const { data: orgData } = useQuery({
    queryKey: ['organisation', id],
    queryFn: () => api.get(`/organisations/${id}`).then((r: any) => r.data),
    enabled: isEdit,
  });

  const [form, setForm] = useState({
    orgTypeId: 1,
    name: '',
    slug: '',
    description: '',
    email: '',
    phone: '',
    website: '',
    countryId: 1,
    crNumber: '',
    taxId: '',
    taxIdType: '',
    logoUrl: '',
    coverUrl: '',
  });

  useEffect(() => {
    if (isEdit) {
      setForm({ orgTypeId: 1, name: '', slug: '', description: '', email: '', phone: '', website: '', countryId: 1, crNumber: '', taxId: '', taxIdType: '', logoUrl: '', coverUrl: '' });
    }
  }, [id]);

  useEffect(() => {
    if (orgData) {
      setForm({
        orgTypeId: orgData.org_type_id,
        name: orgData.name,
        slug: orgData.slug,
        description: orgData.description || '',
        email: orgData.email || '',
        phone: orgData.phone || '',
        website: orgData.website || '',
        countryId: orgData.country_id || 1,
        crNumber: orgData.cr_number || '',
        taxId: orgData.tax_id || '',
        taxIdType: orgData.tax_id_type || '',
        logoUrl: orgData.logo_url || '',
        coverUrl: orgData.cover_url || '',
      });
    }
  }, [orgData]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? api.put(`/organisations/${id}`, data) : api.post('/organisations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organisations'] });
      if (id) queryClient.invalidateQueries({ queryKey: ['organisation', Number(id)] });
      navigate('/admin/organisations');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ ...form });
  };

  const updateField = (field: string, value: any) => {
    setForm((prev: any) => {
      const next = { ...prev, [field]: value };
      if (field === 'name') {
        next.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
      return next;
    });
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">
        {isEdit ? 'Edit Organisation' : 'New Organisation'}
      </h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        Bank and payout settings are configured per branch under Branches → Financial.
      </p>

      <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-6 border border-[var(--color-border)] space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Organisation Type</label>
            <select
              value={form.orgTypeId}
              onChange={(e: any) => updateField('orgTypeId', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm"
            >
              {orgTypes?.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name || t.slug}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e: any) => updateField('name', e.target.value)}
            className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e: any) => updateField('description', e.target.value)}
            className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e: any) => updateField('email', e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Phone</label>
            <input type="text" value={form.phone} onChange={(e: any) => updateField('phone', e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Website</label>
          <input type="url" value={form.website} onChange={(e: any) => updateField('website', e.target.value)}
            className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm"
            placeholder="https://example.com" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Country</label>
            <select value={form.countryId} onChange={(e: any) => updateField('countryId', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm">
              {(Array.isArray(countries) ? countries : []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.iso_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">CR Number</label>
            <input type="text" value={form.crNumber} onChange={(e: any) => updateField('crNumber', e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Tax ID</label>
            <input type="text" value={form.taxId} onChange={(e: any) => updateField('taxId', e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Tax ID Type</label>
            <input type="text" value={form.taxIdType} onChange={(e: any) => updateField('taxIdType', e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Logo URL</label>
            <input type="url" value={form.logoUrl} onChange={(e: any) => updateField('logoUrl', e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Cover URL</label>
            <input type="url" value={form.coverUrl} onChange={(e: any) => updateField('coverUrl', e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] text-sm" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-[var(--color-border)]">
          <button type="submit" disabled={mutation.isPending}
            className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            {mutation.isPending ? 'Saving...' : isEdit ? 'Update Organisation' : 'Create Organisation'}
          </button>
          <button type="button" onClick={() => navigate('/admin/organisations')}
            className="px-6 py-2 border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-bg)] transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
