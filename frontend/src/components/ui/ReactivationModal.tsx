import { useState } from 'react';
import { Modal } from './Modal';
import { authApi } from '../../services/api';
import { useToast } from './Toast';

interface ReactivationModalProps {
  open: boolean;
  onClose: () => void;
  phoneNumber: string;
  email: string;
  countryId: number;
}

export function ReactivationModal({ open, onClose, phoneNumber, email, countryId }: ReactivationModalProps) {
  const [sending, setSending] = useState(false);
  const { showToast } = useToast();

  const handleSend = async () => {
    setSending(true);
    try {
      await authApi.requestReactivation({ phoneNumber, email, countryId });
      showToast('Your reactivation request has been submitted', 'success');
      onClose();
    } catch {
      showToast('Failed to send request. Please try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Account Reactivation" size="sm">
      <p className="text-sm text-[var(--color-text-muted)] mb-6">
        This account already exists but is currently inactive. Would you like to send a reactivation request? An admin will review and activate your account.
      </p>
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={onClose}
          disabled={sending}
          className="px-4 py-2 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-bg)] text-[var(--color-text)] disabled:opacity-40 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleSend}
          disabled={sending}
          className="px-4 py-2 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all"
        >
          {sending ? 'Sending...' : 'Send Reactivation Request'}
        </button>
      </div>
    </Modal>
  );
}
