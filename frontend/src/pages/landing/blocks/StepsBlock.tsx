interface Step { icon?: string; title: string; description: string; }
interface StepsBlockProps { data: { steps?: Step[] }; title?: string; subtitle?: string; }

export default function StepsBlock({ data, title, subtitle }: StepsBlockProps) {
  const steps = data.steps || [];
  if (!steps.length) return null;

  return (
    <section className="cz-landing-section cz-landing-section--surface">
      <div className="cz-landing-inner">
        {(title || subtitle) && (
          <div className="cz-landing-section-header animate-fade-in">
            {title && <h2 className="cz-landing-h2">{title}</h2>}
            {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <div
              key={i}
              className="relative group animate-fade-in"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-[calc(50%+2rem)] w-[calc(100%-2rem)] h-0.5 bg-[var(--color-border)]">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 border-[var(--color-border)] rotate-45" />
                </div>
              )}
              <div className="flex flex-col items-center text-center p-4">
                <div className="w-20 h-20 rounded-full bg-[var(--gradient-primary)] flex items-center justify-center text-white text-2xl font-bold shadow-[var(--shadow-md)] mb-4 group-hover:scale-110 transition-transform">
                  {step.icon || i + 1}
                </div>
                <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
