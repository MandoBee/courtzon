import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { EntityImage } from '../../../components/ui';

interface Blog { id: number; slug: string; title: string; excerpt: string; cover_image: string; author_name: string; published_at: string; }
interface BlogPreviewBlockProps { title?: string; subtitle?: string; }

export default function BlogPreviewBlock({ title, subtitle }: BlogPreviewBlockProps) {
  const [blogs, setBlogs] = useState<Blog[]>([]);

  useEffect(() => {
    api.get('/public/blogs').then(r => setBlogs((r.data.data || []).slice(0, 3))).catch(() => {});
  }, []);

  if (!blogs.length) return null;

  return (
    <section className="cz-landing-section cz-landing-section--bg">
      <div className="cz-landing-inner">
        <div className="cz-landing-section-header animate-fade-in">
          {title && <h2 className="cz-landing-h2">{title}</h2>}
          {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 cz-landing-grid">
          {blogs.map((b, i) => (
            <Link
              key={b.id}
              to={`/blog/${b.slug}`}
              className="group cz-landing-card overflow-hidden p-0 animate-fade-in"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <EntityImage src={b.cover_image} name={b.title} className="w-full h-48 rounded-none text-3xl" />
              <div className="p-6">
                <p className="text-xs text-[var(--color-text-muted)] mb-3">
                  {new Date(b.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <h3 className="text-lg font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors mb-2">
                  {b.title}
                </h3>
                {b.excerpt && <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">{b.excerpt}</p>}
                <span className="inline-flex items-center mt-4 text-sm font-medium text-[var(--color-primary)]">
                  Read more
                  <svg className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
