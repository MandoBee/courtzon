import { useState } from 'react';

interface FAQItem { question: string; answer: string; }
interface FAQBlockProps { data: { items?: FAQItem[] }; title?: string; subtitle?: string; }

export default function FAQBlock({ data, title, subtitle }: FAQBlockProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <section className="cz-landing-section cz-landing-section--bg">
      <div className="cz-landing-inner cz-landing-inner--narrow animate-fade-in">
        {(title || subtitle) && (
          <div className="cz-landing-section-header">
            {title && <h2 className="cz-landing-h2">{title}</h2>}
            {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
          </div>
        )}
        <div className="space-y-3">
          {data.items?.map((item, i) => (
            <div
              key={i}
              className={`cz-landing-faq-item ${openIndex === i ? 'cz-landing-faq-item--open' : ''}`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="cz-landing-faq-trigger w-full flex items-center justify-between text-left"
              >
                <span className="text-base font-semibold text-[var(--color-text)]">{item.question}</span>
                <svg
                  className={`w-5 h-5 text-[var(--color-text-muted)] transition-transform duration-200 shrink-0 ml-2 ${openIndex === i ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openIndex === i && (
                <div className="px-6 pb-5 animate-fade-in">
                  <p className="text-[var(--color-text-muted)] leading-relaxed">{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
