import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchStore } from './SearchProvider';
import { useAuthStore } from '../../store/auth.store';
import api from '../../services/api';
import EntityPreview from './EntityPreview';

const NAV_COMMANDS = [
  { id: 'nav-book', label: 'Book a Court', icon: '🎾', path: '/browse', group: 'Navigation' },
  { id: 'nav-marketplace', label: 'Marketplace', icon: '🛒', path: '/marketplace', group: 'Navigation' },
  { id: 'nav-bookings', label: 'My Bookings', icon: '📅', path: '/bookings', group: 'Navigation' },
  { id: 'nav-membership', label: 'Membership & Loyalty', icon: '⭐', path: '/membership', group: 'Navigation' },
  { id: 'nav-tournaments', label: 'Tournaments', icon: '🏆', path: '/tournaments', group: 'Navigation' },
  { id: 'nav-academies', label: 'Academies', icon: '🎓', path: '/academies', group: 'Navigation' },
  { id: 'nav-coaches', label: 'Coaches', icon: '👨‍🏫', path: '/coaches', group: 'Navigation' },
  { id: 'nav-notifications', label: 'Notifications', icon: '🔔', path: '/notifications', group: 'Navigation' },
  { id: 'nav-profile', label: 'Profile', icon: '👤', path: '/profile', group: 'Navigation' },
  { id: 'nav-admin', label: 'Admin Dashboard', icon: '📊', path: '/admin', group: 'Admin', requires: 'super_admin' },
  { id: 'nav-reception', label: 'Reception Desk', icon: '🏪', path: '/admin/reception', group: 'Admin' },
  { id: 'nav-finance', label: 'Finance Dashboard', icon: '💰', path: '/admin/finance', group: 'Admin' },
  { id: 'nav-settlements', label: 'Settlements', icon: '💳', path: '/admin/settlements', group: 'Admin' },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const { isOpen, close, query, setQuery, addRecent, recentSearches, togglePin, clearRecent } = useSearchStore();
  const [results, setResults] = useState<any[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [previewEntity, setPreviewEntity] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const terms = q.toLowerCase();
    const navMatches = NAV_COMMANDS.filter(c =>
      (c.label.toLowerCase().includes(terms) || c.id.includes(terms)) &&
      (!c.requires || user?.roles?.some((r: string) => r === c.requires))
    );

    let apiResults: any[] = [];
    try {
      const [users, bookings, orgs] = await Promise.allSettled([
        api.get('/admin/users', { params: { search: terms, limit: 3 } }),
        api.get('/admin/bookings', { params: { search: terms, limit: 3 } }),
        api.get('/admin/organisations', { params: { search: terms, limit: 3 } }),
      ]);

      const getData = (r: any) => r.status === 'fulfilled' ? (r.value.data?.data || r.value.data?.rows || []) : [];
      apiResults = [
        ...getData(users).slice(0, 3).map((r: any) => ({ id: r.id, label: r.full_name || `User #${r.id}`, sublabel: r.email, type: 'user', icon: '👤', path: '/admin/users', entity: r })),
        ...getData(bookings).slice(0, 3).map((r: any) => ({ id: r.id, label: `Booking #${r.id}`, sublabel: `${r.resource_name || ''} ${r.booking_date || ''}`, type: 'booking', icon: '📅', path: '/bookings', entity: r })),
        ...getData(orgs).slice(0, 3).map((r: any) => ({ id: r.id, label: r.name || `Org #${r.id}`, sublabel: r.slug, type: 'organisation', icon: '🏢', path: '/admin/organisations', entity: r })),
      ];
    } catch {}
    setResults([...navMatches, ...apiResults]);
    setSelectedIdx(0);
  }, [user]);

  useEffect(() => { doSearch(query); }, [query, doSearch]);

  const select = (idx: number) => {
    const item = results[idx];
    if (!item) return;
    addRecent(item.label, item.type);
    if (item.entity) { setPreviewEntity(item.entity); return; }
    navigate(item.path);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') select(selectedIdx);
    if (e.key === 'Escape') { if (previewEntity) setPreviewEntity(null); else close(); }
  };

  if (!isOpen) return null;

  const groups: Record<string, any[]> = {};
  for (const r of results) {
    const g = r.group || r.type;
    if (!groups[g]) groups[g] = [];
    groups[g].push(r);
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={close} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[101] w-full max-w-2xl bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <span className="text-lg">🔍</span>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Search users, bookings, organisations, or type a command..."
            className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]" />
          <kbd className="px-1.5 py-0.5 text-[10px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded font-mono text-[var(--color-text-muted)]">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {!query && recentSearches.length > 0 && (
            <div className="mb-2">
              <div className="flex justify-between px-3 py-2"><span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">Recent</span><button onClick={clearRecent} className="text-[10px] text-[var(--color-text-muted)] hover:underline">Clear</button></div>
              {recentSearches.slice(0, 5).map((r, i) => (
                <div key={i} onClick={() => setQuery(r.query)} className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-[var(--color-bg)]">
                  <span className="text-[var(--color-text-muted)]">🕐</span><span className="text-[var(--color-text)]">{r.query}</span><span className="text-[10px] text-[var(--color-text-muted)] ml-auto">{r.type}</span>
                </div>
              ))}
            </div>
          )}

          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase">{group}</div>
              {items.map((item: any) => {
                const idx = results.indexOf(item);
                return (
                  <div key={`${item.type}-${item.id}`}
                    onClick={() => select(idx)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer ${idx === selectedIdx ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text)] hover:bg-[var(--color-bg)]'}`}>
                    <span>{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{item.label}</p>
                      {item.sublabel && <p className="text-xs text-[var(--color-text-muted)] truncate">{item.sublabel}</p>}
                    </div>
                    <span className="text-[10px] text-[var(--color-text-muted)] capitalize">{item.type}</span>
                    <button onClick={e => { e.stopPropagation(); togglePin(item.label); }} className="text-xs text-[var(--color-text-muted)] hover:text-yellow-500">📌</button>
                  </div>
                );
              })}
            </div>
          ))}

          {query && results.length === 0 && (
            <p className="px-3 py-8 text-sm text-[var(--color-text-muted)] text-center">No results for "{query}"</p>
          )}
        </div>
      </div>

      {previewEntity && <EntityPreview entity={previewEntity} onClose={() => setPreviewEntity(null)} onNavigate={(path) => { navigate(path); close(); }} />}
    </>
  );
}
