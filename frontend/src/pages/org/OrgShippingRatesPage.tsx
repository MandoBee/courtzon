import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';

interface ShippingRate {
  id: number;
  seller_id: number;
  province_id: number | null;
  city_id: number | null;
  price: number;
  estimated_days: number | null;
  province_name: string | null;
  city_name: string | null;
  created_at: string;
  updated_at: string;
}

interface Province {
  id: number;
  name: string;
}

interface City {
  id: number;
  name: string;
}

export default function OrgShippingRatesPage({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [provinceId, setProvinceId] = useState('');
  const [cityId, setCityId] = useState('');
  const [price, setPrice] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');

  const { data: ratesData, isLoading } = useQuery({
    queryKey: ['seller-shipping-rates', orgId],
    queryFn: () => api.get('/marketplace/seller/shipping-rates', { params: { orgId } }).then((r) => r.data),
    enabled: !!orgId,
  });

  const { data: provincesData } = useQuery({
    queryKey: ['provinces'],
    queryFn: () => api.get('/marketplace/provinces').then((r) => r.data),
  });

  const { data: citiesData } = useQuery({
    queryKey: ['cities', provinceId],
    queryFn: () => api.get(`/marketplace/provinces/${provinceId}/cities`).then((r) => r.data),
    enabled: !!provinceId,
  });

  const rates: ShippingRate[] = ratesData?.data ?? [];
  const provinces: Province[] = provincesData?.data ?? [];
  const cities: City[] = citiesData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/marketplace/seller/shipping-rates', { ...data, orgId: Number(orgId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-shipping-rates'] });
      showToast('Shipping rate created!');
      resetForm();
    },
    onError: (err: any) => showToast('Failed: ' + (err?.response?.data?.message || err.message), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/marketplace/seller/shipping-rates/${id}`, { ...data, orgId: Number(orgId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-shipping-rates'] });
      showToast('Shipping rate updated!');
      resetForm();
    },
    onError: (err: any) => showToast('Failed: ' + (err?.response?.data?.message || err.message), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/marketplace/seller/shipping-rates/${id}`, { data: { orgId: Number(orgId) } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-shipping-rates'] });
      showToast('Shipping rate deleted!');
    },
    onError: (err: any) => showToast('Failed: ' + (err?.response?.data?.message || err.message), 'error'),
  });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setProvinceId('');
    setCityId('');
    setPrice('');
    setEstimatedDays('');
  }

  function handleEdit(rate: ShippingRate) {
    setEditId(rate.id);
    setProvinceId(rate.province_id?.toString() || '');
    setCityId(rate.city_id?.toString() || '');
    setPrice(rate.price.toString());
    setEstimatedDays(rate.estimated_days?.toString() || '');
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: any = { price: parseFloat(price) };
    if (provinceId) data.provinceId = parseInt(provinceId);
    if (cityId) data.cityId = parseInt(cityId);
    if (estimatedDays) data.estimatedDays = parseInt(estimatedDays);
    if (editId) {
      updateMutation.mutate({ id: editId, data });
    } else {
      createMutation.mutate(data);
    }
  }

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Shipping Rates</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Manage delivery pricing by province/city</p>
        </div>
        <Can permission="marketplace.seller.shipping-rates">
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90">
              + Add Rate
            </button>
          )}
        </Can>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-6 space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Province</label>
              <select value={provinceId} onChange={(e) => { setProvinceId(e.target.value); setCityId(''); }}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-[var(--color-bg)]">
                <option value="">All Provinces</option>
                {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">City (optional)</label>
              <select value={cityId} onChange={(e) => setCityId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-[var(--color-bg)]" disabled={!provinceId}>
                <option value="">All Cities</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Shipping Price</label>
              <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required
                className="w-full px-3 py-2 text-sm rounded-lg border bg-[var(--color-bg)]" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Delivery Within (Days)</label>
              <input type="number" min="1" value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-[var(--color-bg)]" placeholder="e.g. 5" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50">
              {editId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm}
              className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-[var(--color-bg)]">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3">Province</th>
              <th className="text-left px-4 py-3">City</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Delivery Days</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rates.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No shipping rates yet. Add one to start selling.</td></tr>
            )}
            {rates.map((rate) => (
              <tr key={rate.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3">{rate.province_name || 'All Provinces'}</td>
                <td className="px-4 py-3">{rate.city_name || 'All Cities'}</td>
                <td className="px-4 py-3 text-right font-medium">{Number(rate.price).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{rate.estimated_days ? `${rate.estimated_days} days` : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleEdit(rate)}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-[var(--color-bg)]">
                      Edit
                    </button>
                    <button onClick={() => { if (confirm('Delete this rate?')) deleteMutation.mutate(rate.id); }}
                      className="text-xs px-2 py-1 rounded-md border text-red-600 hover:bg-red-50">
                      Delete
                    </button>
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
