import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
  sort_order: number;
  is_active: number;
}

export default function CurrenciesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimalPlaces, setDecimalPlaces] = useState('2');
  const [sortOrder, setSortOrder] = useState('0');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'currencies'],
    queryFn: () => api.get('/currencies').then((r: any) => r.data.data),
  });

  const currencies: Currency[] = data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/currencies', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'currencies'] }); resetForm(); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/currencies/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'currencies'] }); resetForm(); showToast('Updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/currencies/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'currencies'] }); setDeleteId(null); showToast('Deleted successfully!'); },
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setCode(''); setName(''); setSymbol(''); setDecimalPlaces('2'); setSortOrder('0'); };

  const openEdit = (c: Currency) => {
    setEditing(c); setCode(c.code); setName(c.name); setSymbol(c.symbol);
    setDecimalPlaces(String(c.decimal_places)); setSortOrder(String(c.sort_order));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !symbol) return;
    const payload = { code, name, symbol, decimalPlaces: parseInt(decimalPlaces) || 2, sortOrder: parseInt(sortOrder) || 0 };
    if (editing) { updateMutation.mutate({ id: editing.id, data: payload }); }
    else { createMutation.mutate(payload); }
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Currencies</h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Currency</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Currency' : 'New Currency'}</h3>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Code *</label>
              <Can permission="currencies.edit.code">
                <input value={code} onChange={(e: any) => setCode(e.target.value.toUpperCase())}
                  placeholder="AED" required maxLength={3}
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
              <Can permission="currencies.edit.name">
                <input value={name} onChange={(e: any) => setName(e.target.value)}
                  placeholder="Dirham" required
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[160px]" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Symbol *</label>
              <Can permission="currencies.edit.symbol">
                <input value={symbol} onChange={(e: any) => setSymbol(e.target.value)}
                  placeholder="د.إ" required
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Decimal Places</label>
              <input type="number" value={decimalPlaces} onChange={(e: any) => setDecimalPlaces(e.target.value)}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
              <input type="number" value={sortOrder} onChange={(e: any) => setSortOrder(e.target.value)}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
            </div>
            <Can permission={editing ? 'currencies.edit' : 'currencies.create'}>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Symbol</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Decimals</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {currencies.map((c: any) => (
              <tr key={c.id} className={`hover:bg-[var(--color-bg)]/30 ${editing?.id === c.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                <td className="px-4 py-3 font-mono font-semibold text-[var(--color-text)]">{c.code}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">{c.name}</td>
                <td className="px-4 py-3 text-lg">{c.symbol}</td>
                <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{c.decimal_places}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${c.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                    <Button variant="ghost" onClick={() => setDeleteId(c.id)}
                      className="text-[var(--color-error)]">Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!currencies.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No currencies found</p>}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Currency">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={() => deleteMutation.mutate(deleteId!)} loading={deleteMutation.isPending}
            className="bg-[var(--color-error)] text-white">Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
