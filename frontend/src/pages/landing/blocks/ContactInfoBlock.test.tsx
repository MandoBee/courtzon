import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContactInfoBlock from './ContactInfoBlock';

const items = [
  { type: 'email' as const, title: 'Email', value: 'support@courtzon.com', icon: 'mail', link: 'mailto:support@courtzon.com' },
  { type: 'phone' as const, title: 'Phone', value: '+1 123 456 7890', icon: 'phone', link: 'tel:+11234567890' },
  { type: 'location' as const, title: 'Location', value: '123 Main St, City, Country', icon: 'map-pin', link: '' },
];

describe('ContactInfoBlock', () => {
  it('renders the block title and subtitle from CMS data', () => {
    render(<ContactInfoBlock data={{ items }} title="Get in Touch" subtitle="We would love to hear from you" />);
    expect(screen.getByText('Get in Touch')).toBeTruthy();
    expect(screen.getByText('We would love to hear from you')).toBeTruthy();
  });

  it('renders all contact cards with CMS-provided title and value', () => {
    render(<ContactInfoBlock data={{ items }} />);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('support@courtzon.com')).toBeTruthy();
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('+1 123 456 7890')).toBeTruthy();
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.getByText('123 Main St, City, Country')).toBeTruthy();
  });

  it('wraps items with links as anchors', () => {
    render(<ContactInfoBlock data={{ items }} />);
    const mail = screen.getByRole('link', { name: /Email/ });
    expect(mail.getAttribute('href')).toBe('mailto:support@courtzon.com');
    const tel = screen.getByRole('link', { name: /Phone/ });
    expect(tel.getAttribute('href')).toBe('tel:+11234567890');
  });

  it('does not render an anchor when the item has no link', () => {
    render(<ContactInfoBlock data={{ items }} />);
    // Location has no link — it should not be an <a>
    const location = screen.getByText('Location').closest('a');
    expect(location).toBeNull();
  });

  it('shows an empty state when no items are configured', () => {
    render(<ContactInfoBlock data={{ items: [] }} />);
    expect(screen.getByText(/No contact information configured yet/)).toBeTruthy();
  });

  it('falls back to an empty list when data is missing entirely', () => {
    render(<ContactInfoBlock />);
    expect(screen.getByText(/No contact information configured yet/)).toBeTruthy();
  });

  it('does not hardcode values when CMS provides different content', () => {
    render(
      <ContactInfoBlock
        data={{
          items: [
            { type: 'email', title: 'Support Desk', value: 'hello@example.org', link: 'mailto:hello@example.org' },
          ],
        }}
        title="Contact Our Team"
      />,
    );
    expect(screen.getByText('Support Desk')).toBeTruthy();
    expect(screen.getByText('hello@example.org')).toBeTruthy();
    expect(screen.getByText('Contact Our Team')).toBeTruthy();
    // Original default content must NOT appear
    expect(screen.queryByText('support@courtzon.com')).toBeNull();
  });
});
