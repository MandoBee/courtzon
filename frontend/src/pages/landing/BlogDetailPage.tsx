import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { EntityImage } from '../../components/ui';

interface BlogDetail { id: number; slug: string; title: string; excerpt: string; content: string; cover_image: string; author_name: string; published_at: string; }

export default function BlogDetailPage() {
  const { blogSlug: slug } = useParams<{ blogSlug: string }>();
  const [blog, setBlog] = useState<BlogDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get(`/public/blogs/${slug}`).then(r => setBlog(r.data)).catch(() => setBlog(null)).finally(() => setLoading(false)); }, [slug]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" /></div>;

  if (!blog) return (
    <div className="min-h-[60vh] flex items-center justify-center bg-[var(--color-bg)]">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-[var(--color-text-muted)]/30 mb-4">404</h1>
        <p className="text-lg text-[var(--color-text-muted)] mb-6">Blog post not found</p>
        <Link to="/blog" className="text-[var(--color-primary)] hover:underline font-medium">&larr; Back to Blog</Link>
      </div>
    </div>
  );

  return (
    <div className="bg-[var(--color-bg)] min-h-screen">
      <section className="cz-hero relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-20" />
        <div className="cz-hero-inner relative cz-landing-inner">
          <div className="max-w-3xl animate-fade-in">
            <Link to="/blog" className="inline-flex items-center text-sm font-medium text-[var(--color-primary)] hover:underline mb-4">
              &larr; Back to Blog
            </Link>
            <p className="text-sm cz-hero-subtitle mb-3">
              {new Date(blog.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              {blog.author_name && ` · By ${blog.author_name}`}
            </p>
            <h1 className="cz-hero-title font-extrabold tracking-tight leading-tight">{blog.title}</h1>
            {blog.excerpt && (
              <p className="cz-hero-subtitle text-lg sm:text-xl max-w-2xl leading-relaxed mt-4">{blog.excerpt}</p>
            )}
          </div>
        </div>
      </section>
      <article className="cz-landing-section cz-landing-section--bg animate-fade-in">
        <div className="cz-landing-inner cz-landing-inner--narrow">
          {blog.cover_image && (
            <EntityImage src={blog.cover_image} name={blog.title} className="w-full h-64 sm:h-80 rounded-[var(--radius-lg)] mb-10 text-6xl" />
          )}
          <div
            className="prose prose-lg max-w-none prose-headings:text-[var(--color-text)] prose-p:text-[var(--color-text-muted)] prose-strong:text-[var(--color-text)] prose-a:text-[var(--color-primary)]"
            dangerouslySetInnerHTML={{ __html: blog.content }}
          />
        </div>
      </article>
    </div>
  );
}
