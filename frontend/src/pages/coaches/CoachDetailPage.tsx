import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { localTodayString } from '../../utils/formatDate';
import { useAuthStore } from '../../store/auth.store';
import { useToast } from '../../components/ui/Toast';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { Can } from '../../permissions/Can';
import { SkeletonRow, Button } from '../../components/ui';
import { SessionTimeline } from '../../components/workspace';

export default function CoachDetailPage() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const engineEnabled = useFeatureFlag('coaching.engine_booking_enabled');

  const { data: coach, isLoading } = useQuery({
    queryKey: ['coach', id],
    queryFn: () => api.get(`/coaches/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqDate, setReqDate] = useState(localTodayString());
  const [reqStart, setReqStart] = useState('10:00');
  const [reqEnd, setReqEnd] = useState('11:00');
  const today = localTodayString();

  const requestMutation = useMutation({
    mutationFn: () => api.post('/coach-sessions/request', {
      coachId: Number(id),
      startTime: `${reqDate}T${reqStart}:00`,
      endTime: `${reqDate}T${reqEnd}:00`,
    }),
    onSuccess: () => {
      setShowRequestModal(false);
      showToast('Session request sent!');
      qc.invalidateQueries({ queryKey: ['coach', id] });
      qc.invalidateQueries({ queryKey: ['my-coach-sessions'] });
      refetchActiveSession();
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Request failed', 'error'),
  });

  const isOwn = user?.isCoach && coach?.user_id === user.id;
  const chatEnabled = useFeatureFlag('community.chat_enabled');

  const { data: activeSessionData, refetch: refetchActiveSession } = useQuery({
    queryKey: ['my-coach-sessions', id],
    queryFn: () => api.get(`/coach-sessions/${id}`).then((r) => r.data).catch(() => null),
    enabled: !!id && !isOwn,
  });
  const activeSession = activeSessionData?.session;

  const reviewMutation = useMutation({
    mutationFn: () => api.post(`/coaches/${id}/reviews`, { rating, reviewText: reviewText.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coach', id] });
      setReviewText('');
      setRating(5);
      showToast('Review submitted. Thank you!');
    },
    onError: (err) => showToast('Failed to submit review: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error'),
  });

  if (isLoading) {
    return <div className="py-8"><SkeletonRow count={4} /></div>;
  }

  if (!coach) {
    return <div className="text-center py-20 text-[var(--color-text-muted)]">Coach not found</div>;
  }

  const certs = Array.isArray(coach.certifications) ? coach.certifications
    : typeof coach.certifications === 'string' ? JSON.parse(coach.certifications) : [];

  const bookLink = engineEnabled
    ? `/coaches/book/session?coachId=${id}`
    : `/coaches/${id}/book`;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center text-2xl font-bold text-[var(--color-primary)]">
            {coach.full_name?.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--color-text)]">{coach.full_name}</h1>
              {coach.is_available && <span className="text-xs bg-[var(--color-success-bg)] text-[var(--color-success-text)] px-2 py-0.5 rounded-full">Available</span>}
              {isOwn && <span className="text-xs text-[var(--color-primary)] font-medium">You</span>}
            </div>
            {coach.bio && <p className="text-sm text-[var(--color-text-muted)] mt-1">{coach.bio}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm mb-4">
          {coach.hourly_rate && (
            <div className="bg-[var(--color-bg)] px-3 py-1.5 rounded-[var(--radius-md)]">
              <span className="text-[var(--color-text-muted)]">Rate: </span>
              <span className="font-medium text-[var(--color-text)]">{formatPrice(Number(coach.hourly_rate))}/hr</span>
            </div>
          )}
          {coach.experience_years > 0 && (
            <div className="bg-[var(--color-bg)] px-3 py-1.5 rounded-[var(--radius-md)]">
              <span className="text-[var(--color-text-muted)]">Experience: </span>
              <span className="font-medium text-[var(--color-text)]">{coach.experience_years} years</span>
            </div>
          )}
          {coach.rating_avg > 0 && (
            <div className="bg-[var(--color-bg)] px-3 py-1.5 rounded-[var(--radius-md)]">
              <span className="text-[var(--color-text-muted)]">Rating: </span>
              <span className="font-medium text-[var(--color-text)]">{Number(coach.rating_avg).toFixed(1)} ★ ({coach.rating_count})</span>
            </div>
          )}
        </div>

        {!isOwn && (
          <div className="flex flex-wrap gap-2">
            <Can permission="coaches.book">
              <button
                onClick={() => setShowRequestModal(true)}
                className="inline-block px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium"
              >
                Request Session
              </button>
            </Can>
            <Link
              to={bookLink}
              className="inline-block px-6 py-2.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-bg)]"
            >
              Book a Court
            </Link>
            {chatEnabled && coach.user_id && (
              <Can permission="community.chat.view">
                <Link
                  to={`/messages?with=${coach.user_id}`}
                  className="inline-block px-6 py-2.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-bg)]"
                >
                  Message
                </Link>
              </Can>
            )}
          </div>
        )}

        {/* Session timeline for existing sessions with this coach */}
        {activeSession && (
          <div className="mt-4">
            <SessionTimeline events={activeSession.timeline || []} title="Session Timeline" />
          </div>
        )}
      </div>

      {/* Request Session Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowRequestModal(false)}>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-text)] mb-4">Request a Session</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Date</label>
                <input type="date" value={reqDate} min={today} onChange={(e) => setReqDate(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Start Time</label>
                  <input type="time" value={reqStart} onChange={(e) => setReqStart(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1">End Time</label>
                  <input type="time" value={reqEnd} onChange={(e) => setReqEnd(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
              </div>
              <Button
                variant="primary"
                className="w-full"
                loading={requestMutation.isPending}
                onClick={() => {
                  if (!reqDate || !reqStart || !reqEnd) { showToast('Please fill in all fields', 'error'); return; }
                  requestMutation.mutate();
                }}
              >
                Send Request
              </Button>
            </div>
          </div>
        </div>
      )}

      {certs.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-6 mb-6">
          <h2 className="font-semibold text-[var(--color-text)] mb-3">Certifications</h2>
          <div className="space-y-2">
            {certs.map((c: any, i: number) => (
              <div key={i} className="text-sm flex items-center gap-2">
                <span className="text-[var(--color-success)]">✓</span>
                {typeof c === 'string' ? (
                  <span className="text-[var(--color-text)]">{c}</span>
                ) : c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">{c.name}</a>
                ) : (
                  <span className="text-[var(--color-text)]">{c.name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {coach.agreements?.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-6 mb-6">
          <h2 className="font-semibold text-[var(--color-text)] mb-3">Partner Organisations</h2>
          <div className="space-y-2">
            {coach.agreements.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--color-text)]">{a.organisation_name || `Organisation #${a.organisation_id}`}</span>
                  {a.hourly_rate != null && (
                    <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] px-2 py-0.5 rounded-full">
                      {formatPrice(Number(a.hourly_rate))}/hr
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isOwn && (
        <Can permission="coaches.reviews.create">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-6 mt-6">
            <h2 className="font-semibold text-[var(--color-text)] mb-3">Leave a Review</h2>
            <div className="flex items-center gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  className={`text-2xl leading-none ${star <= rating ? 'text-yellow-400' : 'text-[var(--color-text-muted)]'}`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share your experience with this coach (optional)"
              rows={3}
              maxLength={1000}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)] mb-3"
            />
            <button
              type="button"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate()}
              className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50"
            >
              {reviewMutation.isPending ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>
        </Can>
      )}
    </div>
  );
}
