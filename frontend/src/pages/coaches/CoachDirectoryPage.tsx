import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatPricePerHour } from '../../utils/currency';
import { useAuthStore } from '../../store/auth.store';

function CoachCard({ c, isOwn }: { c: any; isOwn: boolean }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center text-lg font-bold text-[var(--color-primary)]">
          {c.full_name?.charAt(0)}
        </div>
        <div>
          <h3 className="font-medium text-[var(--color-text)]">{c.full_name}</h3>
          <p className="text-xs text-[var(--color-text-muted)]">{c.experience_years ? `${c.experience_years} years` : 'Coach'}</p>
        </div>
        {isOwn && <span className="ml-auto text-xs text-[var(--color-primary)] font-medium">You</span>}
      </div>
      {c.bio && <p className="text-sm text-[var(--color-text-muted)] mb-3 line-clamp-2">{c.bio}</p>}
      <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] mb-3">
        {c.hourly_rate && <span>{formatPricePerHour(Number(c.hourly_rate), c.currency_code)}</span>}
        {c.rating_count > 0 && <span>★ {Number(c.rating_avg).toFixed(1)} ({c.rating_count})</span>}
      </div>
      <div className="flex gap-2">
        <Link to={`/coaches/${c.id}`} className="flex-1 text-center py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs">
          View Profile
        </Link>
        {!isOwn && (
          <Link to={`/coaches/${c.id}/book`} className="flex-1 text-center py-2 border rounded-[var(--radius-md)] text-xs">
            Book Session
          </Link>
        )}
      </div>
    </div>
  );
}

export default function CoachDirectoryPage() {
  const user = useAuthStore((s) => s.user);
  const { data: coaches } = useQuery({
    queryKey: ['coaches'],
    queryFn: () => api.get('/coaches?limit=50').then((r) => r.data.data),
  });

  const ownId = user?.isCoach ? coaches?.find((c: any) => c.user_id === user.id)?.id : null;
  const ownCard = ownId ? coaches?.find((c: any) => c.id === ownId) : null;
  const others = ownId ? coaches?.filter((c: any) => c.id !== ownId) : coaches;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Coaches</h1>
        {user?.isCoach && (
          <Link to="/coaches/profile" className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm">
            My Coach Profile
          </Link>
        )}
      </div>

      {ownCard && (
        <div className="mb-6 max-w-md">
          <h2 className="text-sm font-medium text-[var(--color-text-muted)] mb-3">Your Profile</h2>
          <CoachCard c={ownCard} isOwn />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {others?.map((c: any) => <CoachCard key={c.id} c={c} isOwn={false} />)}
        {(!coaches || !coaches.length) && <div className="col-span-full text-center py-12 text-sm text-[var(--color-text-muted)]">No coaches found</div>}
      </div>
    </div>
  );
}
