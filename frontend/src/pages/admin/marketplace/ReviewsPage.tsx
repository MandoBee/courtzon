import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-reviews', page, limit],
    queryFn: () => api.get('/marketplace/admin/reviews', { params: { page, limit } }).then((r: any) => r.data),
  });

  const deleteReview = useMutation({
    mutationFn: (id: number) => api.delete(`/marketplace/admin/reviews/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-marketplace-reviews'] }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Product Reviews</h1>
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-[var(--color-bg)]/50"><th className="text-left px-4 py-3">Product</th><th className="text-left px-4 py-3">User</th><th className="text-left px-4 py-3">Rating</th><th className="text-left px-4 py-3">Review</th><th className="text-left px-4 py-3">Date</th><th className="text-right px-4 py-3">Actions</th></tr></thead>
          <tbody className="divide-y">
            {data?.data?.map((r: any) => (
              <tr key={r.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium">{r.product_name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.user_name}</td>
                <td className="px-4 py-3">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</td>
                <td className="px-4 py-3 max-w-xs truncate">{r.review_text || '—'}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { if (confirm('Delete this review?')) deleteReview.mutate(r.id); }} className="text-xs text-red-500">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
          <select value={limit} onChange={(e: any) => { setLimit(Number(e.target.value)); setPage(1); }} className="px-2 py-1 text-xs rounded border">
            {[10, 20, 50, 100].map((n: any) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {data && data.total > limit && (
          <div className="flex items-center gap-3">
            <button onClick={() => setPage((p: any) => Math.max(1, p - 1))} disabled={page <= 1} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Previous</button>
            <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {Math.ceil(data.total / limit)}</span>
            <button onClick={() => setPage((p: any) => p + 1)} disabled={page >= Math.ceil(data.total / limit)} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Next</button>
          </div>
        )}
        {data && <span className="text-xs text-[var(--color-text-muted)]">{data.total} total</span>}
      </div>
    </div>
  );
}
