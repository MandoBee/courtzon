interface TextBlockProps { data: { html?: string }; title?: string; subtitle?: string; }

export default function TextBlock({ data, title, subtitle }: TextBlockProps) {
  return (
    <section className="cz-landing-section cz-landing-section--bg">
      <div className="cz-landing-inner cz-landing-inner--narrow animate-fade-in">
        {title && <h2 className="cz-landing-h2 mb-4">{title}</h2>}
        {subtitle && <p className="cz-landing-lead text-left mx-0 max-w-none mb-8">{subtitle}</p>}
        {data.html ? (
          <div
            className="prose prose-lg max-w-none prose-headings:text-[var(--color-text)] prose-p:text-[var(--color-text-muted)] prose-strong:text-[var(--color-text)] prose-li:text-[var(--color-text-muted)] prose-a:text-[var(--color-primary)]"
            dangerouslySetInnerHTML={{ __html: data.html }}
          />
        ) : (
          <p className="text-[var(--color-text-muted)] text-center py-12">No content yet.</p>
        )}
      </div>
    </section>
  );
}
