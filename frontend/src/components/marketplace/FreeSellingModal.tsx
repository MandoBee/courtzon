import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { Can } from '../../permissions/Can';
import api from '../../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FreeSellingModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const activate = useMutation({
    mutationFn: () => api.post('/marketplace/player/activate').then((r) => r.data),
    onSuccess: () => {
      showToast('Free selling activated! You can now list up to 5 products.');
      onClose();
      navigate('/marketplace/player/products');
    },
    onError: (err) => {
      showToast('Failed to activate: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Start Free Selling" size="lg">
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Rules & Conditions</h3>
          <ul className="space-y-2 text-sm text-[var(--color-text-muted)]">
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-[var(--color-text)]">Free Plan</strong> — No subscription fees or upfront costs required.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-[var(--color-text)]">5 Product Limit</strong> — List up to 5 items at any time.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-[var(--color-text)]">Direct Contact</strong> — Buyers reach you directly via phone. No in-app payment processing.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-[var(--color-text)]">Phone Display</strong> — Your phone number will be visible on your listings.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-[var(--color-text)]">Accurate Listings</strong> — Items must be listed with accurate descriptions and condition status.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-[var(--color-text)]">Policy Compliance</strong> — All listings must comply with marketplace policies and guidelines.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-[var(--color-text)]">Verified Account</strong> — You need a verified account to start selling.</span>
            </li>
          </ul>
        </div>

        <div className="bg-[var(--color-info-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 text-sm text-[var(--color-info-text)]">
          By activating, you agree to the marketplace terms of service and confirm that all items you list will be accurately described.
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={activate.isPending}
            className="flex-1 px-4 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-bg)] transition-all text-[var(--color-text)]"
          >
            Cancel
          </button>
          <Can permission="marketplace.sell">
            <button
              type="button"
              onClick={() => activate.mutate()}
              disabled={activate.isPending}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all"
            >
              {activate.isPending ? 'Activating...' : 'Activate Free Selling'}
            </button>
          </Can>
        </div>
      </div>
    </Modal>
  );
}
