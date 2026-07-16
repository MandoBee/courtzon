import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useWorkspaceStore } from '../../store/workspace.store';
import api from '../../services/api';

export default function RecommendationsSection() {
  const navigate = useNavigate();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const { data: coachesData } = useQuery({
    queryKey: ['home-recommend-coaches'],
    queryFn: () => api.get('/coaches?limit=4').then((r) => r.data),
    staleTime: 30000,
    enabled: activeWorkspace === 'player',
  });

  const coaches = coachesData?.data || [];

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">💡</span>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Recommended</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-none">
        {coaches.length === 0 && (
          <div
            className="shrink-0 w-48 md:w-56 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-4 cursor-pointer hover:border-[var(--color-primary)] transition-colors"
            onClick={() => navigate('/coaches')}
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-lg mb-2">
              👨‍🏫
            </div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Find a Coach</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Start improving your game today.</p>
          </div>
        )}
        {coaches.map((c: any) => (
          <button
            key={c.id}
            onClick={() => navigate(`/coaches/${c.id}`)}
            className="shrink-0 w-44 md:w-52 text-left bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4 hover:shadow-[var(--shadow-md)] transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-base font-bold text-[var(--color-primary)]">
                {c.full_name?.charAt(0) || 'C'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text)] truncate">{c.full_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{c.sport_name || 'Coach'}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{c.bio || 'Available for sessions'}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
