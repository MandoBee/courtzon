---
document_id: "TECH-UX-11"
document_name: "Error State Patterns"
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

# Error State Patterns (TECH-UX-11)

## Booking Error States

### BrowseBranchesPage (`/browse`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| API call failure | No explicit error state — React Query retry mechanism handles silently | No `isError` branch in component; renders empty state "No facilities available" |

### ResourceListPage (`/branches/:branchId/resources`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Branch load failure | No explicit error state — React Query retries | No error handler |
| Resources load failure | Renders with `resources` as undefined — empty state "No resources available" | No error handler |
| Slots load failure | `slotsData` is undefined — "No slots available for this date" | No error handler |

### BookingFormPage (`/book/:resourceId`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Booking creation failure | **Toast notification** with error message + inline error message below form | `BookingFormPage.tsx:62` — `showToast('Booking failed: ' + message, 'error')` and `BookingFormPage.tsx:172-176` — `<p className="text-[var(--color-error)]">{error message}</p>` |
| Resource load failure | Name falls back to "Resource" | No explicit error handler |

### BookingConfirmationPage (`/bookings/:id/confirmation`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Booking load failure | No explicit error state — page renders with undefined booking fields | No error handler |
| Wrong user access | Backend returns 403 Forbidden — toast not handled on this page | No client-side error handling |

### MyBookingsPage (`/bookings`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Bookings load failure | No explicit error state — skeleton loading persists or data is undefined | No `isError` branch |
| Cancel mutation failure | No toast notification — mutation does not have onError handler | `cancelMutation` definition at `MyBookingsPage.tsx:52-60` — only has `onSuccess`, no `onError` |

### MatchListPage (`/matches`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Join failure | **Toast notification:** `{err?.response?.data?.message || 'Failed to join'}` with error type | `MatchListPage.tsx:118` — `onError: (err) => showToast(..., 'error')` |
| Withdraw failure | **Toast notification:** `{err?.response?.data?.message || 'Failed to withdraw'}` with error type | `MatchListPage.tsx:124` — `onError: (err) => showToast(..., 'error')` |
| Match list load failure | No explicit error state — "Loading matches..." persists or data is undefined | No `isError` branch |

### MatchLobbyPage (`/matches/:id`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Match not found | "Match not found" — muted text | `MatchLobbyPage.tsx:88` — `if (!match) return <p>Match not found</p>` |
| Join failure | **Toast notification:** error message from server or `t('match.failed_to_join')` | `MatchLobbyPage.tsx:49-51` |
| Withdraw failure | **Toast notification:** error message or `t('match.failed_to_withdraw')` | `MatchLobbyPage.tsx:60-62` |
| Close applications failure | **Toast notification:** error message or `t('match.failed_to_close')` | `MatchLobbyPage.tsx:72-74` |
| Cancel match failure | **Toast notification:** error message or `t('match.failed_to_cancel')` | `MatchLobbyPage.tsx:83-85` |

### BookingModal (shared component)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Booking creation failure | **Toast notification** with error message | `BookingModal.tsx:317-318` — `onError: (err) => showToast(..., 'error')` |
| Prepare failure | **Toast notification** with error message | BookingModal prepare mutation onError |
| Payment gateway failure | **Toast notification** with payment error message | BookingModal payment handling |

**General pattern:** The Booking module uses the global Toast system (`frontend/src/components/ui/Toast.tsx`) for mutation errors. Loading/empty states rely on inline muted text. Notable gap: `BrowseBranchesPage`, `ResourceListPage`, `BookingConfirmationPage`, and `MyBookingsPage` (load failures) lack explicit error UI — they depend on React Query's built-in retry mechanism.

**Evidence:** All error states verified against page component source files in `frontend/src/pages/booking/` and `frontend/src/components/booking/`.

---

## Organisation Error States

### OrgDashboardPage (`/org/:orgId`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Invalid orgId | "Invalid organisation" — centered text | `OrgDashboardPage.tsx:21` — `if (!orgId) return <div>Invalid organisation</div>` |
| API failure | No explicit error state — React Query retries silently | No `isError` branch |
| Org not found | Backend returns 404 — no client-side handler | No error boundary |

### OrgBranchesPage (`/org/:orgId/branches`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Invalid orgId | "Invalid organisation" — muted text | `OrgBranchesPage.tsx:15` — `if (!orgId) return <div>Invalid organisation</div>` |
| API failure | No explicit error state — React Query retries | No `isError` branch |

### OrgMembersPage (`/org/:orgId/members`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Invalid orgId | "Invalid organisation" — plain text | `OrgMembersPage.tsx:51` — `if (!orgId) return <div>Invalid organisation</div>` |
| Update member mutation failure | **Toast notification** with error message via `getErrorMessage` | `OrgMembersPage.tsx:48` — `onError: (err) => showToast(getErrorMessage(err, 'Failed to update'), 'error')` |

### OrgSubscriptionPage (`/org/:orgId/subscription`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Invalid orgId | "Invalid organisation" | `OrgSubscriptionPage.tsx:31` |
| Subscription load failure | **Error card** with heading "Failed to load subscription data", error message, and Retry button | `OrgSubscriptionPage.tsx:33-41` — `if (isError) return (<div className="bg-[var(--color-error-bg)]..."> <p>Failed to load subscription data</p> <p>{error message}</p> <button>Retry</button> </div>)` |
| Subscription request failure | Mutation error displayed inline | Modal handles error |

### OrgStaffPage (`/org/:orgId/staff`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Add staff mutation failure | **Toast notification** with error message | `OrgStaffPage.tsx` — `onError` handler with `showToast` |
| Update role mutation failure | **Toast notification** with error message | Same pattern |
| Remove staff mutation failure | **Toast notification** with error message | Same pattern |
| Permission override failure | **Toast notification** with error message | Same pattern |

### OrgCoachesPage (`/org/:orgId/coaches`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Invite mutation failure | **Toast notification** with error message | `OrgCoachesPage.tsx:52` — `showToast('Failed to send invite: ' + errMsg(err), 'error')` |
| Respond mutation failure | **Toast notification** with error message | `OrgCoachesPage.tsx:64-65` |
| Remove mutation failure | **Toast notification** with error message | `OrgCoachesPage.tsx:72-73` |

### OrgSettingsPage (`/org/:orgId/settings`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Invalid orgId | "Invalid organisation" — plain text | `OrgSettingsPage.tsx:14` — `if (!orgId) return <div>Invalid organisation</div>` |

### Remaining Org Pages

| Page | Error Handling |
|------|---------------|
| OrgBookingsPage | No explicit error state |
| OrgFinancePage | No explicit error state |
| OrgMarketplacePage | No explicit error state |
| OrgAnnouncementsPage | Mutation failures via toast (create/update/delete) |
| OrgDocumentsPage | Delete failure via toast |
| OrgGalleryPage | Upload/delete failure via toast |
| OrgReportsPage | No explicit error state |
| OrgProfilePage | Mutation failure via toast on update |
| OrgWorkingHoursPage | Mutation failure via toast on hours update |
| OrgPaymentSettingsPage | Mutation failure via toast on settings update |
| OrgReviewsPage | No explicit error state |
| OrgRefereesPage | No explicit error state |
| OrgAcademiesPage | No explicit error state |
| OrgLeaguesPage | No explicit error state |
| OrgTournamentsPage | No explicit error state |
| OrgVerificationPage | No explicit error state |

**General pattern:** Organisation pages primarily use the global Toast system (`frontend/src/components/ui/Toast.tsx`) for mutation error handling (staff, coaches, members, announcements, documents, gallery, profile, settings). Read-only pages (dashboard, branches, bookings, finance, reports, reviews, referees, academies, leagues, tournaments, verification) lack explicit error UI and depend on React Query's built-in retry mechanism. The OrgSubscriptionPage is the only page with a dedicated error card with retry button.

**Evidence:** All error states verified against page component source files in `frontend/src/pages/org/`.

---

## Marketplace Error States

### MarketplacePage (`/marketplace`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Products load failure | No explicit error state — query has `retry: false` so empty state shows after failed load | `MarketplacePage.tsx:56` — `retry: false`, no `isError` branch; shows "No products found" |
| Wishlist load failure | No explicit error state — React Query retries silently | No error handler |
| Wishlist toggle failure | No toast notification — mutation does not have onError handler | `toggleWishlist` at line 80-86 — only onSuccess |

### ProductDetailPage (`/marketplace/products/:id`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Product load failure | "Product not found" — query returns null on error | `ProductDetailPage.tsx:67` — `if (!product) return <div>Product not found</div>` |
| Add to cart failure | **Toast notification** with error message | `ProductDetailPage.tsx:43-47` — `onSuccess: () => showToast('Added to cart!')` — but **no onError handler**; mutation error silently fails |
| Review submission failure | **No toast** — mutation only has onSuccess, no onError | `ProductDetailPage.tsx:57-64` — no error handling |

### CartPage (`/marketplace/cart`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Cart load failure | No explicit error state — shows empty cart if data undefined | No `isError` branch |
| Address save failure | **Toast notification:** "Failed: {error message}" with error type | `CartPage.tsx:64` — `onError: (err) => showToast('Failed: ' + ..., 'error')` |
| Address load failure | No addresses returned — shows "No saved addresses" | React Query silent retry |
| Shipping check failure | No explicit error — shipping section renders without data | No error handler |
| Checkout failure | **Toast notification:** error message from server or generic "Checkout failed" | `CartPage.tsx:205-207` — `onError: (err) => showToast(..., 'error')` |
| Coupon validation failure | Coupon result is undefined — no discount applied, no error shown | `validateCoupon` has `retry: false` but no error handling |
| Card payment cancellation | **Toast notification:** "Payment cancelled" with warning type | `CartPage.tsx:360-361`, `:386-388` — `showToast('Payment cancelled', 'warning')` |
| Card payment timeout | **Toast notification:** "Payment confirmation is taking longer than expected..." with warning type | `CartPage.tsx:342` — `onTimeout` callback |

### OrderListPage (`/marketplace/orders`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Orders load failure | No explicit error state — "No orders found." if data is undefined | No `isError` branch |
| Cancel order failure | **No toast** — mutation `onSuccess` refreshes list, no `onError` handler | `OrderListPage.tsx:37-41` — only `onSuccess` |
| Confirm delivery failure | **No toast** — same as cancel, only `onSuccess` | `OrderListPage.tsx:43-47` — only `onSuccess` |

### OrderDetailPage (`/marketplace/orders/:id`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Order load failure | "Order not found" — query returns null on error | `OrderDetailPage.tsx:36` — `if (!order) return <div>Order not found</div>` |
| Status update failure | "Update failed" — inline text next to action buttons | `OrderDetailPage.tsx:142` — `{updateStatus.isError && 'Update failed'}` |

### WishlistPage (`/marketplace/wishlist`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Wishlist load failure | "Loading..." persists or empty state shown | No `isError` branch |
| Remove from wishlist failure | **Toast notification:** error message with error type | `WishlistPage.tsx:25` — `onError: (err) => showToast(..., 'error')` |
| Add to cart failure | **Toast notification:** error message with error type | `WishlistPage.tsx:34` — `onError: (err) => showToast(..., 'error')` |

### SellerDashboardPage (`/marketplace/seller`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Profile load failure | "Loading..." persists or activation CTA shows | No `isError` branch |
| Activate seller failure | **Toast notification:** "Failed to activate: {error}" with error type | `SellerDashboardPage.tsx:122` — `onError: (err) => showToast(..., 'error')` |
| Delete product failure | **Toast notification:** "Failed to delete product: {error}" with error type | `SellerDashboardPage.tsx:137` — `onError: (err) => showToast(..., 'error')` |
| Update order status failure | **Toast notification:** "Failed to update order: {error}" with error type | `SellerDashboardPage.tsx:144` — `onError: (err) => showToast(..., 'error')` |
| Request settlement failure | **Toast notification:** "Failed to request settlement: {error}" with error type | `SellerDashboardPage.tsx:112` — `onError: (err) => showToast(..., 'error')` |
| Settlements load failure | Shows "No settlements yet." if data is undefined | No error handler |

### PlayerProductsPage (`/marketplace/player/products`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Products load failure | Shows "No products yet" if data is undefined | No `isError` branch |
| Mark as sold failure | **Toast notification:** error message with error type | `PlayerProductsPage.tsx:46-48` — `onError: (err) => showToast(..., 'error')` |

### PlayerProductDetailPage (`/marketplace/player-products/:id`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Product load failure | "Product not found" — query returns null on error | `PlayerProductDetailPage.tsx:17` — `if (!product) return <div>Product not found</div>` |

**General pattern:** Marketplace pages use the global Toast system for mutation errors (checkout, address save, wishlist remove/add-to-cart, seller actions). Read pages (product list, order list, wishlist) lack explicit error UI and depend on React Query's built-in retry mechanism. The CartPage has the most comprehensive error handling (checkout, addresses, payment cancellation, payment timeout). Several mutations (cancel order, confirm delivery, add to cart, wishlist toggle, review submit) lack `onError` handlers.

**Evidence:** All error states verified against page component source files in `frontend/src/pages/marketplace/`.
