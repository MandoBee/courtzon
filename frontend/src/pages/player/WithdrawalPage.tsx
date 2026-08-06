import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Modal } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { getErrorMessage } from '../../utils/errors';

const REASONS = [
  'Closing my account',
  'No longer using CourtZon',
  'Incorrect deposit',
  'Refund request',
  'Switching to another platform',
  'Other',
];

export default function WithdrawalPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet', 'me'],
    queryFn: () => api.get('/wallets/me').then(r => r.data?.data || r.data),
  });

  const { data: withdrawals } = useQuery({
    queryKey: ['my-withdrawals'],
    queryFn: () => api.get('/withdrawals/me').then(r => r.data?.data || []),
  });

  const submitMutation = useMutation({
    mutationFn: (data: any) => api.post('/withdrawals', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
      qc.invalidateQueries({ queryKey: ['my-withdrawals'] });
      setShowModal(false);
      setAmount(''); setReason(''); setNotes('');
      showToast('Withdrawal request submitted!');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const available = wallet ? Number(wallet.balance || 0) - Number(wallet.reserved_balance || 0) : 0;

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-800', under_review: 'bg-blue-100 text-blue-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800', processing: 'bg-purple-100 text-purple-800', completed: 'bg-green-200 text-green-900', cancelled: 'bg-gray-200 text-gray-700' };
    return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${map[s] || 'bg-gray-100'}`}>{s.replace(/_/g, ' ')}</span>;
  };

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-xl font-bold">Withdraw Funds</h1>
      <Card className="p-4 space-y-2">
        <div className="text-sm text-muted">Available Balance</div>
        <div className="text-2xl font-bold">{walletLoading ? '...' : formatPrice(available)}</div>
        {wallet && Number(wallet.reserved_balance) > 0 && <div className="text-xs text-muted">Reserved: {formatPrice(Number(wallet.reserved_balance))}</div>}
        <Button onClick={() => setShowModal(true)} disabled={available <= 0} className="mt-2">Request Withdrawal</Button>
      </Card>

      <h2 className="text-lg font-semibold">Withdrawal History</h2>
      {!withdrawals?.length ? <Card className="p-4 text-sm text-muted text-center">No withdrawal requests yet.</Card> : (
        <div className="space-y-3">
          {withdrawals.map((w: any) => (
            <Card key={w.id} className="p-4 flex justify-between items-start">
              <div>
                <div className="font-medium">{formatPrice(Number(w.amount))}</div>
                <div className="text-xs text-muted">{w.reason}</div>
                <div className="text-xs text-muted">{new Date(w.created_at).toLocaleDateString('en-GB')}</div>
              </div>
              <div className="text-right">
                {statusBadge(w.status)}
                {w.status === 'completed' && w.execution_method && <div className="text-xs text-muted mt-1">{w.execution_method}</div>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Request Withdrawal" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Amount</label>
            <input type="number" step="0.01" min="0" max={available} value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 rounded border text-sm" placeholder="0.00" />
            <div className="text-xs text-muted mt-1">Available: {formatPrice(available)}</div>
          </div>
          <div>
            <label className="block text-sm mb-1">Reason *</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 rounded border text-sm">
              <option value="">Select reason...</option>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Notes {reason === 'Other' ? '*' : ''}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded border text-sm" placeholder="Additional details..." />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => submitMutation.mutate({ amount: Number(amount), reason, playerNotes: notes || undefined })} loading={submitMutation.isPending} disabled={!amount || !reason || (reason === 'Other' && !notes) || Number(amount) > available}>Submit</Button>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
