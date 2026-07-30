---
document_id: "TECH-DEV-02"
document_name: "Coding Standards — React"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["frontend-developer"]
difficulty: "intermediate"
reading_time: 20
depends_on: ["TECH-DEV-01"]
related: ["TECH-DEV-03", "TECH-DEV-04", "TECH-UX-02"]
---
```

# CourtZon Coding Standards — React

## 1. Purpose

Define mandatory React coding standards for all frontend code in CourtZon.

## 2. Scope

All `.tsx` files in `frontend/src/`.

## 3. Component Architecture

### 3.1 Functional Components Only
All components must be functional components with hooks. No class components.

### 3.2 Default Exports
Every page component must use `export default`. Shared components may use named exports.

```typescript
// Page component — default export
export default function BookingListPage() { ... }

// Shared component — named export
export function Pagination(props: PaginationProps) { ... }
```

### 3.3 Component File Name
Component file names match the component name: `BookingListPage.tsx`, `Pagination.tsx`.

## 4. Data Fetching

Use TanStack Query (`@tanstack/react-query`) for all server state:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

// READ
const { data, isLoading } = useQuery({
  queryKey: ['bookings', userId, statusFilter],
  queryFn: () => api.get(`/bookings?status=${statusFilter}`).then(r => r.data),
});

// WRITE
const mutation = useMutation({
  mutationFn: (data: CreateBookingInput) => api.post('/bookings', data),
  onSuccess: () => {
    showToast(t('booking.created'));
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
  },
  onError: (err) => showToast(getErrorMessage(err), 'error'),
});
```

## 5. Permission Gating

Every action button must be wrapped in `<Can>`:

```tsx
import { Can } from '../permissions/Can';

<Can permission="bookings.cancel">
  <button onClick={handleCancel}>{t('common.cancel')}</button>
</Can>
```

## 6. Localization

All visible text must use `t()` from `useTranslation()`:

```tsx
import { useTranslation } from '../i18n';

function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t('booking.details.title')}</h1>;
}
```

## 7. Loading and Error States

Every data-fetching component must handle all states:

```tsx
if (isLoading) return <SkeletonRow count={3} />;
if (error) return <ErrorState message={getErrorMessage(error)} />;
if (!data || data.length === 0) return <EmptyState icon="📅" title={t('common.no_results')} />;

return <DataView data={data} />;
```

## 8. Toast Notifications

Use `useToast()` for user feedback:

```tsx
import { useToast } from '../components/ui/Toast';

const { showToast } = useToast();
showToast(t('booking.created'));                    // success (default)
showToast(t('error.generic'), 'error');              // error
showToast(t('warning.low_stock'), 'warning');         // warning
showToast(t('booking.updated'), 'success', { label: 'Undo', onClick: undo });
```

## 9. CSS Conventions

Use Tailwind CSS with CSS custom properties from the theme:

```tsx
<div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
  <h2 className="text-sm font-semibold text-[var(--color-text)]">Title</h2>
  <p className="text-xs text-[var(--color-text-muted)]">Description</p>
</div>
```

## 10. Route Conventions

Routes are defined in `App.tsx` using React Router v6 with lazy imports:

```tsx
const BookingListPage = lazy(() => import('./pages/booking/BookingListPage'));

<Route path="/bookings" element={<BookingListPage />} />
```

## 11. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (base) |
| TECH-DEV-03 | Folder Structure Standard |
| TECH-UX-02 | Design Token Reference |
| TECH-UX-09 | Empty State Patterns |
| TECH-UX-10 | Loading State Patterns |
| TECH-UX-11 | Error State Patterns |
