import { useState, useEffect, Fragment, useRef } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { formatPrice } from '../../../utils/currency';

export default function BranchListPage() {
  const { orgId } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTab, setFormTab] = useState<'basic' | 'financial' | 'amenities' | 'holidays'>('basic');
  const [expandedBranchId, setExpandedBranchId] = useState<number | null>(null);
  const [expandedResources, setExpandedResources] = useState<any[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapLat, setMapLat] = useState('');
  const [mapLng, setMapLng] = useState('');

  const emptyForm = { name: '', slug: '', description: '', email: '', phone: '', addressLine1: '', city: '', state: '', postalCode: '', accessType: 'open', timezone: 'Africa/Cairo', countryId: undefined as number | undefined, openingTime: '00:00', closingTime: '23:59', latitude: undefined as number | undefined, longitude: undefined as number | undefined };

const TIMEZONES = [
  'Africa/Cairo','Africa/Johannesburg','Africa/Lagos','Africa/Nairobi',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'America/Mexico_City','America/Sao_Paulo','America/Argentina/Buenos_Aires',
  'Asia/Dubai','Asia/Riyadh','Asia/Kuwait','Asia/Doha','Asia/Bahrain',
  'Asia/Muscat','Asia/Amman','Asia/Beirut','Asia/Baghdad',
  'Asia/Karachi','Asia/Kolkata','Asia/Dhaka',
  'Asia/Bangkok','Asia/Jakarta','Asia/Singapore','Asia/Kuala_Lumpur',
  'Asia/Shanghai','Asia/Tokyo','Asia/Seoul',
  'Australia/Sydney','Australia/Melbourne',
  'Europe/London','Europe/Paris','Europe/Berlin','Europe/Madrid','Europe/Rome',
  'Europe/Istanbul','Europe/Moscow',
  'Pacific/Auckland',
];
  const emptyFinancial = { bankName: '', bankAccountName: '', bankAccountNumber: '', iban: '', swift: '', billingAddress: '', billingEmail: '', payoutSchedule: 'monthly' };
  const [form, setForm] = useState(emptyForm);
  const [finForm, setFinForm] = useState(emptyFinancial);
  const [amenityIds, setAmenityIds] = useState<number[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | undefined>(undefined);
  const [selectedBrId, setSelectedBrId] = useState<number | undefined>(undefined);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holidayForm, setHolidayForm] = useState({ name: '', dateFrom: '', dateTo: '', isRecurring: false, isOpenModified: false, openTime: '', closeTime: '' });
  const [editingHolidayId, setEditingHolidayId] = useState<number | null>(null);

  const { data: banksList } = useQuery({
    queryKey: ['banks', form.countryId],
    queryFn: () => api.get(`/banks?countryId=${form.countryId}`).then((r: any) => r.data?.data ?? []).catch(() => []),
    enabled: !!form.countryId,
  });
  const { data: bankBranches } = useQuery({
    queryKey: ['bank-branches', selectedBankId],
    queryFn: () => api.get(`/bank-branches?bankId=${selectedBankId}`).then((r: any) => r.data?.data ?? []).catch(() => []),
    enabled: !!selectedBankId,
  });

  const { data: org } = useQuery({
    queryKey: ['organisation', orgId],
    queryFn: () => api.get(`/organisations/${orgId}`).then((r: any) => r.data),
    enabled: !!orgId,
  });

  const { data: branches, isLoading } = useQuery({
    queryKey: ['branches', orgId],
    queryFn: () => api.get(`/organisations/${orgId}/branches`).then((r: any) => r.data.data),
    enabled: !!orgId,
  });

  const { data: amenities } = useQuery({
    queryKey: ['amenities'],
    queryFn: () => api.get('/amenities').then((r: any) => r.data.data),
  });

  const { data: countries } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/countries').then((r: any) => r.data.data),
  });

  const [selectedCountryId, setSelectedCountryId] = useState<number | undefined>(undefined);

  const { data: provinces } = useQuery({
    queryKey: ['provinces', selectedCountryId],
    queryFn: () => api.get(`/countries/${selectedCountryId}/provinces`).then((r: any) => r.data.data),
    enabled: !!selectedCountryId,
  });

  const [selectedProvinceId, setSelectedProvinceId] = useState<number | undefined>(undefined);

  const { data: cities } = useQuery({
    queryKey: ['cities', selectedProvinceId],
    queryFn: () => api.get(`/provinces/${selectedProvinceId}/cities`).then((r: any) => r.data.data),
    enabled: !!selectedProvinceId,
  });

  useEffect(() => {
    if (provinces?.length && form.state && !selectedProvinceId && editingId) {
      const match = provinces.find((p: any) => p.name === form.state);
      if (match) setSelectedProvinceId(match.id);
    }
  }, [provinces, form.state, selectedProvinceId, editingId]);

  useEffect(() => {
    if (!editingId) {
      setFinForm(emptyFinancial);
      setSelectedBankId(undefined);
      setSelectedBrId(undefined);
      return;
    }
    api.get(`/branches/${editingId}/financial-details`)
      .then((r: any) => {
        const fd = r.data?.data;
        if (!fd) {
          setFinForm(emptyFinancial);
          setSelectedBankId(undefined);
          setSelectedBrId(undefined);
          return;
        }
        setFinForm({
          bankName: fd.bank_name || '',
          bankAccountName: fd.bank_account_name || '',
          bankAccountNumber: fd.bank_account_number || '',
          iban: fd.iban || '',
          swift: fd.swift || '',
          billingAddress: fd.billing_address || '',
          billingEmail: fd.billing_email || '',
          payoutSchedule: fd.payout_schedule || 'monthly',
        });
        setSelectedBankId(fd.bank_id || undefined);
        setSelectedBrId(fd.bank_branch_id || undefined);
      })
      .catch(() => setFinForm(emptyFinancial));
  }, [editingId]);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/branches', { ...data, organisationId: Number(orgId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', orgId] });
      setShowForm(false);
      setForm(emptyForm);
      showToast('Branch created successfully!');
    },
    onError: (err: any) => { showToast('Failed to create branch: ' + getErrorMessage(err), 'error'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/branches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', orgId] });
      setEditingId(null);
      setShowForm(false);
      setForm(emptyForm);
      showToast('Branch updated successfully!');
    },
    onError: (err: any) => { showToast('Failed to update branch: ' + getErrorMessage(err), 'error'); },
  });

  const finMutation = useMutation({
    mutationFn: ({ branchId, data }: { branchId: number; data: any }) =>
      api.put(`/branches/${branchId}/financial-details`, data),
    onSuccess: () => showToast('Financial details saved!'),
    onError: (err: any) => showToast('Failed to save financial details: ' + getErrorMessage(err), 'error'),
  });

  const amenityMutation = useMutation({
    mutationFn: ({ id, ids }: { id: number; ids: number[] }) => api.put(`/branches/${id}/amenities`, { amenityIds: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', orgId] });
      showToast('Amenities updated!');
    },
    onError: (err: any) => { showToast('Failed to update amenities: ' + getErrorMessage(err), 'error'); },
  });

  const { data: holidaysData } = useQuery({
    queryKey: ['branch-holidays', editingId],
    queryFn: () => api.get(`/branches/${editingId}/holidays`).then((r: any) => r.data.data),
    enabled: !!editingId && formTab === 'holidays',
  });

  useEffect(() => {
    if (holidaysData) setHolidays(holidaysData);
  }, [holidaysData]);

  const createHolidayMutation = useMutation({
    mutationFn: (data: any) => api.post(`/branches/${editingId}/holidays`, data),
    onSuccess: (res: any) => {
      setHolidays(res.data.data);
      setHolidayForm({ name: '', dateFrom: '', dateTo: '', isRecurring: false, isOpenModified: false, openTime: '', closeTime: '' });
      setEditingHolidayId(null);
      showToast('Holiday created!');
    },
    onError: (err: any) => showToast('Failed to create holiday: ' + getErrorMessage(err), 'error'),
  });

  const updateHolidayMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/branches/holidays/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-holidays', editingId] });
      setHolidayForm({ name: '', dateFrom: '', dateTo: '', isRecurring: false, isOpenModified: false, openTime: '', closeTime: '' });
      setEditingHolidayId(null);
      showToast('Holiday updated!');
    },
    onError: (err: any) => showToast('Failed to update holiday: ' + getErrorMessage(err), 'error'),
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/branches/holidays/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-holidays', editingId] });
      showToast('Holiday deleted!');
    },
    onError: (err: any) => showToast('Failed to delete holiday: ' + getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/branches/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches', orgId] }); showToast('Branch deleted!'); },
    onError: (err: any) => { showToast('Failed to delete branch: ' + getErrorMessage(err), 'error'); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/branches/${id}`, { isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches', orgId] }); showToast('Branch status toggled!'); },
    onError: (err: any) => { showToast('Failed to toggle branch status: ' + getErrorMessage(err), 'error'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
      if (editingId && (finForm.bankName || finForm.bankAccountNumber || selectedBankId)) {
        finMutation.mutate({
          branchId: editingId,
          data: {
            bankName: finForm.bankName || null,
            bankAccountName: finForm.bankAccountName || null,
            bankAccountNumber: finForm.bankAccountNumber || null,
            iban: finForm.iban || null,
            swift: finForm.swift || null,
            billingAddress: finForm.billingAddress || null,
            billingEmail: finForm.billingEmail || null,
            payoutSchedule: finForm.payoutSchedule || 'monthly',
            bankId: selectedBankId || null,
            bankBranchId: selectedBrId || null,
            currencyId: null,
          },
        });
      }
      if (editingId && amenityIds.length > 0) {
        amenityMutation.mutate({ id: editingId, ids: amenityIds });
      }
    } else {
      createMutation.mutate(form);
    }
  };

  const openEdit = async (b: any) => {
    setEditingId(b.id);
    setForm({
      name: b.name, slug: b.slug,
      description: b.description || '', email: b.email || '', phone: b.phone || '',
      addressLine1: b.address_line1 || '', city: b.city || '', state: b.state || '',
      postalCode: b.postal_code || '', accessType: b.access_type || 'open',
      timezone: b.timezone || 'Africa/Cairo', countryId: b.country_id ?? undefined,
      openingTime: b.opening_time || '08:00', closingTime: b.closing_time || '22:00',
      latitude: b.latitude ?? undefined, longitude: b.longitude ?? undefined,
    });
    setSelectedCountryId(b.country_id ?? undefined);
    setSelectedProvinceId(undefined);
    setShowForm(true);
    setFormTab('basic');
    try {
      const res = await api.get(`/branches/${b.id}/amenities`).then((r: any) => r.data.data);
      setAmenityIds(res.map((a: any) => a.id));
    } catch {
      setAmenityIds([]);
    }
  };

  const toggleExpand = async (branchId: number) => {
    if (expandedBranchId === branchId) {
      setExpandedBranchId(null);
      setExpandedResources([]);
      return;
    }
    setExpandedBranchId(branchId);
    setResourcesLoading(true);
    try {
      const res = await api.get(`/branches/${branchId}/resources`).then((r: any) => r.data.data);
      setExpandedResources(res || []);
    } catch {
      setExpandedResources([]);
    }
    setResourcesLoading(false);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFinForm(emptyFinancial);
    setAmenityIds([]);
    setFormTab('basic');
    setSelectedCountryId(undefined);
    setSelectedProvinceId(undefined);
    setHolidays([]);
    setHolidayForm({ name: '', dateFrom: '', dateTo: '', isRecurring: false, isOpenModified: false, openTime: '', closeTime: '' });
    setEditingHolidayId(null);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
    </div>
  );

  const amenityIcon = (iconKey: string): string => {
    const ICON_MAP: Record<string, string> = {
      floodlights: '💡', parking: '🅿️', shower: '🚿', wifi: '📶', cafeteria: '☕',
      equipment: '🔧', firstaid: '🩹', changing: '🚪', aircon: '❄️', spectator: '🪑',
      coaching: '📋', physio: '💆', proshop: '🛍️',
    };
    return ICON_MAP[iconKey] || '✓';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{org?.name || 'Organisation'} — Branches</h1>
          <Link to="/admin/organisations" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">← Back to Organisations</Link>
        </div>
        <Can permission="branches.create">
          <button onClick={showForm && !editingId ? resetForm : () => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity">
            {showForm ? 'Cancel' : '+ New Branch'}
          </button>
        </Can>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-6 space-y-3 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] text-sm">{editingId ? 'Edit Branch' : 'New Branch'}</h3>
          <div className="flex gap-1 border-b border-[var(--color-border)]">
            {(['basic', 'financial', 'amenities', 'holidays'] as const).map((t: any) => (
              <Can key={t} permission={`branches.edit.${t}`}>
              <button key={t} type="button" onClick={() => setFormTab(t)}
                className={`px-4 py-2 text-sm font-medium rounded-t-[var(--radius-md)] transition-colors ${formTab === t ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
                {t === 'basic' ? 'Basic' : t === 'financial' ? 'Financials' : t === 'amenities' ? 'Amenities' : 'Holidays'}
              </button>
              </Can>
            ))}
          </div>

          {formTab === 'basic' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Can permission="branches.edit.name">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name *</label>
                  <input type="text" value={form.name} onChange={(e: any) => {
                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    setForm({ ...form, name: e.target.value, slug });
                  }}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" required />
                </div>
                </Can>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Description</label>
                <input type="text" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Can permission="branches.edit.email">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                </Can>
                <Can permission="branches.edit.phone">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Phone</label>
                  <input type="text" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                </Can>
              </div>
              <Can permission="branches.edit.address">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Address</label>
                <input type="text" value={form.addressLine1} onChange={(e: any) => setForm({ ...form, addressLine1: e.target.value })}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
              </div>
              </Can>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Country</label>
                  <select value={form.countryId || ''} onChange={(e: any) => {
                    const cid = e.target.value ? Number(e.target.value) : undefined;
                    setForm({ ...form, countryId: cid, state: '', city: '' });
                    setSelectedCountryId(cid); setSelectedProvinceId(undefined);
                  }} className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="">— Select —</option>
                    {(countries || []).filter((c: any) => c.is_active).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">State/Province</label>
                  <select value={selectedProvinceId || ''} onChange={(e: any) => {
                    const pid = e.target.value ? Number(e.target.value) : undefined;
                    setSelectedProvinceId(pid);
                    const name = pid ? (provinces || []).find((p: any) => p.id === pid)?.name || '' : '';
                    setForm({ ...form, state: name, city: '' });
                  }} className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="">— Select State/Province —</option>
                    {(provinces || []).filter((p: any) => p.is_active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">City</label>
                  <select value={form.city || ''} onChange={(e: any) => { setForm({ ...form, city: e.target.value }); }}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="">— Select City —</option>
                    {(cities || []).filter((c: any) => c.is_active).map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select></div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Postal Code</label>
                  <div className="flex gap-1">
                    <input type="text" value={form.postalCode} onChange={(e: any) => setForm({ ...form, postalCode: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                    <Can permission="branches.edit.address">
                    <button type="button" onClick={() => { setMapLat(form.latitude != null ? String(form.latitude) : ''); setMapLng(form.longitude != null ? String(form.longitude) : ''); setShowMapModal(true); }}
                      className="px-2 py-2 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] text-[var(--color-info-text)] hover:bg-[var(--color-info-bg)] text-sm" title="Pin location on map">📍</button>
                    </Can>
                  </div>
                  {(form.latitude && form.longitude) && <p className="text-[10px] text-[var(--color-success-text)] mt-0.5">📍 Location pinned</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Can permission="branches.edit.access-type">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Access Type</label>
                  <select value={form.accessType} onChange={(e: any) => setForm({ ...form, accessType: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="open">Open</option><option value="restricted">Restricted</option><option value="invite_only">Invite Only</option>
                  </select></div>
                </Can>
                <Can permission="branches.edit.timezone">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Timezone</label>
                  <select value={form.timezone} onChange={(e: any) => setForm({ ...form, timezone: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ').replace(/\//g, ' / ')}</option>)}
                  </select></div>
                </Can>
                <Can permission="branches.edit.opening-hours">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Opening Time *</label>
                  <input type="time" value={form.openingTime} onChange={(e: any) => setForm({ ...form, openingTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" /></div>
                </Can>
                <Can permission="branches.edit.closing-hours">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Closing Time *</label>
                  <div><input type="time" value={form.closingTime} onChange={(e: any) => setForm({ ...form, closingTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">OK after midnight (e.g. 02:00)</p></div>
                  </div>
                </Can>
              </div>
            </div>
          )}

          {formTab === 'financial' && (
            <Can permission="branches.edit.bank-account">
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-muted)]">Financial details apply to this branch.</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Bank Name</label>
                  <select value={selectedBankId || ''} onChange={(e: any) => {
                    const bid = e.target.value ? Number(e.target.value) : undefined;
                    setSelectedBankId(bid); setSelectedBrId(undefined);
                  }} className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="">— Select —</option>
                    {(banksList || []).filter((b: any) => b.is_active).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select></div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Bank Branch</label>
                  <select value={selectedBrId || ''} onChange={(e: any) => setSelectedBrId(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="">— Select Bank First —</option>
                    {(bankBranches || []).filter((b: any) => b.is_active).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select></div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Bank Account Name</label>
                  <input type="text" value={finForm.bankAccountName} onChange={(e: any) => setFinForm({ ...finForm, bankAccountName: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Account Number</label>
                  <input type="text" value={finForm.bankAccountNumber} onChange={(e: any) => setFinForm({ ...finForm, bankAccountNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm font-mono text-[var(--color-text)]" /></div>
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">IBAN</label>
                  <input type="text" value={finForm.iban} onChange={(e: any) => setFinForm({ ...finForm, iban: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm font-mono text-[var(--color-text)]" /></div>
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">SWIFT/BIC</label>
                  <input type="text" value={finForm.swift} onChange={(e: any) => setFinForm({ ...finForm, swift: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm font-mono text-[var(--color-text)]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Billing Email</label>
                  <input type="email" value={finForm.billingEmail} onChange={(e: any) => setFinForm({ ...finForm, billingEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" /></div>
              </div>
            </div>
            </Can>
          )}

          {formTab === 'amenities' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-muted)]">Select amenities assigned to this branch. Amenities apply to all resources under this branch.</p>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                {amenities?.filter((a: any) => a.is_active).map((a: any) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer text-[var(--color-text)] p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">
                    <input type="checkbox" checked={amenityIds.includes(a.id)}
                      onChange={() => setAmenityIds((prev: any) => prev.includes(a.id) ? prev.filter((id: any) => id !== a.id) : [...prev, a.id])}
                      className="rounded border-[var(--color-border)]" />
                    <span className="text-xs">{amenityIcon(a.icon)}</span> {a.name_en}
                  </label>
                ))}
                {(!amenities || !amenities.length) && (
                  <p className="text-xs text-[var(--color-text-muted)] col-span-full">No amenities available.</p>
                )}
              </div>
            </div>
          )}

          {formTab === 'holidays' && editingId && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 border rounded-[var(--radius-md)] bg-[var(--color-bg)] bg-[var(--color-surface)]/30">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Holiday Name</label>
                  <input type="text" value={holidayForm.name} onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Date From</label>
                  <input type="date" value={holidayForm.dateFrom} onChange={e => setHolidayForm(f => ({ ...f, dateFrom: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Date To</label>
                  <input type="date" value={holidayForm.dateTo} onChange={e => setHolidayForm(f => ({ ...f, dateTo: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[var(--color-text)]">
                    <input type="checkbox" checked={holidayForm.isRecurring}
                      onChange={e => setHolidayForm(f => ({ ...f, isRecurring: e.target.checked }))}
                      className="rounded border-[var(--color-border)]" />
                    Recurring yearly
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[var(--color-text)]">
                    <input type="checkbox" checked={holidayForm.isOpenModified}
                      onChange={e => setHolidayForm(f => ({ ...f, isOpenModified: e.target.checked }))}
                      className="rounded border-[var(--color-border)]" />
                    Modified hours
                  </label>
                </div>
                {holidayForm.isOpenModified && (
                  <div className="flex gap-2">
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Open Time</label>
                      <input type="time" value={holidayForm.openTime} onChange={e => setHolidayForm(f => ({ ...f, openTime: e.target.value }))}
                        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Close Time</label>
                      <input type="time" value={holidayForm.closeTime} onChange={e => setHolidayForm(f => ({ ...f, closeTime: e.target.value }))}
                        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                    </div>
                  </div>
                )}
                <div className="flex items-end">
                  <button type="button" onClick={() => {
                    if (editingHolidayId) {
                      updateHolidayMutation.mutate({ id: editingHolidayId, data: holidayForm });
                    } else {
                      createHolidayMutation.mutate(holidayForm);
                    }
                  }}
                    className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity">
                    {editingHolidayId ? 'Update' : 'Add Holiday'}
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {holidays.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-[var(--color-bg)]">
                    <div>
                      <span className="font-medium text-[var(--color-text)]">{h.name}</span>
                      <span className="text-[var(--color-text-muted)] ml-2">
                        {h.date_from?.slice(0, 10)}{h.date_to ? ` → ${h.date_to.slice(0, 10)}` : ''}
                        {h.is_recurring ? ' (recurring)' : ''}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => {
                        setEditingHolidayId(h.id);
                        setHolidayForm({
                          name: h.name, dateFrom: h.date_from?.slice(0, 10) || '', dateTo: h.date_to?.slice(0, 10) || '',
                          isRecurring: !!h.is_recurring, isOpenModified: !!h.is_open_modified,
                          openTime: h.open_time || '', closeTime: h.close_time || '',
                        });
                      }}
                        className="text-xs px-2 py-1 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors">Edit</button>
                      <button type="button" onClick={() => { if (confirm('Delete this holiday?')) deleteHolidayMutation.mutate(h.id); }}
                        className="text-xs px-2 py-1 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400 hover:opacity-80 transition-opacity">Delete</button>
                    </div>
                  </div>
                ))}
                {!holidays.length && <p className="text-xs text-[var(--color-text-muted)]">No holidays added yet.</p>}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Can permission={editingId ? 'branches.edit' : 'branches.create'}>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingId ? 'Update Branch' : 'Create Branch'}
            </button>
            </Can>
            <button type="button" onClick={resetForm}
              className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-bg)] transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto border border-[var(--color-border)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)] w-8"></th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Location</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Access</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Resources</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Map</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Status</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches?.map((b: any) => (
              <Fragment key={b.id}>
                <tr className={`border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors ${editingId === b.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => toggleExpand(b.id)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
                      {expandedBranchId === b.id ? '▼' : '▶'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-[var(--color-text)]">{b.name}</div>
                    <div className="text-xs text-[var(--color-text-muted)] font-mono">{b.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-[var(--color-text)]">{b.city || '—'}</div>
                    {b.state && <div className="text-xs text-[var(--color-text-muted)]">{b.state}</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      b.access_type === 'open' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                      b.access_type === 'restricted' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400'
                    }`}>{b.access_type.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Can permission="resources.view">
                      <Link to={`/admin/branches/${b.id}/resources`}
                        className="text-xs text-[var(--color-primary)] hover:underline">Manage</Link>
                    </Can>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${b.latitude && b.longitude ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] dark:text-[var(--color-text-muted)]'}`}>
                      {b.latitude && b.longitude ? '📍 Pinned' : 'Not set'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Can permission="branches.edit.status">
                    <button type="button"
                      onClick={() => toggleActiveMutation.mutate({ id: b.id, isActive: !b.is_active })}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
                        b.is_active ? 'text-[var(--color-success-text)] hover:text-[var(--color-error-text)]' : 'text-[var(--color-error-text)] hover:text-[var(--color-success-text)]'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${b.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
                      {b.is_active ? 'Active' : 'Suspended'}
                    </button>
                    </Can>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Can permission="branches.edit">
                        <button type="button" onClick={() => openEdit(b)}
                          className="text-xs px-2 py-1 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-border)] transition-colors">
                          Edit
                        </button>
                      </Can>
                      <Can permission="branches.delete">
                        <button type="button" onClick={() => { if (confirm('Delete this branch?')) deleteMutation.mutate(b.id); }}
                          className="text-xs px-2 py-1 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400 hover:opacity-80 transition-opacity">
                          Delete
                        </button>
                      </Can>
                    </div>
                  </td>
                </tr>
                {expandedBranchId === b.id && (
                  <tr key={`${b.id}-resources`}>
                    <td colSpan={8} className="px-8 py-4 bg-[var(--color-bg)] bg-[var(--color-surface)]/30">
                      {resourcesLoading ? (
                        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                          <div className="animate-spin h-4 w-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
                          Loading resources...
                        </div>
                      ) : expandedResources.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {expandedResources.map((r: any) => (
                            <div key={r.id} className="flex items-center justify-between rounded-[var(--radius-md)] p-3 border border-[var(--color-border)]">
                              <div>
                                <div className="text-sm font-medium text-[var(--color-text)]">{r.name}</div>
                                <div className="text-xs text-[var(--color-text-muted)]">
                                  {r.resource_type_name || 'Unknown'}
                                  {r.sport_name ? ` · ${r.sport_name}` : ''}
                                  <span className="ml-2">👥 {r.capacity} · ⏱ {r.slot_duration || r.default_slot_duration || 60}min</span>
                                  {r.hourly_price > 0 && <span className="ml-2">{formatPrice(Number(r.hourly_price))}/hr</span>}
                                </div>
                              </div>
                              <Can permission="resources.edit">
                                <Link to={`/admin/branches/${b.id}/resources`}
                                  className="text-xs px-2 py-1 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors">
                                  Edit
                                </Link>
                              </Can>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--color-text-muted)]">No resources for this branch.</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {(!branches || branches.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  No branches found for this organisation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showMapModal && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center" onClick={() => setShowMapModal(false)}>
          <div className="rounded-xl p-5 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3 text-[var(--color-text)]">Pin Location</h3>
            <MapPicker lat={mapLat} lng={mapLng} location={`${form.city || ''} ${form.state || ''}`} onCoord={(lat: string, lng: string) => { setMapLat(lat); setMapLng(lng); }} />
            <div className="flex gap-2 justify-end mt-3">
              <button type="button" onClick={() => setShowMapModal(false)}
                className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">Cancel</button>
              <button type="button" onClick={() => {
                setForm({ ...form, latitude: mapLat ? Number(mapLat) : undefined, longitude: mapLng ? Number(mapLng) : undefined });
                setShowMapModal(false);
              }} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MapPicker({ lat, lng, location, onCoord }: { lat: string; lng: string; location?: string; onCoord: (lat: string, lng: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState(location || '');
  const initialized = useRef(false);

  useEffect(() => {
    if (loaded) return;
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, [loaded]);

  const doSearch = async (query?: string) => {
    const q = query || search;
    if (!q || !mapInstance.current) return;
    const L = (window as any).L;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (data.length) {
        const { lat: lt, lon: ln } = data[0];
        mapInstance.current.setView([lt, ln], 15);
        if (markerRef.current) mapInstance.current.removeLayer(markerRef.current);
        markerRef.current = L.marker([lt, ln]).addTo(mapInstance.current);
        onCoord(lt, ln);
      }
    } catch { /* skip */ }
  };

  useEffect(() => {
    if (!loaded || !mapRef.current || mapInstance.current) return;
    const L = (window as any).L;
    const map = L.map(mapRef.current).setView([30.0444, 31.2357], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);
    map.on('click', (e: any) => {
      const { lat: lt, lng: ln } = e.latlng;
      onCoord(lt.toFixed(6), ln.toFixed(6));
      if (markerRef.current) map.removeLayer(markerRef.current);
      markerRef.current = L.marker([lt, ln]).addTo(map);
    });
    if (lat && lng) { map.setView([parseFloat(lat), parseFloat(lng)], 15); markerRef.current = L.marker([parseFloat(lat), parseFloat(lng)]).addTo(map); }
    mapInstance.current = map;
    if (location && !initialized.current) { initialized.current = true; setTimeout(() => doSearch(location), 500); }
  }, [loaded, lat, lng, onCoord]);

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address..."
          className="flex-1 px-3 py-1.5 text-xs rounded-[var(--radius-md)] border text-[var(--color-text)]"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), doSearch())} />
        <button type="button" onClick={() => doSearch()} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs">Search</button>
      </div>
      <div ref={mapRef} style={{ height: '300px', width: '100%' }} className="rounded-[var(--radius-md)] border" />
      <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Click on the map to drop a pin, or search for an address.</p>
    </div>
  );
}
