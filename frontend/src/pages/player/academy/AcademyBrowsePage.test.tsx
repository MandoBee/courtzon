import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { publicAcademyApi, type PublicAcademyProgram } from '../../../services/academy';
import AcademyBrowsePage from './AcademyBrowsePage';

vi.mock('../../../services/academy', () => ({
  publicAcademyApi: { getPrograms: vi.fn() },
}));
vi.mock('../../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

/**
 * Regression coverage for D-01: `/academy/programs` was not proxied to the API,
 * so Nginx answered with the SPA `index.html` (200, text/html). The page then
 * received a *string* whose `.length` is truthy, skipped the empty-state branch
 * and crashed on `data.map()` inside the ErrorBoundary.
 */
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AcademyBrowsePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const program: PublicAcademyProgram = {
  id: 7,
  code: 'P7',
  name: 'Summer Padel',
  description: null,
  category: 'padel',
  level: null,
  season: null,
  price: 100,
  currency: 'EGP',
  price_type: 'FIXED',
  status: 'published',
  is_public: true,
  capacity: 10,
  confirmedCount: 0,
  availableSeats: 10,
  isFull: false,
  isUnlimited: false,
};

describe('AcademyBrowsePage — data shape hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state instead of crashing when the response is not an array', async () => {
    // Exactly what a mis-proxied request returns: the SPA HTML document.
    vi.mocked(publicAcademyApi.getPrograms).mockResolvedValue('<!doctype html><html><body>app</body></html>' as never);

    renderPage();

    expect(await screen.findByText('player.academy.empty')).toBeInTheDocument();
  });

  it('renders programs when the API returns a proper array', async () => {
    vi.mocked(publicAcademyApi.getPrograms).mockResolvedValue([program]);

    renderPage();

    expect(await screen.findByText('Summer Padel')).toBeInTheDocument();
  });
});
