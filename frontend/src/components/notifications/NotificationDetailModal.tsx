import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui';
import { useToast } from '../ui/Toast';
import { notificationsApi } from '../../services/notifications';
import api from '../../services/api';
import { formatDateTime } from '../../utils/formatDate';

export interface AppNotification {
  id: number;
  title: string;
  body?: string | null;
  icon?: string | null;
  created_at: string;
  is_read?: boolean;
  type?: string | null;
  priority?: string | null;
  category_slug?: string | null;
  action_key?: string | null;
  action_payload?: Record<string, unknown> | null;
}

interface NotificationDetailModalProps {
  notification: AppNotification | null;
  open: boolean;
  onClose: () => void;
}

export default function NotificationDetailModal({
  notification,
  open,
  onClose,
}: NotificationDetailModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!open) setApplied(false);
  }, [open, notification?.id]);

  useEffect(() => {
    if (!open || !notification || notification.is_read) return;
    notificationsApi.markAsRead(notification.id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
  }, [open, notification, queryClient]);

  const applyMutation = useMutation({
    mutationFn: async (bookingId: number) => {
      const res = await api.post(`/bookings/${bookingId}/apply`);
      return res.data;
    },
    onSuccess: () => {
      setApplied(true);
      showToast('Applied! The booking owner will review your request.', 'success');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['public-matches'] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to apply', 'error');
    },
  });

  if (!notification) return null;

  const bookingId = notification.action_payload?.bookingId as number | undefined;
  const categoryLabel = notification.category_slug
    ? notification.category_slug.replace(/_/g, ' ')
    : null;

  return (
    <Modal open={open} onClose={onClose} title={notification.title} size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0 leading-none">{notification.icon || '📬'}</span>
          <div className="min-w-0 flex-1 space-y-2">
            {categoryLabel && (
              <span className="inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)]">
                {categoryLabel}
              </span>
            )}
            {notification.body ? (
              <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
                {notification.body}
              </p>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No additional details.</p>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              {formatDateTime(notification.created_at)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)]"
          >
            Close
          </button>

          {notification.action_key === 'view_matchmaking_booking' && bookingId && (
            <>
              {!applied ? (
                <button
                  type="button"
                  onClick={() => applyMutation.mutate(bookingId)}
                  disabled={applyMutation.isPending}
                  className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50"
                >
                  Apply to match
                </button>
              ) : (
                <span className="px-3 py-2 text-sm text-[var(--color-success-text)] font-medium">
                  Applied
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/matches');
                }}
                className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
              >
                Browse matches
              </button>
            </>
          )}

          {notification.action_key === 'view_coupon' && (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/app');
              }}
              className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90"
            >
              Go to dashboard
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
