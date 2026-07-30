---
document_id: "TECH-UX-10"
document_name: "Loading State Patterns"
family: "TECH-UX"
document_type: "UX"
status: "Draft"
version: "0.1"
audience: ["developer", "designer"]
difficulty: "beginner"
reading_time: 8
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Loading State Patterns (TECH-UX-10)

## Booking Loading States

### BrowseBranchesPage (`/browse`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Initial page load | No explicit loader — cards render incrementally as Promise.all resolves across all organisations | React Query `useQuery` with no loading indicator; `branches` is initially undefined, then renders cards |
| Organisations loading | Nothing visible until loaded | `enabled: !!orgs?.length` gates the branches query |

### ResourceListPage (`/branches/:branchId/resources`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Resource slots loading | "Loading slots..." with `animate-pulse` CSS animation | `ResourceListPage.tsx:13` — `<p className="animate-pulse">Loading slots...</p>` when `isLoading` is true |
| Branch name loading | "Branch" placeholder text | `ResourceListPage.tsx:69` — `{branch?.name || 'Branch'}` |
| Resources loading | No explicit skeleton — cards render when data arrives | React Query loading without skeleton fallback |

### BookingFormPage (`/book/:resourceId`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Resource name loading | "Book: Resource" in the heading | `BookingFormPage.tsx:117` — `resource?.name || 'Resource'` |
| Slots loading | No explicit spinner — slot buttons appear when data arrives | React Query conditional render via `slotsData` |
| Form submission | Button shows loading spinner via `loading={bookingMutation.isPending}` prop | `BookingFormPage.tsx:181` — `<Button loading={bookingMutation.isPending}>` |

### BookingConfirmationPage (`/bookings/:id/confirmation`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Booking data loading | No explicit loader — page renders with undefined values until query completes | React Query `useQuery` without loading state check |
| Payment pending | "⏳ Booking Pending" with warning icon and "Your payment is being verified..." message | `BookingConfirmationPage.tsx:56-65` — conditional render when `isPending` is true |

### MyBookingsPage (`/bookings`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Full page loading | `<Skeleton width={200} height={28} />` for title + `<SkeletonList count={5} itemHeight={72} />` for rows | `MyBookingsPage.tsx:90-97` — rendered when `isLoading` is true |
| Cancel mutation | Cancel button shows `disabled:opacity-50` while pending | `MyBookingsPage.tsx:250-251` — `disabled={!cancelReason || cancelMutation.isPending}` |

### MatchListPage (`/matches`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Initial page load | "Loading matches..." — muted text | `MatchListPage.tsx:175` — `if (isLoading) return <p>Loading matches...</p>` |
| Join mutation | Join button shows `disabled:opacity-50` while pending | `MatchListPage.tsx:243` — `disabled={joinMutation.isPending}` |

### MatchLobbyPage (`/matches/:id`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Initial page load | "Loading..." — muted text | `MatchLobbyPage.tsx:87` — `if (isLoading) return <p>Loading...</p>` |
| All mutations | Action buttons disabled while pending via `disabled={xMutation.isPending}` | Join, withdraw, close, cancel buttons all disable while their mutation is in flight |

### BookingModal (shared component at `/bookings?newBooking=true`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Branch list loading | "Loading branches..." muted text | `BookingModal.tsx` — conditional render |
| Resource list loading | "Loading resources..." muted text | Same — per-step loading |
| Slots loading | "Loading available slots..." muted text | `BookingModal.tsx:716` — `{slots.length === 0 && <p>{t('booking.loading_slots')}</p>}` |
| Prepare mutation | Confirm & Pay button shows loading state | `BookingModal.tsx:1033` — `loading={prepareMutation.isPending \|\| bookingMutation.isPending}` |

**Evidence:** All loading states verified against page component source files in `frontend/src/pages/booking/` and `frontend/src/components/booking/BookingModal.tsx`.

---

## Organisation Loading States

### OrgDashboardPage (`/org/:orgId`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Org info loading | `<SkeletonRow count={4} />` — skeleton placeholders | `OrgDashboardPage.tsx:22` — `if (orgLoading) return <div><SkeletonRow count={4} /></div>` |
| Dashboard data loading | `<SkeletonRow count={2} />` shown after org info renders | `OrgDashboardPage.tsx:41` — `{dashLoading && <SkeletonRow count={2} />}` |

### OrgBranchesPage (`/org/:orgId/branches`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Branches loading | `<div className="animate-pulse h-40 ... rounded-xl" />` — pulsing placeholder | `OrgBranchesPage.tsx:16` — `if (isLoading) return <div className="animate-pulse...">` |

### OrgMembersPage (`/org/:orgId/members`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Members list loading | `<div className="animate-pulse h-40 ... rounded-xl" />` — pulsing placeholder | `OrgMembersPage.tsx:52` — `if (isLoading) return <div className="animate-pulse...">` |

### OrgSubscriptionPage (`/org/:orgId/subscription`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Subscription data loading | "Loading..." — muted text, padded | `OrgSubscriptionPage.tsx:32` — `if (isLoading) return <div className="text-sm text-[var(--color-text-muted)] py-8">Loading...</div>` |

### OrgStaffPage (`/org/:orgId/staff`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Staff list loading | No explicit loader — table rows appear when data arrives | React Query conditional render |
| Add staff mutation | Form submit button disabled while pending | Button `disabled` prop based on mutation `isPending` |

### OrgCoachesPage (`/org/:orgId/coaches`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Coaches loading | No explicit loader — list renders when data arrives | React Query conditional render |
| Invite mutation | Invite button disabled while pending | Button `disabled` prop |
| Directory loading | Directory list shows when modal opens | `enabled: !!orgId && inviteOpen` gates the query |

### OrgMarketplacePage (`/org/:orgId/marketplace`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Products loading | No explicit loader | React Query conditional render |

### Remaining Org Pages

| Page | Loading Implementation |
|------|----------------------|
| OrgBookingsPage | Implicit via React Query |
| OrgFinancePage | Implicit via React Query |
| OrgAnnouncementsPage | Implicit via React Query |
| OrgDocumentsPage | Implicit via React Query |
| OrgGalleryPage | Implicit via React Query |
| OrgReportsPage | Implicit via React Query |
| OrgProfilePage | Implicit via React Query |
| OrgWorkingHoursPage | Implicit via React Query |
| OrgPaymentSettingsPage | Implicit via React Query |
| OrgReviewsPage | Implicit via React Query |
| OrgRefereesPage | Implicit via React Query |
| OrgAcademiesPage | Implicit via React Query |
| OrgLeaguesPage | Implicit via React Query |
| OrgTournamentsPage | Implicit via React Query |
| OrgVerificationPage | Implicit via React Query |

**Observable pattern:** Most Org pages rely on React Query's implicit loading (data is undefined until loaded). Only `OrgDashboardPage`, `OrgBranchesPage`, `OrgMembersPage`, and `OrgSubscriptionPage` have explicit loading indicators. Skeleton is used for richer pages; simple muted text for less complex pages.

**Evidence:** All loading states verified against page component source files in `frontend/src/pages/org/`.

---

## Marketplace Loading States

### MarketplacePage (`/marketplace`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Product grid loading | Grid of 8 animated pulse skeleton cards — each has aspect-square placeholder + 3 text lines (title, description, price) | `MarketplacePage.tsx:229-241` — `{isLoading && <div className="grid ... animate-pulse">...}` |
| Wishlist loading | Wishlist data loads in background — heart icons show grey (🤍) until wishlist resolves | React Query loads independently |
| Cart badge loading | Cart count shown after cart query resolves | Conditional render when `cart?.items?.length` available |

### ProductDetailPage (`/marketplace/products/:id`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Product data loading | "Loading..." — centered muted text | `ProductDetailPage.tsx:66` — `if (isLoading) return <div>Loading...</div>` |
| Reviews loading | Reviews section renders "No reviews yet." until reviews query resolves | React Query conditional render |
| Add to cart mutation | Button shows "Adding..." text, disabled while pending | `ProductDetailPage.tsx:161-163` — `disabled={addToCart.isPending}`, button text conditional |

### CartPage (`/marketplace/cart`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Cart data loading | "Loading..." — centered muted text | `CartPage.tsx:210` — `if (isLoading) return <div>Loading...</div>` |
| Address list loading | Address section shows "No saved addresses" until addresses resolve | React Query conditional render |
| Province/city dropdown loading | Dropdown shows "Select Province" until provinces load; city dropdown disabled until province selected | AddressFormModal conditional render with `enabled` flags |
| Shipping check loading | "Checking shipping availability..." — muted text | `CartPage.tsx:398` — `{isShippingLoading && <p>Checking shipping...</p>}` |
| Checkout mutation | Place Order button shows "Processing..." text, disabled while pending | `CartPage.tsx:484-487` — `disabled={checkout.isPending}`, button text conditional |
| Payment confirming overlay | Fixed overlay with spinning loader and "Verifying payment..." / "Waiting for confirmation..." text | `CartPage.tsx:347-356` — conditional on `confirmState` |

### OrderListPage (`/marketplace/orders`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Orders loading | "Loading..." — muted text | `OrderListPage.tsx:117-118` — `{isLoading && <p>Loading...</p>}` |
| Order counts loading | Count badges show 0 until counts resolve; counts fetched with 30s refetch interval | `OrderListPage.tsx:31-35` — `refetchInterval: 30000` |

### OrderDetailPage (`/marketplace/orders/:id`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Order loading | "Loading..." — centered muted text | `OrderDetailPage.tsx:35` — `if (isLoading) return <div>Loading...</div>` |
| Status update mutation | "Updating..." text shown next to action buttons while pending | `OrderDetailPage.tsx:141` — `{updateStatus.isPending && 'Updating...'}` |

### WishlistPage (`/marketplace/wishlist`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Wishlist loading | "Loading..." — centered muted text | `WishlistPage.tsx:37` — `if (isLoading) return <div>Loading...</div>` |
| Add to cart mutation | Button shows "..." while pending | `WishlistPage.tsx:97` — `{addToCart.isPending ? '...' : 'Add to Cart'}` |

### SellerDashboardPage (`/marketplace/seller`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Profile/status loading | "Loading..." — centered muted text | `SellerDashboardPage.tsx:147` — `if (profileLoading) return <div>Loading...</div>` |
| Products loading | No explicit loader — products grid renders when data arrives | React Query conditional render |
| Seller orders loading | No explicit loader — orders list renders when data arrives | React Query conditional render |
| Settlements loading | "Loading..." — muted text | `SellerDashboardPage.tsx:425-426` — `{settlementsLoading && <p>Loading...</p>}` |
| All mutations | Action buttons disabled while pending via `disabled={xMutation.isPending}` | Create product, delete, update order status, request settlement |

### PlayerProductsPage (`/marketplace/player/products`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Products loading | Grid of 3 animated pulse skeleton cards | `PlayerProductsPage.tsx:89-94` — `{isLoading && <div className="grid ... animate-pulse">...}` |
| Mark as sold mutation | Button disabled while pending | `PlayerProductsPage.tsx:130` — `disabled={deleteMutation.isPending}` |

### PlayerProductDetailPage (`/marketplace/player-products/:id`)

| Element | What the user sees | Implementation |
|---------|-------------------|----------------|
| Product loading | "Loading..." — centered muted text | `PlayerProductDetailPage.tsx:16` — `if (isLoading) return <div>Loading...</div>` |

**Evidence:** All loading states verified against page component source files in `frontend/src/pages/marketplace/`.
