interface LocationMapBlockProps {
  data?: {
    address?: string;
    mapEmbedUrl?: string;
    mapLink?: string;
    latitude?: string | number;
    longitude?: string | number;
  };
  title?: string;
  subtitle?: string;
}

export default function LocationMapBlock({ data, title, subtitle }: LocationMapBlockProps) {
  const address = data?.address || '';
  const mapEmbedUrl = data?.mapEmbedUrl || '';
  const mapLink = data?.mapLink || '';

  return (
    <section className="cz-landing-section">
      <div className="cz-landing-inner animate-fade-in">
        {(title || subtitle) && (
          <div className="cz-landing-section-header">
            {title && <h2 className="cz-landing-h2">{title}</h2>}
            {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
          </div>
        )}

        <div className="cz-landing-card overflow-hidden p-0">
          {mapEmbedUrl ? (
            <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] md:aspect-[16/7]">
              <iframe
                src={mapEmbedUrl}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Location Map"
                className="absolute inset-0"
              />
            </div>
          ) : (
            <div className="relative w-full aspect-[16/9] bg-[var(--color-bg)] flex items-center justify-center">
              <div className="text-center p-6">
                <svg
                  className="w-16 h-16 mx-auto text-[var(--color-text-muted)] opacity-50 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                <p className="text-[var(--color-text-muted)] mb-2">Map not configured yet.</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Add a Google Maps embed URL in the CMS to display the location here.
                </p>
              </div>
            </div>
          )}

          {(address || mapLink) && (
            <div className="p-6 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                {address && (
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-[var(--color-text-muted)] mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <p className="text-[var(--color-text)] leading-relaxed">{address}</p>
                  </div>
                )}
                {mapLink && (
                  <a
                    href={mapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[var(--color-primary)] hover:underline text-sm font-medium shrink-0"
                  >
                    View on Google Maps
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
