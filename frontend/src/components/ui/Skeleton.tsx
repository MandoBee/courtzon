interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'full' | 'none';
}

const radiusMap: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
  none: '',
};

export function Skeleton({ className = '', width, height, rounded = 'md' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`cz-skeleton ${radiusMap[rounded]} ${className}`}
      style={{ width: width ?? '100%', height: height ?? 16 }}
    />
  );
}

interface SkeletonListProps {
  count?: number;
  itemHeight?: number | string;
  itemClassName?: string;
  gap?: number;
}

export function SkeletonList({ count = 3, itemHeight = 64, itemClassName = '', gap = 12 }: SkeletonListProps) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`cz-skeleton rounded-lg ${itemClassName}`}
          style={{ height: itemHeight, width: '100%' }}
        />
      ))}
    </div>
  );
}

/** Card-shaped skeleton matching the common list-item layout (avatar + two lines). */
export function SkeletonRow({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
          <Skeleton width={48} height={48} rounded="lg" />
          <div className="flex-1 space-y-2">
            <Skeleton height={14} width="70%" />
            <Skeleton height={12} width="45%" />
          </div>
        </div>
      ))}
    </div>
  );
}
