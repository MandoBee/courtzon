import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner, Pagination, FlagImage } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

type Tab = 'countries' | 'provinces' | 'cities';

export default function CountriesPage() {
  const [tab, setTab] = useState<Tab>('countries');

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Localization</h1>

      <div className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
        {(['countries', 'provinces', 'cities'] as const).map((t: any) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-[var(--radius-md)] transition-colors capitalize ${
              tab === t ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}>
            {t === 'provinces' ? 'Provinces / States' : t}
          </button>
        ))}
      </div>

      {tab === 'countries' && <CountriesTab />}
      {tab === 'provinces' && <ProvincesTab />}
      {tab === 'cities' && <CitiesTab />}
    </div>
  );
}

/* ───── Countries Tab ───── */

interface Country {
  id: number; iso_code: string; iso_code_3: string; name: string;
  native_name: string | null; phone_code: string; phone_max_length: number;
  phone_min_length: number; default_locale: string; default_currency: string;
  currency_symbol: string | null; currency_name: string | null;
  currency_decimal_places: number; flag_emoji: string | null;
  navigation_polygon: any; sort_order: number; is_active: number;
}

function CountriesTab() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Country | null>(null);
  const [form, setForm] = useState<any>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => api.get('/countries').then((r: any) => r.data.data),
  });
  const { data: currenciesData } = useQuery({
    queryKey: ['admin', 'currencies'],
    queryFn: () => api.get('/currencies').then((r: any) => r.data.data ?? []),
  });
  const { data: languagesData } = useQuery({
    queryKey: ['admin', 'languages'],
    queryFn: () => api.get('/languages').then((r: any) => r.data.data ?? []),
  });

  const countries: Country[] = data || [];
  const currencies: any[] = currenciesData || [];
  const languages: any[] = languagesData || [];

  const sortedCountries = [...countries].sort((a: any, b: any) => a.sort_order - b.sort_order);
  const totalPages = Math.ceil(sortedCountries.length / pageSize);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const paginatedCountries = sortedCountries.slice((safePage - 1) * pageSize, safePage * pageSize);

  const createMut = useMutation({
    mutationFn: (d: any) => api.post('/countries', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'countries'] }); resetForm(); showToast('Created successfully!'); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/countries/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'countries'] }); resetForm(); showToast('Updated successfully!'); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/countries/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'countries'] }); setDeleteId(null); showToast('Deleted successfully!'); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, current }: { id: number; current: number }) =>
      api.put(`/countries/${id}`, { isActive: current ? false : true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'countries'] }); showToast('Status toggled!'); },
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setForm({}); };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openEdit = (c: Country) => {
    setEditing(c);
    setForm({
      isoCode: c.iso_code, isoCode3: c.iso_code_3, name: c.name,
      nativeName: c.native_name || '', phoneCode: c.phone_code,
      phoneMaxLength: c.phone_max_length, phoneMinLength: c.phone_min_length,
      defaultLocale: c.default_locale, defaultCurrency: c.default_currency,
      flagEmoji: c.flag_emoji || '', navigationPolygon: c.navigation_polygon ? JSON.stringify(c.navigation_polygon) : '',
      sortOrder: c.sort_order,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.isoCode || !form.isoCode3) return;
    const payload = { ...form };
    if (payload.navigationPolygon) {
      try { payload.navigationPolygon = JSON.parse(payload.navigationPolygon); } catch { payload.navigationPolygon = undefined; }
    } else { payload.navigationPolygon = undefined; }
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  };

  if (isLoading) return <Spinner />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[var(--color-text)]">Countries</h2>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Country</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Country' : 'New Country'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">ISO Code *</label>
              <Can permission="countries.edit.code">
                <input value={form.isoCode || ''} onChange={(e: any) => set('isoCode', e.target.value.toUpperCase())} placeholder="AE" required maxLength={2}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">ISO Code 3 *</label>
              <Can permission="countries.edit.code">
                <input value={form.isoCode3 || ''} onChange={(e: any) => set('isoCode3', e.target.value.toUpperCase())} placeholder="ARE" required maxLength={3}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
              <Can permission="countries.edit.name">
                <input value={form.name || ''} onChange={(e: any) => set('name', e.target.value)} placeholder="United Arab Emirates" required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Native Name</label>
              <input value={form.nativeName || ''} onChange={(e: any) => set('nativeName', e.target.value)} placeholder="الإمارات"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Phone Code *</label>
              <Can permission="countries.edit.phone-code">
                <input value={form.phoneCode || ''} onChange={(e: any) => set('phoneCode', e.target.value)} placeholder="+971" required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Default Currency *</label>
              <Can permission="countries.edit.currency">
                <select value={form.defaultCurrency || ''} onChange={(e: any) => set('defaultCurrency', e.target.value)} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">Select currency...</option>
                  {currencies.map((c: any) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
                  ))}
                </select>
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Default Language</label>
              <select value={form.defaultLocale || 'en'} onChange={(e: any) => set('defaultLocale', e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                {languages.map((l: any) => (
                  <option key={l.code} value={l.code}>{l.code} — {l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Flag Emoji</label>
              <input value={form.flagEmoji || ''} onChange={(e: any) => set('flagEmoji', e.target.value)} placeholder="🇦🇪"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
              <input type="number" value={form.sortOrder ?? 0} onChange={(e: any) => set('sortOrder', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Navigation Polygon <span className="text-[var(--color-text-muted)]/60">(JSON [[lat, lng], ...])</span></label>
              <textarea value={form.navigationPolygon || ''} onChange={(e: any) => set('navigationPolygon', e.target.value)} rows={2}
                placeholder='[[25.2048, 55.2708], [25.2, 55.3]]'
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm font-mono" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Can permission={editing ? 'countries.edit' : 'countries.create'}>
              <Button type="submit" loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Currency</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Navigation</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {paginatedCountries.map((c: any) => (
                <tr key={c.id} className={`hover:bg-[var(--color-bg)]/30 ${editing?.id === c.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                  <td className="px-4 py-3 text-[var(--color-text)]"><FlagImage iso={c.iso_code} countryName={c.name} className="inline-block w-5 h-auto align-middle mr-1.5" size={20} />{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">{c.phone_code}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    {c.currency_symbol && <span className="mr-1">{c.currency_symbol}</span>}
                    {c.default_currency}
                    {c.currency_name && <span className="ml-1 text-xs text-[var(--color-text-muted)]">({c.currency_name})</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive.mutate({ id: c.id, current: c.is_active })}
                      className={`px-2 py-0.5 text-xs rounded-full cursor-pointer transition-colors ${c.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:opacity-80' : 'bg-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}>
                      {c.is_active ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${c.navigation_polygon ? 'bg-indigo-100 text-indigo-700' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                      {c.navigation_polygon ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                      <Button variant="ghost" onClick={() => setDeleteId(c.id)} className="text-[var(--color-error)]">Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={sortedCountries.length} page={safePage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s: any) => { setPageSize(s); setPage(1); }} />
        {!countries.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No countries found</p>}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Country">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={() => deleteMut.mutate(deleteId!)} loading={deleteMut.isPending} className="bg-[var(--color-error)] text-white">Delete</Button>
        </div>
      </Modal>
    </>
  );
}

/* ───── Provinces Tab ───── */

interface Province {
  id: number; country_id: number; name: string; native_name: string | null;
  code: string | null; type: string; navigation_polygon: any;
  sort_order: number; is_active: number;
}

function ProvincesTab() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Province | null>(null);
  const [form, setForm] = useState<any>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterCountryId, setFilterCountryId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: countries } = useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => api.get('/countries').then((r: any) => r.data.data ?? []),
  });
  const { data: provinces, isLoading } = useQuery({
    queryKey: ['admin', 'provinces', filterCountryId],
    queryFn: () => {
      if (filterCountryId) return api.get(`/countries/${filterCountryId}/provinces`).then((r: any) => r.data.data ?? []);
      return api.get('/provinces').then((r: any) => r.data.data ?? []);
    },
  });

  useEffect(() => { setPage(1); }, [filterCountryId]);

  const provinceList = provinces || [];
  const totalPages = Math.ceil(provinceList.length / pageSize);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const paginatedProvinces = provinceList.slice((safePage - 1) * pageSize, safePage * pageSize);

  const createMut = useMutation({
    mutationFn: (d: any) => api.post('/provinces', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'provinces'] });
      qc.invalidateQueries({ queryKey: ['admin', 'provinces', filterCountryId] });
      resetForm();
      showToast('Created successfully!');
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/provinces/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'provinces'] });
      qc.invalidateQueries({ queryKey: ['admin', 'provinces', filterCountryId] });
      resetForm();
      showToast('Updated successfully!');
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/provinces/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'provinces'] });
      qc.invalidateQueries({ queryKey: ['admin', 'provinces', filterCountryId] });
      setDeleteId(null);
      showToast('Deleted successfully!');
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, current }: { id: number; current: number }) =>
      api.put(`/provinces/${id}`, { isActive: current ? false : true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'provinces'] });
      qc.invalidateQueries({ queryKey: ['admin', 'provinces', filterCountryId] });
      showToast('Status toggled!');
    },
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setForm({}); };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openEdit = (p: Province) => {
    setEditing(p);
    setForm({
      countryId: String(p.country_id), name: p.name, nativeName: p.native_name || '',
      code: p.code || '', type: p.type || 'province',
      navigationPolygon: p.navigation_polygon ? JSON.stringify(p.navigation_polygon) : '',
      sortOrder: p.sort_order,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.countryId) return;
    const payload = { ...form, countryId: Number(form.countryId) };
    if (payload.navigationPolygon) {
      try { payload.navigationPolygon = JSON.parse(payload.navigationPolygon); } catch { payload.navigationPolygon = undefined; }
    } else { payload.navigationPolygon = undefined; }
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  };

  if (isLoading) return <Spinner />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[var(--color-text)]">Provinces / States / Governorates</h2>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Province</Button>
      </div>

      <div className="mb-4">
        <select value={filterCountryId} onChange={(e: any) => setFilterCountryId(e.target.value)}
          className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
          <option value="">All countries</option>
          {[...(countries || [])].filter((c: any) => c.is_active).sort((a: any, b: any) => a.sort_order - b.sort_order).map((c: any) => (
            <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Province' : 'New Province'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Country *</label>
              <select value={form.countryId || ''} onChange={(e: any) => set('countryId', e.target.value)} required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">Select country...</option>
                {[...(countries || [])].filter((c: any) => c.is_active).sort((a: any, b: any) => a.sort_order - b.sort_order).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
              <input value={form.name || ''} onChange={(e: any) => set('name', e.target.value)} placeholder="Dubai" required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Native Name</label>
              <input value={form.nativeName || ''} onChange={(e: any) => set('nativeName', e.target.value)} placeholder="دبي"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Code <span className="text-[var(--color-text-muted)]/60">(ISO 3166-2)</span></label>
              <input value={form.code || ''} onChange={(e: any) => set('code', e.target.value.toUpperCase())} placeholder="AE-DU"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Type</label>
              <select value={form.type || 'province'} onChange={(e: any) => set('type', e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="province">Province</option>
                <option value="state">State</option>
                <option value="governorate">Governorate</option>
                <option value="region">Region</option>
                <option value="emirate">Emirate</option>
                <option value="county">County</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
              <input type="number" value={form.sortOrder ?? 0} onChange={(e: any) => set('sortOrder', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Navigation Polygon <span className="text-[var(--color-text-muted)]/60">(JSON [[lat, lng], ...])</span></label>
              <textarea value={form.navigationPolygon || ''} onChange={(e: any) => set('navigationPolygon', e.target.value)} rows={2}
                placeholder='[[25.2048, 55.2708], [25.2, 55.3]]'
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm font-mono" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Can permission={editing ? 'countries.edit' : 'countries.create'}>
              <Button type="submit" loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Country</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Navigation</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {paginatedProvinces.map((p: Province) => {
                const country = (countries || []).find((c: any) => c.id === p.country_id);
                return (
                  <tr key={p.id} className={`hover:bg-[var(--color-bg)]/30 ${editing?.id === p.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                    <td className="px-4 py-3">
                      <div className="text-[var(--color-text)]">{p.name}</div>
                      {p.native_name && <div className="text-xs text-[var(--color-text-muted)]">{p.native_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]"><FlagImage iso={country?.iso_code} countryName={country?.name} className="inline-block w-5 h-auto align-middle mr-1.5" size={20} />{country?.name}</td>
                    <td className="px-4 py-3 text-xs capitalize text-[var(--color-text)]">{p.type}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive.mutate({ id: p.id, current: p.is_active })}
                        className={`px-2 py-0.5 text-xs rounded-full cursor-pointer transition-colors ${p.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:opacity-80' : 'bg-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}>
                        {p.is_active ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${p.navigation_polygon ? 'bg-indigo-100 text-indigo-700' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                        {p.navigation_polygon ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
                        <Button variant="ghost" onClick={() => setDeleteId(p.id)} className="text-[var(--color-error)]">Delete</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination total={provinceList.length} page={safePage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s: any) => { setPageSize(s); setPage(1); }} />
        {(!provinces || provinces.length === 0) && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No provinces found</p>}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Province">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={() => deleteMut.mutate(deleteId!)} loading={deleteMut.isPending} className="bg-[var(--color-error)] text-white">Delete</Button>
        </div>
      </Modal>
    </>
  );
}

/* ───── Cities Tab ───── */

interface City {
  id: number; province_id: number; name: string; native_name: string | null;
  navigation_polygon: any; sort_order: number; is_active: number;
}

function CitiesTab() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<City | null>(null);
  const [form, setForm] = useState<any>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterCountryId, setFilterCountryId] = useState('');
  const [filterProvinceId, setFilterProvinceId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: countries } = useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => api.get('/countries').then((r: any) => r.data.data ?? []),
  });
  const { data: provinces } = useQuery({
    queryKey: ['admin', 'provinces', filterCountryId],
    queryFn: () => {
      if (filterCountryId) return api.get(`/countries/${filterCountryId}/provinces`).then((r: any) => r.data.data ?? []);
      return api.get('/provinces').then((r: any) => r.data.data ?? []);
    },
    enabled: !!filterCountryId,
  });
  const { data: citiesList, isLoading } = useQuery({
    queryKey: ['admin', 'cities', filterProvinceId],
    queryFn: () => {
      if (filterProvinceId) return api.get(`/provinces/${filterProvinceId}/cities`).then((r: any) => r.data.data ?? []);
      return api.get('/cities').then((r: any) => r.data.data ?? []);
    },
  });

  useEffect(() => { setPage(1); }, [filterCountryId, filterProvinceId]);

  const cityList = (citiesList || []).filter((c: any) => {
    if (filterProvinceId) return true;
    if (filterCountryId) return (provinces || []).some((p: any) => p.id === c.province_id);
    return true;
  });
  const totalPages = Math.ceil(cityList.length / pageSize);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const paginatedCities = cityList.slice((safePage - 1) * pageSize, safePage * pageSize);

  const createMut = useMutation({
    mutationFn: (d: any) => api.post('/cities', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cities'] });
      qc.invalidateQueries({ queryKey: ['admin', 'cities', filterProvinceId] });
      resetForm();
      showToast('Created successfully!');
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/cities/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cities'] });
      qc.invalidateQueries({ queryKey: ['admin', 'cities', filterProvinceId] });
      resetForm();
      showToast('Updated successfully!');
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/cities/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cities'] });
      qc.invalidateQueries({ queryKey: ['admin', 'cities', filterProvinceId] });
      setDeleteId(null);
      showToast('Deleted successfully!');
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, current }: { id: number; current: number }) =>
      api.put(`/cities/${id}`, { isActive: current ? false : true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cities'] });
      qc.invalidateQueries({ queryKey: ['admin', 'cities', filterProvinceId] });
      showToast('Status toggled!');
    },
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setForm({}); };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openEdit = (c: City) => {
    setEditing(c);
    const prov = (provinces || []).find((p: any) => p.id === c.province_id);
    setForm({
      provinceId: String(c.province_id), name: c.name, nativeName: c.native_name || '',
      navigationPolygon: c.navigation_polygon ? JSON.stringify(c.navigation_polygon) : '',
      sortOrder: c.sort_order,
    });
    if (prov) setFilterCountryId(String(prov.country_id));
    setFilterProvinceId(String(c.province_id));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.provinceId) return;
    const payload = { ...form, provinceId: Number(form.provinceId) };
    if (payload.navigationPolygon) {
      try { payload.navigationPolygon = JSON.parse(payload.navigationPolygon); } catch { payload.navigationPolygon = undefined; }
    } else { payload.navigationPolygon = undefined; }
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  };

  const handleCountryChange = (countryId: string) => {
    setFilterCountryId(countryId);
    setFilterProvinceId('');
    set('provinceId', '');
  };

  if (isLoading) return <Spinner />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[var(--color-text)]">Cities</h2>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New City</Button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <select value={filterCountryId} onChange={(e: any) => handleCountryChange(e.target.value)}
          className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
          <option value="">All countries</option>
          {[...(countries || [])].filter((c: any) => c.is_active).sort((a: any, b: any) => a.sort_order - b.sort_order).map((c: any) => (
            <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
          ))}
        </select>
        <select value={filterProvinceId} onChange={(e: any) => setFilterProvinceId(e.target.value)}
          className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
          <option value="">All provinces</option>
          {(provinces || []).filter((p: any) => p.is_active).map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit City' : 'New City'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Country</label>
              <select value={filterCountryId} onChange={(e: any) => handleCountryChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">Select country...</option>
                {[...(countries || [])].filter((c: any) => c.is_active).sort((a: any, b: any) => a.sort_order - b.sort_order).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Province *</label>
              <select value={form.provinceId || ''} onChange={(e: any) => set('provinceId', e.target.value)} required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">Select province...</option>
                {(provinces || []).filter((p: any) => p.is_active).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
              <input value={form.name || ''} onChange={(e: any) => set('name', e.target.value)} placeholder="Dubai City" required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Native Name</label>
              <input value={form.nativeName || ''} onChange={(e: any) => set('nativeName', e.target.value)} placeholder="دبي"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
              <input type="number" value={form.sortOrder ?? 0} onChange={(e: any) => set('sortOrder', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Navigation Polygon <span className="text-[var(--color-text-muted)]/60">(JSON [[lat, lng], ...])</span></label>
              <textarea value={form.navigationPolygon || ''} onChange={(e: any) => set('navigationPolygon', e.target.value)} rows={2}
                placeholder='[[25.2048, 55.2708], [25.2, 55.3]]'
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm font-mono" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Can permission={editing ? 'countries.edit' : 'countries.create'}>
              <Button type="submit" loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Province</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Country</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Navigation</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {paginatedCities.map((c: City) => {
                const prov = (provinces || []).find((p: any) => p.id === c.province_id);
                const country = (countries || []).find((ct: any) => prov && ct.id === prov.country_id);
                return (
                  <tr key={c.id} className={`hover:bg-[var(--color-bg)]/30 ${editing?.id === c.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                    <td className="px-4 py-3">
                      <div className="text-[var(--color-text)]">{c.name}</div>
                      {c.native_name && <div className="text-xs text-[var(--color-text-muted)]">{c.native_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{prov?.name || '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]"><FlagImage iso={country?.iso_code} countryName={country?.name} className="inline-block w-5 h-auto align-middle mr-1.5" size={20} />{country?.name}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive.mutate({ id: c.id, current: c.is_active })}
                        className={`px-2 py-0.5 text-xs rounded-full cursor-pointer transition-colors ${c.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:opacity-80' : 'bg-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}>
                        {c.is_active ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${c.navigation_polygon ? 'bg-indigo-100 text-indigo-700' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                        {c.navigation_polygon ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                        <Button variant="ghost" onClick={() => setDeleteId(c.id)} className="text-[var(--color-error)]">Delete</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination total={cityList.length} page={safePage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s: any) => { setPageSize(s); setPage(1); }} />
        {(!citiesList || citiesList.length === 0) && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No cities found</p>}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete City">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={() => deleteMut.mutate(deleteId!)} loading={deleteMut.isPending} className="bg-[var(--color-error)] text-white">Delete</Button>
        </div>
      </Modal>
    </>
  );
}
