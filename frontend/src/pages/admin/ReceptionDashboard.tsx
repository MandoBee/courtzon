import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { SkeletonRow } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

export default function ReceptionDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const { data: todayBookings, isLoading } = useQuery({
    queryKey: ['reception', 'today', today],
    queryFn: () => api.get('/admin/bookings', { params: { date: today, status: 'confirmed' } }).then(r => r.data?.data || r.data?.rows || []),
  });

  const { data: pendingPayments } = useQuery({
    queryKey: ['reception', 'pending-payments'],
    queryFn: () => api.get('/admin/withdrawal-requests').then(r => r.data?.data || []),
  });

  const checkIn = useMutation({
    mutationFn: (bookingId: number) => api.post(`/bookings/${bookingId}/check-in`),
    onSuccess: () => showToast('Checked in!', 'success'),
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  const doSearch = async () => {
    if (!search.trim()) return;
    try {
      const [userRes, bookingRes] = await Promise.all([
        api.get('/admin/users', { params: { search: search.trim(), limit: 5 } }),
        api.get('/admin/bookings', { params: { search: search.trim(), limit: 5 } }),
      ]);
      setSearchResults([
        ...((userRes.data?.data || userRes.data?.rows || []).map((u: any) => ({ ...u, _type: 'user' }))),
        ...((bookingRes.data?.data || bookingRes.data?.rows || []).map((b: any) => ({ ...b, _type: 'booking' }))),
      ]);
    } catch { showToast('Search failed', 'error'); }
  };

  const bookings = Array.isArray(todayBookings) ? todayBookings : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">Reception Desk</h1>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'New Booking', icon: '📅', onClick: () => navigate('/browse') },
          { label: 'Quick Check-in', icon: '✅', onClick: () => document.getElementById('search-input')?.focus() },
          { label: 'Cash Payment', icon: '💵', onClick: () => navigate('/admin/finance') },
          { label: 'Player Lookup', icon: '🔍', onClick: () => document.getElementById('search-input')?.focus() },
        ].map((a, i) => (
          <button key={i} onClick={a.onClick} className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl hover:shadow-md transition-shadow">
            <span>{a.icon}</span><span>{a.label}</span>
          </button>
        ))}
      </div>

      {/* Quick Search */}
      <div className="flex gap-2">
        <input id="search-input" type="text" placeholder="Search players, bookings..." value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
          className="flex-1 px-4 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" />
        <button onClick={doSearch} className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-xl">Search</button>
      </div>

      {searchResults && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-2">
          <div className="flex justify-between"><h3 className="text-sm font-semibold">Results</h3><button onClick={() => setSearchResults(null)} className="text-xs text-[var(--color-text-muted)]">Clear</button></div>
          {searchResults.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No results.</p> : searchResults.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-[var(--color-border)] last:border-0">
              <div><span className="font-medium">{r.full_name || r.name || `ID ${r.id}`}</span><span className="text-[var(--color-text-muted)] ml-2">({r._type})</span></div>
              {r._type === 'booking' && <button onClick={() => checkIn.mutate(r.id)} className="text-[var(--color-primary)] hover:underline">Check In</button>}
            </div>
          ))}
        </div>
      )}

      {/* Today's Schedule */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Today's Schedule ({bookings.length})</h2>
        {isLoading ? <SkeletonRow count={4} /> : bookings.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No bookings today.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
              <th className="text-left px-3 py-2">Time</th><th className="text-left px-3 py-2">Player</th><th className="text-left px-3 py-2">Court</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2"></th>
            </tr></thead>
            <tbody>{bookings.slice(0, 20).map((b: any) => (
              <tr key={b.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-3 py-2 text-xs">{b.start_time}–{b.end_time}</td>
                <td className="px-3 py-2 text-xs font-medium">{b.user_name || `User #${b.user_id}`}</td>
                <td className="px-3 py-2 text-xs">{b.resource_name || `Court #${b.resource_id}`}</td>
                <td className="px-3 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${b.booking_status === 'confirmed' ? 'bg-blue-100 text-blue-700' : b.booking_status === 'checked_in' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{b.booking_status}</span></td>
                <td className="px-3 py-2">
                  {b.booking_status === 'confirmed' && <button onClick={() => checkIn.mutate(b.id)} className="text-xs text-[var(--color-primary)] hover:underline">Check In</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {/* Action Center */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Pending Payments</h3>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{Array.isArray(pendingPayments) ? pendingPayments.filter((p: any) => p.status === 'pending').length : '—'}</p>
          <button onClick={() => navigate('/admin/withdrawal-requests')} className="text-xs text-[var(--color-primary)] hover:underline mt-2">View All</button>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Today's Arrivals</h3>
          <p className="text-2xl font-bold text-blue-600 mt-1">{bookings.length}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Checked In</h3>
          <p className="text-2xl font-bold text-green-600 mt-1">{bookings.filter((b: any) => b.booking_status === 'checked_in').length}</p>
        </div>
      </div>
    </div>
  );
}
