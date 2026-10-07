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

/* Representative Privacy Policy CMS content (mirrors the semantic structure
   stored in the CMS: 7 <h2> main sections with <p> paragraphs, no subsections).
   Distinctive phrases prove the content is served from the (mocked) CMS rather
   than hardcoded in the component. */
const privacyHtml = [
  '<h2>1. Information We Collect</h2>',
  '<p>We collect information you provide directly, such as your name, email, phone number, and payment information when you create an account or make a booking.</p>',
  '<h2>2. How We Use Your Information</h2>',
  '<p>We use your information to provide and improve our services, process transactions, send notifications, and comply with legal obligations.</p>',
  '<h2>3. Information Sharing</h2>',
  '<p>We do not sell your personal information. We share information only with service providers and as required by law.</p>',
  '<h2>4. Data Security</h2>',
  '<p>We implement appropriate technical and organizational measures to protect your personal information.</p>',
  '<h2>5. Your Rights</h2>',
  '<p>You have the right to access, correct, or delete your personal information. Contact privacy@courtzon.com to exercise these rights.</p>',
  '<h2>6. Cookies</h2>',
  '<p>We use cookies to improve your experience and analyze usage.</p>',
  '<h2>7. Contact</h2>',
  '<p>For privacy inquiries: cms-supplied-privacy@example.com.</p>',
].join('');

function makePrivacyPage(blocks: Block[]) {
  return { title: 'Privacy Policy', slug: 'privacy', blocks };
}

function renderPrivacy(blocks: Block[]) {
  (api.get as any).mockImplementation((url: string) => {
    if (url.startsWith('/public/pages/')) return Promise.resolve({ data: makePrivacyPage(blocks) });
    return Promise.resolve({ data: {} });
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={['/privacy']}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <LandingPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const privacyBlocks: Block[] = [
  {
    id: 44,
    block_type: 'hero',
    title: 'Privacy Policy',
    subtitle: null,
    content: JSON.stringify({ heading: 'Privacy Policy', subheading: 'Last updated: October 2026' }),
  },
  { id: 45, block_type: 'text', title: null, subtitle: null, content: JSON.stringify({ html: privacyHtml }) },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LandingPage (Privacy Policy — same legal-document structure as Terms)', () => {
  it('applies the privacy-scoped wrapper class from the CMS page slug', async () => {
    const { container } = renderPrivacy(privacyBlocks);
    expect(await screen.findByRole('heading', { level: 2, name: '1. Information We Collect' })).toBeTruthy();
    const wrapper = container.querySelector('.cz-landing');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.className).toContain('cz-landing--privacy');
  });

  it('renders all 7 main sections as <h2> headings with body paragraphs', async () => {
    renderPrivacy(privacyBlocks);
    const h2 = await screen.findAllByRole('heading', { level: 2 });
    expect(h2).toHaveLength(7);
    const titles = h2.map((h) => h.textContent);
    expect(titles).toEqual([
      '1. Information We Collect',
      '2. How We Use Your Information',
      '3. Information Sharing',
      '4. Data Security',
      '5. Your Rights',
      '6. Cookies',
      '7. Contact',
    ]);

    expect(screen.getByText('We do not sell your personal information. We share information only with service providers and as required by law.')).toBeTruthy();
    expect(screen.getByText('For privacy inquiries: cms-supplied-privacy@example.com.')).toBeTruthy();
  });

  it('has no subsection headings (privacy document has no subsections)', async () => {
    renderPrivacy(privacyBlocks);
    await screen.findByRole('heading', { level: 2, name: '1. Information We Collect' });
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });

  it('serves content from the CMS (not hardcoded): changing CMS content changes the page', async () => {
    renderPrivacy([
      {
        id: 45,
        block_type: 'text',
        title: null,
        subtitle: null,
        content: JSON.stringify({ html: '<h2>1. Information We Collect</h2><p>Fresh CMS privacy wording for the structure test.</p>' }),
      },
    ]);
    expect(await screen.findByText('Fresh CMS privacy wording for the structure test.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '1. Information We Collect' })).toBeTruthy();
  });
});