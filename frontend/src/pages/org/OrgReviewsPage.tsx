import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { EntityImage } from '../../components/ui';
import { Can } from '../../permissions/Can';

export default function OrgReviewsPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['org-reviews', orgId],
    queryFn: () => api.get(`/org/${orgId}/reviews`).then((r) => r.data),
    enabled: !!orgId,
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;

  const reviews: any[] = data?.reviews || [];
  const summary = data?.summary || { review_count: 0, average_rating: 0 };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < Math.round(rating) ? 'text-amber-400' : 'text-[var(--color-border)]'}>&#9733;</span>
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Reviews</h1>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)] text-center">
        <div className="text-4xl font-bold text-[var(--color-text)]">{summary.average_rating}</div>
        <div className="text-lg mt-1">{renderStars(summary.average_rating)}</div>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">{summary.review_count} review{summary.review_count !== 1 ? 's' : ''}</p>
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No reviews yet.</p>
      ) : (
        <div className="grid gap-3">
          {reviews.map((r: any) => (
            <div key={r.id} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
              <div className="flex items-start gap-3">
                <EntityImage src={r.user_avatar} name={r.user_name || 'User'} className="w-9 h-9 rounded-full text-sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-[var(--color-text)]">{r.user_name || 'Anonymous'}</p>
                    <div className="text-sm">{renderStars(r.rating)}</div>
                  </div>
                  {r.comment && <p className="text-sm text-[var(--color-text)] mt-1">{r.comment}</p>}
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                    {r.status ? ` · ${r.status}` : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
