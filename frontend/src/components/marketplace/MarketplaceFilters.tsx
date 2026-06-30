import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import api from '../../services/api';

interface CategoryCrumb {
  id: number;
  name: string;
  parent_id: number | null;
}

interface MarketplaceFiltersProps {
  categoryId: number | null;
  sportIds: number[];
  brandIds: number[];
  tagIds: number[];
  inStockOnly: boolean;
  gender: string[];
  onCategoryChange: (id: number | null) => void;
  onToggleSport: (id: number) => void;
  onToggleBrand: (id: number) => void;
  onToggleTag: (id: number) => void;
  onInStockChange: (checked: boolean) => void;
  onGenderChange: (genders: string[]) => void;
  onClearAll: () => void;
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--color-border)] pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
      <h3 className="text-sm font-bold text-green-400 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function CheckboxRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 py-1 cursor-pointer group">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
      />
      <span className="text-sm text-[var(--color-text)] group-hover:text-[var(--color-primary)]">{label}</span>
    </label>
  );
}

export default function MarketplaceFilters({
  categoryId,
  sportIds,
  brandIds,
  tagIds,
  inStockOnly,
  gender,
  onCategoryChange,
  onToggleSport,
  onToggleBrand,
  onToggleTag,
  onInStockChange,
  onGenderChange,
  onClearAll,
}: MarketplaceFiltersProps) {
  const { data: allCategories = [] } = useQuery<CategoryCrumb[]>({
    queryKey: ['mp-categories-all'],
    queryFn: () =>
      api
        .get('/marketplace/categories')
        .then((r) => r.data.data as CategoryCrumb[]),
  });

  const { data: sports = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['mp-sports-marketplace'],
    queryFn: () => api.get('/sports/marketplace').then((r) => r.data as { id: number; name: string }[]),
  });

  const { data: brands = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['mp-brands'],
    queryFn: () => api.get('/marketplace/brands').then((r) => r.data as { id: number; name: string }[]),
  });

  const { data: tags = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['mp-tags'],
    queryFn: () => api.get('/marketplace/tags').then((r) => r.data as { id: number; name: string }[]),
  });

  // Build category tree
  const { rootCategories, childrenMap } = useMemo(() => {
    const root: CategoryCrumb[] = [];
    const chMap: Record<number, CategoryCrumb[]> = {};

    for (const cat of allCategories) {
      if (!cat.parent_id) {
        root.push(cat);
      } else {
        if (!chMap[cat.parent_id]) chMap[cat.parent_id] = [];
        chMap[cat.parent_id].push(cat);
      }
    }
    return { rootCategories: root, childrenMap: chMap };
  }, [allCategories]);

  // Determine which category is selected at each level
  const selectedCat = useMemo(() => {
    if (!categoryId) return null;
    return allCategories.find((c) => c.id === categoryId) || null;
  }, [categoryId, allCategories]);

  // Walk up the tree to find main/sub/sub-sub
  const { mainCat, subCat, subSubCat } = useMemo<{
    mainCat: CategoryCrumb | null;
    subCat: CategoryCrumb | null;
    subSubCat: CategoryCrumb | null;
  }>(() => {
    if (!selectedCat) return { mainCat: null, subCat: null, subSubCat: null };
    const chain: CategoryCrumb[] = [];
    let current: CategoryCrumb | null = selectedCat;
    while (current) {
      chain.unshift(current);
      current = current.parent_id ? (allCategories.find((c) => c.id === current!.parent_id) || null) : null;
    }
    return {
      mainCat: chain[0] || null,
      subCat: chain[1] || null,
      subSubCat: chain[2] || null,
    };
  }, [selectedCat, allCategories]);

  const handleMainChange = (catId: string) => {
    if (!catId) { onCategoryChange(null); return; }
    onCategoryChange(Number(catId));
  };

  const handleSubChange = (catId: string) => {
    if (!catId) {
      if (mainCat) { onCategoryChange(mainCat.id); return; }
      onCategoryChange(null);
      return;
    }
    onCategoryChange(Number(catId));
  };

  const handleSubSubChange = (catId: string) => {
    if (!catId) {
      if (subCat) { onCategoryChange(subCat.id); return; }
      if (mainCat) { onCategoryChange(mainCat.id); return; }
      onCategoryChange(null);
      return;
    }
    onCategoryChange(Number(catId));
  };

  const handleGenderToggle = (value: string) => {
    if (gender.includes(value)) {
      onGenderChange(gender.filter((g) => g !== value));
    } else {
      onGenderChange([...gender, value]);
    }
  };

  const hasActiveFilters =
    categoryId !== null ||
    sportIds.length > 0 ||
    brandIds.length > 0 ||
    tagIds.length > 0 ||
    inStockOnly ||
    gender.length > 0;

  const subCategories = mainCat ? (childrenMap[mainCat.id] || []) : [];
  const subSubCategories = subCat ? (childrenMap[subCat.id] || []) : [];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-green-400">Filters</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <FilterSection title="Category">
        <div className="space-y-2">
          <select
            value={mainCat?.id ?? ''}
            onChange={(e) => handleMainChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded border bg-[var(--color-surface)] text-[var(--color-text)]"
          >
            <option value="">All Categories</option>
            {rootCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {subCategories.length > 0 && (
            <select
              value={subCat?.id ?? ''}
              onChange={(e) => handleSubChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded border bg-[var(--color-surface)] text-[var(--color-text)]"
            >
              <option value="">All {mainCat?.name || 'Subcategories'}</option>
              {subCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {subSubCategories.length > 0 && (
            <select
              value={subSubCat?.id ?? ''}
              onChange={(e) => handleSubSubChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded border bg-[var(--color-surface)] text-[var(--color-text)]"
            >
              <option value="">All {subCat?.name || ''}</option>
              {subSubCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </FilterSection>

      <FilterSection title="Gender">
        <CheckboxRow
          id="gender-male"
          label="Male"
          checked={gender.includes('male')}
          onChange={() => handleGenderToggle('male')}
        />
        <CheckboxRow
          id="gender-female"
          label="Female"
          checked={gender.includes('female')}
          onChange={() => handleGenderToggle('female')}
        />
        <CheckboxRow
          id="gender-unisex"
          label="Unisex"
          checked={gender.includes('unisex')}
          onChange={() => handleGenderToggle('unisex')}
        />
      </FilterSection>

      <FilterSection title="Sport">
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {sports.map((s) => (
            <CheckboxRow
              key={s.id}
              id={`sport-${s.id}`}
              label={s.name}
              checked={sportIds.includes(s.id)}
              onChange={() => onToggleSport(s.id)}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Brand">
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {brands.map((b) => (
            <CheckboxRow
              key={b.id}
              id={`brand-${b.id}`}
              label={b.name}
              checked={brandIds.includes(b.id)}
              onChange={() => onToggleBrand(b.id)}
            />
          ))}
          {!brands.length && (
            <p className="text-xs text-[var(--color-text-muted)]">No brands available</p>
          )}
        </div>
      </FilterSection>

      <FilterSection title="Tags">
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {tags.map((t) => (
            <CheckboxRow
              key={t.id}
              id={`tag-${t.id}`}
              label={t.name}
              checked={tagIds.includes(t.id)}
              onChange={() => onToggleTag(t.id)}
            />
          ))}
          {!tags.length && (
            <p className="text-xs text-[var(--color-text-muted)]">No tags available</p>
          )}
        </div>
      </FilterSection>

      <FilterSection title="Availability">
        <CheckboxRow
          id="in-stock"
          label="In stock only"
          checked={inStockOnly}
          onChange={() => onInStockChange(!inStockOnly)}
        />
      </FilterSection>
    </div>
  );
}
