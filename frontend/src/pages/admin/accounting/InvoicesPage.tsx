import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner, Pagination } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { localToday } from '../../../utils/dateRange';

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
}

interface Invoice {
  id: number;
  invoice_number: string;
  type: 'sales' | 'purchase' | 'credit_note' | 'debit_note';
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  organisation_name?: string;
  user_name?: string;
  issue_date: string;
  due_date: string;
  total: number;
  items?: InvoiceLineItem[];
}

const TYPE_BADGE: Record<string, string> = {
  sales: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  purchase: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  credit_note: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  debit_note: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  issued: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [payModal, setPayModal] = useState<number | null>(null);
  const [cancelModal, setCancelModal] = useState<number | null>(null);
  const [form, setForm] = useState({ organisation_id: '', user_id: '', issue_date: localToday(), due_date: '', type: 'sales' as string });
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([{ description: '', quantity: 1, unit_price: 0, tax_rate: 0, total: 0 }]);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'invoices', page, pageSize],
    queryFn: () => api.get('/admin/accounting/invoices', { params: { page, pageSize } }).then((r: any) => r.data),
  });

  const { data: orgs } = useQuery({
    queryKey: ['organisations', 'list-minimal'],
    queryFn: () => api.get('/organisations', { params: { limit: 200 } }).then((r: any) => r.data.data || r.data),
  });

  const { data: users } = useQuery({
    queryKey: ['users', 'list-minimal'],
    queryFn: () => api.get('/users', { params: { limit: 200 } }).then((r: any) => r.data.data || r.data),
  });

  const invoices: Invoice[] = data?.data || [];
  const total = data?.total || 0;
  const orgList: any[] = Array.isArray(orgs) ? orgs : orgs?.data || [];
  const userList: any[] = Array.isArray(users) ? users : users?.data || [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/accounting/invoices', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] }); resetForm(); showToast('Invoice created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const issueMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/accounting/invoices/${id}/issue`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] }); showToast('Invoice issued!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/accounting/invoices/${id}/record-payment`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] }); setPayModal(null); showToast('Payment recorded!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/accounting/invoices/${id}/cancel`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] }); setCancelModal(null); showToast('Invoice cancelled!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => {
    setShowForm(false);
    setForm({ organisation_id: '', user_id: '', issue_date: localToday(), due_date: '', type: 'sales' });
    setLineItems([{ description: '', quantity: 1, unit_price: 0, tax_rate: 0, total: 0 }]);
  };

  const addLineItem = () => setLineItems([...lineItems, { description: '', quantity: 1, unit_price: 0, tax_rate: 0, total: 0 }]);

  const updateLineItem = (idx: number, field: keyof InvoiceLineItem, value: any) => {
    const updated = lineItems.map((li, i) => {
      if (i !== idx) return li;
      const next = { ...li, [field]: value };
      const qty = Number(next.quantity) || 1;
      const price = Number(next.unit_price) || 0;
      const tax = Number(next.tax_rate) || 0;
      next.total = qty * price * (1 + tax / 100);
      return next;
    });
    setLineItems(updated);
  };

  const removeLineItem = (idx: number) => { if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx)); };

  const grandTotal = lineItems.reduce((s, li) => s + li.total, 0);

  const handleCreate = () => {
    if (!form.organisation_id && !form.user_id) { showToast('Select an organisation or user', 'error'); return; }
    if (!form.due_date) { showToast('Due date is required', 'error'); return; }
    const hasEmptyDesc = lineItems.some(li => !li.description);
    if (hasEmptyDesc) { showToast('All line items need a description', 'error'); return; }
    createMutation.mutate({
      organisationId: form.organisation_id ? Number(form.organisation_id) : null,
      userId: form.user_id ? Number(form.user_id) : null,
      issueDate: form.issue_date,
      dueDate: form.due_date,
      type: form.type,
      items: lineItems.map(li => ({ description: li.description, quantity: Number(li.quantity), unitPrice: Number(li.unit_price), taxRate: Number(li.tax_rate) })),
    });
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

  return (
    <Can permission="accounting.invoices.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Invoices</h1>
          <Can permission="accounting.invoices.manage">
            <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Invoice</Button>
          </Can>
        </div>

        {showForm && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">New Invoice</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="sales">Sales</option>
                  <option value="purchase">Purchase</option>
                  <option value="credit_note">Credit Note</option>
                  <option value="debit_note">Debit Note</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Issue Date *</label>
                <input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Due Date *</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div></div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Organisation</label>
                <select value={form.organisation_id} onChange={e => setForm({ ...form, organisation_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">None</option>
                  {orgList.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">User</label>
                <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">None</option>
                  {userList.map((u: any) => <option key={u.id} value={u.id}>{u.full_name || u.name}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--color-text)]">Line Items</span>
                <Button type="button" variant="ghost" onClick={addLineItem}>+ Add Item</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                      <th className="text-left px-2 py-2">Description</th>
                      <th className="text-right px-2 py-2 w-20">Qty</th>
                      <th className="text-right px-2 py-2 w-24">Unit Price</th>
                      <th className="text-right px-2 py-2 w-20">Tax %</th>
                      <th className="text-right px-2 py-2 w-24">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, idx) => (
                      <tr key={idx} className="border-b border-[var(--color-border)]">
                        <td className="px-2 py-2">
                          <input value={li.description} onChange={e => updateLineItem(idx, 'description', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min="1" value={li.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs text-right" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.01" min="0" value={li.unit_price} onChange={e => updateLineItem(idx, 'unit_price', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs text-right" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.1" min="0" value={li.tax_rate} onChange={e => updateLineItem(idx, 'tax_rate', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs text-right" />
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-mono text-[var(--color-text)]">{fmt(li.total)}</td>
                        <td className="px-2 py-2">
                          <button type="button" onClick={() => removeLineItem(idx)} disabled={lineItems.length <= 1}
                            className="text-xs text-[var(--color-error)] disabled:opacity-30">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-2 text-sm font-semibold text-[var(--color-text)]">
                Grand Total: {fmt(grandTotal)}
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleCreate} loading={createMutation.isPending}>Create Invoice</Button>
              <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
          {isLoading ? <Spinner /> : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Invoice #</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Issue Date</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Due Date</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Total</th>
                    <Can permission="accounting.invoices.manage">
                      <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                    </Can>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-[var(--color-bg)]/30">
                      <td className="px-4 py-3">
                        <button onClick={() => setDetail(inv)} className="text-sm font-medium text-[var(--color-primary)] hover:underline">{inv.invoice_number}</button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${TYPE_BADGE[inv.type] || ''}`}>{inv.type.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_BADGE[inv.status] || ''}`}>{inv.status}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text)]">{inv.organisation_name || inv.user_name || '-'}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{fmtDate(inv.issue_date)}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{fmt(inv.total)}</td>
                      <Can permission="accounting.invoices.manage">
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {inv.status === 'draft' && (
                              <button onClick={() => issueMutation.mutate(inv.id)} className="text-xs text-[var(--color-primary)] hover:underline">Issue</button>
                            )}
                            {inv.status === 'issued' && (
                              <>
                                <button onClick={() => setPayModal(inv.id)} className="text-xs text-green-600 hover:underline">Record Payment</button>
                                <button onClick={() => setCancelModal(inv.id)} className="text-xs text-red-500 hover:underline">Cancel</button>
                              </>
                            )}
                          </div>
                        </td>
                      </Can>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!invoices.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No invoices found</p>}
              <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </div>

        <Modal open={detail !== null} onClose={() => setDetail(null)} title={`Invoice ${detail?.invoice_number || ''}`}>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-[var(--color-text-muted)]">Status:</span> <span className="font-medium">{detail.status}</span></div>
                <div><span className="text-[var(--color-text-muted)]">Type:</span> <span className="font-medium">{detail.type}</span></div>
                <div><span className="text-[var(--color-text-muted)]">Issue Date:</span> <span>{fmtDate(detail.issue_date)}</span></div>
                <div><span className="text-[var(--color-text-muted)]">Due Date:</span> <span>{fmtDate(detail.due_date)}</span></div>
              </div>
              {detail.items && detail.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Line Items</h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                        <th className="text-left px-2 py-1">Description</th>
                        <th className="text-right px-2 py-1">Qty</th>
                        <th className="text-right px-2 py-1">Price</th>
                        <th className="text-right px-2 py-1">Tax</th>
                        <th className="text-right px-2 py-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((li, i) => (
                        <tr key={i} className="border-b border-[var(--color-border)]">
                          <td className="px-2 py-1">{li.description}</td>
                          <td className="px-2 py-1 text-right">{li.quantity}</td>
                          <td className="px-2 py-1 text-right">{fmt(li.unit_price)}</td>
                          <td className="px-2 py-1 text-right">{li.tax_rate}%</td>
                          <td className="px-2 py-1 text-right font-mono">{fmt(li.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-right text-sm font-semibold text-[var(--color-text)]">Total: {fmt(detail.total)}</div>
            </div>
          )}
        </Modal>

        <Modal open={payModal !== null} onClose={() => setPayModal(null)} title="Record Payment">
          <p className="text-sm text-[var(--color-text-muted)] mb-6">Mark this invoice as paid?</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setPayModal(null)}>Cancel</Button>
            <Button onClick={() => payMutation.mutate(payModal!)} loading={payMutation.isPending}
              className="bg-green-600 text-white">Record Payment</Button>
          </div>
        </Modal>

        <Modal open={cancelModal !== null} onClose={() => setCancelModal(null)} title="Cancel Invoice">
          <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure you want to cancel this invoice?</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setCancelModal(null)}>No</Button>
            <Button onClick={() => cancelMutation.mutate(cancelModal!)} loading={cancelMutation.isPending}
              className="bg-red-600 text-white">Yes, Cancel</Button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}
