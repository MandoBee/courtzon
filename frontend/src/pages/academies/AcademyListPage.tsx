import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';

export default function AcademyListPage() {
  const { data: academies, isLoading } = useQuery({
    queryKey: ['academies'],
    queryFn: () => api.get('/academies').then((r) => r.data?.data || []),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Academies</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {academies?.map((a: any) => (
          <Link key={a.id} to={`/academies/${a.id}`}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 hover:shadow-[var(--shadow-md)] transition-all">
            <h3 className="font-medium text-[var(--color-text)] mb-1">{a.name}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{a.organisation_name}{a.sport_name ? ` • ${a.sport_name}` : ''}</p>
            {a.description && <p className="text-sm text-[var(--color-text-muted)] mt-2 line-clamp-2">{a.description}</p>}
          </Link>
        ))}
        {(!academies || !academies.length) && <div className="col-span-full text-center py-12 text-sm text-[var(--color-text-muted)]">No academies yet</div>}
      </div>
    </div>
  );
}
