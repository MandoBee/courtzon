import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ui/Toast';
import LandingPage from './LandingPage';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() },
}));

import api from '../../services/api';

type Block = {
  id: number;
  block_type: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
};

function makePage(blocks: Block[]) {
  return { title: 'Contact Us', blocks };
}

function renderPage(blocks: Block[]) {
  (api.get as any).mockImplementation((url: string) => {
    if (url.startsWith('/public/pages/')) return Promise.resolve({ data: makePage(blocks) });
    if (url.startsWith('/public/countries')) return Promise.resolve({ data: { data: [] } });
    if (url.startsWith('/public/contact/options')) return Promise.resolve({ data: { data: {} } });
    return Promise.resolve({ data: {} });
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={['/contact']}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <LandingPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LandingPage (CMS-driven contact blocks)', () => {
  it('renders contact_info content from CMS block JSON', async () => {
    renderPage([
      {
        id: 1,
        block_type: 'contact_info',
        title: 'Contact Information',
        subtitle: 'Reach us any time',
        content: JSON.stringify({
          items: [
            { type: 'email', title: 'Email', value: 'custom@from-cms.com', link: 'mailto:custom@from-cms.com' },
            { type: 'phone', title: 'Phone', value: '+971 50 000 0000', link: 'tel:+971500000000' },
            { type: 'location', title: 'Location', value: 'Dubai Media City', link: '' },
          ],
        }),
      },
    ]);
    expect(await screen.findByText('Contact Information')).toBeTruthy();
    expect(screen.getByText('Reach us any time')).toBeTruthy();
    expect(screen.getByText('custom@from-cms.com')).toBeTruthy();
    expect(screen.getByText('+971 50 000 0000')).toBeTruthy();
    expect(screen.getByText('Dubai Media City')).toBeTruthy();
  });

  it('renders location_map content from CMS block JSON', async () => {
    renderPage([
      {
        id: 2,
        block_type: 'location_map',
        title: 'Find Us',
        subtitle: null,
        content: JSON.stringify({
          address: '10 CMS Street, Dubai',
          mapEmbedUrl: 'https://maps.google.com/maps?q=dubai&output=embed',
          mapLink: 'https://maps.google.com/?q=dubai',
        }),
      },
    ]);
    expect(await screen.findByText('Find Us')).toBeTruthy();
    expect(screen.getByText('10 CMS Street, Dubai')).toBeTruthy();
    const iframe = screen.getByTitle('Location Map') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://maps.google.com/maps?q=dubai&output=embed');
    expect(screen.getByRole('link', { name: /View on Google Maps/ }).getAttribute('href')).toBe(
      'https://maps.google.com/?q=dubai',
    );
  });

  it('renders blocks in the CMS sort order (reorderable)', async () => {
    renderPage([
      { id: 3, block_type: 'location_map', title: 'Map First', subtitle: null, content: JSON.stringify({ address: 'A', mapEmbedUrl: '' }) },
      { id: 1, block_type: 'contact_info', title: 'Info Second', subtitle: null, content: JSON.stringify({ items: [] }) },
      { id: 2, block_type: 'text', title: 'Text Third', subtitle: null, content: JSON.stringify({ html: '<p>Body</p>' }) },
    ]);
    const mapTitle = await screen.findByText('Map First');
    const infoTitle = screen.getByText('Info Second');
    const textTitle = screen.getByText('Text Third');

    const position = (el: Element) => (el.compareDocumentPosition(document.body) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 0);
    // compareDocumentPosition on body: elements before body's children come first.
    // Simpler: use the DOM order of section headings.
    const headings = Array.from(document.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).toEqual(['Map First', 'Info Second', 'Text Third']);
    expect(position(mapTitle)).toBeGreaterThanOrEqual(0);
    expect(infoTitle).toBeTruthy();
    expect(textTitle).toBeTruthy();
  });

  it('shows "No content yet." when the CMS page has no blocks', async () => {
    renderPage([]);
    expect(await screen.findByText('No content yet.')).toBeTruthy();
  });

  it('arranges contact_info + location_map on the left and the whole form on the right', async () => {
    const { container } = renderPage([
      {
        id: 1,
        block_type: 'contact_info',
        title: 'Contact Information',
        subtitle: null,
        content: JSON.stringify({
          items: [
            { type: 'email', title: 'Email', value: 'mniazyy@gmail.com', link: 'mailto:mniazyy@gmail.com' },
          ],
        }),
      },
      {
        id: 2,
        block_type: 'location_map',
        title: 'Our Location',
        subtitle: null,
        content: JSON.stringify({
          address: '4 Galal st., Faisal, Giza, Egypt',
          mapEmbedUrl: 'https://maps.google.com/maps?q=pin&output=embed',
        }),
      },
      { id: 3, block_type: 'contact_form', title: 'Send Us a Message', subtitle: null, content: '{}' },
    ]);

    await screen.findByText('Send Us a Message');

    // Exactly one two-column wrapper with two columns
    expect(container.querySelectorAll('.cz-landing-cols').length).toBe(1);
    const cols = container.querySelectorAll('.cz-landing-col');
    expect(cols.length).toBe(2);

    // Left column: contact cards + map
    expect(cols[0].textContent).toContain('Contact Information');
    expect(cols[0].textContent).toContain('Our Location');
    expect(cols[0].textContent).toContain('mniazyy@gmail.com');
    expect(cols[0].querySelector('iframe')).toBeTruthy();

    // Right column: the whole "Send Us a Message" form
    expect(cols[1].textContent).toContain('Send Us a Message');
    expect(cols[1].querySelector('form')).toBeTruthy();
    expect(cols[1].querySelector('textarea')).toBeTruthy();
    expect(cols[1].querySelector('button[type="submit"]')).toBeTruthy();
  });

  it('keeps the plain full-width stack when there is no form to pair with', async () => {
    const { container } = renderPage([
      {
        id: 1,
        block_type: 'contact_info',
        title: 'Contact Information',
        subtitle: null,
        content: JSON.stringify({ items: [] }),
      },
    ]);
    await screen.findByText('Contact Information');
    expect(container.querySelector('.cz-landing-cols')).toBeNull();
  });
});
