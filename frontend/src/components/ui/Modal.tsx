import { useEffect, useId, useRef } from 'react';

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
  /**
   * Opt-in modal-dialog accessibility. When enabled the panel exposes
   * role="dialog" / aria-modal with an accessible name, focus moves into the
   * dialog on open, Tab is trapped inside it, and focus returns to the opener
   * on close. Off by default so the ~80 unrelated dialogs are unchanged.
   */
  a11yDialog?: boolean;
}

/** Elements that can receive keyboard focus inside the dialog panel. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  variant = 'auto',
  footer,
  a11yDialog = false,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

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

  // Focus management — opt-in only.
  useEffect(() => {
    if (!open || !a11yDialog || typeof document === 'undefined') return;
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [open, a11yDialog]);

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
    ? `w-full ${sizeClasses[size]} max-h-[85vh] flex flex-col !p-0 bg-[var(--color-surface)] rounded-t-[var(--radius-xl)] shadow-xl cz-sheet-enter cz-reserve-bnav md:mb-0`
    : `w-full ${sizeClasses[size]} max-h-[85vh] md:max-h-[90vh] flex flex-col !p-0 bg-[var(--color-surface)] rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-lg)] shadow-xl cz-sheet-enter md:!animate-none cz-reserve-bnav md:mb-0`;

  /** Keep Tab / Shift+Tab focus cycling inside the dialog panel. */
  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === panel) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={overlayRef}
      className={`cz-modal-overlay fixed inset-0 z-[70] ${overlayClass} p-0 md:p-4 cz-fade-enter`}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={panelClass}
        role={a11yDialog ? 'dialog' : undefined}
        aria-modal={a11yDialog ? true : undefined}
        aria-labelledby={a11yDialog && title ? titleId : undefined}
        tabIndex={a11yDialog ? -1 : undefined}
        onKeyDown={a11yDialog ? handlePanelKeyDown : undefined}
      >
        {/* Drag handle (mobile / sheet) */}
        <div className="flex justify-center pt-2 pb-1 shrink-0 md:hidden" aria-hidden="true">
          <span className="block w-10 h-1.5 rounded-full bg-[var(--color-border)]" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] shrink-0">
            <h2 id={a11yDialog ? titleId : undefined} className="cz-modal-title font-semibold text-[var(--color-text)]">{title}</h2>
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
