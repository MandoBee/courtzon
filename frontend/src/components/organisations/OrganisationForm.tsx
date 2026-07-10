import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../ui/Toast';
import UpgradeRequestModal from '../subscription/UpgradeRequestModal';
import OrgCancellationPolicy from './OrgCancellationPolicy';
import BranchCancellationPolicy from './BranchCancellationPolicy';
import {
  organisationFormPaths,
  unwrapBranchesResponse,
  type OrganisationFormContext,
} from './organisation-form-paths';
import { EntityImage, CountryFlag } from '../ui';


interface OrgFormData {
  orgTypeId: number;
  name: string; slug: string; description: string;
  email: string; phone: string; website: string;
  crNumber: string; taxId: string; vatRegistered: boolean;
  countryId: number;
  logoFile: File | null; logoPreview: string;
  coverFile: File | null; coverPreview: string;
  documents: { file: File | null; preview: string; name: string }[];
}

type FormTab = 'basic' | 'docs' | 'cancellation' | 'branches' | 'resources';

interface Props {
  orgId: number | null;
  context: OrganisationFormContext;
  onClose: () => void;
  /** When embedded in org portal pages (branches/resources), open this tab. */
  initialTab?: FormTab;
  variant?: 'modal' | 'page';
  pageTitle?: string;
}

const blankForm: OrgFormData = {
  orgTypeId: 1, name: '', slug: '', description: '', email: '', phone: '', website: '',
  crNumber: '', taxId: '', vatRegistered: false, countryId: 1,
  logoFile: null, logoPreview: '', coverFile: null, coverPreview: '',
  documents: [],
};

const branchBlank = { name: '', slug: '', description: '', email: '', phone: '', addressLine1: '', city: '', state: '', postalCode: '', accessType: 'open', timezone: 'Africa/Cairo', countryId: undefined as number | undefined, openingTime: '00:00', closingTime: '23:59', latitude: undefined as number | undefined, longitude: undefined as number | undefined };
const branchFinBlank = { bankName: '', bankAccountName: '', bankAccountNumber: '', iban: '', swift: '', billingAddress: '', billingEmail: '', payoutSchedule: 'monthly' };

export default function OrganisationForm({ orgId, context, onClose, initialTab, variant = 'modal', pageTitle }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isCreate = !orgId;
  const paths = useMemo(() => orgId ? organisationFormPaths(context, orgId) : null, [context, orgId]);
  const [formTab, setFormTab] = useState<FormTab>(initialTab ?? 'basic');
  const [form, setForm] = useState<OrgFormData>(blankForm);
  const formInitialized = useRef(false);

  const [branchForm, setBranchForm] = useState(branchBlank);
  const [branchFinForm, setBranchFinForm] = useState(branchFinBlank);
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [branchFormTab, setBranchFormTab] = useState<'basic' | 'financial' | 'cancellation' | 'amenities' | 'holidays'>('basic');
  const [branchAmenityIds, setBranchAmenityIds] = useState<number[]>([]);
  const [branchHolidays, setBranchHolidays] = useState<any[]>([]);
  const [branchHolidayForm, setBranchHolidayForm] = useState({ name: '', dateFrom: '', dateTo: '', isRecurring: false, isOpenModified: false, openTime: '', closeTime: '' });
  const [editingBranchHolidayId, setEditingBranchHolidayId] = useState<number | null>(null);
  const [selectedBrBankId, setSelectedBrBankId] = useState<number | undefined>(undefined);
  const [selectedBrBranchId, setSelectedBrBranchId] = useState<number | undefined>(undefined);
  const [showBrMapModal, setShowBrMapModal] = useState(false);
  const [brMapLat, setBrMapLat] = useState('');
  const [brMapLng, setBrMapLng] = useState('');

  const [showNewCountry, setShowNewCountry] = useState(false);
  const [newCountryForm, setNewCountryForm] = useState({ name: '', isoCode: '', isoCode3: '', phoneCode: '', defaultCurrency: '' });

  const [selectedBrCountryId, setSelectedBrCountryId] = useState<number | undefined>(undefined);
  const { data: brProvinces } = useQuery({
    queryKey: ['provinces', selectedBrCountryId],
    queryFn: () => api.get(`/countries/${selectedBrCountryId}/provinces`).then((r: any) => r.data.data),
    enabled: !!selectedBrCountryId,
  });

  const { data: branches, isLoading: branchesLoading } = useQuery({
    queryKey: paths?.branchesQueryKey ?? ['branches', orgId],
    queryFn: () =>
      api.get(paths!.branchesList).then((r: any) => unwrapBranchesResponse(context, r.data)),
    enabled: !!orgId && !!paths,
  });

  const [selectedBrProvinceId, setSelectedBrProvinceId] = useState<number | undefined>(undefined);
  const { data: brCities } = useQuery({
    queryKey: ['cities', selectedBrProvinceId],
    queryFn: () => api.get(`/provinces/${selectedBrProvinceId}/cities`).then((r: any) => r.data.data),
    enabled: !!selectedBrProvinceId,
  });

  useEffect(() => {
    if (brProvinces?.length && branchForm.state && !selectedBrProvinceId && editingBranchId) {
      const match = brProvinces.find((p: any) => p.name === branchForm.state);
      if (match) setSelectedBrProvinceId(match.id);
    }
  }, [brProvinces, branchForm.state, selectedBrProvinceId, editingBranchId]);

  const { data: amenities } = useQuery({
    queryKey: ['amenities'],
    queryFn: () => api.get('/amenities').then((r: any) => r.data.data),
  });

  const { data: brBanksList } = useQuery({
    queryKey: ['banks', branchForm.countryId],
    queryFn: () => api.get(`/banks?countryId=${branchForm.countryId}`).then((r: any) => r.data?.data ?? []).catch(() => []),
    enabled: !!branchForm.countryId,
  });
  const { data: brBankBranches } = useQuery({
    queryKey: ['bank-branches', selectedBrBankId],
    queryFn: () => api.get(`/bank-branches?bankId=${selectedBrBankId}`).then((r: any) => r.data?.data ?? []).catch(() => []),
    enabled: !!selectedBrBankId,
  });

  const [resourceFormTab, setResourceFormTab] = useState<'basic' | 'pricing'>('basic');
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<number | null>(null);
  const [resourceForm, setResourceForm] = useState({
    name: '', resourceTypeId: 1, sportId: undefined as number | undefined,
    description: '', capacity: 1, hourlyPrice: 0, slotDuration: undefined as number | undefined,
    pricingType: 'per_hour' as 'per_hour' | 'fixed',
    peakHourValue: undefined as number | undefined,
    images: [] as string[],
    openingTime: '', closingTime: '',
  });
  const [peakHours, setPeakHours] = useState<any[]>(
    [0,1,2,3,4,5,6].map(d => ({ dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' }))
  );
  const [editingBranchName, setEditingBranchName] = useState<string>('');
  const [editingResourceName, setEditingResourceName] = useState<string>('');
  const [expandedBranchId, setExpandedBranchId] = useState<number | null>(null);

  const [previewDoc, setPreviewDoc] = useState<{ preview: string; name: string } | null>(null);

  const { data: orgTypes } = useQuery({
    queryKey: ['organisation-types'],     queryFn: () => api.get('/organisation-types').then((r: any) => r.data.data),
  });

  const { data: countries } = useQuery({
    queryKey: ['countries'],     queryFn: () => api.get('/countries').then((r: any) => r.data.data),
  });

  const { data: orgData } = useQuery({
    queryKey: paths?.orgQueryKey ?? ['organisation', orgId],
    queryFn: () => api.get(paths!.orgInfo).then((r: any) => r.data),
    enabled: !!orgId && !!paths,
  });

  const [policyLevel, setPolicyLevel] = useState<'organisation' | 'branch'>('organisation');

  const { data: policySettings } = useQuery({
    queryKey: ['org-cancellation-settings', orgId, context],
    queryFn: () => api.get(paths!.cancellationSettings).then((r) => r.data),
    enabled: !!orgId,
  });

  useEffect(() => {
    if (policySettings) {
      setPolicyLevel(policySettings.cancellation_policy_level || 'organisation');
    }
  }, [policySettings]);

  const policyLoaded = useRef(false);
  useEffect(() => {
    if (policySettings) policyLoaded.current = true;
  }, [policySettings]);

  const savePolicyLevelMutation = useMutation({
    mutationFn: (level: string) => api.put(paths!.cancellationSettings, { policyLevel: level }),
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to save', 'error'),
  });

  const handlePolicyLevelChange = (level: 'organisation' | 'branch') => {
    setPolicyLevel(level);
    if (policyLoaded.current && orgId) {
      savePolicyLevelMutation.mutate(level);
    }
  };

  const expandedBranch = expandedBranchId ? (branches || []).find((b: any) => b.id === expandedBranchId) : null;

  useEffect(() => {
    if (isCreate) { setForm(blankForm); formInitialized.current = false; }
  }, [isCreate]);

  useEffect(() => {
    setShowBranchForm(false);
    setEditingBranchId(null);
    setShowResourceForm(false);
    setEditingResourceId(null);
    setExpandedBranchId(null);
    setBranchForm(branchBlank);
    setBranchFinForm(branchFinBlank);
    setBranchAmenityIds([]);
    setSelectedBrCountryId(undefined);
    setSelectedBrProvinceId(undefined);
    setSelectedBrBankId(undefined);
    setSelectedBrBranchId(undefined);
  }, [orgId]);

  useEffect(() => {
    if (orgData && orgId && !formInitialized.current) {
      formInitialized.current = true;
      setForm({
        orgTypeId: orgData.org_type_id || 1,
        name: orgData.name || '',
        slug: orgData.slug || '',
        description: orgData.description || '',
        email: orgData.email || '',
        phone: orgData.phone || '',
        website: orgData.website || '',
        crNumber: orgData.cr_number || '',
        taxId: orgData.tax_id || '',
        vatRegistered: orgData.tax_id_type === 'VAT',
        countryId: orgData.country_id || 1,
        logoFile: null, logoPreview: orgData.logo_url || '',
        coverFile: null, coverPreview: orgData.cover_url || '',
        documents: orgData.documents
          ? (typeof orgData.documents === 'string' ? JSON.parse(orgData.documents) : orgData.documents).map((url: string) => ({ file: null, preview: url, name: 'Doc' }))
          : [],
      });
    }
  }, [orgData, orgId]);

  useEffect(() => {
    if (!editingBranchId || !paths) {
      setBranchFinForm(branchFinBlank);
      setSelectedBrBankId(undefined);
      setSelectedBrBranchId(undefined);
      return;
    }
    api.get(paths.branchFinancialDetails(editingBranchId))
      .then((r: any) => {
        const fd = r.data?.data;
        if (!fd) {
          setBranchFinForm(branchFinBlank);
          setSelectedBrBankId(undefined);
          setSelectedBrBranchId(undefined);
          return;
        }
        setBranchFinForm({
          bankName: fd.bank_name || '',
          bankAccountName: fd.bank_account_name || '',
          bankAccountNumber: fd.bank_account_number || '',
          iban: fd.iban || '',
          swift: fd.swift || '',
          billingAddress: fd.billing_address || '',
          billingEmail: fd.billing_email || '',
          payoutSchedule: fd.payout_schedule || 'monthly',
        });
        setSelectedBrBankId(fd.bank_id || undefined);
        setSelectedBrBranchId(fd.bank_branch_id || undefined);
      })
      .catch(() => setBranchFinForm(branchFinBlank));
  }, [editingBranchId, paths]);

  useEffect(() => {
    if (editingBranchId && selectedBrBankId && brBanksList) {
      const bank = brBanksList.find((b: any) => b.id === selectedBrBankId);
      if (bank?.swift) {
        setBranchFinForm((v: any) => ({ ...v, swift: bank.swift }));
      }
    }
  }, [editingBranchId, selectedBrBankId, brBanksList]);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/organisations', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'organisations'] }); showToast('Organisation created successfully!'); onClose(); },
    onError: (err) => { showToast('Failed to create organisation: ' + (err as any).message, 'error'); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => context === 'admin'
      ? api.put(`/organisations/${orgId}`, data)
      : context === 'org'
      ? api.put(`/org/${orgId}/info`, data)
      : api.put('/marketplace/seller/shop', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organisations'] });
      queryClient.invalidateQueries({ queryKey: ['mp-player-status'] });
      if (paths) queryClient.invalidateQueries({ queryKey: paths.orgQueryKey });
      showToast('Organisation updated successfully!');
      if (variant === 'modal') onClose();
    },
    onError: (err) => { showToast('Failed to update organisation: ' + (err as any).message, 'error'); },
  });

  const invalidateBranchQueries = () => {
    if (paths) queryClient.invalidateQueries({ queryKey: paths.branchesQueryKey });
    if (context === 'org' && orgId) {
      queryClient.invalidateQueries({ queryKey: ['org-resources', orgId] });
    }
  };

  const deleteBranchMutation = useMutation({
    mutationFn: (id: number) => api.delete(paths!.branchDelete(id)),
    onSuccess: () => { invalidateBranchQueries(); showToast('Branch deleted!'); },
    onError: (err) => { showToast('Failed to delete branch: ' + (err as any).message, 'error'); },
  });

  const createBranchMutation = useMutation({
    mutationFn: (data: any) => {
      const payload = paths!.isOrg ? data : { ...data, organisationId: Number(orgId) };
      return api.post(paths!.createBranch, payload);
    },
    onSuccess: () => {
      invalidateBranchQueries();
      setBranchForm(branchBlank); setBranchFinForm(branchFinBlank); setShowBranchForm(false); setEditingBranchId(null);
      showToast('Branch created successfully!');
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        showToast(err?.response?.data?.message || 'Limit reached', 'warning');
        setShowUpgradeModal(true);
      } else {
        showToast('Failed to create branch: ' + (err as any).message, 'error');
      }
    },
  });

  const updateBranchMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(paths!.branchUpdate(id), data),
    onSuccess: () => {
      invalidateBranchQueries();
      setBranchForm(branchBlank); setBranchFinForm(branchFinBlank); setShowBranchForm(false); setEditingBranchId(null);
      showToast('Branch updated successfully!');
    },
    onError: (err) => {
      const resp = (err as any).response?.data;
      console.error('Branch update failed:', resp || err);
      const detail = resp?.details?.map((d: any) => `${d.path?.join('.') || '?'}: ${d.message}`).join('; ');
      showToast('Failed to update branch: ' + (detail || resp?.message || (err as any).message), 'error');
    },
  });

  const branchAmenityMutation = useMutation({
    mutationFn: ({ id, ids }: { id: number; ids: number[] }) => api.put(`/branches/${id}/amenities`, { amenityIds: ids }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches', orgId] }); showToast('Amenities updated!'); },
    onError: (err) => { showToast('Failed to update amenities: ' + (err as any).message, 'error'); },
  });

  const { data: branchHolidaysData } = useQuery({
    queryKey: ['branch-holidays', editingBranchId],
    queryFn: () => api.get(`/branches/${editingBranchId}/holidays`).then((r: any) => r.data.data),
    enabled: !!editingBranchId && branchFormTab === 'holidays',
  });

  useEffect(() => {
    if (branchHolidaysData) setBranchHolidays(branchHolidaysData);
  }, [branchHolidaysData]);

  const createBranchHolidayMutation = useMutation({
    mutationFn: (data: any) => api.post(`/branches/${editingBranchId}/holidays`, data),
    onSuccess: (res: any) => {
      setBranchHolidays(res.data.data);
      setBranchHolidayForm({ name: '', dateFrom: '', dateTo: '', isRecurring: false, isOpenModified: false, openTime: '', closeTime: '' });
      setEditingBranchHolidayId(null);
      showToast('Holiday created!');
    },
    onError: (err) => showToast('Failed to create holiday: ' + (err as any).message, 'error'),
  });

  const updateBranchHolidayMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/branches/holidays/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-holidays', editingBranchId] });
      setBranchHolidayForm({ name: '', dateFrom: '', dateTo: '', isRecurring: false, isOpenModified: false, openTime: '', closeTime: '' });
      setEditingBranchHolidayId(null);
      showToast('Holiday updated!');
    },
    onError: (err) => showToast('Failed to update holiday: ' + (err as any).message, 'error'),
  });

  const deleteBranchHolidayMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/branches/holidays/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-holidays', editingBranchId] });
      showToast('Holiday deleted!');
    },
    onError: (err) => showToast('Failed to delete holiday: ' + (err as any).message, 'error'),
  });

  const branchFinMutation = useMutation({
    mutationFn: (data: any) => {
      if (editingBranchId && paths) {
        return api.put(paths.branchFinancialDetails(editingBranchId), data);
      }
      if (context === 'seller') {
        return api.put('/marketplace/seller/shop', { financialDetails: data });
      }
      return Promise.reject(new Error('Save the branch before adding financial details'));
    },
    onSuccess: () => {
      if (editingBranchId) queryClient.invalidateQueries({ queryKey: ['branch-financial', editingBranchId] });
      showToast('Financial details saved!');
    },
    onError: (err) => { showToast('Failed to save financial details: ' + (err as any).message, 'error'); },
  });

  const { data: resourceTypes } = useQuery({
    queryKey: ['resource-types'],
    queryFn: () => api.get('/resource-types').then((r: any) => r.data.data),
  });

  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then((r: any) => r.data).catch(() => []),
  });

  const invalidateResourcesForBranch = (bid: number) => {
    queryClient.invalidateQueries({ queryKey: ['resources', bid] });
    if (context === 'org' && orgId) {
      queryClient.invalidateQueries({ queryKey: ['org-resources', orgId] });
    }
  };

  const createResourceMutation = useMutation({
    mutationFn: (data: any) => api.post(paths!.createResource, data),
    onSuccess: (_data: any, variables: any) => {
      invalidateResourcesForBranch(variables?.branchId);
      setShowResourceForm(false);
      setEditingResourceId(null);
      showToast('Resource created successfully!');
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        showToast(err?.response?.data?.message || 'Limit reached', 'warning');
        setShowUpgradeModal(true);
      } else {
        showToast('Failed to create resource: ' + (err as any).message, 'error');
      }
    },
  });

  const updateResourceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(paths!.resourceUpdate(id), data),
    onSuccess: (_data: any, variables: { id: number; data: any }) => {
      invalidateResourcesForBranch(variables?.data?.branchId);
      setShowResourceForm(false);
      setEditingResourceId(null);
      showToast('Resource updated successfully!');
    },
    onError: (err) => { showToast('Failed to update resource: ' + (err as any).message, 'error'); },
  });

  const deleteResourceMutation = useMutation({
    mutationFn: ({ id, branchId: _branchId }: { id: number; branchId: number }) => api.delete(paths!.resourceDelete(id)),
    onSuccess: (_data: any, variables: { id: number; branchId: number }) => {
      invalidateResourcesForBranch(variables.branchId);
      showToast('Resource deleted!');
    },
    onError: (err) => { showToast('Failed to delete resource: ' + (err as any).message, 'error'); },
  });

  const set = (k: keyof OrgFormData, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleUpload = async (file: File, field: 'logoFile' | 'coverFile', previewField: 'logoPreview' | 'coverPreview') => {
    if (!orgId) {
      showToast('Save the organisation first, then upload logo or cover.', 'warning');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    const category = field === 'logoFile' ? 'logo' : 'cover';
    try {
      const res = await api.post(`/organisations/${orgId}/${category}`, fd);
      const url = res.data?.url ?? '';
      set(field, file);
      set(previewField, url);
      if (paths) queryClient.invalidateQueries({ queryKey: paths.orgQueryKey });
      queryClient.invalidateQueries({ queryKey: ['admin', 'organisations'] });
      showToast(`${category === 'logo' ? 'Logo' : 'Cover'} uploaded`);
    } catch (err) {
      showToast(`Upload failed: ${(err as any)?.response?.data?.message || (err as any).message}`, 'error');
    }
  };

  const handleDocUpload = async (file: File) => {
    if (!orgId) {
      showToast('Save the organisation first, then upload documents.', 'warning');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post(`/organisations/${orgId}/documents`, fd);
      const url = res.data?.url ?? '';
      set('documents', [...form.documents, { file, preview: url, name: file.name }]);
      showToast('Document uploaded');
    } catch (err) {
      showToast(`Upload failed: ${(err as any)?.response?.data?.message || (err as any).message}`, 'error');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      orgTypeId: form.orgTypeId, name: form.name, slug: form.slug,
      description: form.description || undefined,
      email: form.email || undefined, phone: form.phone || undefined, website: form.website || undefined,
      crNumber: form.crNumber || undefined, taxId: form.taxId || undefined,
    };
    if (showNewCountry && isCreate) {
      payload.newCountry = newCountryForm;
    } else {
      payload.countryId = form.countryId;
    }
    if (isCreate) createMutation.mutate(payload);
    else updateMutation.mutate(payload);
  };

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const activeCountries = (countries || []).filter((c: any) => c.is_active).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const visibleTabs = (context === 'org'
    ? ['basic', 'branches', 'resources']
    : ['basic', 'docs', ...(policyLevel === 'organisation' ? ['cancellation'] : []), 'branches', 'resources']) as FormTab[];

  const branchSubTabs = context === 'org'
    ? (['basic', 'financial', ...(policyLevel === 'branch' ? ['cancellation' as const] : []), 'amenities', 'holidays'] as const)
    : (['basic', 'financial', ...(policyLevel === 'branch' ? ['cancellation' as const] : []), 'amenities', 'holidays'] as const);

  return (
    <div className={`bg-[var(--color-surface)] rounded-[var(--radius-lg)] ${variant === 'page' ? '' : 'shadow-[var(--shadow-md)] p-5 mb-6 border'}`}>
      <div className={`flex items-center justify-between ${variant === 'page' ? 'mb-6' : 'mb-4'}`}>
        {variant === 'page' ? (
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            {pageTitle ?? (formTab === 'branches' ? '🏪 Branches' : formTab === 'resources' ? '🏟️ Resources' : '⚙️ Settings')}
          </h1>
        ) : (
          <>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{isCreate ? 'New Organisation' : `Edit Organisation — ${orgData?.name || ''}`}</h2>
            <button type="button" onClick={onClose} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">&times; Cancel</button>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex gap-1 mb-4 border-b border-[var(--color-border)]">
          {visibleTabs.map((t) => (
            <Can key={t} permission={`organisations.edit.${t}`}>
              <button type="button"
                onClick={() => setFormTab(t as typeof formTab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-[var(--radius-md)] transition-colors ${formTab === t ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
                {t === 'basic' ? 'Basic' : t === 'docs' ? 'Documents' : t === 'cancellation' ? 'Cancellation' : t === 'branches' ? 'Branches' : 'Resources'}
              </button>
            </Can>
          ))}
        </div>

        {formTab === 'basic' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Can permission="organisations.edit.name">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Name *</label>
                  <input value={form.name} onChange={e => { set('name', e.target.value); set('slug', autoSlug(e.target.value)); }} required
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div>
              </Can>
              <Can permission="organisations.edit.website">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Website</label>
                  <input value={form.website} onChange={e => set('website', e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div>
              </Can>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Can permission="organisations.edit.org-type">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Organisation Type *</label>
                  <select value={form.orgTypeId} onChange={e => set('orgTypeId', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                    {(orgTypes || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></div>
              </Can>
              <Can permission="organisations.edit.email">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div>
              </Can>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Can permission="organisations.edit.country">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Country *</label>
                  {showNewCountry && isCreate ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="Name (e.g. Egypt)" value={newCountryForm.name} onChange={e => setNewCountryForm(f => ({ ...f, name: e.target.value }))} className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm" />
                        <input placeholder="ISO2 (e.g. EG)" value={newCountryForm.isoCode} onChange={e => setNewCountryForm(f => ({ ...f, isoCode: e.target.value.toUpperCase() }))} maxLength={2} className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm font-mono" />
                        <input placeholder="ISO3 (e.g. EGY)" value={newCountryForm.isoCode3} onChange={e => setNewCountryForm(f => ({ ...f, isoCode3: e.target.value.toUpperCase() }))} maxLength={3} className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm font-mono" />
                        <input placeholder="Phone code (e.g. +20)" value={newCountryForm.phoneCode} onChange={e => setNewCountryForm(f => ({ ...f, phoneCode: e.target.value }))} className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm" />
                        <input placeholder="Currency code (e.g. EGP)" value={newCountryForm.defaultCurrency} onChange={e => setNewCountryForm(f => ({ ...f, defaultCurrency: e.target.value.toUpperCase() }))} maxLength={3} className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm font-mono" />
                      </div>
                      <button type="button" onClick={() => setShowNewCountry(false)} className="text-xs text-[var(--color-primary)] hover:underline">← Pick existing country</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {form.countryId && (
                        <CountryFlag
                          countryCode={activeCountries.find((c: any) => c.id === form.countryId)?.iso_code}
                          countryName={activeCountries.find((c: any) => c.id === form.countryId)?.name}
                          size={24}
                        />
                      )}
                      <select value={form.countryId} onChange={e => set('countryId', Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                        {activeCountries.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {isCreate && <button type="button" onClick={() => setShowNewCountry(true)} className="px-2.5 py-2 rounded-[var(--radius-md)] border text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] hover:bg-[var(--color-border)]">+ New</button>}
                    </div>
                  )}
                </div>
              </Can>
              <Can permission="organisations.edit.phone">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Phone</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-2.5 py-2 rounded-l-[var(--radius-md)] border border-r-0 bg-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-muted)] font-mono">
                      {activeCountries.find((c: any) => c.id === form.countryId)?.phone_code || '+'}
                    </span>
                    <input value={form.phone} onChange={e => set('phone', e.target.value)}
                      className="w-full px-3 py-2 rounded-r-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
                  </div>
                </div>
              </Can>
            </div>

            <Can permission="organisations.edit.description">
              <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div>
            </Can>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Can permission="organisations.edit.logo">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Logo</label>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-16 h-16 rounded-[var(--radius-md)] border overflow-hidden bg-[var(--color-bg)] bg-[var(--color-surface)] flex items-center justify-center">
                      {form.logoPreview || form.name ? (
                        <EntityImage src={form.logoPreview} name={form.name || 'Organisation'} className="w-full h-full rounded-[var(--radius-md)] text-2xl" />
                      ) : (
                        <span className="text-2xl text-[var(--color-text-muted)]">?</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'logoFile', 'logoPreview'); }}
                        className="w-full" />
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Max 2MB. PNG, JPG or SVG. 200×200px</p>
                    </div>
                  </div></div>
              </Can>
              <Can permission="organisations.edit.cover">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Cover Image</label>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-20 h-12 rounded-[var(--radius-md)] border overflow-hidden bg-[var(--color-bg)] bg-[var(--color-surface)] flex items-center justify-center">
                      {form.coverPreview || form.name ? (
                        <EntityImage src={form.coverPreview} name={form.name || 'Organisation'} className="w-full h-full rounded-[var(--radius-md)] text-lg" />
                      ) : (
                        <span className="text-sm text-[var(--color-text-muted)]">?</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'coverFile', 'coverPreview'); }}
                        className="w-full" />
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Max 5MB. PNG, JPG or WebP. 1200×400px</p>
                    </div>
                  </div></div>
              </Can>
              <Can permission="organisations.edit.cancellation-policy">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Cancellation Policy</label>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => handlePolicyLevelChange('organisation')}
                    className={`flex-1 px-3 py-2 text-xs rounded-[var(--radius-md)] border transition-colors ${
                      policyLevel === 'organisation'
                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                        : 'border-[var(--color-border)] text-[var(--color-text)]'
                    }`}>
                    By Organisation
                  </button>
                  <button type="button"
                    onClick={() => handlePolicyLevelChange('branch')}
                    className={`flex-1 px-3 py-2 text-xs rounded-[var(--radius-md)] border transition-colors ${
                      policyLevel === 'branch'
                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                        : 'border-[var(--color-border)] text-[var(--color-text)]'
                    }`}>
                    By Branch
                  </button>
                </div>
              </div>
              </Can>
            </div>
          </div>
        )}

        {formTab === 'docs' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Can permission="organisations.edit.docs">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">CR Number</label>
                  <input value={form.crNumber} onChange={e => set('crNumber', e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm font-mono text-[var(--color-text)]" /></div>
              </Can>
              <Can permission="organisations.edit.docs">
                <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Tax ID</label>
                  <input value={form.taxId} onChange={e => set('taxId', e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm font-mono text-[var(--color-text)]" /></div>
              </Can>
              <Can permission="organisations.edit.docs">
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={form.vatRegistered} onChange={e => set('vatRegistered', e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)]" />
                    <span className="text-sm font-medium text-[var(--color-text)]">VAT Registered</span>
                  </label></div>
              </Can>
            </div>
            <Can permission="organisations.edit.docs">
              <div><label className="block text-sm font-medium text-[var(--color-text)] mb-1">Official Documents</label>
                <div className="border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-md)] p-4">
                  <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" multiple onChange={e => { const files = e.target.files; if (files) Array.from(files).forEach(handleDocUpload); }}
                    className="w-full" />
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">PNG, JPG, WebP or PDF</p>
                  {form.documents.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                      {form.documents.map((doc, i) => (
                        <div key={i} className="relative group rounded-[var(--radius-md)] border overflow-hidden bg-[var(--color-bg)] bg-[var(--color-surface)] cursor-pointer" onClick={() => doc.preview && setPreviewDoc({ preview: doc.preview, name: doc.name })}>
                          <div className="h-20 bg-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center overflow-hidden">
                            {doc.preview.endsWith('.pdf') || doc.name.toLowerCase().endsWith('.pdf') ? (
                              <div className="flex flex-col items-center gap-1 text-[var(--color-text-muted)]">
                                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8m0 4h8m-8-8h1"/></svg>
                                <span className="text-[10px] font-medium">PDF</span>
                              </div>
                            ) : (
                              <EntityImage src={doc.preview} name={doc.name} className="w-full h-full rounded-none text-lg" />
                            )}
                          </div>
                          <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                            <span className="text-[11px] text-[var(--color-text)] truncate flex-1">{doc.name}</span>
                            <button type="button" onClick={e => { e.stopPropagation(); set('documents', form.documents.filter((_, j) => j !== i)); }}
                              className="text-[var(--color-error)] hover:text-[var(--color-error-text)] text-xs font-medium flex-shrink-0">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div></div>
            </Can>
          </div>
        )}

        {formTab === 'cancellation' && (
          <OrgCancellationPolicy orgId={orgId!} />
        )}

        {formTab === 'resources' && (
          <div className="space-y-4">

            {showResourceForm && (
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3 border space-y-3">
                <h4 className="text-xs font-semibold text-[var(--color-text)]">
                  {editingResourceId ? `Edit Resource — ${editingBranchName} — ${editingResourceName}` : 'New Resource'}
                </h4>
                <div className="flex gap-1 border-b border-[var(--color-border)]">
                  {(['basic', 'pricing'] as const).map((t) => (
                    <Can key={t} permission={`resources.edit.${t}`}>
                    <button key={t} type="button" onClick={() => setResourceFormTab(t)}
                      className={`px-3 py-1 text-xs font-medium rounded-t-[var(--radius-md)] transition-colors ${resourceFormTab === t ? ' text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                      {t === 'basic' ? 'Basic' : 'Pricing'}
                    </button>
                    </Can>
                  ))}
                </div>
                {resourceFormTab === 'basic' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name *</label>
                        <input value={resourceForm.name} onChange={e => setResourceForm((f: any) => ({ ...f, name: e.target.value }))} required
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Type</label>
                        <select value={resourceForm.resourceTypeId} onChange={e => setResourceForm((f: any) => ({ ...f, resourceTypeId: Number(e.target.value) }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                          {(resourceTypes || []).map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
                        </select></div>
                    </div>
                    <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Description (optional)</label>
                      <textarea value={resourceForm.description} onChange={e => setResourceForm((f: any) => ({ ...f, description: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" rows={2} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Sport *</label>
                        <select value={resourceForm.sportId || ''} onChange={e => setResourceForm((f: any) => ({ ...f, sportId: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" required>
                          <option value="">Select sport...</option>
                          {(Array.isArray(sports) ? sports : [])?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Capacity (optional)</label>
                        <input type="number" value={resourceForm.capacity} onChange={e => setResourceForm((f: any) => ({ ...f, capacity: Number(e.target.value) }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" min={1} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Opening Time</label>
                        <input type="time" value={resourceForm.openingTime} onChange={e => setResourceForm((f: any) => ({ ...f, openingTime: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
                        {expandedBranch?.opening_time && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Must be ≥ branch: {expandedBranch.opening_time}</p>}</div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Closing Time</label>
                        <input type="time" value={resourceForm.closingTime} onChange={e => setResourceForm((f: any) => ({ ...f, closingTime: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
                        {expandedBranch?.closing_time && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Must be ≤ branch: {expandedBranch.closing_time}</p>}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Images</label>
                      <input type="file" accept="image/*" multiple onChange={async (e) => {
                        const files = e.target.files; if (!files) return;
                        const urls: string[] = [];
                        for (const f of Array.from(files)) {
                          const fd = new FormData(); fd.append('file', f);
                          try {
                            const res = await api.post('/upload', fd);
                            urls.push(res.data.url);
                          } catch { /* skip */ }
                        }
                        setResourceForm((f: any) => ({ ...f, images: [...f.images, ...urls] }));
                      }} className="w-full" />
                      {resourceForm.images.length > 0 && (
                        <div className="flex gap-2 mt-1">
                          {resourceForm.images.map((url: string, i: number) => (
                            <div key={i} className="relative w-12 h-12 rounded border overflow-hidden">
                              <EntityImage src={url} name={resourceForm.name || 'Resource'} className="w-full h-full rounded-none text-xs" />
                              <button type="button" onClick={() => setResourceForm((f: any) => ({ ...f, images: f.images.filter((_: string, j: number) => j !== i) }))}
                                className="absolute top-0 right-0 bg-[var(--color-error)] text-white text-[9px] px-1 leading-tight">&times;</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {resourceFormTab === 'pricing' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-2">
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Hourly Price (EGP)</label>
                        <input type="number" value={resourceForm.hourlyPrice} onChange={e => setResourceForm((f: any) => ({ ...f, hourlyPrice: Number(e.target.value) }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" min={0} /></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Slot (min)</label>
                        <select value={resourceForm.slotDuration ?? ''} onChange={e => setResourceForm((f: any) => ({ ...f, slotDuration: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                          <option value="">Default</option>
                          {[10,15,30,60,90,120].map(v => <option key={v} value={v}>{v} min</option>)}
                        </select></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Peak Pricing Type</label>
                        <select value={resourceForm.pricingType} onChange={e => setResourceForm((f: any) => ({ ...f, pricingType: e.target.value as 'per_hour' | 'fixed' }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                          <option value="per_hour">% Percent</option>
                          <option value="fixed">Fixed</option>
                        </select></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Peak Hour Value</label>
                        <input type="number" value={resourceForm.peakHourValue || ''} onChange={e => setResourceForm((f: any) => ({ ...f, peakHourValue: e.target.value ? Number(e.target.value) : undefined }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" min={0} />
                        {resourceForm.pricingType === 'per_hour' && (
                          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Insert 10% as 10, not 0.10</p>
                        )}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2">Peak Hour Schedule</label>
                      <div className="space-y-1 border rounded-[var(--radius-md)] p-2">
                        {peakHours.map((ph: any) => (
                          <div key={ph.dayOfWeek} className="flex items-center gap-2 text-xs">
                            <label className="flex items-center gap-1.5 min-w-[100px] cursor-pointer">
                              <input type="checkbox" checked={ph.hasPeak}
                                onChange={() => setPeakHours((prev: any[]) => prev.map((p: any) => p.dayOfWeek === ph.dayOfWeek ? { ...p, hasPeak: !p.hasPeak } : p))}
                                className="w-3 h-3 rounded border-[var(--color-border)]" />
                              <span className="text-[var(--color-text)]">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][ph.dayOfWeek]}</span>
                            </label>
                            {ph.hasPeak && (
                              <>
                                <input type="time" value={ph.startTime} onChange={e => setPeakHours((prev: any[]) => prev.map((p: any) => p.dayOfWeek === ph.dayOfWeek ? { ...p, startTime: e.target.value } : p))}
                                  className="px-1.5 py-0.5 text-xs rounded border text-[var(--color-text)]" />
                                <span className="text-[var(--color-text-muted)]">to</span>
                                <input type="time" value={ph.endTime} onChange={e => setPeakHours((prev: any[]) => prev.map((p: any) => p.dayOfWeek === ph.dayOfWeek ? { ...p, endTime: e.target.value } : p))}
                                  className="px-1.5 py-0.5 text-xs rounded border text-[var(--color-text)]" />
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Can permission={editingResourceId ? 'resources.edit' : 'resources.create'}>
                  <button type="button" onClick={() => {
                    if (!resourceForm.sportId) { showToast('Please select a sport', 'warning'); return; }
                    const payload = { ...resourceForm, branchId: Number(expandedBranchId), peakHours };
                    editingResourceId ? updateResourceMutation.mutate({ id: editingResourceId, data: payload }) : createResourceMutation.mutate(payload);
                  }} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs">
                    {editingResourceId ? 'Update Resource' : 'Create Resource'}
                  </button>
                  </Can>
                  <button type="button" onClick={() => { setShowResourceForm(false); setEditingResourceId(null); setResourceForm({ name: '', resourceTypeId: 1, sportId: undefined, description: '', capacity: 1, hourlyPrice: 0, slotDuration: undefined, pricingType: 'per_hour', peakHourValue: undefined, images: [], openingTime: '', closingTime: '' }); setPeakHours([0,1,2,3,4,5,6].map(d => ({ dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' }))); }} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">Cancel</button>
                </div>
              </div>
            )}

            {branchesLoading ? <p className="text-xs text-[var(--color-text-muted)]">Loading...</p> : branches?.length ? (
              <div className="space-y-3">
                {branches.map((b: any) => (
                  <div key={b.id} className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
                    <div className="flex items-center justify-between w-full px-4 py-2.5 bg-[var(--color-bg)] text-sm font-medium text-[var(--color-text)]">
                      <span>{b.name} <span className="text-xs text-[var(--color-text-muted)] font-normal">{b.city ? `(${b.city})` : ''}</span></span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <Can permission="resources.create">
                        <button type="button" onClick={() => {
                          setExpandedBranchId(b.id);
                          setResourceForm({ name: '', resourceTypeId: 1, sportId: undefined, description: '', capacity: 1, hourlyPrice: 0, slotDuration: undefined, pricingType: 'per_hour', peakHourValue: undefined, images: [], openingTime: '', closingTime: '' });
                          setPeakHours([0,1,2,3,4,5,6].map(d => ({ dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' })));
                          setEditingResourceId(null);
                          setEditingBranchName(b.name);
                          setEditingResourceName('');
                          setShowResourceForm(true);
                        }} className="text-xs px-2 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)]">+ Add Resource</button>
                      </Can>
                      <BranchResourcesList branchId={b.id}
                        onEdit={(r: any) => {
                          setExpandedBranchId(b.id);
                          setResourceForm({
                            name: r.name,
                            resourceTypeId: r.resource_type_id,
                            sportId: r.sport_id ?? undefined,
                            description: r.description || '',
                            capacity: r.capacity || 1,
                             hourlyPrice: Number(r.hourly_price) || 0,
                            slotDuration: r.slot_duration ?? undefined,
                            pricingType: r.pricing_type || 'per_hour',
                            peakHourValue: r.peak_hour_value ?? undefined,
                            images: (typeof r.images === 'string' ? JSON.parse(r.images) : r.images) || [],
                            openingTime: r.opening_time || '',
                            closingTime: r.closing_time || '',
                          });
                          setEditingResourceId(r.id);
                          setEditingBranchName(b.name);
                          setEditingResourceName(r.name);
                          setShowResourceForm(true);
                          const phs = r.peak_hours || [];
                          if (phs.length) {
                            setPeakHours([0,1,2,3,4,5,6].map(d => {
                              const found = phs.find((ph: any) => ph.dayOfWeek === d);
                              return found || { dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' };
                            }));
                          } else {
                            setPeakHours([0,1,2,3,4,5,6].map(d => ({ dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' })));
                          }
                        }}
                        onDelete={(id: number, branchId: number) => deleteResourceMutation.mutate({ id, branchId })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-[var(--color-text-muted)]">No branches yet. Add a branch first.</p>}
          </div>
        )}

        {formTab === 'branches' && (
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <Can permission="branches.create">
                <button type="button" onClick={() => {
                  const defaultCountryId = orgData?.country_id ?? form.countryId;
                  setBranchForm({ ...branchBlank, countryId: defaultCountryId || undefined });
                  setBranchFinForm(branchFinBlank); setEditingBranchId(null); setShowBranchForm(true); setBranchFormTab('basic'); setBranchAmenityIds([]);
                  setSelectedBrCountryId(defaultCountryId || undefined); setSelectedBrProvinceId(undefined);
                }} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">+ New Branch</button>
              </Can>
            </div>

            {showBranchForm && (
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3 border space-y-3">
                <h4 className="text-xs font-semibold text-[var(--color-text)]">{editingBranchId ? `Edit Branch — ${branchForm.name}` : 'New Branch'}</h4>
                <div className="flex gap-1 border-b border-[var(--color-border)]">
                  {branchSubTabs.map(t =>
                    <Can key={t} permission={`branches.edit.${t}`}>
                    <button key={t} type="button" onClick={() => setBranchFormTab(t as typeof branchFormTab)}
                      className={`px-3 py-1 text-xs font-medium rounded-t-[var(--radius-md)] transition-colors ${branchFormTab === t ? ' text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                      {t === 'basic' ? 'Basic' : t === 'financial' ? 'Financials' : t === 'cancellation' ? 'Cancellation' : t === 'amenities' ? 'Amenities' : 'Holidays'}
                    </button>
                    </Can>
                  )}
                </div>
                {branchFormTab === 'basic' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Can permission="branches.edit.name"><div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name *</label><input value={branchForm.name} onChange={e => setBranchForm((f: any) => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))} required className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div></Can>
                      <Can permission="branches.edit.email"><div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Email</label><input value={branchForm.email} onChange={e => setBranchForm((f: any) => ({ ...f, email: e.target.value }))} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div></Can>
                      <Can permission="branches.edit.phone"><div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Phone</label><input value={branchForm.phone} onChange={e => setBranchForm((f: any) => ({ ...f, phone: e.target.value }))} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div></Can>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Description</label><input value={branchForm.description} onChange={e => setBranchForm((f: any) => ({ ...f, description: e.target.value }))} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div>
                    </div>
                    <Can permission="branches.edit.address"><div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Address</label><input value={branchForm.addressLine1} onChange={e => setBranchForm((f: any) => ({ ...f, addressLine1: e.target.value }))} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div></Can>
                    <div className="grid grid-cols-4 gap-3">
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Country</label>
                        <div className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)] bg-[var(--color-bg)] opacity-70">
                          {branchForm.countryId ? ((countries || []).find((c: any) => c.id === branchForm.countryId)?.name || '—') : <span className="text-[var(--color-text-muted)]">—</span>}
                        </div></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">State/Province</label>
                        <select value={selectedBrProvinceId || ''} onChange={(e) => {
                          const pid = e.target.value ? Number(e.target.value) : undefined;
                          setSelectedBrProvinceId(pid);
                          const name = pid ? (brProvinces || []).find((p: any) => p.id === pid)?.name || '' : '';
                          setBranchForm((f: any) => ({ ...f, state: name, city: '' }));
                        }} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                          <option value="">— Select State/Province —</option>
                          {(brProvinces || []).filter((p: any) => p.is_active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">City</label>
                        <select value={branchForm.city || ''} onChange={(e) => { setBranchForm((f: any) => ({ ...f, city: e.target.value })); }}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                          <option value="">— Select City —</option>
                          {(brCities || []).filter((c: any) => c.is_active).map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Postal Code</label>
                        <div className="flex gap-1"><input value={branchForm.postalCode} onChange={e => setBranchForm((f: any) => ({ ...f, postalCode: e.target.value }))} className="flex-1 px-2 py-1.5 rounded-[var(--radius-md)] border text-sm" />
                        <button type="button" onClick={() => { setBrMapLat(branchForm.latitude != null ? String(branchForm.latitude) : ''); setBrMapLng(branchForm.longitude != null ? String(branchForm.longitude) : ''); setShowBrMapModal(true); }}
                          className="px-2 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] text-[var(--color-info-text)] hover:bg-[var(--color-info-bg)] text-sm" title="Pin location">📍</button></div>
                        {(branchForm.latitude && branchForm.longitude) && <p className="text-[10px] text-[var(--color-success-text)] mt-0.5">📍 Pinned</p>}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <Can permission="branches.edit.access-type"><div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Access Type</label><select value={branchForm.accessType} onChange={e => setBranchForm((f: any) => ({ ...f, accessType: e.target.value }))} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]"><option value="open">Open</option><option value="restricted">Restricted</option><option value="invite_only">Invite Only</option></select></div></Can>
                      <Can permission="branches.edit.timezone"><div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Timezone</label>
                        <select value={branchForm.timezone || 'Africa/Cairo'} onChange={e => setBranchForm((f: any) => ({ ...f, timezone: e.target.value }))} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                          {['Africa/Cairo','Africa/Johannesburg','Africa/Lagos','Africa/Nairobi','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Sao_Paulo','Asia/Dubai','Asia/Riyadh','Asia/Kuwait','Asia/Karachi','Asia/Kolkata','Asia/Bangkok','Asia/Singapore','Asia/Shanghai','Asia/Tokyo','Asia/Seoul','Australia/Sydney','Europe/London','Europe/Paris','Europe/Berlin','Europe/Istanbul','Europe/Moscow'].map(tz => <option key={tz} value={tz}>{tz.replace(/_/g,' ').replace(/\//g,' / ')}</option>)}
                        </select></div></Can>
                      <Can permission="branches.edit.opening-hours"><div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Opening Time *</label><input type="time" value={branchForm.openingTime} onChange={e => setBranchForm((f: any) => ({ ...f, openingTime: e.target.value }))} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /></div></Can>
                      <Can permission="branches.edit.closing-hours"><div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Closing Time *</label><input type="time" value={branchForm.closingTime} onChange={e => setBranchForm((f: any) => ({ ...f, closingTime: e.target.value }))} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" /><p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">OK after midnight</p></div></Can>
                    </div>
                  </div>
                )}
                {branchFormTab === 'financial' && (
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Financial details apply to this branch.</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Bank Name</label>
                        <select value={selectedBrBankId || ''} onChange={(e) => {
                          const bid = e.target.value ? Number(e.target.value) : undefined;
                          const bank = bid ? (brBanksList || []).find((b: any) => b.id === bid) : undefined;
                          setSelectedBrBankId(bid); setSelectedBrBranchId(undefined);
                          setBranchFinForm((v: any) => ({ ...v, swift: bank?.swift || '' }));
                        }} className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm"><option value="">— Select —</option>
                          {(brBanksList || []).filter((b: any) => b.is_active).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Bank Branch</label>
                        <select value={selectedBrBranchId || ''} onChange={(e) => setSelectedBrBranchId(e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm"><option value="">— Select Bank First —</option>
                          {(brBankBranches || []).filter((b: any) => b.is_active).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">SWIFT/BIC</label>
                        <input value={branchFinForm.swift} readOnly
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border bg-[var(--color-border)] bg-[var(--color-surface)] text-sm font-mono text-[var(--color-text-muted)] cursor-not-allowed" /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Account Name</label>
                        <input value={branchFinForm.bankAccountName} onChange={e => setBranchFinForm((v: any) => ({ ...v, bankAccountName: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm" /></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Account Number</label>
                        <input value={branchFinForm.bankAccountNumber} onChange={e => setBranchFinForm((v: any) => ({ ...v, bankAccountNumber: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm font-mono" /></div>
                      <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">IBAN</label>
                        <input value={branchFinForm.iban} onChange={e => setBranchFinForm((v: any) => ({ ...v, iban: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm font-mono" /></div>
                    </div>
                    <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Billing Email</label>
                      <input value={branchFinForm.billingEmail} onChange={e => setBranchFinForm((v: any) => ({ ...v, billingEmail: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm" /></div>
                  </div>
                )}
                {branchFormTab === 'cancellation' && editingBranchId && (
                  <BranchCancellationPolicy branchId={editingBranchId} orgId={orgId ?? undefined} />
                )}
                {branchFormTab === 'amenities' && (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--color-text-muted)]">Select amenities. Applies to all resources under this branch.</p>
                    <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                      {amenities?.filter((a: any) => a.is_active).map((a: any) => {
                        const iconMap: Record<string, string> = { floodlights:'💡',parking:'🅿️',shower:'🚿',wifi:'📶',cafeteria:'☕',equipment:'🔧',firstaid:'🩹',changing:'🚪',aircon:'❄️',spectator:'🪑',coaching:'📋',physio:'💆',proshop:'🛍️' };
                        return (
                          <label key={a.id} className="flex items-center gap-1.5 text-xs cursor-pointer text-[var(--color-text)] p-1 rounded hover:bg-[var(--color-bg)]">
                            <input type="checkbox" checked={branchAmenityIds.includes(a.id)}
                              onChange={() => setBranchAmenityIds((prev) => prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id])}
                              className="rounded border-[var(--color-border)]" />
                            <span>{iconMap[a.icon] || '✓'}</span> {a.name_en}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {branchFormTab === 'holidays' && editingBranchId && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 border rounded-[var(--radius-md)] /30">
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name</label>
                        <input value={branchHolidayForm.name} onChange={e => setBranchHolidayForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Date From</label>
                        <input type="date" value={branchHolidayForm.dateFrom} onChange={e => setBranchHolidayForm(f => ({ ...f, dateFrom: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Date To</label>
                        <input type="date" value={branchHolidayForm.dateTo} onChange={e => setBranchHolidayForm(f => ({ ...f, dateTo: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-xs cursor-pointer text-[var(--color-text)]">
                          <input type="checkbox" checked={branchHolidayForm.isRecurring}
                            onChange={e => setBranchHolidayForm(f => ({ ...f, isRecurring: e.target.checked }))} /> Recurring
                        </label>
                        <label className="flex items-center gap-1 text-xs cursor-pointer text-[var(--color-text)]">
                          <input type="checkbox" checked={branchHolidayForm.isOpenModified}
                            onChange={e => setBranchHolidayForm(f => ({ ...f, isOpenModified: e.target.checked }))} /> Modified hours
                        </label>
                      </div>
                      {branchHolidayForm.isOpenModified && (
                        <div className="flex gap-2">
                          <div>
                            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Open</label>
                            <input type="time" value={branchHolidayForm.openTime} onChange={e => setBranchHolidayForm(f => ({ ...f, openTime: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Close</label>
                            <input type="time" value={branchHolidayForm.closeTime} onChange={e => setBranchHolidayForm(f => ({ ...f, closeTime: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
                          </div>
                        </div>
                      )}
                      <div className="flex items-end">
                        <button type="button" onClick={() => {
                          if (editingBranchHolidayId) updateBranchHolidayMutation.mutate({ id: editingBranchHolidayId, data: branchHolidayForm });
                          else createBranchHolidayMutation.mutate(branchHolidayForm);
                        }}
                          className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
                          {editingBranchHolidayId ? 'Update' : 'Add'}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {branchHolidays.map((h: any) => (
                        <div key={h.id} className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-[var(--color-bg)]">
                          <span><b>{h.name}</b> {h.date_from?.slice(0, 10)}{h.date_to ? ` → ${h.date_to.slice(0, 10)}` : ''}{h.is_recurring ? ' (recurring)' : ''}</span>
                          <div className="flex gap-1">
                            <button type="button" onClick={() => {
                              setEditingBranchHolidayId(h.id);
                              setBranchHolidayForm({ name: h.name, dateFrom: h.date_from?.slice(0, 10) || '', dateTo: h.date_to?.slice(0, 10) || '', isRecurring: !!h.is_recurring, isOpenModified: !!h.is_open_modified, openTime: h.open_time || '', closeTime: h.close_time || '' });
                            }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)]">Edit</button>
                            <button type="button" onClick={() => { if (confirm('Delete?')) deleteBranchHolidayMutation.mutate(h.id); }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80">Delete</button>
                          </div>
                        </div>
                      ))}
                      {!branchHolidays.length && <p className="text-[10px] text-[var(--color-text-muted)]">No holidays.</p>}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Can permission={editingBranchId ? 'branches.edit' : 'branches.create'}>
                  <button type="button" onClick={() => {
                    const base = paths!.isOrg ? branchForm : { ...branchForm, organisationId: Number(orgId) };
                    const payload = Object.fromEntries(Object.entries(base).filter(([, v]) => v !== ''));
                    if (editingBranchId) {
                      updateBranchMutation.mutate({ id: editingBranchId, data: payload });
                      if (branchAmenityIds.length > 0) branchAmenityMutation.mutate({ id: editingBranchId, ids: branchAmenityIds });
                      if (selectedBrBankId || branchFinForm.bankAccountNumber || branchFinForm.billingEmail) {
                        branchFinMutation.mutate({
                          bankName: branchFinForm.bankName || null,
                          bankAccountName: branchFinForm.bankAccountName || null,
                          bankAccountNumber: branchFinForm.bankAccountNumber || null,
                          iban: branchFinForm.iban || null,
                          swift: branchFinForm.swift || null,
                          billingAddress: branchFinForm.billingAddress || null,
                          billingEmail: branchFinForm.billingEmail || null,
                          payoutSchedule: branchFinForm.payoutSchedule || 'monthly',
                          bankId: selectedBrBankId || null,
                          bankBranchId: selectedBrBranchId || null,
                          currencyId: null,
                        });
                      }
                    } else {
                      createBranchMutation.mutate(payload);
                    }
                  }} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs">
                    {editingBranchId ? 'Update Branch' : 'Create Branch'}
                  </button>
                  </Can>
                  <button type="button" onClick={() => { setShowBranchForm(false); setBranchForm(branchBlank); setBranchFinForm(branchFinBlank); setEditingBranchId(null); setBranchAmenityIds([]); setSelectedBrCountryId(undefined); setSelectedBrProvinceId(undefined); }} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">Cancel</button>
                </div>
              </div>
            )}

            {branchesLoading ? <p className="text-xs text-[var(--color-text-muted)]">Loading...</p> : branches?.length ? (
              <div className="border rounded-[var(--radius-md)] overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b bg-[var(--color-bg)]">
                    <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Name</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Location</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Access</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Map</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Status</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Actions</th>
                  </tr></thead>
                  <tbody>
                    {branches.map((b: any) => (
                      <tr key={b.id} className="border-b hover:bg-[var(--color-bg)]">
                        <td className="px-4 py-2"><div className="text-sm font-medium text-[var(--color-text)]">{b.name}</div><div className="text-xs text-[var(--color-text-muted)] font-mono">{b.slug}</div></td>
                        <td className="px-4 py-2"><div className="text-sm text-[var(--color-text)]">{b.city || '—'}</div>{b.state && <div className="text-xs text-[var(--color-text-muted)]">{b.state}</div>}</td>
                        <td className="px-4 py-2 text-center"><span className={`px-2 py-0.5 text-xs rounded-full font-medium ${b.access_type === 'open' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : b.access_type === 'restricted' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'}`}>{b.access_type.replace(/_/g,' ')}</span></td>
                        <td className="px-4 py-2 text-center"><span className={`px-2 py-0.5 text-xs rounded-full font-medium ${b.latitude && b.longitude ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>{b.latitude && b.longitude ? '📍 Pinned' : 'Not set'}</span></td>
                        <td className="px-4 py-2 text-center">
                          <Can permission="branches.edit.status">
                          <button type="button" onClick={() => {
                            api.put(`/branches/${b.id}`, { isActive: !b.is_active }).then(() => queryClient.invalidateQueries({ queryKey: ['branches', orgId] }));
                          }}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${b.is_active ? 'text-[var(--color-success-text)] hover:text-[var(--color-error-text)]' : 'text-[var(--color-error-text)] hover:text-[var(--color-success-text)]'}`}>
                            <span className={`w-2 h-2 rounded-full ${b.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />{b.is_active ? 'Active' : 'Suspended'}</button>
                          </Can>
                          </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Can permission="branches.edit">
                              <button type="button" onClick={async () => {
                                setBranchForm({ name: b.name, slug: b.slug, description: b.description || '', email: b.email || '', phone: b.phone || '', addressLine1: b.address_line1 || '', city: b.city || '', state: b.state || '', postalCode: b.postal_code || '', accessType: b.access_type || 'open', timezone: b.timezone || 'Africa/Cairo', countryId: b.country_id ?? undefined, openingTime: b.opening_time || '08:00', closingTime: b.closing_time || '22:00', latitude: b.latitude != null ? Number(b.latitude) : undefined, longitude: b.longitude != null ? Number(b.longitude) : undefined });
                                setEditingBranchId(b.id); setShowBranchForm(true); setBranchFormTab('basic');
                                setSelectedBrCountryId(b.country_id ?? undefined); setSelectedBrProvinceId(undefined);
                                try { const res = await api.get(`/branches/${b.id}/amenities`).then((r: any) => r.data.data); setBranchAmenityIds(res.map((a: any) => a.id)); } catch { setBranchAmenityIds([]); }
                              }} className="text-xs px-2 py-1 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)]">Edit</button>
                            </Can>
                            <Can permission="branches.delete">
                              <button type="button" onClick={() => {
                                if (confirm('Delete this branch?')) { deleteBranchMutation.mutate(b.id); showToast('Branch deleted!'); }
                              }}
                                className="text-xs px-2 py-1 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400">Delete</button>
                            </Can>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-[var(--color-text-muted)]">No branches yet</p>}
          </div>
        )}

        {(variant !== 'page' || formTab === 'basic') && (
        <div className="flex items-center gap-3 mt-6 pt-4 border-t">
          <Can permission={isCreate ? 'organisations.create' : 'organisations.edit'}>
          <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
            {isCreate ? 'Create Organisation' : 'Save Changes'}
          </button>
          </Can>
          {variant === 'modal' && (
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          )}
        </div>
        )}
      </form>

      {previewDoc && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center" onClick={() => setPreviewDoc(null)}>
          <div className="max-w-3xl max-h-[90vh] rounded-xl p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">{previewDoc.name}</span>
              <button onClick={() => setPreviewDoc(null)} className="text-lg">&times;</button></div>
            {previewDoc.preview.endsWith('.pdf') ? (
              <iframe src={previewDoc.preview} className="w-[80vw] h-[80vh]" />
            ) : (
              <EntityImage src={previewDoc.preview} name={previewDoc.name} className="max-w-full max-h-[80vh] rounded-[var(--radius-md)] text-4xl object-contain" />
            )}
          </div>
        </div>
      )}

      {showBrMapModal && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center" onClick={() => setShowBrMapModal(false)}>
          <div className="rounded-xl p-5 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Pin Location</h3>
            <MapPicker lat={brMapLat} lng={brMapLng} location={`${branchForm.city || ''} ${branchForm.state || ''}`} onCoord={(lat: string, lng: string) => { setBrMapLat(lat); setBrMapLng(lng); }} />
            <div className="flex gap-2 justify-end mt-3">
              <button type="button" onClick={() => setShowBrMapModal(false)} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">Cancel</button>
              <button type="button" onClick={() => {
                setBranchForm((f: any) => ({ ...f, latitude: brMapLat ? Number(brMapLat) : undefined, longitude: brMapLng ? Number(brMapLng) : undefined }));
                setShowBrMapModal(false);
              }} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs">Save</button>
            </div>
          </div>
        </div>
      )}
      {orgId && (
        <UpgradeRequestModal
          orgId={typeof orgId === 'string' ? parseInt(orgId, 10) : orgId}
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </div>
  );
}

function BranchResourcesList({ branchId, onEdit, onDelete }: { branchId: number; onEdit: (r: any) => void; onDelete: (id: number, branchId: number) => void }) {
  const { showToast } = useToast();
  const { data: resources, isLoading } = useQuery({
    queryKey: ['resources', branchId],
    queryFn: () => api.get(`/branches/${branchId}/resources`).then((r: any) => r.data.data),
  });

  if (isLoading) return <p className="text-xs text-[var(--color-text-muted)]">Loading...</p>;
  if (!resources?.length) return <p className="text-xs text-[var(--color-text-muted)]">No resources.</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {resources.map((r: any) => (
        <div key={r.id} className="flex items-center justify-between rounded-[var(--radius-md)] p-2.5 border border-[var(--color-border)]">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--color-text)] truncate">{r.name}</div>
            <div className="text-[11px] text-[var(--color-text-muted)]">
              {r.resource_type_name || ''} {r.sport_name ? `· ${r.sport_name}` : ''}
            </div>
          </div>
          <div className="flex gap-1.5 ml-2 flex-shrink-0">
            <Can permission="resources.edit">
              <button type="button" onClick={() => onEdit(r)}
                className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-border)]">Edit</button>
            </Can>
            <Can permission="resources.delete">
              <button type="button" onClick={() => { if (confirm('Delete this resource?')) { onDelete(r.id, branchId); showToast('Resource deleted!'); } }}
                className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400">Delete</button>
            </Can>
          </div>
        </div>
      ))}
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
          className="flex-1 px-3 py-1.5 text-xs rounded-[var(--radius-md)] border" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), doSearch())} />
        <button type="button" onClick={() => doSearch()} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs">Search</button>
      </div>
      <div ref={mapRef} style={{ height: '300px', width: '100%' }} className="rounded-[var(--radius-md)] border" />
      <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Click on the map to drop a pin, or search for an address.</p>
    </div>
  );
}
