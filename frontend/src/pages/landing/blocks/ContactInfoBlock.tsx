interface ContactInfoItem {
  type: 'email' | 'phone' | 'location';
  title: string;
  value: string;
  icon?: string;
  link?: string;
}

interface ContactInfoBlockProps {
  data?: { items?: ContactInfoItem[] };
  title?: string;
  subtitle?: string;
}

function getIcon(type: string) {
  switch (type) {
    case 'email':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'phone':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      );
    case 'location':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function ContactInfoBlock({ data, title, subtitle }: ContactInfoBlockProps) {
  const items = data?.items || [];

  return (
    <section className="cz-landing-section cz-landing-section--bg">
      <div className="cz-landing-inner animate-fade-in">
        {(title || subtitle) && (
          <div className="cz-landing-section-header">
            {title && <h2 className="cz-landing-h2">{title}</h2>}
            {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((item, i) => {
            const content = (
              <div
                key={`${item.type}-${i}`}
                className="cz-landing-card group hover:shadow-[var(--shadow-lg)] transition-all duration-300 hover:scale-[1.02] flex flex-col items-center text-center p-8 h-full"
              >
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)] mb-4 group-hover:scale-110 transition-transform">
                  {getIcon(item.type)}
                </div>
                <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">{item.title}</h3>
                <p className="text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap break-words">
                  {item.value}
                </p>
              </div>
            );

            if (item.link) {
              return (
                <a
                  key={`${item.type}-${i}`}
                  href={item.link}
                  target={item.link.startsWith('http') ? '_blank' : undefined}
                  rel={item.link.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="block h-full no-underline"
                >
                  {content}
                </a>
              );
            }

            return content;
          })}
        </div>
        {items.length === 0 && (
          <p className="text-center text-[var(--color-text-muted)] py-12">No contact information configured yet.</p>
        )}
      </div>
    </section>
  );
}
