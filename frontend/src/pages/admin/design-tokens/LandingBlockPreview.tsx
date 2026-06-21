import { getLandingDefinition } from '../../../theme/landing-styles';

export function LandingBlockPreview({ blockId }: { blockId: string }) {
  switch (blockId) {
    case 'hero':
      return (
        <section className="cz-hero relative overflow-hidden rounded-[var(--radius-md)]">
          <div className="cz-hero-inner relative max-w-7xl mx-auto px-4">
            <h1 className="cz-hero-title font-extrabold tracking-tight">CourtZon</h1>
            <p className="cz-hero-subtitle text-sm max-w-md">Book courts, join tournaments, grow your game.</p>
            <div className="mt-4 flex gap-2">
              <span className="cz-landing-btn-surface text-xs py-2 px-4">Get started</span>
              <span className="cz-hero-cta-secondary inline-flex px-4 py-2 text-xs font-semibold border-2 rounded-[var(--radius-lg)]">
                Learn more
              </span>
            </div>
          </div>
        </section>
      );
    case 'features':
      return (
        <section className="cz-landing-section cz-landing-section--bg rounded-[var(--radius-md)] py-6">
          <div className="px-3">
            <div className="cz-landing-section-header mb-4">
              <h2 className="cz-landing-h2 text-lg">Features</h2>
              <p className="cz-landing-lead text-xs">Everything you need</p>
            </div>
            <div className="grid grid-cols-2 cz-landing-grid">
              {['Booking', 'Tournaments'].map((t) => (
                <div key={t} className="cz-landing-card group p-3">
                  <div className="cz-landing-feature-icon text-sm mb-2">📅</div>
                  <h3 className="text-xs font-semibold text-[var(--color-text)]">{t}</h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Short description</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    case 'cta':
      return (
        <section className="cz-hero py-8 rounded-[var(--radius-md)] text-center px-3">
          <h2 className="cz-landing-h2 text-base">Ready to play?</h2>
          <p className="cz-hero-subtitle text-xs mt-2">Join thousands of players</p>
          <span className="cz-landing-btn-surface text-xs py-2 px-4 mt-3 inline-flex">Sign up</span>
        </section>
      );
    case 'faq':
      return (
        <section className="cz-landing-section cz-landing-section--bg py-6 px-3 rounded-[var(--radius-md)]">
          <h2 className="cz-landing-h2 text-center text-sm mb-3">FAQ</h2>
          <div className="space-y-2">
            <div className="cz-landing-faq-item cz-landing-faq-item--open">
              <div className="cz-landing-faq-trigger text-xs font-semibold text-[var(--color-text)]">How do I book?</div>
            </div>
            <div className="cz-landing-faq-item">
              <div className="cz-landing-faq-trigger text-xs font-semibold text-[var(--color-text)]">Pricing?</div>
            </div>
          </div>
        </section>
      );
    case 'pricing':
      return (
        <section className="cz-landing-section cz-landing-section--surface py-6 px-3 rounded-[var(--radius-md)]">
          <div className="grid grid-cols-3 cz-landing-grid items-end">
            <div className="cz-landing-card p-2 text-center">
              <p className="text-[10px] font-bold">Basic</p>
            </div>
            <div className="cz-landing-card cz-landing-pricing-featured p-2 text-center">
              <p className="text-[10px] font-bold">Pro</p>
            </div>
            <div className="cz-landing-card p-2 text-center">
              <p className="text-[10px] font-bold">Team</p>
            </div>
          </div>
        </section>
      );
    case 'content':
    default:
      return (
        <section className="cz-landing-section cz-landing-section--bg py-6 px-3 rounded-[var(--radius-md)]">
          <h2 className="cz-landing-h2 text-sm mb-2">Section title</h2>
          <p className="cz-landing-lead text-xs text-left mx-0 max-w-none mb-3">Subtitle copy</p>
          <div className="cz-landing-card p-3">
            <p className="text-[10px] text-[var(--color-text-muted)]">Card or prose content</p>
          </div>
        </section>
      );
  }
}

export function landingPreviewLabel(blockId: string): string {
  return getLandingDefinition(blockId)?.label ?? 'Landing';
}
