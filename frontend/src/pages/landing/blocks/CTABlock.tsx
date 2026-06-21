import { Link } from 'react-router-dom';

interface CTABlockProps { data: { text?: string; buttonText?: string; buttonLink?: string }; title?: string; subtitle?: string; }

function resolveCtaLink(link?: string): string {
  if (link === '/seller-register') return '/register/seller';
  return link || '/register';
}

export default function CTABlock({ data, title, subtitle }: CTABlockProps) {
  return (
    <section className="cz-hero cz-landing-section">
      <div className="cz-landing-inner cz-landing-inner--narrow text-center animate-fade-in">
        <h2 className="cz-landing-h2">{title || data.text || 'Ready to get started?'}</h2>
        {subtitle && <p className="cz-hero-subtitle cz-landing-lead">{subtitle}</p>}
        {data.buttonText && (
          <Link to={resolveCtaLink(data.buttonLink)} className="cz-landing-btn-surface mt-8">
            {data.buttonText}
            <svg className="ml-2 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        )}
      </div>
    </section>
  );
}
