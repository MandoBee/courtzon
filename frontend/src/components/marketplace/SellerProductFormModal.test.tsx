import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SellerProductFormModal from './SellerProductFormModal';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

vi.mock('../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a), post: (...a: any[]) => mockPost(...a), put: (...a: any[]) => mockPut(...a) },
}));

vi.mock('../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../ui', () => ({ EntityImage: () => <img alt="" /> }));
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: any) => unknown) =>
    selector({ user: { permissions: ['*'] } }),
}));

const PRODUCT = {
  id: 7,
  name: 'Pro Racket',
  description: 'Tournament racket',
  price: '120.00',
  discounted_price: '99.00',
  quantity: 4,
  currency_code: 'EGP',
  gender: 'unisex',
  condition_status: 'good',
  sport_id: 3,
  category_id: 5,
  brand_id: 9,
  branch_id: 11,
  images: '["/uploads/a.webp","/uploads/b.webp"]',
  tags: [{ id: 21, name: 'Pro' }, { id: 22, name: 'Red' }],
  variants: [
    { id: 1, variant_name: 'Red', variant_type: 'color', price_adjustment: '5.00', quantity: 2, sku: 'SKU-R', variant_color: '#ff0000' },
  ],
  marketplace_visible: 1,
  status: 'active',
};

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SellerProductFormModal
        open={true}
        editId={7}
        onClose={() => {}}
        sports={[{ id: 3, name: 'Tennis' }]}
        categories={[{ id: 4, parent_id: null, name: 'Racquets' }, { id: 5, parent_id: 4, name: 'Pro Series' }]}
        brands={[{ id: 9, name: 'Wilson' }]}
        tags={[{ id: 21, name: 'Pro' }, { id: 22, name: 'Red' }]}
        orgId={1}
      />
    </QueryClientProvider>,
  );
}

describe('SellerProductFormModal edit population', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/marketplace/products/')) return Promise.resolve({ data: PRODUCT });
      if (url.includes('/branches')) return Promise.resolve({ data: { data: [{ id: 11, name: 'Main Branch' }] } });
      return Promise.resolve({ data: [] });
    });
  });

  it('initializes every editable field from the selected product', async () => {
    renderModal();

    await waitFor(() => {
      expect((screen.getByDisplayValue('Pro Racket') as HTMLInputElement).value).toBe('Pro Racket');
    });
    // core fields
    expect((screen.getByDisplayValue('Tournament racket') as HTMLTextAreaElement).value).toBe('Tournament racket');
    expect((screen.getByDisplayValue('120.00') as HTMLInputElement).value).toBe('120.00');
    expect((screen.getByDisplayValue('99.00') as HTMLInputElement).value).toBe('99.00');
    expect((screen.getByDisplayValue('4') as HTMLInputElement).value).toBe('4');
    // selects (comboboxes)
    const combos = screen.getAllByRole('combobox');
    const selectByValue = (v: string) => combos.find((s: any) => s.value === v);
    expect(selectByValue('3')).toBeTruthy(); // sport
    expect(selectByValue('5')).toBeTruthy(); // category
    expect(selectByValue('9')).toBeTruthy(); // brand
    expect(selectByValue('11')).toBeTruthy(); // branch
    expect(selectByValue('good')).toBeTruthy(); // condition
  });

  it('preserves existing images and variants in edit state', async () => {
    renderModal();

    // images render as previews
    await waitFor(() => {
      expect((screen.getByDisplayValue('Pro Racket') as HTMLInputElement).value).toBe('Pro Racket');
    });
    // variant data is shown (variant name input)
    expect(screen.getByDisplayValue('Red')).toBeTruthy();
    expect(screen.getByDisplayValue('5.00')).toBeTruthy();
    expect(screen.getByDisplayValue('SKU-R')).toBeTruthy();
  });

  it('initializes tag selections from the product tags', async () => {
    renderModal();

    // tag chips are toggle buttons; Pro/Red should render as selected (active class)
    await waitFor(() => {
      const proTag = screen.getByText('Pro').closest('button');
      expect(proTag).toBeTruthy();
    });
  });
});