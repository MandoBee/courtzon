import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LocationMapBlock from './LocationMapBlock';

describe('LocationMapBlock', () => {
  it('renders the block title and subtitle from CMS data', () => {
    render(
      <LocationMapBlock
        data={{ address: '123 Main St', mapEmbedUrl: '' }}
        title="Our Location"
        subtitle="Visit our office"
      />,
    );
    expect(screen.getByText('Our Location')).toBeTruthy();
    expect(screen.getByText('Visit our office')).toBeTruthy();
  });

  it('renders the CMS-configured map embed URL in the iframe (no hardcoded map)', () => {
    const url = 'https://maps.google.com/maps?q=CourtZon&t=&z=13&ie=UTF8&iwloc=&output=embed';
    render(<LocationMapBlock data={{ address: '123 Main St', mapEmbedUrl: url }} />);
    const iframe = screen.getByTitle('Location Map') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(url);
  });

  it('renders the CMS-provided address', () => {
    render(
      <LocationMapBlock data={{ address: '456 Arena Blvd, Dubai, UAE', mapEmbedUrl: '' }} />,
    );
    expect(screen.getByText('456 Arena Blvd, Dubai, UAE')).toBeTruthy();
  });

  it('renders the "View on Google Maps" link from CMS mapLink', () => {
    const link = 'https://maps.google.com/?q=456+Arena+Blvd';
    render(<LocationMapBlock data={{ address: '456 Arena Blvd', mapEmbedUrl: '', mapLink: link }} />);
    const anchor = screen.getByRole('link', { name: /View on Google Maps/ });
    expect(anchor.getAttribute('href')).toBe(link);
    expect(anchor.getAttribute('target')).toBe('_blank');
  });

  it('shows an empty state when no map is configured', () => {
    render(<LocationMapBlock data={{ address: '', mapEmbedUrl: '' }} />);
    expect(screen.getByText(/Map not configured yet/)).toBeTruthy();
    expect(screen.queryByTitle('Location Map')).toBeNull();
  });

  it('hides the footer row when there is neither address nor map link', () => {
    render(<LocationMapBlock data={{ mapEmbedUrl: 'https://example.com/embed' }} />);
    expect(screen.getByTitle('Location Map')).toBeTruthy();
    expect(screen.queryByText(/View on Google Maps/)).toBeNull();
  });
});
