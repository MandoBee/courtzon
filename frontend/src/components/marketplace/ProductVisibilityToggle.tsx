import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../ui/Toast';
import api from '../../services/api';
import { Can } from '../../permissions/Can';

/**
 * Seller/Organisation Marketplace-visibility control for their own products.
 * Independent of approval status: only Active products can be shown; hiding is
 * always allowed. Pending/rejected products show a disabled hint instead.
 */
export function ProductVisibilityToggle({ product }: { product: any }) {
  const { showToast } = useToast();
  const qc = useQueryClient();

  const visible = Number(product.marketplace_visible) === 1;
  const isActive = product.status === 'active';

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      api.put(`/marketplace/products/${product.id}/visibility`, { visible: next }).then((r) => r.data),
    onSuccess: () => {
      // Refresh every management surface + admin/product-detail caches.
      qc.invalidateQueries({ queryKey: ['mp-seller-products'] });
      qc.invalidateQueries({ queryKey: ['mp-seller-stats'] });
      qc.invalidateQueries({ queryKey: ['org-products'] });
      qc.invalidateQueries({ queryKey: ['admin-marketplace-products'] });
      qc.invalidateQueries({ queryKey: ['admin-product'] });
      showToast(visible ? 'Hidden from Marketplace' : 'Visible in Marketplace');
    },
    onError: (e: any) => showToast(e?.message || 'Failed to update visibility', 'error'),
  });

  if (!isActive) {
    return (
      <span
        className="text-[11px] text-[var(--color-text-muted)]"
        title="Product must be approved before it can appear in the Marketplace."
      >
        Awaiting approval
      </span>
    );
  }

  return (
    <Can permission="marketplace.seller.visibility">
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(!visible)}
        className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors disabled:opacity-50 ${
          visible
            ? 'text-[var(--color-success-text)] border-[var(--color-success)]/40 bg-[var(--color-success-bg)]'
            : 'text-[var(--color-text-muted)] border-[var(--color-border)] bg-[var(--color-bg)]'
        }`}
        title={visible ? 'Visible in Marketplace' : 'Hidden from Marketplace'}
      >
        {visible ? 'Visible' : 'Hidden'}
      </button>
    </Can>
  );
}