/**
 * Shared red circular notification badge for navigation counters.
 * Hides itself when count <= 0. Caps display at "99+".
 */
export default function CountBadge({ count, className = '' }: { count: number; className?: string }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  const value = count > 99 ? '99+' : String(count);
  return (
    <span
      role="status"
      aria-label={`${value} new items`}
      className={`absolute -top-1.5 -right-2 bg-[var(--color-error)] text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 ${className}`}
    >
      {value}
    </span>
  );
}