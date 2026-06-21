import { Link } from 'react-router-dom';

interface HeroBlockProps {
  data: { heading?: string; subheading?: string; ctaText?: string; ctaLink?: string; secondaryCtaText?: string; secondaryCtaLink?: string; backgroundImage?: string };
  title?: string;
  subtitle?: string;
}

export default function HeroBlock({ data, title, subtitle }: HeroBlockProps) {
  return (
    <section className="cz-hero relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-20" />
      <div className="cz-hero-inner relative cz-landing-inner">
        <div className="max-w-3xl">
          <h1 className="cz-hero-title font-extrabold tracking-tight leading-tight animate-fade-in">
            {title || data.heading || 'Welcome to CourtZon'}
          </h1>
          <p className="cz-hero-subtitle text-lg sm:text-xl max-w-2xl leading-relaxed animate-slide-up">
            {subtitle || data.subheading || ''}
          </p>
          {(data.ctaText || data.secondaryCtaText) && (
            <div className="mt-10 flex flex-wrap gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              {data.ctaText && (
                <Link to={data.ctaLink || '/register'} className="cz-landing-btn-surface">
                  {data.ctaText}
                  <svg className="ml-2 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              )}
              {data.secondaryCtaText && (
                <Link
                  to={data.secondaryCtaLink || '#features'}
                  className="cz-hero-cta-secondary inline-flex items-center px-8 py-3.5 text-base font-semibold border-2 rounded-xl transition-all"
                >
                  {data.secondaryCtaText}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
