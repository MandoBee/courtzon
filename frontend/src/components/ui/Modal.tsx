import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * - `auto` (default): bottom-sheet on mobile, centered on desktop.
   * - `center`: always centered.
   * - `sheet`: always bottom-sheet.
   */
  variant?: 'auto' | 'center' | 'sheet';
  footer?: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  variant = 'auto',
  footer,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClasses = {
    sm: 'md:max-w-sm',
    md: 'md:max-w-md',
    lg: 'md:max-w-lg',
    xl: 'md:max-w-2xl',
  };

  const isSheet = variant === 'sheet';
  // For `auto`: bottom-sheet on mobile (flex-col justify-end), centered on md+.
  const overlayClass = isSheet
    ? 'flex items-end justify-center'
    : 'flex items-end md:items-center justify-center';

  const panelClass = isSheet
    ? `w-full ${sizeClasses[size]} max-h-[85vh] flex flex-col !p-0 bg-[var(--color-surface)] rounded-t-[var(--radius-xl)] shadow-xl cz-sheet-enter cz-pb-safe mb-24 md:mb-0`
    : `w-full ${sizeClasses[size]} max-h-[85vh] md:max-h-[90vh] flex flex-col !p-0 bg-[var(--color-surface)] rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-lg)] shadow-xl cz-sheet-enter md:!animate-none cz-pb-safe mb-24 md:mb-0`;

  return (
    <div
      ref={overlayRef}
      className={`cz-modal-overlay fixed inset-0 ${isSheet ? 'z-50' : 'z-[70]'} ${overlayClass} p-0 md:p-4 cz-fade-enter`}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={panelClass}>
        {/* Drag handle (mobile / sheet) */}
        <div className="flex justify-center pt-2 pb-1 shrink-0 md:hidden">
          <span className="block w-10 h-1.5 rounded-full bg-[var(--color-border)]" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] shrink-0">
            <h2 className="cz-modal-title font-semibold text-[var(--color-text)]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none cz-no-select"
            >
              &times;
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-[var(--color-border)] shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
