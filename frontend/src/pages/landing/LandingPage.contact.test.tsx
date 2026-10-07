import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  (api.get as any).mockResolvedValue({ data: makePage(blocks) });
  return render(
    <MemoryRouter initialEntries={['/contact']}>
      <LandingPage />
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
});
