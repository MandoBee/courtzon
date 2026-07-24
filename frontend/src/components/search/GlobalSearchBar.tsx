import { useSearchStore } from './SearchProvider';

export default function GlobalSearchBar() {
  const { open, query } = useSearchStore();

  return (
    <button onClick={open} className="flex items-center gap-2 px-4 py-1.5 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-primary)] transition-colors w-full max-w-md">
      <span>🔍</span>
      <span className="flex-1 text-left">{query || 'Search anything...'}</span>
      <kbd className="px-1.5 py-0.5 text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded font-mono">⌘K</kbd>
    </button>
  );
}
