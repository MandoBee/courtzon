---
document_id: "TECH-UX-09"
document_name: "Empty State Patterns"
family: "TECH-UX"
document_type: "UX"
status: "Draft"
version: "0.1"
audience: ["developer", "designer"]
difficulty: "beginner"
reading_time: 10
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Empty State Patterns (TECH-UX-09)

## Booking Empty States

### BrowseBranchesPage (`/browse`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No organisations exist or no branches returned | "No facilities available yet" — centered muted text in full-width column | `BrowseBranchesPage.tsx:79-83` — `{(!branches || branches.length === 0) && <div>No facilities available yet</div>}` |

### ResourceListPage (`/branches/:branchId/resources`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Branch has no resources | "No resources available at this branch" — centered muted text | `ResourceListPage.tsx:110-114` — conditional render when `resources` array is empty/falsy |
| No slots available for selected date | "No slots available for this date" below the resource card | `ResourceListPage.tsx:18-20` — `ResourceSlots` sub-component when `available.length === 0` |

### BookingFormPage (`/book/:resourceId`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No slots available for the selected date | "No slots available" — muted text in place of slot buttons | `BookingFormPage.tsx:83` — `if (!available.length) return <p>No slots available</p>` |
| Resource not found (data loading) | "Book: Resource" — falls back to generic resource name | `BookingFormPage.tsx:117` — `resource?.name || 'Resource'` |

### MyBookingsPage (`/bookings`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| User has no bookings | "No bookings yet" — centered muted text via translation key | `MyBookingsPage.tsx:263-267` — `{bookings.length === 0 && <div>{t('booking.empty')}</div>}` |
| No bookings match the selected status filter | "No bookings yet" — same empty state regardless of filter | Same as above (no per-filter empty message) |

### MatchListPage (`/matches`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No matches in the current tab | "No matches in this tab" — centered muted text | `MatchListPage.tsx:272-274` — `{filtered.length === 0 && <div>No matches in this tab</div>}` |
| Discover tab: all matches dismissed or none available | "No matches in this tab" | Same (generic per-tab message) |
| Applied tab: no pending applications | "No matches in this tab" | Same |
| Joined tab: not a participant in any match | "No matches in this tab" | Same |
| Dismissed tab: no dismissed matches | "No matches in this tab" | Same |
| History tab: no past/expired matches | "No matches in this tab" | Same |

### MatchLobbyPage (`/matches/:id`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No participants yet | "No participants yet. Be the first to join!" — muted text in the participants section | `MatchLobbyPage.tsx:128-129` — `{participants.length === 0 ? <p>No participants yet...</p>}` |

### BookingConfirmationPage (`/bookings/:id/confirmation`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Booking not found | No explicit empty state — relies on React Query error | No empty state handler; page renders with `booking?.resource_name` fallback |

**Evidence:** All empty states verified against page component source files in `frontend/src/pages/booking/`.

---

## Organisation Empty States

### OrgDashboardPage (`/org/:orgId`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No booking data (new org) | Dashboard renders with zeros for all KPIs | `OrgDashboardPage.tsx` — defaults: `d.todayBookings ?? 0`, `d.totalBranches ?? 0`, etc. |
| No pending actions | Pending action links show 0 | `OrgDashboardPage.tsx:71-78` — `{d.pendingAccessRequests ?? 0} pending` |
| No org ID in URL | "Invalid organisation" — centered muted text | `OrgDashboardPage.tsx:21` — `if (!orgId) return <div>Invalid organisation</div>` |

### OrgBranchesPage (`/org/:orgId/branches`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No branches | "No branches found." — muted text | `OrgBranchesPage.tsx:26-28` — `{items.length === 0 ? <p>No branches found.</p>}` |

### OrgMembersPage (`/org/:orgId/members`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No members matching filters | "No members found matching your filters." — centered muted text | `OrgMembersPage.tsx` — conditional render when `rows.length === 0` |
| No branch filter options | No branches dropdown rendered | Branch list from API; if empty, filters still show |

### OrgStaffPage (`/org/:orgId/staff`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No staff members | "No staff members added yet." — muted text | `OrgStaffPage.tsx` — conditional render |

### OrgCoachesPage (`/org/:orgId/coaches`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No coaches | "No coaches associated with this organisation yet." | `OrgCoachesPage.tsx` — conditional render |
| No invitable coaches in directory | Empty directory list in Invite modal | Directory query returns `[]` |

### OrgSubscriptionPage (`/org/:orgId/subscription`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No active subscription | "No Plan" as plan name; shows "Get Started" action | `OrgSubscriptionPage.tsx:58` — `{sub.planName || 'No Plan'}` |
| No transaction history | Empty transaction list section | Conditional render |

### OrgMarketplacePage (`/org/:orgId/marketplace`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No products listed | Empty products list — muted text | Conditional render |

### OrgBookingsPage (`/org/:orgId/bookings`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No bookings | Empty bookings table — "No bookings found" | Conditional render |

### OrgFinancePage (`/org/:orgId/finance`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No transactions | "No transactions found." | Conditional render |
| No settlements | "No settlements found." | Conditional render |

### OrgAnnouncementsPage (`/org/:orgId/announcements`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No announcements | "No announcements yet." | Conditional render |

### OrgDocumentsPage (`/org/:orgId/documents`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No documents uploaded | "No documents uploaded." | Conditional render |

### OrgGalleryPage (`/org/:orgId/gallery`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No gallery images | "No gallery images yet." | Conditional render |

### OrgReviewsPage (`/org/:orgId/reviews`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No reviews | "No reviews yet." with 0.0 average | Conditional render |

### OrgVerificationPage (`/org/:orgId/verification`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No verification documents | Empty documents section | Conditional render |
| No verification history | Empty history timeline | Conditional render |

**Evidence:** All empty states verified against page component source files in `frontend/src/pages/org/`.

---

## Marketplace Empty States

### MarketplacePage (`/marketplace`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No products match filters | "No products found" with shopping bag emoji + "Try adjusting your filters or search terms" — centered text | `MarketplacePage.tsx:242-247` — `{!products?.data?.length && <div>...}` |
| No wishlist items | Heart icon badge shows 0 (no badge rendered) | `MarketplacePage.tsx:136-140` — conditional count badge |
| No cart items | Cart icon badge shows 0 (no badge rendered) | `MarketplacePage.tsx:144-148` — conditional count badge |

### ProductDetailPage (`/marketplace/products/:id`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Product not found | "Product not found" — centered muted text | `ProductDetailPage.tsx:67` — `if (!product) return <div>Product not found</div>` |
| No reviews yet | "No reviews yet." — muted text in reviews section | `ProductDetailPage.tsx:204` — `{!reviews?.data?.length && <p>No reviews yet.</p>}` |

### CartPage (`/marketplace/cart`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Cart is empty | "Your cart is empty" — centered muted text + "Browse products" link | `CartPage.tsx:211-215` — `{!mergedCart?.items?.length && ...}` |
| No saved addresses | "No saved addresses" — muted text in address section | `CartPage.tsx:326` — `{!addresses?.length && <p>No saved addresses</p>}` |

### OrderListPage (`/marketplace/orders`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No orders | "No orders found." — centered muted text | `OrderListPage.tsx:120` — `{!orders?.data?.length && <p>No orders found.</p>}` |
| No orders match filter | Same "No orders found." regardless of filter | Same as above (no per-filter message) |

### OrderDetailPage (`/marketplace/orders/:id`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Order not found | "Order not found" — centered muted text | `OrderDetailPage.tsx:36` — `if (!order) return <div>Order not found</div>` |

### WishlistPage (`/marketplace/wishlist`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Wishlist is empty | "Your wishlist is empty" with heart emoji + "Browse products" link — centered | `WishlistPage.tsx:39-46` — `{!items?.length && ...}` |
| Item is sold out | Item shown with reduced opacity (opacity-60) and "Sold Out" button text | `WishlistPage.tsx:66` — `{isSoldOut ? 'opacity-60' : ''}`, `:97` — button shows "Sold Out" |

### SellerDashboardPage (`/marketplace/seller`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No selling account (not activated) | Activation CTA: "Activate Free Selling" button with explainer text | `SellerDashboardPage.tsx:161-173` |
| Pending admin approval | "Pending Admin Approval" with clock emoji + explainer text | `SellerDashboardPage.tsx:153-159` |
| No products in products tab | No explicit empty state — products grid renders empty | No conditional empty handler |
| No orders in orders tab | "No orders yet." — muted text | `SellerDashboardPage.tsx:389` — `{!sellerOrders?.data?.length && <p>No orders yet.</p>}` |
| No settlements | "No settlements yet." — muted text | `SellerDashboardPage.tsx:428` — `{!settlements?.data?.length && <p>No settlements yet.</p>}` |
| At max 5 product limit | Warning banner: "You've reached the 5-item limit. Mark some products as sold to free up slots." | `PlayerProductsPage.tsx:73-77` — `{totalCount >= 5 && <div>...}` |

### PlayerProductsPage (`/marketplace/player/products`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| No products | "No products yet" + "Tap 'Add Product' to list your first item for sale." — centered | `PlayerProductsPage.tsx:95-98` — `{!products?.length && <div>...}` |
| Max 5 products reached | Add Product button shows "(5/5)" and is disabled | `PlayerProductsPage.tsx:65-66` — `disabled={totalCount >= 5}`, button text shows count |

### PlayerProductDetailPage (`/marketplace/player-products/:id`)

| Condition | What the user sees | Implementation |
|-----------|-------------------|----------------|
| Product not found | "Product not found" — centered muted text | `PlayerProductDetailPage.tsx:17` — `if (!product) return <div>Product not found</div>` |

**Evidence:** All empty states verified against page component source files in `frontend/src/pages/marketplace/`.
