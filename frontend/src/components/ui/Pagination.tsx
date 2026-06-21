import { useTranslation } from '../../i18n';
import { Button } from './Button';

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const PAGE_SIZES = [10, 25, 50, 100];

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  if (current > 3) pages.push('ellipsis');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  const { t } = useTranslation();
  if (total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
      {onPageSizeChange ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <span>{t('common.rows_per_page')}</span>
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      ) : <div />}

      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <span>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, total)} of {total}</span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
          {t('common.previous')}
        </Button>
        {getPageNumbers(safePage, totalPages).map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 text-xs text-[var(--color-text-muted)]">…</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)}
              className={`px-2 py-1 text-xs rounded-[var(--radius-md)] transition-colors ${p === safePage ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]'}`}>
              {p}
            </button>
          )
        )}
        <Button variant="ghost" size="sm" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
