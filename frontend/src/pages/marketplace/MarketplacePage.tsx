import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import MarketplaceFilters from '../../components/marketplace/MarketplaceFilters';
import ProductCardImage, { getProductImages } from '../../components/marketplace/ProductCardImage';

import { Can } from '../../permissions/Can';
import { useTranslation } from '../../i18n';

type Tab = 'all' | 'sellers' | 'players';

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export default function MarketplacePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sportIds, setSportIds] = useState<number[]>([]);
  const [brandIds, setBrandIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [gender, setGender] = useState<string[]>([]);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const sellerType = tab === 'all' ? undefined : tab === 'players' ? 'player' : 'seller';

  const { data: products, isLoading } = useQuery({
    queryKey: ['mp-products', tab, search, categoryId, sportIds, brandIds, tagIds, inStockOnly, gender, sort, page],
    queryFn: () => {
      const params: Record<string, string | number> = { sort, page, limit: 20 };
      if (sellerType) params.sellerType = sellerType;
      if (search) params.search = search;
      if (categoryId) params.categoryId = categoryId;
      if (sportIds.length === 1) params.sportId = sportIds[0];
      else if (sportIds.length > 1) params.sportIds = sportIds.join(',');
      if (brandIds.length === 1) params.brandId = brandIds[0];
      else if (brandIds.length > 1) params.brandIds = brandIds.join(',');
      if (tagIds.length) params.tagIds = tagIds.join(',');
      if (inStockOnly) params.stockStatus = 'in_stock';
      if (gender.length && gender.length < 3) params.gender = gender.join(',');
      return api.get('/marketplace/products', { params }).then((r) => {
        const d = r.data;
        if (!d || !Array.isArray(d.data)) throw new Error('Invalid response: expected { data: [...] }');
        return d;
      });
    },
    retry: false,
    staleTime: 30000,
  });

  const { data: wishlist } = useQuery({
    queryKey: ['mp-wishlist'],
    queryFn: () => api.get('/marketplace/wishlist').then((r) => r.data.data),
  });

  const { data: cart } = useQuery({
    queryKey: ['mp-cart'],
    queryFn: () => api.get('/marketplace/cart').then((r) => r.data),
    staleTime: 30000,
  });

  const { data: playerStatus } = useQuery({
    queryKey: ['mp-player-status'],
    queryFn: () => api.get('/marketplace/player/status').then((r) => r.data),
  });

  const wishlistIds = new Set((wishlist || []).map((w: { product_id: number }) => w.product_id));
  const wishlistCount = (wishlist || []).length;
  const cartCount = cart?.items?.length || 0;

  const toggleWishlist = useMutation({
    mutationFn: (productId: number) =>
      wishlistIds.has(productId)
        ? api.delete(`/marketplace/wishlist/${productId}`)
        : api.post(`/marketplace/wishlist/${productId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mp-wishlist'] }),
  });

  const resetPage = () => setPage(1);

  const handleCategoryChange = (id: number | null) => {
    setCategoryId(id);
    resetPage();
  };

  const handleToggleSport = (id: number) => {
    setSportIds((prev) => toggleId(prev, id));
    resetPage();
  };

  const handleClearAllFilters = () => {
    setCategoryId(null);
    setSportIds([]);
    setBrandIds([]);
    setTagIds([]);
    setInStockOnly(false);
    setGender([]);
    resetPage();
  };

  const filterProps = {
    categoryId,
    sportIds,
    brandIds,
    tagIds,
    inStockOnly,
    gender,
    onCategoryChange: handleCategoryChange,
    onToggleSport: handleToggleSport,
    onToggleBrand: (id: number) => { setBrandIds((prev) => toggleId(prev, id)); resetPage(); },
    onToggleTag: (id: number) => { setTagIds((prev) => toggleId(prev, id)); resetPage(); },
    onInStockChange: (checked: boolean) => { setInStockOnly(checked); resetPage(); },
    onGenderChange: (genders: string[]) => { setGender(genders); resetPage(); },
    onClearAll: handleClearAllFilters,
  };

  const productLink = (p: { id: number; org_type_slug?: string }) =>
    p.org_type_slug === 'player' ? `/marketplace/player-products/${p.id}` : `/marketplace/products/${p.id}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('marketplace.title')}</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <Link to="/marketplace/wishlist" className="relative p-2 text-sm border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] transition-colors">
            🤍
            {wishlistCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[var(--color-error)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {wishlistCount > 99 ? '99+' : wishlistCount}
              </span>
            )}
          </Link>
          <Link to="/marketplace/cart" className="relative p-2 text-sm border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] transition-colors">
            🛒
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[var(--color-error)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </Link>
          <Can permission="marketplace.player-products.manage">
            {playerStatus?.active && (
              <Link to="/marketplace/player/products" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] transition-colors text-[var(--color-text)]">
                My Products
              </Link>
            )}
          </Can>
          <Link to="/marketplace/orders" className="relative p-2 text-sm border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] transition-colors">
            📋
          </Link>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[var(--color-border)] pb-2 flex-wrap">
        {(['all', 'sellers', 'players'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setPage(1); }}
            className={`px-4 py-2 text-sm rounded-t-[var(--radius-md)] capitalize ${
              tab === t ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t === 'all' ? `All (${products?.total ?? '...'})` : t}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start flex-wrap">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-56 shrink-0 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
          <MarketplaceFilters {...filterProps} />
        </aside>

        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              placeholder={t('marketplace.search_placeholder')}
              className="w-full max-w-[160px] sm:w-48 md:w-56 px-3 py-2 text-sm rounded-[var(--radius-md)] border bg-[var(--color-surface)]"
            />
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((o) => !o)}
              className="lg:hidden px-3 py-2 text-sm border rounded-[var(--radius-md)] shrink-0"
            >
              {mobileFiltersOpen ? 'Apply Filters' : 'Filters'}
            </button>
            <p className="text-sm text-[var(--color-text-muted)] mr-auto">
              {products?.total != null ? `${products.total} product${products.total === 1 ? '' : 's'}` : t('common.loading')}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-[var(--color-text-muted)]">Sort by:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border bg-[var(--color-surface)]"
              >
                <option value="newest">{t('marketplace.newest')}</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {mobileFiltersOpen && (
            <div className="lg:hidden bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-4">
              <MarketplaceFilters {...filterProps} />
            </div>
          )}

          {tab === 'players' && (
            <div className="bg-[var(--color-info-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 text-sm text-[var(--color-info-text)]">
              These products are listed by players on free selling plans. Contact the seller directly to arrange purchase.
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] overflow-hidden animate-pulse">
                  <div className="aspect-square bg-[var(--color-border)]" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-[var(--color-border)] rounded w-1/2" />
                    <div className="h-4 bg-[var(--color-border)] rounded w-3/4" />
                    <div className="h-3 bg-[var(--color-border)] rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : !products?.data?.length ? (
            <div className="text-center py-12 text-[var(--color-text-muted)]">
              <div className="text-4xl mb-3">🛍️</div>
              <p className="text-lg font-medium">{t('marketplace.no_products')}</p>
              <p className="text-sm mt-1">Try adjusting your filters or search terms</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.data.map((p: {
                id: number; name: string; images?: string; price: string | number;
                discounted_price?: string | number; currency_code: string; quantity: number;
                shop_name?: string; seller_phone?: string; seller_full_name?: string; org_type_slug?: string;
              }) => (
                <Link
                  key={p.id}
                  to={productLink(p)}
                  className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden hover:shadow-md transition-all hover:-translate-y-0.5 group"
                >
                  <div className="aspect-square bg-[var(--color-border)] relative overflow-hidden">
                    <ProductCardImage
                      images={getProductImages(p.images)}
                      name={p.name}
                      className="w-full h-full rounded-none text-3xl"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); toggleWishlist.mutate(p.id); }}
                      className="absolute top-2 right-2 p-1.5 bg-[var(--color-surface)]/90 rounded-full shadow text-sm hover:scale-110 transition-transform"
                    >
                      {wishlistIds.has(p.id) ? '❤️' : '🤍'}
                    </button>
                    {p.discounted_price && Number(p.discounted_price) > 0 && Number(p.discounted_price) < Number(p.price) && (
                      <span className="absolute top-2 left-2 bg-[var(--color-error)] text-white text-xs px-2 py-0.5 rounded-full font-medium">
                        -{Math.round((1 - Number(p.discounted_price) / Number(p.price)) * 100)}%
                      </span>
                    )}
                    {p.quantity <= 0 && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-sm font-medium px-3 py-1 rounded-full text-white">Sold Out</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-xs text-[var(--color-text-muted)] truncate">
                      {p.org_type_slug === 'player' ? p.seller_full_name || 'Player' : p.shop_name || 'Unknown Shop'}
                    </p>
                    {p.org_type_slug === 'player' && p.seller_phone && (
                      <p className="text-xs text-[var(--color-primary)] font-medium">📞 {p.seller_phone}</p>
                    )}
                    <p className="text-sm font-medium text-[var(--color-text)] line-clamp-2 leading-snug">{p.name}</p>
                    <div className="flex items-baseline gap-2 pt-1">
                      {p.discounted_price && Number(p.discounted_price) > 0 && Number(p.discounted_price) < Number(p.price) ? (
                        <><span className="text-sm font-bold text-[var(--color-primary)]">{formatPrice(Number(p.discounted_price), p.currency_code)}</span><span className="text-xs text-[var(--color-text-muted)] line-through">{formatPrice(Number(p.price), p.currency_code)}</span></>
                      ) : (
                        <span className="text-sm font-bold text-[var(--color-primary)]">{formatPrice(Number(p.price), p.currency_code)}</span>
                      )}
                    </div>
                    {p.quantity > 0 && p.quantity <= 5 && (
                      <p className="text-xs text-[var(--color-warning)] font-medium">Only {p.quantity} left</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {products && products.total > products.limit && (
            <div className="flex items-center justify-between pt-4 flex-wrap gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">
                Showing {(page - 1) * products.limit + 1}-{Math.min(page * products.limit, products.total)} of {products.total}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(1)} disabled={page <= 1} className="px-2 py-1.5 text-xs border rounded disabled:opacity-30">«</button>
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="text-xs px-3 py-1.5 border rounded disabled:opacity-30">{t('marketplace.prev')}</button>
                <span className="text-xs text-[var(--color-text-muted)] px-2">Page {page} of {Math.ceil(products.total / products.limit)}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(Math.ceil(products.total / products.limit), p + 1))} disabled={page >= Math.ceil(products.total / products.limit)} className="text-xs px-3 py-1.5 border rounded disabled:opacity-30">{t('marketplace.next')}</button>
                <button type="button" onClick={() => setPage(Math.ceil(products.total / products.limit))} disabled={page >= Math.ceil(products.total / products.limit)} className="px-2 py-1.5 text-xs border rounded disabled:opacity-30">»</button>
              </div>
            </div>
          )}
          {products && products.total <= products.limit && products.total > 0 && (
            <p className="text-xs text-[var(--color-text-muted)] text-center pt-2">Showing all {products.total} products</p>
          )}
        </div>
      </div>

    </div>
  );
}
