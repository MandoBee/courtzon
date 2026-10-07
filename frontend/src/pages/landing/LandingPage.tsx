import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import HeroBlock from './blocks/HeroBlock';
import FeaturesBlock from './blocks/FeaturesBlock';
import CTABlock from './blocks/CTABlock';
import TextBlock from './blocks/TextBlock';
import TeamBlock from './blocks/TeamBlock';
import FAQBlock from './blocks/FAQBlock';
import ContactFormBlock from './blocks/ContactFormBlock';
import ContactInfoBlock from './blocks/ContactInfoBlock';
import LocationMapBlock from './blocks/LocationMapBlock';
import StatsBlock from './blocks/StatsBlock';
import TestimonialsBlock from './blocks/TestimonialsBlock';
import BlogPreviewBlock from './blocks/BlogPreviewBlock';
import PricingPlansBlock from './blocks/PricingPlansBlock';
import StepsBlock from './blocks/StepsBlock';

interface Block {
  id: number;
  block_type: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
}

interface Page {
  title: string;
  slug?: string;
  blocks: Block[];
}

/* Two-column landing layout:
   - LEFT_COLUMN_TYPES blocks stack in the left column (contact details + map)
   - RIGHT_COLUMN_TYPES blocks stack in the right column (the contact form)
   Applied only when the page has at least one block of each side, so pages
   without a form (or without info/map) keep the plain full-width stack. */
const LEFT_COLUMN_TYPES = new Set(['contact_info', 'location_map']);
const RIGHT_COLUMN_TYPES = new Set(['contact_form']);

export default function LandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const resolvedSlug = slug || 'home';
        const { data } = await api.get(`/public/pages/${resolvedSlug}`);
        if (!cancelled) setPage(data);
      } catch {
        if (!cancelled) {
          setError('Page not found');
          setPage(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading && !page) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-[var(--color-text-muted)] mb-4">404</h1>
          <p className="text-lg text-[var(--color-text-muted)] mb-6">{error || 'Page not found'}</p>
          <a href="/" className="text-[var(--color-primary)] hover:underline font-medium">Go Home</a>
        </div>
      </div>
    );
  }

  const renderBlock = (block: Block) => {
    const data = block.content ? JSON.parse(block.content) : {};
    const key = `block-${block.id}-${block.block_type}`;

    switch (block.block_type) {
      case 'hero':
        return <HeroBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'features':
        return <FeaturesBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'cta':
        return <CTABlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'text':
        return <TextBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'team':
        return <TeamBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'faq':
        return <FAQBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'contact_form':
        return <ContactFormBlock key={key} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'contact_info':
        return <ContactInfoBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'location_map':
        return <LocationMapBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'stats':
        return <StatsBlock key={key} data={data} title={block.title || undefined} />;
      case 'testimonials':
        return <TestimonialsBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'blog_preview':
        return <BlogPreviewBlock key={key} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'pricing':
        return <PricingPlansBlock key={key} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      case 'steps':
        return <StepsBlock key={key} data={data} title={block.title || undefined} subtitle={block.subtitle || undefined} />;
      default:
        return null;
    }
  };

  const blocks = page.blocks || [];
  const useColumns =
    blocks.some((b) => LEFT_COLUMN_TYPES.has(b.block_type)) &&
    blocks.some((b) => RIGHT_COLUMN_TYPES.has(b.block_type));

  const renderBlocks = (): ReactNode[] => {
    if (!useColumns) return blocks.map(renderBlock);

    const leftBlocks = blocks.filter((b) => LEFT_COLUMN_TYPES.has(b.block_type));
    const rightBlocks = blocks.filter((b) => RIGHT_COLUMN_TYPES.has(b.block_type));
    const nodes: ReactNode[] = [];
    let columnsRendered = false;

    for (const block of blocks) {
      const inColumn =
        LEFT_COLUMN_TYPES.has(block.block_type) || RIGHT_COLUMN_TYPES.has(block.block_type);
      if (inColumn) {
        // Render the whole two-column section once, at the position of the
        // first column block; remaining column blocks are grouped inside it.
        if (!columnsRendered) {
          columnsRendered = true;
          nodes.push(
            <section key="landing-columns" className="cz-landing-section">
              <div className="cz-landing-inner animate-fade-in">
                <div className="cz-landing-cols">
                  <div className="cz-landing-col">{leftBlocks.map(renderBlock)}</div>
                  <div className="cz-landing-col">{rightBlocks.map(renderBlock)}</div>
                </div>
              </div>
            </section>,
          );
        }
        continue;
      }
      nodes.push(renderBlock(block));
    }
    return nodes;
  };

  return (
    <div className={`cz-landing cz-landing--${page.slug || slug || 'home'}`}>
      {page.blocks && page.blocks.length > 0 ? (
        renderBlocks()
      ) : (
        <div className="min-h-[50vh] flex items-center justify-center text-[var(--color-text-muted)]">
          No content yet.
        </div>
      )}
    </div>
  );
}
