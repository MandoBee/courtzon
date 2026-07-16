import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function MarketplaceHighlights() {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['home-marketplace'],
    queryFn: () => api.get('/marketplace/products?limit=4').then((r) => r.data),
    staleTime: 30000,
  });

  const products = data?.data || [];

  if (!products.length) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🏪</span>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Marketplace</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-none">
        {products.map((p: any) => (
          <button
            key={p.id}
            onClick={() => navigate(`/marketplace/products/${p.id}`)}
            className="shrink-0 w-36 md:w-44 text-left bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden hover:shadow-[var(--shadow-md)] transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="h-20 md:h-24 bg-[var(--color-bg)] flex items-center justify-center overflow-hidden">
              {(() => { try { const imgs = JSON.parse(p.images || '[]'); if (imgs?.[0]) return <img src={imgs[0]} alt={p.name} className="w-full h-full object-cover" />; } catch {} return <span className="text-3xl">🏸</span>; })()}
            </div>
            <div className="p-2.5 md:p-3">
              <p className="text-xs font-semibold text-[var(--color-text)] truncate">{p.name}</p>
              {p.price && (
                <p className="text-xs text-[var(--color-primary)] font-medium mt-0.5">
                  {p.currency_symbol || '$'}{p.price}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
