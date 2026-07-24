import { useEffect } from 'react';
import { create } from 'zustand';

interface RecentSearch {
  query: string;
  type: string;
  timestamp: number;
}

interface SearchState {
  isOpen: boolean;
  query: string;
  recentSearches: RecentSearch[];
  pinnedSearches: string[];
  open: () => void;
  close: () => void;
  setQuery: (q: string) => void;
  addRecent: (query: string, type: string) => void;
  togglePin: (query: string) => void;
  clearRecent: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  isOpen: false,
  query: '',
  recentSearches: JSON.parse(localStorage.getItem('recentSearches') || '[]'),
  pinnedSearches: JSON.parse(localStorage.getItem('pinnedSearches') || '[]'),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '' }),
  setQuery: (q) => set({ query: q }),
  addRecent: (query, type) => {
    const recent = [{ query, type, timestamp: Date.now() }, ...get().recentSearches.filter(r => r.query !== query)].slice(0, 10);
    localStorage.setItem('recentSearches', JSON.stringify(recent));
    set({ recentSearches: recent });
  },
  togglePin: (query) => {
    const pinned = get().pinnedSearches.includes(query)
      ? get().pinnedSearches.filter(p => p !== query)
      : [...get().pinnedSearches, query];
    localStorage.setItem('pinnedSearches', JSON.stringify(pinned));
    set({ pinnedSearches: pinned });
  },
  clearRecent: () => {
    localStorage.removeItem('recentSearches');
    set({ recentSearches: [] });
  },
}));

export function useGlobalSearch() {
  const { isOpen, open, close, query, setQuery } = useSearchStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? close() : open();
      }
      if (e.key === 'Escape' && isOpen) close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, open, close]);

  return { isOpen, open, close, query, setQuery };
}
