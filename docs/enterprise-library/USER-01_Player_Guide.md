---
document_id: "USER-01"
document_name: "Player Guide"
family: "USER"
document_type: "GUIDE"
status: "Draft"
version: "0.1"
audience: ["player", "end-user"]
difficulty: "beginner"
reading_time: 10
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Product Management"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Player Guide (USER-01) — Booking a Court

## Chapter: Booking a Court

### 1. Purpose

The Booking feature allows you to reserve sports courts and facilities at your chosen club or organisation. You can book courts for private matches, join public matches, and manage your reservations — all from a single interface.

### 2. Roles

**Primary role:** Player
**Supported roles:** Any authenticated user with an active account

### 3. Permissions

The following permission keys control what you can do:

| Permission | What it allows |
|-----------|---------------|
| `bookings.create` | Create new bookings and prepare (hold) slots |
| `bookings.view` | View your bookings and resource slot availability |
| `bookings.cancel` | Cancel your own bookings |
| `bookings.check-in` | Check in to a confirmed booking |
| `bookings.matchmaking` | Start matchmaking and manage applicants |
| `matches.view` | Browse public matches |
| `matches.apply` | Apply to join public matches |

These permissions are assigned to your **role(s)** by your organisation admin or super admin.

### 4. Prerequisites

Before you can book a court:

1. **Active account** — You must be logged in to the CourtZon platform
2. **Organisation membership** — You don't need to be a member; any logged-in user can browse public facilities
3. **Available court** — The branch/resource must have open slots for your desired date and time
4. **Payment method** (if booking with payment) — Wallet balance, cash, or card as supported by the branch

### 5. Step-by-Step: Book a Court

#### Step 1: Browse Facilities

1. Navigate to **Browse** (`/browse`) from the navigation bar or bottom nav
2. You'll see a grid of facility cards — each shows:
   - Branch name and city
   - Organisation name (clickable link)
   - Access type badge: `open` (book freely), `restricted` (request approval), `private`
   - Average rating (if available)
3. Facilities requiring approval show a "Request Access" button

#### Step 2: Select a Branch

1. Click on a facility card to go to its resource list (`/branches/:branchId/resources`)
2. You'll see:
   - Branch name and address
   - Date picker (defaults to today)
   - Grid of resources/courts with name, type, sport, capacity, and operating hours

#### Step 3: Choose a Resource and Time

1. Each resource card shows available time slots for the selected date
2. Available slots appear as clickable time buttons (e.g., "10:00", "11:00")
3. If there are more than 8 slots, a "+N more" link opens the full booking form
4. Click a slot to navigate to the booking form with pre-filled date and time

#### Step 4: Complete the Booking Form

On the booking form (`/book/:resourceId`):

1. **Date** — Pre-filled from previous step; you can change it (minimum: today)
2. **Time slot** — Select from available slots (highlighted when selected)
3. **Payment Method** — Choose between:
   - **Wallet** — Pay from your wallet balance (if sufficient, booking is instantly confirmed)
   - **Cash** — Pay at the facility (booking confirmed immediately, payment pending)
   - **Card** — Pay online via payment gateway (booking created as pending_payment)
4. **Notes** (optional) — Add any special requests
5. Click **Confirm Booking**

#### Step 5: Payment (if applicable)

- **Wallet payment:** Booking is instantly confirmed; amount deducted from your wallet
- **Cash payment:** Booking is instantly confirmed; pay at the facility
- **Card/Online payment:** You'll be redirected to the payment gateway; booking is confirmed after successful payment

#### Step 6: Receive Confirmation

After successful booking:

1. You're redirected to the **Confirmation Page** (`/bookings/:id/confirmation`)
2. See a green checkmark with "Booking Confirmed!"
3. Your **QR code** is displayed — show this at the facility for check-in
4. The QR code is also available offline in the app
5. Options: **View My Bookings** or **Book Another**

If payment is pending (card payment), the page shows ⏳ "Booking Pending" with auto-polling every 3 seconds until confirmed.

### 6. Booking a Public Match (Matchmaking)

1. On the booking form or BookingModal, select **Match type: Public**
2. Optionally set matchmaking criteria:
   - Min/Max age
   - Target gender
   - Skill level
   - Max players (default: 2)
   - Application deadline
   - Auto-accept applicants
3. Complete payment as usual
4. Your booking appears in **Matches** (`/matches`) under the "Joined" tab
5. Other players can discover and apply to join your match
6. You can **Manage Applicants** from your booking or the match lobby

### 7. Managing Your Bookings

Go to **My Bookings** (`/bookings`):

- **Filter by status** — All, Confirmed, Pending, Checked In, Completed, Cancelled
- **Sort** — By date or nearest (requires location permission)
- **Cancel** — Click "Cancel" on a confirmed booking, enter a reason, confirm
- **View QR** — Click the QR link to reopen your confirmation page
- **Manage** — For public matches, click "Manage" to view/applicants
- **Pagination** — Adjust rows per page (10/20/30/50) and navigate pages

### 8. Validation Rules

| Rule | Error Message |
|------|---------------|
| Date must be in YYYY-MM-DD format | Zod schema validation |
| Time must be in HH:mm format | Zod schema validation |
| End time must be after start time | Server-enforced |
| Selected range must align to slot boundaries | "Selected time range must be aligned to slot boundaries" |
| Slots must be consecutive (no gaps) | "booking range does not cover any complete slot" |
| Payment method must be cash, card, wallet, online, or cod | Zod enum validation |
| Matchmaking deadline must be before booking start | "Deadline must be before the booking start time" |
| Cancel requires a reason | "reason: Required" — min 1, max 500 chars |

### 9. Common Errors and Solutions

| Error | Likely Cause | Solution |
|-------|-------------|----------|
| "One or more slots are currently being booked" | Another user is booking the same slot | Wait a moment and try again |
| "One or more slots are no longer available" | Slot was booked between loading and submission | Go back and select a different slot |
| "Illegal booking state transition" | Attempting to cancel/check-in a booking in terminal state | Check current booking status |
| "Booking is already in terminal state" | Booking already cancelled/completed/expired | No action needed |
| "You can only view your own bookings" | Accessing another user's booking | Use your own booking ID |
| "Not your preparation" | Using someone else's prepare ID | Create your own booking session |
| "Booking preparation session expired" | Prepare session timed out after 10 min | Start the booking process again |

### 10. Related Screens and APIs

| Screen | Route | Purpose |
|--------|-------|---------|
| BrowseBranchesPage | `/browse` | Facility discovery |
| ResourceListPage | `/branches/:branchId/resources` | Resource listing with slots |
| BookingFormPage | `/book/:resourceId` | Booking creation form |
| BookingConfirmationPage | `/bookings/:id/confirmation` | Post-booking confirmation + QR |
| MyBookingsPage | `/bookings` | Booking list and management |
| MatchListPage | `/matches` | Public match discovery |
| MatchLobbyPage | `/matches/:id` | Match detail and lobby |

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/resources/:resourceId/slots` | GET | Get available slots for a date |
| `/bookings` | POST | Create a booking |
| `/bookings` | GET | List my bookings |
| `/bookings/:id` | GET | Get booking detail |
| `/bookings/:id/cancel` | POST | Cancel a booking |
| `/bookings/:id/check-in` | POST | Check in |
| `/matches` | GET | List public matches |
| `/matches/:id/join` | POST | Join a match |
| `/matches/:id/withdraw` | POST | Withdraw application |

**Evidence:** All screens verified at `frontend/src/pages/booking/`. All APIs verified at `backend/src/modules/booking/presentation/booking.routes.ts:8-28`.

---

## Chapter: Browsing Products (Marketplace)

### 1. Purpose

The Marketplace lets you browse, search, and discover sports equipment and accessories. Products are listed by organisations (subscription sellers) and players (free sellers, max 5 items).

### 2. Permissions

| Permission | What it allows |
|-----------|---------------|
| `marketplace.sell` | List products as a seller (requires approved org) |
| `marketplace.player-products.manage` | Manage your player-listed products |

### 3. Browsing Products

**Interface:** MarketplacePage (`/marketplace`)

1. Navigate to **Marketplace** from the bottom nav "More" → Marketplace
2. Browse the product grid — each card shows: image, shop name, product name, price (discounted if applicable), stock badge
3. Use tabs to filter: **All**, **Sellers** (org listings), **Players** (free listings)
4. Use filters sidebar (desktop) or mobile filter panel:
   - Search by keyword
   - Category filter
   - Sport filter
   - Brand filter
   - Tag filter
   - In Stock Only
   - Gender filter
5. Sort by: Newest, Price Low to High, Price High to Low
6. Click the heart icon on any product to add/remove from your wishlist
7. Click a product card to view details

### 4. Viewing Product Details

**Interface:** ProductDetailPage (`/marketplace/products/:id`) or PlayerProductDetailPage (`/marketplace/player-products/:id`)

The product detail page shows:
- **Image gallery** — swipeable product photos
- **Shop name** — clickable seller reference
- **Product name, description, video** (if available)
- **Price** — current price with discount badge and original price strikethrough
- **Stock status** — "In Stock (N available)" or "Out of Stock"
- **Variant selectors** — For products with variants (size, color), select before adding to cart
- **Quantity picker** — Min 1, max 10 or available stock
- **Add to Cart** button (disabled if out of stock or variant not selected)
- **Wishlist** heart toggle
- **Reviews section** — read existing reviews and submit your own (rating 1-5)

### 5. Player Products (Free Listings)

Player-listed products show a blue info banner: "Contact the seller directly to arrange purchase and delivery." Instead of Add to Cart, you'll see **Call** and **WhatsApp** buttons to contact the seller.

### 6. Related Screens and APIs

| Screen | Route | Purpose |
|--------|-------|---------|
| MarketplacePage | `/marketplace` | Product browsing with filters |
| ProductDetailPage | `/marketplace/products/:id` | Seller product detail |
| PlayerProductDetailPage | `/marketplace/player-products/:id` | Player product detail (direct contact) |
| WishlistPage | `/marketplace/wishlist` | Saved products |

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/marketplace/products` | GET | List/filter products |
| `/marketplace/products/:id` | GET | Get product detail |
| `/marketplace/categories` | GET | List categories |
| `/marketplace/brands` | GET | List brands |
| `/marketplace/tags` | GET | List tags |

---

## Chapter: Managing Your Cart

### 1. Adding Items to Cart

1. On a product detail page, select a variant (if required), choose quantity, click **Add to Cart**
2. You're redirected back to marketplace with a success toast
3. The cart icon badge shows your item count

### 2. Viewing and Editing Cart

**Interface:** CartPage (`/marketplace/cart`)

1. Navigate to your cart via the cart icon in the marketplace header
2. Each cart item shows: product image, name, variant, shop, unit price, quantity controls (+/-), remove button
3. Items from free-plan sellers show Call/WhatsApp contact buttons
4. Adjust quantity with +/- buttons (validated against stock)
5. Remove items with the red delete button

### 3. Applying Coupons

1. Enter a coupon code in the coupon field
2. Click **Apply** to validate
3. If valid, the discount appears in green below the field and in the order summary

### 4. Related Screens and APIs

| Screen | Route | Purpose |
|--------|-------|---------|
| CartPage | `/marketplace/cart` | Cart management + checkout |
| MarketplacePage | `/marketplace` | Browsing and adding products |

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/marketplace/cart` | GET | Get cart contents |
| `/marketplace/cart` | POST | Add item to cart |
| `/marketplace/cart/:itemId` | PUT | Update item quantity |
| `/marketplace/cart/:productId` | DELETE | Remove item from cart |
| `/marketplace/coupons/validate` | POST | Validate coupon code |

---

## Chapter: Checkout Process

### 1. Prerequisites

Before checking out:
1. **Items in cart** — at least one item with sufficient stock
2. **Shipping address** — saved address or create one during checkout
3. **Payment method** — Card (online) or Cash on Delivery

### 2. Step-by-Step Checkout

#### Step 1: Select or Add Shipping Address

1. On CartPage, choose from your saved addresses
2. Click **"+ Add Address"** to create a new one
3. Fill in: label (optional), full name, phone, street address, province, city
4. Click **Save Address**

#### Step 2: Shipping Validation

After selecting an address, shipping is checked per seller:
- Each seller shows ✅ (available) or ❌ (cannot ship)
- Shipping cost is displayed per seller
- Items from sellers that can't ship to your address are greyed out

#### Step 3: Apply Coupon (Optional)

Enter a coupon code and click **Apply** for a discount.

#### Step 4: Choose Payment Method

| Method | Description |
|--------|-------------|
| **Card** | Pay online via secure Paymob card iframe |
| **Cash** | Pay on delivery — order confirmed immediately |

#### Step 5: Place Order

1. Review the order summary: subtotal, discount, shipping, total
2. Click **Place Order** — the button shows the total amount
3. For card payment: a secure card iframe opens, enter card details, payment is processed
4. For cash payment: order is created immediately

### 3. Post-Checkout

- **Card success:** You're redirected to `/marketplace/orders` with a success toast
- **Card payment pending:** A payment poller waits for confirmation (up to 90s), then redirects
- **Cash:** Order is confirmed immediately, redirect to orders
- **Payment cancelled:** Warning toast, cart is restored

### 4. Related APIs

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/marketplace/addresses` | GET/POST | Manage shipping addresses |
| `/marketplace/cart/check-shipping` | POST | Validate shipping availability |
| `/marketplace/coupons/validate` | POST | Validate coupon |
| `/marketplace/orders` | POST | Create order (checkout) |

---

## Chapter: Viewing Orders

### 1. Your Orders

**Interface:** OrderListPage (`/marketplace/orders`)

1. Navigate to **Orders** from the marketplace header (clipboard icon)
2. Filter by status tabs: All, Pending, Confirmed, Processing, Shipped, Delivered, Cancelled
3. Each order card shows: items with images, shop name, qty, price per item, subtotal, shipping, total, status badge
4. Order header shows: order ID (truncated), date, expected delivery date
5. Mobile: status tabs become a dropdown

### 2. Order Actions

| Status | Available Action |
|--------|-----------------|
| Pending / Confirmed | **Cancel Order** |
| Shipped | **Confirm Delivery** |
| Delivered | **Request Refund** |

### 3. Order Detail

**Interface:** OrderDetailPage (`/marketplace/orders/:id`)

Click any order to see full detail:
- Order ID (truncated public ID), creation date, status badge
- **Items list** — product name, variant, qty, unit price, total
- **Shipping address** — full address snapshot
- **Tracking** — carrier name and tracking number (if shipped)
- **Payment summary** — subtotal, discount, shipping, total, payment method + status
- **Action buttons** — same as list view

### 4. Related APIs

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/marketplace/orders` | GET | List orders |
| `/marketplace/orders/counts` | GET | Get counts per status |
| `/marketplace/orders/:id` | GET | Get order detail |
| `/marketplace/orders/:id/status` | PUT | Update order status |

---

## Chapter: Managing Reviews

### 1. Writing a Review

1. Navigate to a product detail page
2. Scroll to the **Reviews** section
3. Select a star rating (1-5)
4. Write your review text
5. Click **Submit Review**
6. The review appears immediately in the list below

### 2. Viewing Reviews

The reviews section shows all submitted reviews with:
- User name
- Star rating (★)
- Review text

### 3. Related APIs

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/marketplace/products/:id/reviews` | GET | List product reviews |
| `/marketplace/products/:id/reviews` | POST | Submit a review |

---

## Chapter: Wishlist

### 1. Adding to Wishlist

Click the heart icon (🤍) on any product card or product detail page. It turns red (❤️) when the product is wishlisted.

### 2. Viewing Wishlist

**Interface:** WishlistPage (`/marketplace/wishlist`)

1. Navigate to Wishlist via the heart icon in the marketplace header
2. Each item shows: product image, name, price (with discount), shop name
3. Click image/name to go to product detail
4. Click **Add to Cart** to move an item to your cart
5. Click ✕ to remove from wishlist

### 3. Related APIs

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/marketplace/wishlist` | GET | List wishlist |
| `/marketplace/wishlist/:productId` | POST | Add to wishlist |
| `/marketplace/wishlist/:productId` | DELETE | Remove from wishlist |

---

## Chapter: Player Selling

### 1. Activate Free Selling

1. Navigate to **Seller Dashboard** (`/marketplace/seller`)
2. Click **Activate Free Selling** — no subscription needed
3. Your seller account is created; admin may need to approve
4. Once activated, you can list up to **5 products** for free

### 2. Listing Products as a Player

**Interface:** PlayerProductsPage (`/marketplace/player/products`)

1. Click **Add Product** — a form modal opens
2. Fill in: product name, description, price, condition, images
3. Submit — product is listed as a "player" listing
4. Track your products: status tabs (All, Active, Pending), edit, mark as sold

### 3. Max Product Limit

You can list up to **5 products** on the free plan. When you reach the limit:
- The "Add Product" button is disabled
- A warning message shows: "You've reached the 5-item limit. Mark some products as sold to free up slots."
- Mark a product as **Sold** to free up a slot

### 4. Marking a Product as Sold

1. Click **Sold** on an active or pending product
2. Confirm in the dialog
3. The product is marked `sold` and removed from marketplace listings
4. A slot is freed for a new product

### 5. How Buyers Contact You

Player-listed products show your **phone number** on the product page. Buyers can:
- **Call** you directly via the Call button
- **WhatsApp** you via the WhatsApp button

There is no online checkout for player products — all transactions happen directly between you and the buyer.

### 6. Upgrading to Seller Plan

1. In Seller Dashboard, click **Upgrade** (when at the free plan limit)
2. Browse available seller plans
3. Submit an upgrade request
4. An admin reviews and approves your request
5. On approval, you can list unlimited products with full online checkout

### 7. Related Screens and APIs

| Screen | Route | Purpose |
|--------|-------|---------|
| SellerDashboardPage | `/marketplace/seller` | Seller management hub |
| PlayerProductsPage | `/marketplace/player/products` | Player product CRUD |

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/marketplace/player/activate` | POST | Activate free selling |
| `/marketplace/player/status` | GET | Get selling status |
| `/marketplace/player/products` | GET | List player products |
| `/marketplace/player/products` | POST | Create player product |
| `/marketplace/player/products/:productId` | PUT | Update player product |
| `/marketplace/player/products/:productId/sold` | PATCH | Mark as sold |

---

## Chapter: Making a Payment

### 1. Wallet Deposit Flow

1. Navigate to **My Wallet** (`/my/wallet`) from the bottom nav "More" → Wallet, or from your profile
2. Your current balance is displayed at the top (if no wallet exists, one is auto-created with 0 balance)
3. Click **Deposit Funds** to open the deposit form
4. Enter an amount (must be > 0) and select a payment method (card, bank transfer, etc.)
5. Click **Deposit**:
   - If the gateway processes immediately, your balance updates and a success toast appears
   - If the gateway requires redirect (card payment), a secure payment iframe opens
6. After successful payment, a `wallet_transactions` record is created with `type = 'deposit'`, `direction = 'credit'`
7. The transaction appears in your history below

**Screens:** WalletPage (`frontend/src/pages/player/WalletPage.tsx:42-270`, route `/my/wallet`)
**APIs:** `POST /wallets/deposit` → `wallet.controller.ts:12-33`, `GET /wallets/me` → `wallet.controller.ts:6-10`

### 2. Card Payment Flow

When you choose "card" as a payment method during checkout:

1. The system calls `POST /payments/charge` with `paymentMethod: 'card'`
2. A Paymob payment intention is created via `paymentGateway.charge()`
3. A `payment_transactions` record is created with `status = 'pending'`
4. The response includes `paymentUrl` and `clientSecret` for the frontend card widget
5. You're redirected to the secure payment page (Paymob hosted page or iframe)
6. After completing card details, Paymob processes the payment and sends a **webhook** to `/payments/webhook`
7. The webhook is verified via HMAC signature, processed idempotently (Redis dedup with 24h TTL)
8. On success: `payment_status` → `paid`, events `payment:succeeded` + `payment:completed` emitted
9. On failure: `payment_status` → `failed`, events `payment:failed-event` + `payment:failed` emitted
10. The booking/order is fulfilled by business modules listening to `payment:succeeded`

**Evidence:** `payment.service.ts:113-188` (gateway charge), `payment.service.ts:200-385` (webhook), `payment-aggregate.ts:3-11` (state machine).

### 3. Viewing Payment History

1. Navigate to **My Payments** (`/my/payments`)
2. Filter by tab: All, Completed, Pending, Failed
3. Each payment shows: type, date, amount, and status badge (green for completed, yellow for pending, red for failed)
4. Click a payment to expand and see details

**Screens:** PaymentsPage (`frontend/src/pages/player/PaymentsPage.tsx:11-115`, route `/my/payments`)
**APIs:** `GET /payments/transactions` → `payment.controller.ts:114-119`, `payment.service.ts:928-930`

### 4. Refunds

If a booking is cancelled with a paid payment:

1. The system calculates the refund amount based on the cancellation policy
2. For **gateway payments**: `POST /payments/:id/refund` is called, which invokes `paymentGateway.refund()`
3. For **wallet payments**: The amount is credited back to your wallet automatically via the cancellation flow
4. A `payment:refunded` event is emitted
5. A journal entry is created (`debit = 'Refund Expense'`, `credit = 'Cash'`)

**Evidence:** `payment.service.ts:769-796` (refund), `booking.service.ts:975-1014` (cancellation with refund).

### Related Screens and APIs

| Screen | Route | Purpose |
|--------|-------|---------|
| WalletPage | `/my/wallet` | View balance, deposit funds, transaction history |
| PaymentsPage | `/my/payments` | View payment history with filters |

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/wallets/me` | GET | Get wallet balance and currency |
| `/wallets/deposit` | POST | Deposit funds into wallet |
| `/wallets/withdraw` | POST | Request withdrawal from wallet |
| `/wallets/transactions` | GET | List wallet transactions |
| `/payments/charge` | POST | Initiate a payment charge |
| `/payments/confirm` | POST | Confirm a payment with gateway poll |
| `/payments/status/:id` | GET | Get payment status |
| `/payments/transactions` | GET | List payment transactions |
| `/payments/:id/refund` | POST | Request a refund |

---

## Chapter: Managing Your Wallet

### 1. Viewing Balance

1. Navigate to **My Wallet** (`/my/wallet`)
2. Your current balance is displayed prominently at the top in a Card component
3. The currency code (e.g., `EGP`) and formatted amount are shown
4. If no wallet exists, one is auto-created with 0 balance on first access

**Source:** `wallet.service.ts:16-39` — `getMyWallet()` auto-creates wallet if missing:
```typescript
// wallet.service.ts:16-39
// Queries default_currency from user's country
// INSERT INTO user_wallets (user_id, balance, currency_code, aggregate_version) VALUES (?, 0, ?, 1)
// Returns { id, balance, currencyCode, isLocked }
```

**Evidence:** `wallet.routes.ts:8` — `GET /wallets/me`.

### 2. Depositing Funds

1. On the Wallet page, the **Deposit Funds** card shows an amount input and payment method selector
2. Payment methods are loaded from `GET /public/payment-methods?context=wallet`
3. Enter amount (validated: positive number)
4. Select payment method (card, bank transfer, etc.)
5. Click **Deposit**:
   - `POST /wallets/deposit` called with `{ amount, paymentMethod, returnUrl }`
   - Gateway processes payment → on success, wallet balance updated atomically in DB transaction
   - New balance computed, version incremented (optimistic lock)
   - `wallet_transactions` record created with `direction = 'credit'`, `transaction_type = 'deposit'`
   - `wallet:deposit` event emitted
   - If balance < 50, `wallet:low-balance` event emitted
6. Success toast shown; balance and transaction list refresh

**Source:** `wallet.service.ts:41-100` (deposit), `wallet.service.ts:148-218` (depositV2).

### 3. Withdrawing Funds

1. On the Wallet page or via a withdrawal action
2. `POST /wallets/withdraw` is called with `{ amount, notes?, branchFinancialDetailsId? }`
3. Requires `financial.withdraw` permission
4. The system:
   - Validates balance >= amount
   - Locks wallet row (`FOR UPDATE`)
   - Deducts balance with optimistic version check
   - Creates `withdrawal_requests` record with `status = 'pending'`
   - Creates `wallet_transactions` record with `direction = 'debit'`, `transaction_type = 'withdrawal'`
   - Emits `wallet:withdrawal` event
   - If new balance < 50, emits `wallet:low-balance` event
5. An admin reviews and either **approves** or **rejects** the request
6. On approval: status → `approved`, then eventually `completed` after payout
7. On rejection: status → `rejected`

**Withdrawal Request Lifecycle:**
```
pending → approved | rejected | cancelled
approved → completed
```

**Evidence:** `wallet.service.ts:102-146` (withdraw), `wallet.service.ts:220-274` (withdrawV2), `withdrawal-request.repository.ts:48-55` (updateStatus).

### 4. Viewing Transaction History

1. On the Wallet page, the **Transaction History** section lists all wallet transactions
2. Each row shows: transaction type (deposit, withdrawal, payment, etc.), description, date, and amount (+ green for credit, - red for debit)
3. Paginated with Previous/Next buttons
4. Filterable by type, date range via API

**Source:** `wallet.repository.ts:94-112` — `findTransactions()` with filters.

### 5. Low Balance Warning

If your wallet balance drops below 50 currency units after any transaction, a `wallet:low-balance` event is emitted (visible as a system notification).

**Evidence:** `wallet-constants.ts:1` — `LOW_BALANCE_THRESHOLD = 50`, `wallet-aggregate.ts:55-57` — `isLowBalance()`.

---

## Chapter: Browsing and Joining Organisations

### 1. Purpose

The Organisation features allow you to discover sports facilities (organisations), view their storefronts, request access to restricted branches, and interact with organisations as a member or player.

### 2. Browsing Organisations

**Interface:** BrowseBranchesPage (`/browse`)

1. Navigate to **Browse** (`/browse`) from the main navigation
2. You'll see a list of facility cards showing:
   - Organisation name and branch name
   - City and address
   - Access type badge (`open` = book freely, `restricted` = request approval, `invite_only` = private)
   - Average rating and review count
   - Sport types available
3. Filtering is available by organisation type, country, and rating (via query params)

**API Endpoint:** `GET /organisations` — paginated list with type, country, rating, verified, active filters

### 3. Viewing an Organisation Storefront

**Interface:** Organisation storefront (`/organisations/:id`)

Click on an organisation name or card to view its public storefront page. The storefront shows:
- Organisation logo, cover image, name, and description
- Contact details (email, phone, website)
- Organisation type badge
- Average rating and review count
- Verified badge (if verified)
- List of active branches with:
  - Branch name, description, city, address
  - Access type badge
  - Operating hours (opening_time / closing_time)
  - Images

**API Endpoint:** `GET /organisations/:id/storefront` — returns public, non-sensitive data only (no financial details, tax info, or documents)

**Source:** `organisation.service.ts:197-234` — `getStorefront()` queries `organisations` + `branches`, returns only public fields.

### 4. Requesting Branch Access

For branches with `access_type = 'restricted'` or `invite_only`, you need approval before booking:

1. Navigate to the branch resource page (`/branches/:branchId/resources`)
2. If the branch is restricted, you'll see a **"Request Access"** button
3. Click to submit an access request
4. The organisation admin reviews your request and either approves or rejects it
5. You can check your access status via the "My Access" link

**API Endpoints:**
- `POST /branches/:branchId/request-access` — Submit access request
- `GET /branches/:branchId/my-access` — Check your access status (returns `pending`, `approved`, `rejected`, or `none`)

**Statuses:** `pending` → `approved` (can book) | `rejected` (cannot book, see note) | `banned` (removed by admin)

**Source:** `organisation.controller.ts:714-734`, `branch.repository.ts` (access request methods).

### 5. Joining an Organisation

Joining an organisation as a member is managed through the **branch access system**:

1. **For open branches:** Simply browse and book — no explicit "join" needed
2. **For restricted branches:** Request access through the branch resource page
3. **For invite-only branches:** An organisation admin must invite you (your user ID is added with approved status)

Once your access is approved:
- You appear in the organisation's member list
- You can book resources/courts at that branch
- You can join coaching sessions and academy programs

### 6. Permissions

| Permission | What it allows |
|-----------|---------------|
| `bookings.create` | Book courts at accessible branches |
| `bookings.view` | View your bookings |
| `branches.view` | View branch details and resources |

### 7. Related Screens

| Screen | Route | Purpose |
|--------|-------|---------|
| BrowseBranchesPage | `/browse` | Facility discovery |
| Organisation Storefront | `/organisations/:id` | Public org profile |
| ResourceListPage | `/branches/:branchId/resources` | Branch resources + access request |

**Evidence:** Storefront API at `organisation.service.ts:197-234`. Organisation listing at `organisation.repository.ts:15-51`. Access request endpoints at `organisation.controller.ts:714-734`. Routes at `organisation.routes.ts:31-55`.

---

## Chapter: Academy Programs

### 1. Purpose

The Academy module lets you browse, enroll in, and track sports training programs offered by your organisation. Programs are structured courses with group divisions, scheduled sessions, and attendance tracking.

### 2. Permissions

| Permission | What it allows |
|-----------|---------------|
| `academy.enroll` | Enroll in an academy program |

### 3. Browsing Programs

**Interface:** AcademyListPage (`/player/academy`)

1. Navigate to **Academy** from the bottom nav "More" → Academy
2. You'll see a grid of program cards — each shows:
   - Program name and category (e.g., "Tennis Beginner", "Swimming Advanced")
   - Skill level badge (beginner, intermediate, advanced)
   - Capacity progress bar (e.g., "12/20 enrolled")
   - Price tag (or "FREE", "MEMBERS ONLY")
   - Status badge (Open, Running, Full, etc.)
3. Filter by category or search by keyword
4. Click a program card to view details

### 4. Viewing Program Details

**Interface:** AcademyDetailPage (`/player/academy/:id`)

The program detail page shows:
- Full description, level, season
- Capacity usage bar with remaining spots
- Price with currency and price type
- **Enroll** button (visible if program status is `open` or `published`)
- If already enrolled: "Enrolled" badge with status (confirmed/waiting)
- If program is full: "Join Waiting List" button

### 5. Enrolling in a Program

1. Click **Enroll** on the program detail page
2. If capacity available: enrollment status is `confirmed` immediately
3. If program is full: enrollment status is `waiting` with a waiting list position
4. A success toast confirms your enrollment
5. Navigate to your enrollments to view details

### 6. Viewing Your Enrollments

**Interface:** My enrollments (`/player/academy/enrollments`)

- List of your enrollments with program name, group assignment, status badge (confirmed/waiting/completed/cancelled)
- Cancel button on confirmed/pending enrollments
- View attendance records per session (if enrolled in a running program)

### 7. Related Screens and APIs

| Screen | Route | Purpose |
|--------|-------|---------|
| AcademyListPage | `/player/academy` | Browse public programs |
| AcademyDetailPage | `/player/academy/:id` | Program detail + enroll |

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/player/academy/programs` | GET | List public programs |
| `/player/academy/programs/:id` | GET | Program detail |
| `/player/academy/enrollments` | POST | Enroll in program |
| `/player/academy/enrollments` | GET | My enrollments |
| `/player/academy/enrollments/:id/cancel` | POST | Cancel enrollment |
| `/player/academy/categories` | GET | Program categories |

---

## Chapter: Tournaments

### 1. Purpose

The Tournament module lets you browse, register for, and participate in tournaments. You can view brackets, standings, and your matches. Formats include knockout, round-robin, and group stage + knockout.

### 2. Permissions

| Permission | What it allows |
|-----------|---------------|
| `tournament.register` | Register for a tournament |
| `tournament.view` | View tournament details, bracket, standings |

### 3. Browsing Tournaments

**Interface:** TournamentListPage (`/tournaments`)

1. Navigate to **Tournaments** from the bottom nav "More" → Tournaments
2. Browse the grid of tournament cards — each shows:
   - Tournament name and format badge (Knockout, Round Robin, etc.)
   - Sport and category
   - Date range and registration window
   - Player count (e.g., "8/16 registered")
   - Registration fee or "Free"
   - Status badge (Registration Open, Running, Completed, etc.)
3. Filter by status, sport, or format
4. Sort by date or name
5. Click a tournament card to view details

### 4. Viewing Tournament Details

**Interface:** TournamentDetailPage (`/tournaments/:id`)

The detail page shows multiple sections:

**Info Card:**
- Name, description, format, sport, category
- Registration window (open/close dates)
- Tournament dates
- Fee and prize description
- Rules
- Status badge with date info

**Registration Section:**
- **Register** button if registration is open
- **Cancel Registration** if already registered
- Shows your registration status (pending, confirmed, waiting)
- Waiting list position if applicable

**Bracket Tab** (knockout formats):
- Visual bracket tree showing rounds and matchups
- Bye slots shown as empty positions
- Winners advance to next round

**Standings Tab:**
- Ranked table: position, player name, points, wins, losses, draws, played
- Sorted by points descending, then goal difference, then goals for

**Matches Tab:**
- List of your matches with round, opponent, date/time, court, score (if completed)
- Status badges: scheduled, in progress, completed, walkover, forfeit

### 5. Registering for a Tournament

1. On TournamentDetailPage, click **Register**
2. If registration is open: registration is created with status `pending`
3. If the tournament is full: you're added to the **waiting list** with a position number
4. An admin confirms registrations; if confirmed, you appear in the bracket/standings
5. If a confirmed player cancels, the next waiting player is auto-confirmed

### 6. Viewing Standings

**Interface:** Standings tab on TournamentDetailPage

- Position ranking with points calculation (3 points per win)
- Tiebreakers: goal difference → goals for
- Updated after every confirmed match result

### 7. Related Screens and APIs

| Screen | Route | Purpose |
|--------|-------|---------|
| TournamentListPage | `/tournaments` | Browse tournaments |
| TournamentDetailPage | `/tournaments/:id` | Tournament detail |

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/player/tournaments` | GET | List tournaments |
| `/player/tournaments/:id` | GET | Tournament detail |
| `/player/tournaments/:id/register` | POST | Register |
| `/player/tournaments/my` | GET | My registrations |
| `/player/tournaments/:id/standings` | GET | View standings |
| `/player/tournaments/:id/matches` | GET | View matches |

---

## Chapter: Leagues

### 1. Purpose

The League module lets you view seasonal leagues, register teams, and track standings throughout the season. Leagues support tiered divisions with promotion and relegation.

### 2. Permissions

| Permission | What it allows |
|-----------|---------------|
| `league.register-team` | Register a team in a league |

### 3. Viewing Leagues

**Interface:** League list (`/player/leagues`)

1. Navigate to **Leagues** from the bottom nav "More" → Leagues
2. Browse league cards showing:
   - League name and season
   - Format (Round Robin / Double Round Robin)
   - Sport and team count
   - Registration fee
   - Status badge (Registration Open, Running, Completed, etc.)
3. Filter by status, sport, or season
4. Click a league to view details

### 4. League Detail

**Interface:** League detail (`/player/leagues/:id`)

- **Info:** name, format, season, sport, fee, points system (e.g., 3 pts win, 1 pt draw)
- **Divisions:** list of tiered divisions with capacity and team counts
- **Standings:** per-division ranked table with position, team name, played, wins, draws, losses, GF, GA, GD, points, form (last 5: W/D/L)
- **Fixtures:** round-by-round match schedule
- **My Team:** if registered, your team's detail with matches and statistics

### 5. Team Registration

1. On league detail, click **Register Team**
2. Enter team name and optionally add players
3. Team is assigned to the lowest available division (by tier)
4. Registration status: `pending` if capacity available, `waiting` if division is full
5. An admin confirms team registrations
6. Once confirmed, your team appears in the division's standings and fixture schedule

### 6. Standings Viewing

The standings table shows:
- Position (1 = leader)
- Team name
- Played / Wins / Draws / Losses
- Goals For / Goals Against / Goal Difference
- Points (wins × points_per_win + draws × points_per_draw)
- Form indicator (last 5 results as colored W/D/L badges)

Teams are sorted by: points → goal difference → goals for (all descending).

### 7. Related Screens and APIs

| Screen | Route | Purpose |
|--------|-------|---------|
| League List | `/player/leagues` | Browse leagues |
| League Detail | `/player/leagues/:id` | League detail + standings |

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/player/leagues` | GET | List leagues |
| `/player/leagues/:id` | GET | League detail |
| `/player/leagues/:id/standings` | GET | View standings |
| `/player/leagues/:id/fixtures` | GET | View fixtures |
| `/player/leagues/:id/register` | POST | Register team |
| `/player/leagues/my` | GET | My teams |
