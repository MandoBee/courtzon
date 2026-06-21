import type { ReactNode } from 'react';
import { Card } from '../../../components/ui/Card';

/** Keeps live preview visible while scrolling the token editor (sticky within admin main). */
export function StickyPreviewPanel({
  title,
  header,
  children,
}: {
  title?: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full sticky top-4 self-start z-10 max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain">
      <Card className="space-y-3 shadow-[var(--shadow-md)]">
        {title ? <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2> : null}
        {header}
        {children}
      </Card>
    </div>
  );
}
