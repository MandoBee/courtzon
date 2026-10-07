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

/* Representative Terms of Service CMS content (mirrors the semantic structure
   stored in the CMS: 12 <h2> main sections, 5 <h3> subsections under section 7,
   <p> paragraphs and <ul> list copy). Distinctive phrases prove the content is
   served from the (mocked) CMS rather than hardcoded in the component. */
const termsHtml = [
  '<h2>1. Acceptance of Terms</h2>',
  '<p>By using CourtZon, you agree to these Terms of Service. If you do not agree, please do not use our platform.</p>',
  '<h2>2. Account Registration</h2>',
  '<p>You must provide accurate information when creating an account.</p>',
  '<h2>3. CourtZon Platform &amp; Third-Party Providers</h2>',
  '<p>CourtZon is a technology platform that connects users with independent providers.</p>',
  '<ul><li>Court bookings, clubs, and sports facilities</li><li>Marketplace products sold by independent sellers</li></ul>',
  '<p>CourtZon directly provides subscription services only to sellers, organizations, clubs, facilities, and other business users.</p>',
  '<h2>4. Bookings, Facilities &amp; Services</h2>',
  '<p>Court bookings are provided by the relevant facility, club, or service provider.</p>',
  '<h2>5. Marketplace &amp; Sellers</h2>',
  '<p>Marketplace products are offered by independent sellers.</p>',
  '<h2>6. Payments</h2>',
  '<p>Payments for transactions are processed securely.</p>',
  '<h2>7. Cancellations &amp; Refunds</h2>',
  '<p>The applicable policy depends on what was purchased and who provides it.</p>',
  '<ul><li>Third-party bookings, facilities, academies, and events &mdash; see section 7.1.</li><li>CourtZon subscriptions &mdash; see section 7.3.</li></ul>',
  '<h3>7.1 Third-Party Bookings &amp; Services</h3>',
  '<p>Bookings are provided by the relevant service provider.</p>',
  '<h3>7.2 Marketplace Purchases</h3>',
  '<p>Products are offered by independent sellers.</p>',
  '<h3>7.3 CourtZon Subscriptions</h3>',
  '<p>Subscriptions purchased directly from CourtZon are services provided by CourtZon.</p>',
  '<h3>7.4 Payment Errors</h3>',
  '<p>Users should contact CourtZon with transaction information.</p>',
  '<h3>7.5 Refund Processing</h3>',
  '<p>Refund timing may depend on the payment provider.</p>',
  '<h2>8. User Conduct</h2>',
  '<p>You agree not to misuse our platform.</p>',
  '<h2>9. Intellectual Property</h2>',
  '<p>All content and trademarks on CourtZon are owned by or licensed to us.</p>',
  '<h2>10. Limitation of Liability</h2>',
  '<p>CourtZon is provided as is.</p>',
  '<h2>11. Changes to These Terms</h2>',
  '<p>We may update these terms.</p>',
  '<h2>12. Contact Us</h2>',
  '<p>For questions: cms-supplied-terms@example.com.</p>',
].join('');

function makeTermsPage(blocks: Block[]) {
  return { title: 'Terms of Service', slug: 'terms', blocks };
}

function renderTerms(blocks: Block[]) {
  (api.get as any).mockImplementation((url: string) => {
    if (url.startsWith('/public/pages/')) return Promise.resolve({ data: makeTermsPage(blocks) });
    return Promise.resolve({ data: {} });
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={['/terms']}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <LandingPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const termsBlocks: Block[] = [
  {
    id: 46,
    block_type: 'hero',
    title: 'Terms of Service',
    subtitle: null,
    content: JSON.stringify({ heading: 'Terms of Service', subheading: 'Last updated: October 2026' }),
  },
  { id: 47, block_type: 'text', title: null, subtitle: null, content: JSON.stringify({ html: termsHtml }) },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LandingPage (Terms of Service semantic structure)', () => {
  it('applies the terms-scoped wrapper class from the CMS page slug', async () => {
    const { container } = renderTerms(termsBlocks);
    expect(await screen.findByRole('heading', { level: 2, name: '1. Acceptance of Terms' })).toBeTruthy();
    const wrapper = container.querySelector('.cz-landing');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.className).toContain('cz-landing--terms');
  });

  it('renders main sections as <h2> headings (1-12) with body paragraphs underneath', async () => {
    renderTerms(termsBlocks);
    const h2 = await screen.findAllByRole('heading', { level: 2 });
    expect(h2).toHaveLength(12);
    const titles = h2.map((h) => h.textContent);
    expect(titles[0]).toBe('1. Acceptance of Terms');
    expect(titles[2]).toBe('3. CourtZon Platform & Third-Party Providers');
    expect(titles[6]).toBe('7. Cancellations & Refunds');
    expect(titles[11]).toBe('12. Contact Us');

    // Paragraphs render as body copy, not headings
    expect(screen.getByText('By using CourtZon, you agree to these Terms of Service. If you do not agree, please do not use our platform.')).toBeTruthy();
    expect(screen.getByText('The applicable policy depends on what was purchased and who provides it.')).toBeTruthy();
  });

  it('renders the Cancellations & Refunds subsections as <h3> headings (7.1-7.5)', async () => {
    renderTerms(termsBlocks);
    const h3 = await screen.findAllByRole('heading', { level: 3 });
    expect(h3).toHaveLength(5);
    const titles = h3.map((h) => h.textContent);
    expect(titles).toEqual([
      '7.1 Third-Party Bookings & Services',
      '7.2 Marketplace Purchases',
      '7.3 CourtZon Subscriptions',
      '7.4 Payment Errors',
      '7.5 Refund Processing',
    ]);
  });

  it('keeps the third-party vs direct-CourtZon responsibility wording intact', async () => {
    renderTerms(termsBlocks);
    await screen.findByRole('heading', { level: 2, name: '3. CourtZon Platform & Third-Party Providers' });
    expect(screen.getByText('CourtZon directly provides subscription services only to sellers, organizations, clubs, facilities, and other business users.')).toBeTruthy();
    expect(screen.getByText('Marketplace products are offered by independent sellers.')).toBeTruthy();
  });

  it('serves content from the CMS (not hardcoded): changing CMS content changes the page', async () => {
    renderTerms([
      {
        id: 47,
        block_type: 'text',
        title: null,
        subtitle: null,
        content: JSON.stringify({ html: '<h2>1. Acceptance of Terms</h2><p>Fresh CMS wording for the structure test.</p>' }),
      },
    ]);
    expect(await screen.findByText('Fresh CMS wording for the structure test.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '1. Acceptance of Terms' })).toBeTruthy();
  });

  it('preserves the given CMS order and section 7 list copy', async () => {
    const { container } = renderTerms(termsBlocks);
    await screen.findByRole('heading', { level: 2, name: '7. Cancellations & Refunds' });

    // The 7.1-7.5 headings appear after the section 7 heading in document order
    const sec7 = screen.getByRole('heading', { level: 2, name: '7. Cancellations & Refunds' });
    const sub71 = screen.getByRole('heading', { level: 3, name: '7.1 Third-Party Bookings & Services' });
    expect(sec7.compareDocumentPosition(sub71) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Section 7 intro list renders as list items
    const introList = container.querySelectorAll('.cz-landing--terms .prose ul');
    expect(introList.length).toBeGreaterThanOrEqual(2);
    expect(introList[1].textContent).toContain('Third-party bookings, facilities, academies, and events');
    expect(introList[1].textContent).toContain('CourtZon subscriptions');
  });
});