import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';

interface LegalPageBlock {
  id: number;
  block_type: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
}

interface LegalPage {
  title: string;
  blocks: LegalPageBlock[];
}

interface LegalConsentProps {
  onChange?: (agreed: boolean) => void;
}

const pageCache = new Map<string, LegalPage>();

async function fetchLegalPage(slug: string): Promise<LegalPage | null> {
  if (pageCache.has(slug)) return pageCache.get(slug)!;
  try {
    const { data } = await api.get(`/public/pages/${slug}`);
    const page = data as LegalPage;
    pageCache.set(slug, page);
    return page;
  } catch {
    return null;
  }
}

function parseBlockHtml(block: LegalPageBlock): string | undefined {
  if (!block.content) return undefined;
  try {
    const parsed = JSON.parse(block.content);
    return parsed.html || undefined;
  } catch {
    return block.content || undefined;
  }
}

export default function LegalConsent({ onChange }: LegalConsentProps) {
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [modal, setModal] = useState<'privacy' | 'terms' | null>(null);
  const [page, setPage] = useState<LegalPage | null>(null);
  const [loading, setLoading] = useState(false);

  const agreed = privacy && terms;

  useEffect(() => {
    onChange?.(agreed);
  }, [agreed, onChange]);

  const openModal = useCallback((type: 'privacy' | 'terms') => {
    setModal(type);
    setLoading(true);
    setPage(null);
    fetchLegalPage(type).then((p) => {
      setPage(p);
      setLoading(false);
    });
  }, []);

  const openFromLabel = (e: React.MouseEvent, type: 'privacy' | 'terms') => {
    e.preventDefault();
    e.stopPropagation();
    openModal(type);
  };

  const checkboxClass = 'mt-0.5 w-4 h-4 accent-[var(--color-primary)] cursor-pointer';
  const rowClass = 'flex items-start gap-3 p-3 rounded-xl border border-[var(--color-border)] cursor-pointer transition-all hover:border-[var(--color-primary)]/40 bg-[var(--color-bg)]';
  const linkClass = 'text-[var(--color-primary)] font-medium underline underline-offset-2 hover:opacity-80';
  const labelClass = 'text-sm text-[var(--color-text)]';

  return (
    <>
      <div className="space-y-3">
        <label className={rowClass}>
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className={checkboxClass} />
          <span className={labelClass}>
            I have read and agree to the{' '}
            <button type="button" onClick={(e) => openFromLabel(e, 'privacy')} className={linkClass}>
              Privacy Policy
            </button>
          </span>
        </label>
        <label className={rowClass}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className={checkboxClass} />
          <span className={labelClass}>
            I have read and agree to the{' '}
            <button type="button" onClick={(e) => openFromLabel(e, 'terms')} className={linkClass}>
              Terms of Service
            </button>
          </span>
        </label>
      </div>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} size="lg">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
          </div>
        ) : !page ? (
          <p className="text-sm text-[var(--color-text-muted)]">Unable to load this document right now. Please try again later.</p>
        ) : (
          <div>
            <h3 className="text-lg font-bold text-[var(--color-text)] mb-4">{page.title}</h3>
            {page.blocks && page.blocks.length > 0 ? (
              page.blocks.map((b) => {
                const html = parseBlockHtml(b);
                return (
                  <div key={b.id} className="mb-6">
                    {b.title && <h4 className="text-sm font-semibold text-[var(--color-text)] mb-2">{b.title}</h4>}
                    {b.subtitle && <p className="text-sm text-[var(--color-text-muted)] mb-2">{b.subtitle}</p>}
                    {html && (
                      <div
                        className="prose prose-sm max-w-none prose-headings:text-[var(--color-text)] prose-p:text-[var(--color-text-muted)] prose-strong:text-[var(--color-text)] prose-li:text-[var(--color-text-muted)] prose-a:text-[var(--color-primary)]"
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No content available.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
