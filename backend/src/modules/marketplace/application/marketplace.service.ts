import { randomUUID } from 'node:crypto';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import { marketplaceRepository as repo } from '../infrastructure/repositories/marketplace.repository.js';
import { paymentService } from '../../payment/application/payment.service.js';
import { paymentRepository } from '../../payment/infrastructure/repositories/payment.repository.js';
import { commissionService } from '../../financial/application/commission.service.js';
import { organisationService } from '../../organisations/application/organisation.service.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';
import { getPool } from '../../../database/mysql.js';
import { withTransaction } from '../../../database/database.transaction.js';
import type mysql from 'mysql2/promise';
import { getPlanNumericLimit } from '../../organisations/application/plan-limits.util.js';
import { userRepository } from '../../auth/infrastructure/repositories/user.repository.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { toMySqlDateTime } from '../../../shared/utils/mysql-date.js';
import { financialEntitlementRepository } from '../../financial/infrastructure/repositories/financial-entitlement.repository.js';

const log = createModuleLogger('marketplace');

type RowData = mysql.RowDataPacket[];

/**
 * Purchase eligibility: a product is purchasable only when Active AND
 * Marketplace-visible. Hidden products can never be bought through stale UI or
 * direct API calls.
 */
export function isProductPurchasable(product: any): boolean {
  return !!product && product.status === 'active' && Number(product.marketplace_visible) === 1;
}

export const marketplaceService = {
  // ── Categories ──
  async getCategories(parentId?: number | null) {
    return repo.findCategories(parentId);
  },

  async getCategory(id: number) {
    const cat = await repo.findCategoryById(id);
    if (!cat) throw new NotFoundError('Category');
    const children = await repo.findCategories(id);
    return { ...cat, subcategories: children };
  },

  // ── Products ──
  async listProducts(filters: any) {
    if (filters.categoryId) {
      const descIds = await repo.findDescendantCategoryIds(filters.categoryId);
      filters.categoryIds = [filters.categoryId, ...descIds];
      delete filters.categoryId;
    }
    // Public catalog: only Active + Marketplace-visible products.
    filters.visibleOnly = true;
    return repo.findProducts(filters);
  },

  /**
   * Public product detail, ownership-aware: hidden products are exposed only
   * to their owner (org or player-seller); everyone else gets a 404. Active +
   * visible products are public as before.
   */
  async getProductForRequester(id: number, viewerUserId: number | null) {
    const product = await repo.findProductById(id);
    if (!product) throw new NotFoundError('Product');
    const publiclyVisible = product.status === 'active' && Number(product.marketplace_visible) === 1;
    if (publiclyVisible) return this.getProduct(id);

    if (viewerUserId) {
      if (await this._ownsProductAsSeller(viewerUserId, product)) return this.getProduct(id);
    }
    throw new NotFoundError('Product');
  },

  /**
   * Owner-controlled Marketplace visibility (independent of approval).
   * - Show requires the product to be Active (visibility can never bypass approval).
   * - Hide is allowed whenever the owner wants the product off the public catalog.
   * - Approval status is never modified. Emits only on an actual change.
   */
  async setProductVisibility(userId: number, productId: number, visible: boolean) {
    const product = await repo.findProductById(productId);
    if (!product) throw new NotFoundError('Product');

    if (!(await this._ownsProductAsSeller(userId, product))) throw new ForbiddenError('Not your product');

    if (visible && product.status !== 'active') {
      throw new ConflictError('Product must be approved before it can appear in the Marketplace.');
    }

    if (Number(product.marketplace_visible) === (visible ? 1 : 0)) {
      return product; // no transition — nothing to announce
    }

    const ok = await repo.setMarketplaceVisible(productId, visible);
    if (!ok) throw new NotFoundError('Product');

    // Post-commit announce to admin, owner, and player catalog consumers.
    eventBusV2.emit('marketplace:product-visibility-changed', {
      productId,
      name: (product as any).name,
      visible,
      status: product.status,
      sellerType: (product as any).seller_type,
      organisationId: (product as any).seller_id ?? null,
      sellerUserId: (product as any).seller_user_id ?? null,
    });

    // Return the product already fetched above (with the new visibility flag) —
    // NOT a fresh full re-fetch. The DB update has committed; a response must
    // never depend on auxiliary queries that can fail after commit and turn a
    // successful visibility change into a 500 for the client.
    return { ...product, marketplace_visible: visible ? 1 : 0 };
  },

  async getProduct(id: number) {
    const product = await repo.findProductById(id);
    if (!product) throw new NotFoundError('Product');
    const variants = await repo.findVariants(id);
    const tags = await repo.findProductTags(id);
    const productImages = await repo.findProductImages(id);
    const specs = await repo.findProductSpecs(id);
    const related = await repo.findRelatedProducts(id);
    return { ...product, variants, tags, images2: productImages, specs, related };
  },

  async createProduct(userId: number, data: any) {
    // Resolve the creating organisation via product ownership: orgs the user
    // owns (ANY type) plus scoped roles. Deterministic: lowest id (= primary).
    const candidates = await repo.findSellerOrgsForUser(userId);
    const owned = (candidates as any[]).filter((o: any) => Number(o.owner_id) === Number(userId));
    const orgPool = owned.length ? owned : (candidates as any[]);
    const org = orgPool.slice().sort((a: any, b: any) => a.id - b.id)[0] || null;
    if (!org) throw new ForbiddenError('You must be a seller to create products');
    if (!org.is_active) throw new ForbiddenError('Seller account is inactive');

    const defaultLimit = 3;
    const maxListings = await getPlanNumericLimit(org.id, 'products', defaultLimit);
    const currentCount = await repo.countOrgProducts(org.id);
    if (currentCount >= maxListings) {
      throw new ConflictError(
        maxListings === Infinity
          ? '' // never reached when unlimited
          : `Product listing limit reached (max ${maxListings}). Upgrade your plan to list more products.`
      );
    }

    let branchId = data.branchId;
    if (!branchId) {
      const branches = await organisationService.listBranches(org.id);
      if (branches?.length) branchId = branches[0].id;
    }
    const { variants, tagIds, ...productData } = data;
    const id = await repo.createProduct({ ...productData, sellerId: org.id, branchId });
    if (variants?.length) {
      for (const v of variants) {
        await repo.createVariant({ ...v, productId: id });
      }
    }
    if (tagIds?.length) {
      await repo.setProductTags(id, tagIds);
    }
    return this.getProduct(id);
  },

  async updateProduct(userId: number, productId: number, data: any) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('Not a seller');

    const previous = await repo.findProductById(productId);
    if (!previous) throw new NotFoundError('Product');
    if (!orgIds.includes(Number(previous.seller_id))) throw new ForbiddenError('Not your product');

    data.status = 'pending';
    const { variants, tagIds, ...productData } = data;
    const updated = await repo.updateProduct(productId, orgIds, productData);
    if (!updated) throw new NotFoundError('Product');
    if (variants !== undefined) {
      const existingVariants = await repo.findVariants(productId);
      const incomingIds = variants.filter((v: any) => v.id).map((v: any) => v.id);
      for (const existing of existingVariants) {
        if (!incomingIds.includes(existing.id)) {
          await repo.deleteVariant(existing.id, orgIds);
        }
      }
      for (const v of variants) {
        if (v.id) {
          await repo.updateVariant(v.id, v, orgIds);
        } else {
          await repo.createVariant({ ...v, productId });
        }
      }
    }
    if (tagIds !== undefined) {
      await repo.setProductTags(productId, tagIds);
    }

    // Post-commit announce: a seller/org edit re-submits the product for
    // review (→ pending). The ADMIN Products screen must refresh immediately,
    // alongside the seller/org/player audiences. Skip when there is no
    // transition (editing an already-pending product).
    if (previous.status !== 'pending') {
      eventBusV2.emit('marketplace:product-status-changed', {
        productId,
        name: (previous as any).name,
        previousStatus: previous.status,
        status: 'pending',
        sellerType: (previous as any).seller_type,
        organisationId: (previous as any).seller_id ?? null,
        sellerUserId: (previous as any).seller_user_id ?? null,
      });
    }

    return this.getProduct(productId);
  },

  async deleteProduct(userId: number, productId: number) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('Not a seller');
    const product = await repo.findProductById(productId);
    if (!product || !orgIds.includes(Number(product.seller_id))) throw new NotFoundError('Product');
    const placeholders = orgIds.map(() => '?').join(', ');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM cart_items WHERE product_id = ?', [productId]);
      await conn.execute('DELETE FROM wishlist_items WHERE product_id = ?', [productId]);
      await conn.execute('UPDATE products SET is_active = 0 WHERE id = ? AND deleted_at IS NULL', [productId]);
      const [result] = await conn.execute(
        `UPDATE products SET deleted_at = NOW() WHERE id = ? AND seller_id IN (${placeholders}) AND deleted_at IS NULL`,
        [productId, ...orgIds],
      );
      if (!(result as { affectedRows: number }).affectedRows) throw new NotFoundError('Product');
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // ── Variants (seller-only management) ──
  async createVariant(userId: number, productId: number, data: any) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('Not a seller');
    const product = await repo.findProductById(productId);
    if (!product) throw new NotFoundError('Product');
    if (!orgIds.includes(Number(product.seller_id))) throw new ForbiddenError('Not your product');
    const id = await repo.createVariant({ ...data, productId });
    return { id };
  },

  async updateVariant(userId: number, variantId: number, data: any) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('Not a seller');
    const variant = await repo.findVariantById(variantId);
    if (!variant) throw new NotFoundError('Variant');
    if (!orgIds.includes(Number(variant.seller_id))) throw new ForbiddenError('Variant does not belong to your organisation');
    const ok = await repo.updateVariant(variantId, data, orgIds);
    if (!ok) throw new NotFoundError('Variant');
    return { success: true };
  },

  async deleteVariant(userId: number, variantId: number) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('Not a seller');
    const variant = await repo.findVariantById(variantId);
    if (!variant) throw new NotFoundError('Variant');
    if (!orgIds.includes(Number(variant.seller_id))) throw new ForbiddenError('Variant does not belong to your organisation');
    await repo.deleteVariant(variantId, orgIds);
  },

  // ── Wishlist ──
  async getWishlist(userId: number) {
    return repo.findWishlist(userId);
  },

  async addWishlist(userId: number, productId: number) {
    const product = await repo.findProductById(productId);
    if (!product) throw new NotFoundError('Product');
    await repo.addWishlist(userId, productId);
    return { success: true };
  },

  async removeWishlist(userId: number, productId: number) {
    await repo.removeWishlist(userId, productId);
    return { success: true };
  },

  // ── Cart ──
  async getCart(userId: number) {
    const items = await repo.findCartByUser(userId);
    let subtotal = 0;
    for (const item of items) {
      const basePrice = Number(item.price) || 0;
      const discPrice = item.discounted_price ? Number(item.discounted_price) : null;
      const adjustment = Number(item.price_adjustment || 0);
      const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
      const price = (hasDiscount ? discPrice : basePrice) + adjustment;
      item.effective_price = price;
      subtotal += price * item.quantity;
    }
    return { items, subtotal };
  },

  async addToCart(userId: number, productId: number, quantity: number, variantId?: number) {
    const product = await repo.findProductById(productId);
    if (!product) throw new NotFoundError('Product');
    if (product.status !== 'active') throw new ConflictError('Product is not available');

    if (variantId) {
      const variants = await repo.findVariants(productId);
      const variant = variants.find((v: any) => v.id === variantId);
      if (!variant) throw new NotFoundError('Variant');
      if (variant.quantity - variant.reserved_quantity < quantity) {
        throw new ConflictError('Insufficient variant stock');
      }
      await repo.upsertCartItemExact(userId, productId, quantity, variantId);
    } else {
      if (product.quantity - product.reserved_quantity < quantity) {
        throw new ConflictError('Insufficient stock');
      }
      await repo.upsertCartItem(userId, productId, quantity);
    }
    return this.getCart(userId);
  },

  async updateCartItem(userId: number, itemId: number, quantity: number) {
    const ok = await repo.updateCartItemQuantity(userId, itemId, quantity);
    if (!ok) throw new NotFoundError('Cart item');
    return this.getCart(userId);
  },

  async removeCartItem(userId: number, productId: number) {
    await repo.removeCartItem(userId, productId);
    return this.getCart(userId);
  },

  // ── Addresses ──
  async getAddresses(userId: number) {
    return repo.findAddresses(userId);
  },

  async createAddress(userId: number, data: any) {
    const id = await repo.createAddress(userId, data);
    return repo.findAddressById(id, userId);
  },

  async updateAddress(userId: number, addressId: number, data: any) {
    const ok = await repo.updateAddress(addressId, userId, data);
    if (!ok) throw new NotFoundError('Address');
    return repo.findAddressById(addressId, userId);
  },

  async deleteAddress(userId: number, addressId: number) {
    const ok = await repo.deleteAddress(addressId, userId);
    if (!ok) throw new NotFoundError('Address');
  },

  // ── Coupons ──
  async validateCoupon(code: string, subtotal: number) {
    const coupon = await repo.findCouponByCode(code);
    if (!coupon) throw new NotFoundError('Coupon');

    if (coupon.min_order_amount && subtotal < Number(coupon.min_order_amount)) {
      throw new ConflictError(`Minimum order amount of ${coupon.min_order_amount} required`);
    }
    if (coupon.max_uses) {
      const uses = await repo.countCouponUsage(coupon.id);
      if (uses >= coupon.max_uses) throw new ConflictError('Coupon usage limit reached');
    }
    let discount = coupon.discount_type === 'percentage'
      ? subtotal * (Number(coupon.discount_value) / 100)
      : Number(coupon.discount_value);
    discount = Math.min(discount, subtotal);

    return { coupon, discount };
  },

  // ── Orders ──
  async checkout(userId: number, data: any) {
    const traceId = randomUUID();
    log.info({ traceId, userId, paymentMethod: data.paymentMethod }, 'checkout: started');

    const cartItems = await repo.findCartByUser(userId);
    if (!cartItems.length) {
      log.warn({ traceId, userId }, 'checkout: cart is empty');
      throw new ConflictError('Cart is empty');
    }
    log.info({ traceId, cartItemCount: cartItems.length, sellers: [...new Set(cartItems.map((i: any) => i.seller_id))] }, 'checkout: cart loaded');

    // ── Batch pre-fetch: all products + variants in 2 queries ──
    const productIds = [...new Set(cartItems.map((i: any) => i.product_id))];
    const allProducts = await repo.findProductsByIds(productIds);
    const allVariants = await repo.findVariantsForProducts(productIds);
    const productMap = new Map<number, any>(allProducts.map((p: any) => [p.id, p]));
    const variantMap = new Map<number, any[]>(); // productId → variants[]
    for (const v of allVariants as any[]) {
      if (!variantMap.has(v.product_id)) variantMap.set(v.product_id, []);
      variantMap.get(v.product_id)!.push(v);
    }

    const seenSellers = new Map<number, { sellerId: number; commission: number; rateType: 'percentage' | 'fixed' }>();
    const sellerShares = new Map<number, number>();

    for (const item of cartItems) {
      const product = productMap.get(item.product_id);
      if (!isProductPurchasable(product)) {
        throw new ConflictError(`Product "${item.name}" is no longer available`);
      }
      if (item.variant_id) {
        const variants = variantMap.get(item.product_id) || [];
        const variant = variants.find((v: any) => v.id === item.variant_id);
        if (!variant || variant.quantity < item.quantity) {
          throw new ConflictError(`Insufficient stock for "${item.name}" variant`);
        }
      } else if (product.quantity < item.quantity) {
        throw new ConflictError(`Insufficient stock for "${item.name}"`);
      }
      const basePrice = Number(item.price) || 0;
      const discPrice = item.discounted_price ? Number(item.discounted_price) : null;
      const adjustment = Number(item.price_adjustment || 0);
      const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
      const effectivePrice = (hasDiscount ? discPrice : basePrice) + adjustment;
      const lineTotal = effectivePrice * item.quantity;
      sellerShares.set(product.seller_id, (sellerShares.get(product.seller_id) || 0) + lineTotal);
      if (!seenSellers.has(product.seller_id)) {
        // Verify seller has an active subscription (not just pending)
        const sellerOrgId = product.seller_id;
        const { getCurrentSubscription } = await import('../../organisations/application/current-subscription.service.js');
        const sellerSub = await getCurrentSubscription(sellerOrgId);
        if (!sellerSub.exists) {
          throw new ConflictError(`Seller "${item.name || product.name}" has no active subscription plan`);
        }
        if (sellerSub.effectiveStatus !== 'active') {
          log.warn({ traceId, sellerOrgId, status: sellerSub.effectiveStatus }, 'checkout: seller subscription is not active');
          throw new ConflictError(`Seller "${item.name || product.name}" does not have an active subscription`);
        }

        const comm = await commissionService.calculate(product.seller_id, 'marketplace', 100);
        log.info({ traceId, sellerId: product.seller_id, commission: comm.rate, rateType: comm.rateType, planName: comm.planName }, 'checkout: seller commission resolved');
        seenSellers.set(product.seller_id, {
          sellerId: product.seller_id,
          commission: comm.rate,
          rateType: comm.rateType,
        });
      }
    }

    // ── Shipping validation ──
    if (!data.addressId) {
      throw new ConflictError('Please select a shipping address');
    }
    const addr = await repo.findAddressById(data.addressId, userId);
    if (!addr) throw new NotFoundError('Address');
    const provinceId = addr.province_id;
    const cityId = addr.city_id;
    if (!provinceId) throw new ConflictError('Selected address has no province — please update it');

    const sellerIds = [...new Set(cartItems.map((i: any) => i.seller_id))];
    const sellerShipping = new Map<number, { price: number; maxDays: number }>();
    const shippingErrors: string[] = [];
    for (const sid of sellerIds) {
      const rate = await repo.findShippingRateForSeller(sid, provinceId, cityId);
      const shopName = cartItems.find((i: any) => i.seller_id === sid)?.shop_name || `Seller #${sid}`;
      if (!rate) {
        shippingErrors.push(`"${shopName}" does not ship to your address`);
      } else {
        sellerShipping.set(sid, { price: Number(rate.price), maxDays: Number(rate.estimated_days || 0) });
      }
    }
    if (shippingErrors.length) {
      throw new ConflictError(shippingErrors.join('. '));
    }
    const maxDays = Math.max(0, ...[...sellerShipping.values()].map(s => s.maxDays));
    const estimatedDeliveryDate = maxDays > 0
      ? new Date(Date.now() + maxDays * 86400000).toISOString().slice(0, 10)
      : null;

    const currencyCode = cartItems[0].currency_code;
    let subtotal = 0;
    for (const item of cartItems) {
      const basePrice = Number(item.price) || 0;
      const discPrice = item.discounted_price ? Number(item.discounted_price) : null;
      const adjustment = Number(item.price_adjustment || 0);
      const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
      const price = (hasDiscount ? discPrice : basePrice) + adjustment;
      subtotal += price * item.quantity;
    }

    // Apply coupon
    let discountAmount = 0;
    let couponId: number | undefined;
    if (data.couponCode) {
      const validation = await this.validateCoupon(data.couponCode, subtotal);
      couponId = validation.coupon.id;
      discountAmount = validation.discount;
    }
    const afterDiscount = subtotal - discountAmount;
    const discountFactor = subtotal > 0 ? afterDiscount / subtotal : 1;

    // ── Group cart items by seller for per-seller order creation ──
    const checkoutGroupId = randomUUID();
    const sellerItemGroups = new Map<number, any[]>();
    for (const item of cartItems) {
      const product = productMap.get(item.product_id)!;
      const sid = product.seller_id;
      if (!sellerItemGroups.has(sid)) sellerItemGroups.set(sid, []);
      sellerItemGroups.get(sid)!.push(item);
    }

    const createdOrderIds: number[] = [];
    const sellerToOrderId = new Map<number, number>();
    const sellerToTotal = new Map<number, number>();
    let grandTotal = 0;
    let grandShippingCost = 0;
    let grandCommission = 0;
    let grandTax = 0;
    let grandSubtotal = 0;
    let grandDiscount = 0;

    // ── Create one order per seller ──
    for (const [sellerId, sellerItems] of sellerItemGroups) {
      const sellerInfo = seenSellers.get(sellerId)!;

      // Calculate this seller's subtotal
      let sellerSubtotal = 0;
      for (const item of sellerItems) {
        const basePrice = Number(item.price) || 0;
        const discPrice = item.discounted_price ? Number(item.discounted_price) : null;
        const adjustment = Number(item.price_adjustment || 0);
        const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
        const price = (hasDiscount ? discPrice : basePrice) + adjustment;
        sellerSubtotal += price * item.quantity;
      }

      // Proportional discount for this seller
      const sellerDiscount = Math.round(sellerSubtotal * discountFactor * 100) / 100 - sellerSubtotal + discountAmount * (sellerSubtotal / subtotal || 0);
      const sellerAfterDiscount = sellerSubtotal - Math.round(discountAmount * (sellerSubtotal / (subtotal || 1)) * 100) / 100;

      // Shipping for this seller
      const shipping = sellerShipping.get(sellerId) || { price: 0, maxDays: 0 };

      // Commission for this seller
      let sellerCommission = 0;
      if (sellerInfo.rateType === 'fixed') {
        sellerCommission = sellerInfo.commission;
      } else {
        sellerCommission = Math.round((sellerInfo.commission / 100) * sellerAfterDiscount * 100) / 100;
      }

      // Tax for this seller
      let sellerTax = 0;
      const taxPool = getPool();
      const [taxRows] = await taxPool.execute<any[]>(
        `SELECT rate, type FROM tax_rates
         WHERE is_active = 1 AND (organisation_id = ? OR organisation_id IS NULL)
         ORDER BY (organisation_id IS NOT NULL) DESC, id ASC
         LIMIT 1`,
        [sellerId],
      );
      if (taxRows.length > 0) {
        const taxRate = taxRows[0];
        if (taxRate.type === 'fixed') {
          sellerTax = Number(taxRate.rate);
        } else {
          sellerTax = Math.round(sellerAfterDiscount * Number(taxRate.rate)) / 100;
        }
      }

      const sellerTotal = Math.round((sellerAfterDiscount + shipping.price + sellerTax) * 100) / 100;
      const sellerDiscountAmount = Math.round(discountAmount * (sellerSubtotal / (subtotal || 1)) * 100) / 100;

      // ── Create order for this seller ──
      const orderId = await repo.createOrder({
        buyerId: userId,
        subtotal: sellerSubtotal,
        shippingCost: shipping.price,
        commission: sellerCommission,
        total: sellerTotal,
        couponId,
        discountAmount: sellerDiscountAmount,
        taxAmount: sellerTax,
        currencyCode,
        shippingAddress: addr || null,
        notes: data.notes || '',
        paymentMethod: data.paymentMethod || 'wallet',
        estimatedDeliveryDate,
        checkoutGroupId,
      });
      createdOrderIds.push(orderId);
      sellerToOrderId.set(sellerId, orderId);
      sellerToTotal.set(sellerId, sellerTotal);
      grandTotal += sellerTotal;
      grandShippingCost += shipping.price;
      grandCommission += sellerCommission;
      grandTax += sellerTax;
      grandSubtotal += sellerSubtotal;
      grandDiscount += sellerDiscountAmount;

      log.info({ traceId, orderId, sellerId, total: sellerTotal }, 'checkout: per-seller order created');

      // ── Create order items for this seller ──
      for (const item of sellerItems) {
        const product = productMap.get(item.product_id)!;
        const basePrice = Number(item.price) || 0;
        const discPrice = item.discounted_price ? Number(item.discounted_price) : null;
        const adjustment = Number(item.price_adjustment || 0);
        const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
        const price = (hasDiscount ? discPrice : basePrice) + adjustment;
        const itemTotal = price * item.quantity;
        const adjustedTotal = itemTotal * discountFactor;
        const commissionAmount = sellerInfo.rateType === 'fixed'
          ? sellerInfo.commission
          : (sellerInfo.commission / 100) * adjustedTotal;
        await repo.createOrderItem({
          orderId, productId: item.product_id, variantId: item.variant_id || undefined,
          sellerId, quantity: item.quantity, unitPrice: price,
          totalPrice: itemTotal, commissionRate: sellerInfo.commission, commissionAmount,
        });
      }

      // ── Status history for this order ──
      await repo.createOrderStatusHistory({
        orderId, toStatus: 'pending', changedBy: userId, changedByRole: 'buyer',
        note: 'Order placed',
      });
    }

    // Record coupon usage once (on the first order)
    if (couponId && createdOrderIds.length) {
      await repo.recordCouponUsage(couponId, userId, createdOrderIds[0]);
    }

    // ── Decrement stock atomically (prevents overselling) ──
    // Phase 2 Step 5: insertLedgerEntry (marketplace_ledger_entries) removed —
    // stock deduction is tracked by products.quantity + order_items snapshot.
    try {
      for (const item of cartItems) {
        await repo.decrementStock(item.product_id, item.variant_id || undefined, item.quantity);
      }
    } catch (stockErr: any) {
      // Atomic decrement failed — restore stock for ALL orders in this checkout group, cancel all
      for (const oid of createdOrderIds) {
        await this._restoreOrderStock(oid, stockErr.message || 'Insufficient stock');
        await repo.updateOrderStatus(oid, 'cancelled', 'Insufficient stock');
        await repo.createOrderStatusHistory({
          orderId: oid, toStatus: 'cancelled', changedBy: userId, changedByRole: 'system',
          note: 'Insufficient stock — cancelled by overselling guard',
        });
      }
      eventBusV2.emit('marketplace:order-cancelled', {
        orderId: createdOrderIds[0], userId, reason: 'Insufficient stock', checkoutGroupId,
      });
      throw new ConflictError(stockErr.message || 'Insufficient stock');
    }

    // Load user billing data for Intention API
    const user = await userRepository.findById(userId);

    const customerData = user ? {
      customerEmail: user.email,
      customerPhone: user.full_phone,
      customerName: user.full_name,
      customerAddress: {
        city: addr.city || 'N/A',
        country: addr.country || 'EG',
        state: addr.state || 'N/A',
        street: addr.street_address || 'N/A',
        building: 'N/A',
        floor: 'N/A',
        apartment: 'N/A',
      },
    } : undefined;

    // Emit order-placed event for each seller
    for (const [sellerId] of sellerItemGroups) {
      eventBusV2.emit('marketplace:order-placed', {
        orderId: sellerToOrderId.get(sellerId) || createdOrderIds[0],
        userId,
        sellerId,
        total: sellerToTotal.get(sellerId) || grandTotal,
        organisationId: sellerId,
        checkoutGroupId,
      });
    }

    log.info({ traceId, checkoutGroupId, orderIds: createdOrderIds, grandTotal, paymentMethod: data.paymentMethod }, 'checkout: processing payment');
    const result = await this._processOrderPayment(userId, createdOrderIds, grandTotal, currencyCode, data.paymentMethod, data.returnUrl, customerData, checkoutGroupId);
    log.info({ traceId, checkoutGroupId, paymentMethod: data.paymentMethod }, 'checkout: completed successfully');
    return result;
  },

  async _processOrderPayment(userId: number, orderIds: number[], total: number, currency: string, paymentMethod: string, returnUrl?: string, customerData?: { customerEmail?: string; customerPhone?: string; customerName?: string; customerAddress?: Record<string, any> }, checkoutGroupId?: string) {
    const primaryOrderId = orderIds[0];
    if (paymentMethod === 'wallet') {
      try {
        const result = await paymentService.charge(userId, {
          referenceType: 'order',
          referenceId: primaryOrderId,
          amount: total,
          currency,
          paymentMethod: 'wallet',
        });
        if (result.success) {
          for (const oid of orderIds) {
            await this._fulfillAndConfirmOrder(oid, userId, 'Payment via wallet');
          }
          const orderRows = await repo.findOrderById(primaryOrderId);
          if (orderRows?.length) {
            const order = this._formatOrder(orderRows);
            return order;
          }
          return this.getOrderForUser(primaryOrderId, userId);
        }
        await this._restoreOrdersStock(orderIds, 'Wallet payment returned not successful');
        for (const oid of orderIds) {
          await repo.updateOrderStatus(oid, 'cancelled', 'Wallet payment failed');
        }
      } catch (err: any) {
        log.error({ err, orderIds, userId }, 'Wallet payment failed — restoring stock and cancelling orders');
        await this._restoreOrdersStock(orderIds, 'Wallet payment failed — stock restored');
        for (const oid of orderIds) {
          await repo.updateOrderStatus(oid, 'cancelled', `Wallet payment error: ${err?.message || 'Unknown error'}`);
        }
        throw new ConflictError(err?.message || 'Wallet payment failed');
      }
    } else if (paymentMethod === 'cash') {
      for (const oid of orderIds) {
        await this._fulfillAndConfirmOrder(oid, userId, 'Payment on delivery (cash)');
      }
      return this.getOrderForUser(primaryOrderId, userId);
    } else {
      // ── Card / Online payment via gateway ──
      // Clear cart immediately after order creation — order is now the source of truth.
      // If gateway fails, restore cart AND stock.
      const cartSnapshot = await repo.getCartItems(userId);
      await repo.clearCart(userId);

      try {
        const result = await paymentService.charge(userId, {
          referenceType: 'order',
          referenceId: primaryOrderId,
          amount: total,
          currency,
          paymentMethod: paymentMethod as any,
          returnUrl,
          ...customerData,
        });

        if (!result.success) {
          await repo.restoreCart(userId, cartSnapshot);
          await this._restoreOrdersStock(orderIds, 'Gateway charge failed — stock restored');
          const errMsg = (result as any).errorMessage || 'Payment gateway rejected the transaction';
          const rawResp = (result as any).rawResponse ? JSON.stringify((result as any).rawResponse).substring(0, 300) : '';
          log.error({ primaryOrderId, errorMessage: errMsg, rawResponse: rawResp }, 'Gateway charge failed');
          throw new ConflictError(errMsg);
        }

        const paymentUrl = 'paymentUrl' in result ? result.paymentUrl : undefined;
        const clientSecret = 'clientSecret' in result ? result.clientSecret : undefined;
        if (!paymentUrl && !clientSecret) {
          await repo.restoreCart(userId, cartSnapshot);
          await this._restoreOrdersStock(orderIds, 'Gateway returned no payment URL — stock restored');
          throw new ConflictError('Payment gateway did not return a checkout URL or client secret');
        }

        const paymentId = 'paymentId' in result ? result.paymentId : undefined;
        const order = await this.getOrder(primaryOrderId);
        return { ...order, paymentUrl, clientSecret, paymentId, checkoutGroupId, orderIds };
      } catch (err) {
        await repo.restoreCart(userId, cartSnapshot);
        await this._restoreOrdersStock(orderIds, 'Gateway charge exception — stock restored');
        throw err;
      }
    }

    const orderRows = await repo.findOrderById(primaryOrderId);
    if (orderRows?.length) {
      return this._formatOrder(orderRows);
    }
    return this.getOrderForUser(primaryOrderId, userId);
  },

  async getOrders(userId: number, page: number, limit: number, status?: string) {
    const result = await repo.findOrdersByBuyer(userId, page, limit, status);
    return this._groupOrdersByItem(result);
  },

  async getOrderCounts(userId: number) {
    return repo.getOrderCountsByBuyer(userId);
  },

  _groupOrdersByItem(result: { data: any[]; total: number; page: number; limit: number }) {
    // Group by checkout_group_id when present (multi-seller orders)
    const groups = new Map<string, { checkoutGroupId: string; orders: Map<number, any>; totalAmount: number }>();
    const ungrouped = new Map<number, any>();

    for (const row of result.data as any[]) {
      const groupId = row.checkout_group_id;
      if (groupId) {
        if (!groups.has(groupId)) {
          groups.set(groupId, { checkoutGroupId: groupId, orders: new Map(), totalAmount: 0 });
        }
        const grp = groups.get(groupId)!;
        if (!grp.orders.has(row.id)) {
          grp.orders.set(row.id, {
            id: row.id,
            public_id: row.public_id,
            checkout_group_id: groupId,
            status: row.status,
            payment_status: row.payment_status,
            subtotal: Number(row.subtotal || 0),
            shipping_cost: Number(row.shipping_cost || 0),
            discount_amount: Number(row.discount_amount || 0),
            total: Number(row.total || 0),
            currency_code: row.currency_code,
            payment_method: row.payment_method,
            created_at: row.created_at,
            estimated_delivery_date: row.estimated_delivery_date,
            tracking_number: row.tracking_number,
            shipping_carrier: row.shipping_carrier,
            buyer_name: row.buyer_name || null,
            buyer_phone: row.buyer_phone || null,
            shop_name: row.shop_name || null,
            seller_id: row.item_seller_id || null,
            items: [],
            tax_amount: Number(row.tax_amount || 0),
            commission_amount: Number(row.commission_amount || 0),
          });
        }
        const order = grp.orders.get(row.id);
        if (row.product_id) {
          order.items.push({
            itemId: row.item_id,
            productId: row.product_id,
            productName: row.product_name,
            variantName: row.variant_name || null,
            shopName: row.shop_name || row.org_name || null,
            quantity: row.quantity,
            unitPrice: row.unit_price,
            totalPrice: row.item_total,
            images: row.images,
          });
        }
        grp.totalAmount += Number(row.total || 0);
      } else {
        // Legacy single-order (no group)
        if (!ungrouped.has(row.id)) {
          ungrouped.set(row.id, {
            id: row.id,
            public_id: row.public_id,
            status: row.status,
            payment_status: row.payment_status,
            subtotal: row.subtotal,
            shipping_cost: row.shipping_cost,
            discount_amount: row.discount_amount,
            tax_amount: row.tax_amount,
            total: row.total,
            commission_amount: row.commission_amount,
            currency_code: row.currency_code,
            payment_method: row.payment_method,
            created_at: row.created_at,
            estimated_delivery_date: row.estimated_delivery_date,
            tracking_number: row.tracking_number,
            shipping_carrier: row.shipping_carrier,
            buyer_name: row.buyer_name || null,
            buyer_phone: row.buyer_phone || null,
            items: [],
          });
        }
        const order = ungrouped.get(row.id);
        if (row.product_id) {
          order.items.push({
            itemId: row.item_id,
            productId: row.product_id,
            productName: row.product_name,
            variantName: row.variant_name || null,
            shopName: row.shop_name || row.org_name || null,
            quantity: row.quantity,
            unitPrice: row.unit_price,
            totalPrice: row.item_total,
            images: row.images,
          });
        }
      }
    }

    // Merge groups into a flat list for the buyer view
    const merged: any[] = [];
    for (const [, grp] of groups) {
      const orders = Array.from(grp.orders.values());
      // Aggregate all items across all seller-orders in this checkout group
      const allItems: any[] = [];
      let totalSubtotal = 0;
      let totalShipping = 0;
      let totalDiscount = 0;
      let totalTax = 0;
      let totalCommission = 0;
      for (const o of orders) {
        allItems.push(...o.items);
        totalSubtotal += Number(o.subtotal || 0);
        totalShipping += Number(o.shipping_cost || 0);
        totalDiscount += Number(o.discount_amount || 0);
        totalTax += Number(o.tax_amount || 0);
        totalCommission += Number(o.commission_amount || 0);
      }
      // Use the primary order as the representative
      const primary = orders[0];
      merged.push({
        ...primary,
        // Override with aggregated values across all seller-orders
        subtotal: totalSubtotal,
        shipping_cost: totalShipping,
        discount_amount: totalDiscount,
        tax_amount: totalTax,
        commission_amount: totalCommission,
        total: grp.totalAmount,
        items: allItems,
        _isGrouped: orders.length > 1,
        _sellerOrderCount: orders.length,
        _sellerOrders: orders,
      });
    }
    for (const [, order] of ungrouped) {
      merged.push(order);
    }

    // Sort by created_at DESC
    merged.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { ...result, data: merged, total: merged.length };
  },

  /**
   * Enriches grouped seller orders with canonical financial status and seller_net
   * from financial_entitlements. The seller_net is the sum of ORGANIZATION_EARNING
   * amounts — the authoritative source for seller economics.
   *
   * financial_status is derived per order from the entitlement statuses of its
   * order_items: Pending / Available / Held / Reserved / Settled / Cancelled.
   */
  async _enrichGroupedOrdersWithFinancials(orders: any[], sellerOrgIds: number[]): Promise<any[]> {
    if (!orders.length || !sellerOrgIds.length) return orders;

    const allOrderIds = orders.map((o: any) => o.id);
    if (!allOrderIds.length) return orders;

    const orderItemLinks = await repo.findOrderItemIdsBySellerOrders(allOrderIds, sellerOrgIds);
    if (!orderItemLinks.length) {
      return orders.map((o: any) => ({ ...o, seller_net: 0, financial_status: 'Pending' }));
    }

    const orderItemIds = orderItemLinks.map((l) => l.orderItemId);
    const entitlements = await financialEntitlementRepository.findBySourceIds('marketplace', orderItemIds);

    const itemToOrder = new Map<number, number>();
    for (const link of orderItemLinks) {
      itemToOrder.set(link.orderItemId, link.orderId);
    }

    const orderEarningMap = new Map<number, number>();
    const orderEntitlementStatuses = new Map<number, string[]>();

    for (const ent of entitlements) {
      const orderId = ent.source_id != null ? itemToOrder.get(ent.source_id) : undefined;
      if (orderId === undefined) continue;

      if (ent.entitlement_type === 'ORGANIZATION_EARNING') {
        orderEarningMap.set(orderId, (orderEarningMap.get(orderId) || 0) + Number(ent.amount));
      }
      if (ent.entitlement_type === 'ORGANIZATION_EARNING') {
        if (!orderEntitlementStatuses.has(orderId)) orderEntitlementStatuses.set(orderId, []);
        orderEntitlementStatuses.get(orderId)!.push(ent.status);
      }
    }

    const deriveFinancialStatus = (statuses: string[]): string => {
      if (!statuses.length) return 'Pending';
      const s = new Set(statuses);
      if (s.has('CANCELLED')) return 'Cancelled';
      if (s.has('SETTLED')) return 'Settled';
      if (s.has('ON_HOLD')) {
        const allOnHold = statuses.every((st) => st === 'ON_HOLD');
        return allOnHold ? 'Held' : 'Held';
      }
      if (s.has('AVAILABLE')) return 'Available';
      if (s.has('PENDING')) return 'Pending';
      return 'Pending';
    };

    return orders.map((order: any) => {
      const statuses = orderEntitlementStatuses.get(order.id) || [];
      const enriched = {
        ...order,
        seller_net: Math.round((orderEarningMap.get(order.id) || 0) * 100) / 100,
        financial_status: deriveFinancialStatus(statuses),
      };

      if (order._sellerOrders) {
        enriched._sellerOrders = order._sellerOrders.map((so: any) => {
          const soStatuses = orderEntitlementStatuses.get(so.id) || [];
          return {
            ...so,
            seller_net: Math.round((orderEarningMap.get(so.id) || 0) * 100) / 100,
            financial_status: deriveFinancialStatus(soStatuses),
          };
        });
      }

      return enriched;
    });
  },

  async getOrderForUser(orderId: number, userId: number) {
    // 1. Try buyer view
    let rows = await repo.findOrderById(orderId, userId);
    let viewedAsSeller = false;
    let sellerOrgIds: number[] = [];

    // 2. If not the buyer, check if the user is a seller on this order
    //    (any organisation they own or act for — not just 'shop' types).
    if (!rows.length) {
      const orgIds = await this._resolveSellerOrgIds(userId);
      if (orgIds.length) { rows = await repo.findOrderById(orderId, undefined, orgIds); viewedAsSeller = true; sellerOrgIds = orgIds; }
    }

    // 3. Unfiltered fallback (race condition: order was just created and buyer_id join not yet visible)
    if (!rows.length) {
      rows = await repo.findOrderById(orderId);
    }
    if (!rows.length) throw new NotFoundError('Order');

    const order = this._formatOrder(rows);
    order.viewedAsSeller = viewedAsSeller;

    // For buyer view: if this order belongs to a checkout group, fetch all sibling orders
    // and merge their items so the buyer sees the complete checkout.
    if (!viewedAsSeller && order.checkout_group_id) {
      const allGroupRows = await repo.findOrdersByCheckoutGroup(order.checkout_group_id);
      if (allGroupRows.length > 1) {
        const allOrders = this._groupOrdersByItem({ data: allGroupRows, total: allGroupRows.length, page: 1, limit: 100 });
        if (allOrders.data.length === 1) {
          // Merge the grouped result into the primary order
          const grouped = allOrders.data[0];
          order.items = grouped.items;
          order.subtotal = grouped.subtotal;
          order.shipping_cost = grouped.shipping_cost;
          order.discount_amount = grouped.discount_amount;
          order.tax_amount = grouped.tax_amount;
          order.commission_amount = grouped.commission_amount;
          order.total = grouped.total;
          order._sellerOrders = grouped._sellerOrders;
          order._isGrouped = true;
        }
      }
    }

    // Enrich with canonical seller economics when viewed as seller
    if (viewedAsSeller && sellerOrgIds.length) {
      const enriched = await this._enrichGroupedOrdersWithFinancials([order], sellerOrgIds);
      if (enriched.length) Object.assign(order, { seller_net: enriched[0].seller_net, financial_status: enriched[0].financial_status });
    }

    return order;
  },

  async getOrder(orderId: number) {
    const rows = await repo.findOrderById(orderId);
    if (!rows.length) throw new NotFoundError('Order');
    return this._formatOrder(rows);
  },

  _formatOrder(rows: any[]) {
    const order = { ...rows[0] };
    order.items = rows.map((r: any) => {
      const item: any = {
        itemId: r.item_id,
        productId: r.product_id,
        productName: r.product_name,
        variantName: r.variant_name || null,
        quantity: r.quantity,
        unitPrice: r.unit_price,
        totalPrice: r.item_total,
        shopName: r.shop_name,
        sellerId: r.seller_id,
      };
      return item;
    });
    delete order.product_id; delete order.product_name; delete order.variant_name;
    delete order.quantity; delete order.unit_price; delete order.item_total;
    delete order.shop_name; delete order.seller_user_id;
    return order;
  },

  // ── Order Status Transitions ──
  async cancelOrder(orderId: number, userId: number) {
    const order = await this.getOrder(orderId);
    if (order.buyer_id !== userId) throw new NotFoundError('Order not found');

    // Cancel the order (restores stock in the status transition handler)
    await this.updateOrderStatus(orderId, userId, { status: 'cancelled', note: 'User cancelled payment' });

    // If this order belongs to a checkout group, cancel all sibling orders too
    const checkoutGroupId = order.checkout_group_id;
    if (checkoutGroupId) {
      const siblingIds = await repo.findOrderIdsByCheckoutGroup(checkoutGroupId);
      for (const siblingId of siblingIds) {
        if (siblingId === orderId) continue;
        const siblingRows = await repo.findOrderById(siblingId);
        const siblingOrder = siblingRows?.length ? this._formatOrder(siblingRows) : null;
        if (siblingOrder && siblingOrder.status !== 'cancelled') {
          try {
            await this.updateOrderStatus(siblingId, userId, { status: 'cancelled', note: 'Checkout group cancelled' });
          } catch (_e) { /* may fail if seller already progressed — log and continue */ }
        }
      }
    }

    // Restore cart from order items
    const orderRows = await repo.findOrderById(orderId);
    if (orderRows?.length) {
      await repo.restoreCartFromOrder(userId, orderRows);
    }
  },

  async updateOrderStatus(orderId: number, userId: number, data: any) {
    const order = await this.getOrder(orderId);
    const userRole = await this._getUserRoleInOrder(userId, order);
    if (!userRole) throw new NotFoundError('Order not found');

    this._validateStatusTransition(order.status, data.status, userRole);

    const isRefundOrCancel = data.status === 'cancelled' || data.status === 'refunded';
    const refundReason = data.note || (data.status === 'cancelled' ? 'Order cancelled' : 'Order refunded');

    // ── Money movement FIRST (source of truth) ──
    // The order must not claim a cancelled/refunded state until the customer's
    // money has actually moved back. If the wallet credit or gateway refund
    // fails, _processOrderRefund throws and the order stays in its previous
    // state: an observable failure with a clean retry — never a silent "refunded"
    // with funds still captured (W4/R2). Idempotent: wallet orders are guarded
    // by the unique order_refund transaction; direct card orders by the
    // paid-only payment lookup.
    if (isRefundOrCancel && order.payment_status === 'paid') {
      await this._processOrderRefund(order, orderId, refundReason);
    }

    await repo.updateOrderStatus(orderId, data.status, data.note);
    if (data.trackingNumber || data.shippingCarrier) {
      await repo.updateOrderTracking(orderId, data.shippingCarrier || '', data.trackingNumber || '');
    }
    await repo.createOrderStatusHistory({
      orderId, fromStatus: order.status, toStatus: data.status,
      changedBy: userId, changedByRole: userRole, note: data.note,
    });

    // ── Marketplace Financials: Status transitions ──
    if (data.status === 'confirmed') {
      await this._recordOrderFinancials(orderId);
    } else if (data.status === 'delivered') {
      await this._recordDeliveryFinancials(orderId);
    } else if (isRefundOrCancel) {
      await this._recordReversalFinancials(orderId, data.status, data.note);
      // Restore stock for cancelled/refunded orders
      const orderRows = await repo.findOrderById(orderId);
      if (orderRows?.length) {
        for (const row of orderRows as any[]) {
          if (!row.product_id) continue;
          await repo.restoreStock(row.product_id, row.variant_id, row.quantity);
        }
      }
    }

    // Multi-seller: when cancelling/refunding, also cancel all sibling orders in the checkout group
    if (isRefundOrCancel && order.checkout_group_id) {
      const siblingIds = await repo.findOrderIdsByCheckoutGroup(order.checkout_group_id);
      for (const siblingId of siblingIds) {
        if (siblingId === orderId) continue;
        const siblingRows = await repo.findOrderById(siblingId);
        const siblingOrder = siblingRows?.length ? this._formatOrder(siblingRows) : null;
        if (siblingOrder && siblingOrder.status !== 'cancelled' && siblingOrder.status !== 'refunded') {
          try {
            await this._validateStatusTransition(siblingOrder.status, data.status, userRole);
            await this._processOrderRefund(siblingOrder, siblingId, data.note || `Checkout group ${data.status}`);
            await repo.updateOrderStatus(siblingId, data.status, data.note || `Checkout group ${data.status}`);
            // Restore stock for sibling
            for (const row of siblingRows as any[]) {
              if (!row.product_id) continue;
              await repo.restoreStock(row.product_id, row.variant_id, row.quantity);
            }
            await repo.createOrderStatusHistory({
              orderId: siblingId, fromStatus: siblingOrder.status, toStatus: data.status,
              changedBy: userId, changedByRole: userRole,
              note: data.note || `Checkout group ${data.status}`,
            });
          } catch (e) {
            // A sibling that fails its refund stays in its previous state (money
            // moved first). Log loudly — the old silent swallow hid refund failures,
            // letting a sibling claim refunded with the money still captured (W4).
            log.error({ err: e, siblingId, orderId, toStatus: data.status }, 'Sibling order cancellation/refund failed');
          }
        }
      }
    }

    const firstItem = order.items?.[0];
    const sellerId = firstItem?.sellerId ?? 0;

    eventBusV2.emit('marketplace:order-status-changed', {
      orderId, userId, sellerId,
      fromStatus: order.status,
      toStatus: data.status,
    });

    if (data.status === 'shipped') {
      eventBusV2.emit('marketplace:order-shipped', {
        orderId, userId, sellerId,
        trackingNumber: data.trackingNumber,
      });
    } else if (data.status === 'delivered') {
      eventBusV2.emit('marketplace:order-delivered', { orderId, userId, sellerId });
    } else if (data.status === 'cancelled') {
      eventBusV2.emit('marketplace:order-cancelled', {
        orderId, userId, sellerId, reason: data.note,
      });
    } else if (data.status === 'refunded') {
      eventBusV2.emit('marketplace:order-refunded', {
        orderId, userId, sellerId, reason: data.note,
      });
    }

    return this.getOrder(orderId);
  },

  // ── Payment Event Handlers ──
  // Called by the marketplace payment listener when payment:succeeded or payment:failed-event fires.
  // For wallet/cash, fulfillment also happens synchronously in _processOrderPayment.
  // Idempotent: safe to call multiple times.
  async handlePaymentSucceeded(data: { paymentId: number; referenceType: string; referenceId: number; amount: number; metadata?: Record<string, any> }) {
    if (data.referenceType !== 'order' || !data.referenceId) return;

    const orderRows = await repo.findOrderById(data.referenceId);
    if (!orderRows?.length) {
      log.error({ referenceId: data.referenceId }, 'handlePaymentSucceeded: order not found');
      return;
    }
    const order = orderRows[0] as any;
    if (order.status === 'confirmed') {
      log.info({ orderId: data.referenceId }, 'handlePaymentSucceeded: order already confirmed — idempotent');
      return;
    }
    if (order.status === 'cancelled') {
      log.warn({ orderId: data.referenceId }, 'handlePaymentSucceeded: order was cancelled — skipping delayed webhook');
      return;
    }

    // Fulfill all orders in the checkout group (multi-seller)
    const checkoutGroupId = order.checkout_group_id;
    if (checkoutGroupId) {
      const allOrderIds = await repo.findOrderIdsByCheckoutGroup(checkoutGroupId);
      for (const oid of allOrderIds) {
        await this._fulfillAndConfirmOrder(oid, order.buyer_id, 'Payment confirmed');
      }
    } else {
      await this._fulfillAndConfirmOrder(data.referenceId, order.buyer_id, 'Payment confirmed');
    }
  },

  // Restore stock for order items (used by immediate gateway failure and payment:failed-event listener)
  async _restoreOrderStock(orderId: number, reason: string) {
    // Safety: never restore stock if payment was already made
    // (prevents race with webhook arriving between query and per-order processing)
    const hasPaid = await repo.orderHasPaidPayment(orderId);
    if (hasPaid) {
      log.warn({ orderId, reason }, '_restoreOrderStock: skipped — order has paid payment');
      return;
    }

    const orderRows = await repo.findOrderById(orderId);
    if (!orderRows?.length) return;
    for (const row of orderRows as any[]) {
      if (!row.product_id) continue;
      await repo.restoreStock(row.product_id, row.variant_id, row.quantity);
    }
  },

  // Restore stock for multiple orders at once (checkout group rollback)
  async _restoreOrdersStock(orderIds: number[], reason: string) {
    for (const oid of orderIds) {
      await this._restoreOrderStock(oid, reason);
    }
  },

  async handlePaymentFailed(data: { paymentId: number; referenceType: string; referenceId: number; amount: number; reason?: string; metadata?: Record<string, any> }) {
    if (data.referenceType !== 'order' || !data.referenceId) return;

    log.error({ orderId: data.referenceId, reason: data.reason }, 'handlePaymentFailed: order payment failed');

    // Restore stock for all orders in the checkout group
    const orderRows = await repo.findOrderById(data.referenceId);
    const userId = data.metadata?.userId || (orderRows?.length ? orderRows[0].buyer_id : 0) || 0;
    const checkoutGroupId = orderRows?.length ? (orderRows[0] as any).checkout_group_id : null;

    if (checkoutGroupId) {
      const allOrderIds = await repo.findOrderIdsByCheckoutGroup(checkoutGroupId);
      await this._restoreOrdersStock(allOrderIds, data.reason || 'Payment failed');
      for (const oid of allOrderIds) {
        await repo.updateOrderStatus(oid, 'cancelled', data.reason || 'Payment failed');
      }
    } else {
      await this._restoreOrderStock(data.referenceId, data.reason || 'Payment failed');
      await repo.updateOrderStatus(data.referenceId, 'cancelled', data.reason || 'Payment failed');
    }

    // Notify
    eventBusV2.emit('marketplace:order-cancelled', {
      orderId: data.referenceId,
      userId,
      reason: data.reason || 'Payment failed',
    });
  },

  // ── Shared order fulfillment (wallet, cash, and event-driven) ──
  // Marks order as confirmed, records financials, clears cart, emits notification.
  // payment_status is set based on payment method:
  //   - cash → 'unpaid' (COD — payment collected on delivery)
  //   - wallet/card → 'paid' (payment already completed)
  async _fulfillAndConfirmOrder(orderId: number, userId: number, note: string) {
    // Read the order first to determine status + payment method
    const orderRows = await repo.findOrderById(orderId);
    if (!orderRows?.length) return;

    const orderStatus = (orderRows[0] as any).status;
    if (orderStatus === 'confirmed' || orderStatus === 'cancelled') {
      log.info({ orderId, status: orderStatus }, '_fulfillAndConfirmOrder: idempotent skip');
      return;
    }

    const paymentMethod = (orderRows[0] as any).payment_method;
    const isCash = paymentMethod === 'cash';

    // Set status to confirmed; the repo method sets payment_status = 'paid' for confirmed,
    // but cash orders must stay as 'unpaid' (COD)
    await repo.updateOrderStatus(orderId, 'confirmed');
    if (isCash) {
      const pool = getPool();
      await pool.execute(
        "UPDATE orders SET payment_status = 'unpaid', paid_at = NULL WHERE id = ?",
        [orderId],
      );
    }

    await this._recordOrderFinancials(orderId);
    await repo.createOrderStatusHistory({
      orderId, toStatus: 'confirmed', changedBy: userId, changedByRole: 'system',
      note,
    });
    await repo.clearCart(userId);
    const sellerId = orderRows?.[0]?.item_seller_id || 0;
    eventBusV2.emit('marketplace:order-confirmed', {
      orderId, userId,
      sellerId,
    });
  },

  // ── Financial recording: Confirmed ──
  // Records the financial breakdown using new model:
  //   - courtzon_fee = fee on products only (NOT on shipping — shipping is 100% org)
  //   - Organization Net = (products × (1-rate)) + shipping
  //   - cash_holder determined by payment method
  async _recordOrderFinancials(orderId: number) {
    const rows = await repo.findOrderById(orderId);
    if (!rows?.length) return;
    const order = rows[0] as any;
    const isCOD = order.payment_method === 'cash';

    // Aggregate per-seller commission from order_items (calculated on product price only during checkout)
    let totalFee = 0;
    let totalProduct = 0;
    for (const row of rows as any[]) {
      if (!row.item_seller_id) continue;
      totalProduct += Number(row.item_total || 0);
      totalFee += Number(row.commission_amount || 0);
    }

    const shippingCost = Number(order.shipping_cost || 0);
    // courtzon_fee = fee on products only (shipping is 100% org)
    const organizationNet = (totalProduct - totalFee) + shippingCost;

    await repo.updateOrderFinancials(orderId, {
      courtzonCommission: totalFee,
      courtzonFee: totalFee,
      orgProductShare: totalProduct - totalFee,
      orgShippingShare: shippingCost,
      cashHolder: isCOD ? 'org' : 'courtzon',
      cashCollectionStatus: isCOD ? 'expected_from_customer' : 'under_collection',
    });
  },

  // ── Financial recording: Delivered ──
  // Balanced double-entry revenue recognition (debits = credits):
  //   CARD/WALLET (CourtZon collected the buyer's money):
  //     debit  platform_account(1)  totalAmount      — collected cash moves out of staging
  //     credit platform_account(2)  courtzonFee       — CourtZon commission earned
  //     credit branch(seller)       net = total − fee — payable to seller
  //   CASH/COD (the SELLER collected the buyer's money — never CourtZon's cash):
  //     debit  branch(seller)       totalAmount       — seller physically holds the cash
  //     credit platform_account(2)  courtzonFee       — CourtZon receivable FROM the seller
  //     credit branch(seller)       net = total − fee — seller entitlement
  async _recordDeliveryFinancials(orderId: number) {
    const rows = await repo.findOrderById(orderId);
    if (!rows?.length) return;
    const order = rows[0] as any;
    const isCOD = order.payment_method === 'cash';

    // Update cash collection status
    await repo.updateCashCollectionStatus(orderId, isCOD ? 'held_by_org' : 'held_by_courtzon');

    // Use order-level courtzon_fee (fee on products only — shipping is 100% org)
    const courtzonFee = Number(order.courtzon_fee || order.courtzon_commission || 0);
    const totalProduct = Number(order.subtotal || 0);
    const totalShipping = Number(order.shipping_cost || 0);
    const totalTax = Number(order.tax_amount || 0);
    const totalAmount = Math.round((totalProduct + totalShipping + totalTax) * 100) / 100;
    const netAmount = Math.round((totalAmount - courtzonFee) * 100) / 100;

    const sellerDetails = new Map<number, { branchId: number | null }>();
    for (const row of rows as any[]) {
      if (!row.item_seller_id) continue;
      if (!sellerDetails.has(row.item_seller_id)) {
        sellerDetails.set(row.item_seller_id, { branchId: row.branch_id || null });
      }
    }

    // Create a single transaction for the whole order
    const txnId = await transactionRepository.createTransaction({
      type: 'marketplace_order',
      sourceType: 'marketplace',
      sourceId: orderId,
      totalAmount,
      status: 'completed',
    });

    const entries: any[] = [];

    // Debit: where the buyer's money actually sits at delivery time.
    const firstSeller = sellerDetails.keys().next().value;
    const firstBranchId = firstSeller ? sellerDetails.get(firstSeller)?.branchId : null;
    if (isCOD) {
      // Cash held by the seller organisation — NOT collected by CourtZon.
      entries.push({
        transactionId: txnId,
        side: 'debit',
        entityType: 'branch',
        entityId: firstBranchId || 0,
        amount: totalAmount,
        branchId: firstBranchId || undefined,
        organisationId: firstSeller || undefined,
        description: `COD cash held by seller for order #${orderId}`,
      });
    } else {
      // Card/wallet — payment previously landed on the platform float.
      entries.push({
        transactionId: txnId,
        side: 'debit',
        entityType: 'platform_account',
        entityId: 1,
        amount: totalAmount,
        description: `Collected payment routed for order #${orderId}`,
      });
    }

    // Credit: CourtZon fee (commission on products only)
    if (courtzonFee > 0) {
      entries.push({
        transactionId: txnId,
        side: 'credit',
        entityType: 'platform_account',
        entityId: 2,
        amount: courtzonFee,
        description: `CourtZon fee for order #${orderId}`,
      });
    }

    // Credit: org revenue (net = products − fee + shipping + tax)
    if (netAmount > 0) {
      entries.push({
        transactionId: txnId,
        side: 'credit',
        entityType: 'branch',
        entityId: firstBranchId || 0,
        amount: netAmount,
        branchId: firstBranchId || undefined,
        organisationId: firstSeller || undefined,
        description: `Org net + Shipping Rate for order #${orderId}`,
      });
    }

    await transactionRepository.createEntries(entries);
    // Phase 2 Step 5: insertLedgerEntry (due_to_courtzon) removed — commission
    // receivable/payable is already represented by financial_entitlements and
    // GL control accounts via the canonical accounting engine.
  },

  // ── Financial reversal: Cancelled / Refunded ──
  // Reverses delivery entries and resets financial columns.
  async _recordReversalFinancials(orderId: number, reason: string, note?: string) {
    const rows = await repo.findOrderById(orderId);
    if (!rows?.length) return;
    const order = rows[0] as any;

    // Reverse delivery transaction entries if they exist
    const txns = await transactionRepository.findBySource('marketplace', orderId);
    for (const txn of txns as any[]) {
      const txnWithEntries = await transactionRepository.findById(txn.id);
      if (!txnWithEntries?.entries?.length) continue;
      const reverseEntries: any[] = [];
      for (const entry of txnWithEntries.entries) {
        reverseEntries.push({
          transactionId: entry.transaction_id,
          side: entry.side === 'credit' ? 'debit' : 'credit',
          entityType: entry.entity_type,
          entityId: entry.entity_id,
          amount: Number(entry.amount),
          branchId: entry.branch_id || undefined,
          organisationId: entry.organisation_id || undefined,
          description: `Reversal (${reason}) for order #${orderId}`,
        });
      }
      if (reverseEntries.length) {
        await transactionRepository.createEntries(reverseEntries);
      }
    }

    // Reset financial columns
    await repo.updateOrderFinancials(orderId, {
      courtzonCommission: 0,
      courtzonFee: 0,
      orgProductShare: 0,
      orgShippingShare: 0,
      cashHolder: order.cash_holder || 'courtzon',
      cashCollectionStatus: 'under_collection',
    });
  },

  // ── Refund execution ──
  // Credits the buyer's wallet directly for wallet-funded orders (the gateway has
  // no record of a synthetic wallet charge, so paymentService.refund() would fail
  // silently). Card/online orders are refunded via the gateway. COD orders have no
  // pre-collected payment and require no action.
  //
  // Multi-seller checkouts charge ONCE against the primary order of the checkout
  // group. Sibling seller-orders therefore locate that same payment through the
  // group and refund only their own total — the payment row stays 'paid' until
  // every order in the group has been refunded.
  async _findPaymentForOrder(order: any, orderId: number) {
    const direct = await paymentRepository.findByOrderId(orderId);
    if (direct?.id) return direct;
    if (!order.checkout_group_id) return null;
    // Fallback: the group payment lives on the primary (lowest-id) order.
    const groupIds = await repo.findOrderIdsByCheckoutGroup(order.checkout_group_id);
    const primaryId = groupIds.length ? Math.min(...groupIds) : null;
    if (primaryId === null || primaryId === orderId) return null;
    return paymentRepository.findByOrderIdIncludingRefunded(primaryId);
  },

  /** True when at least one sibling order in the group is still active. */
  async _hasActiveGroupSiblings(order: any, orderId: number): Promise<boolean> {
    if (!order.checkout_group_id) return false;
    const siblingIds = (await repo.findOrderIdsByCheckoutGroup(order.checkout_group_id))
      .filter((oid: number) => oid !== orderId);
    for (const sid of siblingIds) {
      const rows = await repo.findOrderById(sid);
      const status = rows?.length ? (rows[0] as any).status : null;
      if (status && status !== 'cancelled' && status !== 'refunded') return true;
    }
    return false;
  },

  async _processOrderRefund(order: any, orderId: number, reason: string) {
    if (order.payment_status !== 'paid') {
      log.info({ orderId }, 'Order refund: payment not paid — nothing to refund');
      return;
    }

    const paymentTxn = await this._findPaymentForOrder(order, orderId);
    if (!paymentTxn?.id) {
      log.warn({ orderId }, 'Order refund: no paid payment transaction found');
      return;
    }

    const method = (paymentTxn as any).payment_method || order.payment_method || 'card';
    const amount = Number(order.total || 0);
    if (amount <= 0) {
      log.warn({ orderId, amount }, 'Order refund: zero/negative amount — skipping');
      return;
    }

    if (method === 'wallet') {
      // Idempotency anchor: a successful wallet refund for this order writes a
      // single unique (order_refund, orderId) wallet_transactions row. If it
      // already exists, the refund completed on a previous attempt — skip
      // instead of re-crediting the wallet (no duplicate refunds on retry).
      const existingRefunds = await walletRepository.findTransactionsByReference('order_refund', orderId);
      if (existingRefunds.length > 0) {
        log.info({ orderId }, 'Order refund: wallet already refunded — idempotent skip');
        return;
      }

      await withTransaction(async (conn) => {
        const wallet = await walletRepository.findByUserId(order.buyer_id);
        if (!wallet) {
          // Money cannot move — throw so the order never claims refunded with
          // the funds still captured (W4). Previously this returned silently.
          throw new Error(`Order #${orderId} refund failed: buyer ${order.buyer_id} has no wallet`);
        }
        const state = await walletRepository.lockAndGetBalance(wallet.id, conn);
        if (!state) {
          throw new ConflictError('Wallet is locked');
        }

        const newBalance = state.balance + amount;
        const updated = await walletRepository.updateBalance(wallet.id, newBalance, state.version, conn);
        if (!updated) {
          // Rollback (throws inside withTransaction): the payment must NOT be
          // marked refunded when the credit did not persist.
          throw new Error(`Order #${orderId} refund failed: concurrent wallet update — retry`);
        }

        await walletRepository.createTransaction({
          walletId: wallet.id,
          type: 'refund',
          amount,
          direction: 'credit',
          // uq_wallet_txn_ref (reference_type, reference_id) ignores
          // direction/type, so a refund row must not reuse the charge's
          // ('order', orderId) pair — use the order_refund pseudo-type.
          referenceType: 'order_refund',
          referenceId: orderId,
          description: `Order #${orderId} refund: ${reason || 'order refund'}`,
        }, conn);

        // Only close the payment once EVERY order in the checkout group is terminal.
        const siblingsActive = await this._hasActiveGroupSiblings(order, orderId);
        if (!siblingsActive) {
          await conn.execute(
            `UPDATE payment_transactions
             SET payment_status = 'refunded', updated_at = NOW()
             WHERE id = ? AND payment_status IN ('paid', 'refunded')`,
            [paymentTxn.id],
          );
        }

        await eventBusV2.emit('payment:refunded', {
          paymentId: paymentTxn.id,
          userId: order.buyer_id,
          amount,
          reason,
          referenceType: 'order',
          referenceId: orderId,
          metadata: { paymentMethod: 'wallet', checkoutGroupId: order.checkout_group_id || null },
        }, undefined, conn);

        eventBusV2.emit('wallet:transaction', {
          walletId: wallet.id,
          userId: order.buyer_id,
          amount,
          balance: newBalance,
          type: 'refund',
          description: `Order #${orderId} refund`,
        });
      });
      log.info({ orderId, amount }, 'Order refund: wallet credited');
    } else if (method === 'cash') {
      log.info({ orderId }, 'Order refund: COD order — no pre-collected payment');
    } else {
      // Gateway refund failure must surface (throw) — swallowing it let the
      // order claim refunded while the gateway kept the payment (W4).
      const result = await paymentService.refund(paymentTxn.id, amount, reason || 'Order refunded');
      if (!result?.success) {
        throw new Error(`Order #${orderId} gateway refund failed: ${(result as any)?.errorMessage || 'unknown error'}`);
      }
    }
  },

  /**
   * Resolve ALL organisation ids through which the user can act as a
   * Marketplace seller: organisations they OWN (any org type — a sports club,
   * academy, gym, etc. can be a seller exactly like a shop) plus organisations
   * where they hold an active organisation-scoped role. Deduped, order-stable.
   * Ownership (organisations.owner_id) is the authoritative product-ownership
   * relationship; role scopes cover staff acting on behalf of an org.
   */
  async _resolveSellerOrgIds(userId: number): Promise<number[]> {
    const orgs = await repo.findSellerOrgsForUser(userId);
    const ids = new Set<number>();
    for (const o of orgs as any[]) {
      if (o?.id && Number(o.is_active) === 1) ids.add(Number(o.id));
    }
    return [...ids];
  },

  /** True when product.seller_id belongs to one of the user's seller orgs. */
  async _ownsProductAsSeller(userId: number, product: any): Promise<boolean> {
    if (!product) return false;
    if (product.seller_user_id && Number(product.seller_user_id) === Number(userId)) return true;
    const orgIds = await this._resolveSellerOrgIds(userId);
    return orgIds.includes(Number(product.seller_id));
  },

  async _getUserRoleInOrder(userId: number, order: any): Promise<'buyer' | 'seller' | 'admin' | null> {
    if (order.buyer_id === userId) return 'buyer';
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (orgIds.length && order.items?.some((i: any) => orgIds.includes(Number(i.sellerId)))) {
      return 'seller';
    }
    // A user who is neither the buyer nor a seller on this order must be a
    // genuine platform admin to manage it. Do NOT fall back to 'admin' for
    // unrelated users holding a broad view permission.
    if (await repo.isPlatformAdmin(userId)) return 'admin';
    return null;
  },

  _validateStatusTransition(current: string, next: string, role: string) {
    const transitions: Record<string, Record<string, string[]>> = {
      pending: {
        buyer: ['cancelled'],
        admin: ['confirmed', 'cancelled'],
        seller: ['processing', 'cancelled'],
      },
      confirmed: {
        buyer: ['cancelled'],
        admin: ['processing', 'cancelled'],
        seller: ['processing', 'cancelled'],
      },
      processing: {
        seller: ['shipped'],
        admin: ['shipped', 'cancelled'],
        buyer: ['cancelled'],
      },
      shipped: {
        buyer: ['delivered'],
        admin: ['delivered', 'cancelled'],
        seller: ['delivered'],
      },
      delivered: {
        buyer: ['refunded'],
        admin: ['refunded'],
        seller: [],
      },
      cancelled: { buyer: [], seller: [], admin: [] },
      refunded: { buyer: [], seller: [], admin: [] },
    };

    const allowed = transitions[current]?.[role] || [];
    if (!allowed.includes(next)) {
      throw new ForbiddenError(`Cannot transition from '${current}' to '${next}' as ${role}`);
    }
  },

  // ── Seller Orders ──
  async getSellerOrders(userId: number, filters: any) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('Not a seller');
    const result = await repo.findOrdersBySeller(orgIds, filters);
    const grouped = this._groupOrdersByItem(result);
    grouped.data = await this._enrichGroupedOrdersWithFinancials(grouped.data, orgIds);
    return grouped;
  },

  async getSellerStats(userId: number) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('Not a seller');
    const stats = await repo.getSellerStats(orgIds);
    // Phase 2 Step 6: add financial-position metrics from PositionService
    // (single authority) alongside sales metrics. gross_sales_volume clarifies
    // that total_revenue is GROSS SALES, not seller earnings.
    const { positionService } = await import('../../financial/application/position.service.js');
    let available = 0, pendingFee = 0;
    for (const oid of orgIds) {
      const bal = await positionService.getSellerBalanceSummary(oid);
      available += bal.available_balance;
      pendingFee += bal.pending_fee;
    }
    return {
      ...stats,
      gross_sales_volume: stats.total_revenue,
      financial_position: {
        available_balance: Math.round(available * 100) / 100,
        pending_commission: Math.round(pendingFee * 100) / 100,
      },
    };
  },

  // ── Seller products (manage) ──
  async getSellerProducts(userId: number, page: number, limit: number, filters?: { sportId?: number; status?: string; branchId?: number }) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('Not a seller');
    return repo.findProducts({ sellerIds: orgIds, page, limit, sort: 'newest', status: filters?.status, sportId: filters?.sportId, branchId: filters?.branchId });
  },

  // ── Reviews ──
  async getReviews(productId: number, page: number, limit: number) {
    return repo.findReviewsByProduct(productId, page, limit);
  },

  async createReview(userId: number, productId: number, data: any) {
    const product = await repo.findProductById(productId);
    if (!product) throw new NotFoundError('Product');
    const purchased = await repo.findOrdersContainingProduct(userId, productId);
    if (!purchased) throw new ForbiddenError('You can only review products you have purchased');
    return repo.createReview({ productId, userId, rating: data.rating, reviewText: data.reviewText });
  },

  // ── Player → Seller Upgrade Flow ──

  async getPublicSellerProfile(sellerId: number) {
    const org = await repo.findOrgById(sellerId);
    if (!org) return null;
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT full_name, avatar_url FROM users WHERE id = ?',
      [org.owner_id]
    );
    const user = rows[0] as any;
    return {
      id: org.id,
      shopName: user?.full_name || org.name,
      shopDescription: org.description,
      shopLogoUrl: user?.avatar_url,
      ratingAvg: org.rating_avg,
      ratingCount: org.rating_count,
    };
  },

  async activatePlayerSell(userId: number) {
    const pool = getPool();
    await pool.execute(
      'UPDATE users SET has_activated_selling = 1 WHERE id = ?',
      [userId]
    );
    return { success: true };
  },

  async upgradeToSeller(userId: number, data: any) {
    const org = await repo.findOrgByUserId(userId, 'player');
    if (!org) throw new NotFoundError('No player selling account found');

    const pool = getPool();
    const [result] = await pool.execute<RowData>(
      `INSERT INTO organisation_upgrade_requests (organisation_id, requested_by, requested_plan_id, status, notes)
       VALUES (?, ?, ?, 'pending', ?)`,
      [org.id, userId, data.planId || null, data.notes || null]
    );

    eventBusV2.emit('marketplace:new-seller-registered', {
      sellerId: org.id,
      userId,
      shopName: org.name || '',
    });
    return { id: (result as any).insertId, status: 'pending' };
  },

  async approveSellerUpgrade(adminUserId: number, orgId: number) {
    const pool = getPool();

    const [requests] = await pool.execute<RowData>(
      `SELECT * FROM organisation_upgrade_requests
       WHERE organisation_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [orgId]
    );
    const request = requests[0];
    if (!request) throw new NotFoundError('No pending upgrade request');

    const org = await repo.findOrgById(orgId);
    if (!org) throw new NotFoundError('Organisation not found');

    const shopTypeId = await repo.findOrgTypeIdBySlug('shop');
    if (!shopTypeId) throw new NotFoundError('Shop org type not configured');

    await repo.updateOrganisation(orgId, { orgTypeId: shopTypeId });

    if (request.requested_plan_id) {
      await repo.createSubscription(orgId, request.requested_plan_id);
    }

    await pool.execute(
      `UPDATE organisation_upgrade_requests SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [adminUserId, request.id]
    );

    return { success: true, orgId };
  },

  async getSellerPlans() {
    return repo.findSubscriptionPlansByOrgType('shop');
  },

  // ── Cart Seller Info ──
  async getCartSellerInfo(userId: number) {
    return repo.findCartSellers(userId);
  },

  // ── Settlements (delegated to settlement module) ──
  async getSettlementsByUser(userId: number, page: number, limit: number) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('No seller account found');
    // P2-5: aggregate across ALL authorised seller organisations (never orgIds[0]
    // only). Each settlement keeps its organisation identity. If the seller has a
    // single org, behavior is identical to before.
    const { settlementRepository } = await import('../../settlement/infrastructure/repositories/settlement.repository.js');
    return settlementRepository.findSettlementsForOrgs(orgIds, page, limit);
  },

  async getSettlementBalanceByUser(userId: number) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('No seller account found');
    // Phase 2 Step 3: delegate to PositionService — the canonical facade over
    // financial_entitlements (single authority). Legacy repo method superseded.
    const { positionService } = await import('../../financial/application/position.service.js');
    let available = 0, fee = 0, count = 0;
    for (const oid of orgIds) {
      const balance = await positionService.getSellerBalanceSummary(oid);
      available += balance.available_balance;
      fee += balance.pending_fee;
      count += balance.unsettled_orders;
    }
    return {
      available_balance: Math.round(available * 100) / 100,
      pending_fee: Math.round(fee * 100) / 100,
      pending_settlements: 0,
      unsettled_orders: count,
    };
  },

  async requestSettlement(userId: number, organisationId?: number) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new ForbiddenError('No seller account found');

    // P2-5: explicit multi-organisation selection. A single-org seller keeps
    // backward-compatible behavior (default to their only org). A multi-org
    // seller MUST specify which organisation to settle — never silently pick
    // orgIds[0]. The requested org is always verified against the authorised
    // seller org ids (strict organisation isolation).
    let targetOrgId: number;
    if (organisationId == null) {
      if (orgIds.length > 1) {
        throw new ValidationError('organisationId is required when a seller manages multiple organisations');
      }
      targetOrgId = orgIds[0];
    } else {
      if (!orgIds.includes(Number(organisationId))) {
        throw new ForbiddenError('You do not have access to this organisation');
      }
      targetOrgId = Number(organisationId);
    }

    return (await import('../../settlement/application/settlement.service.js')).settlementService.requestSettlement({
      organisationId: targetOrgId,
      requestedBy: userId,
      requestedByRole: 'seller',
    });
  },

  async getPlayerStatus(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT has_activated_selling FROM users WHERE id = ?',
      [userId]
    );
    const active = rows.length > 0 && !!(rows[0] as any).has_activated_selling;
    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM products
       WHERE seller_user_id = ? AND seller_type = 'player' AND status = 'active' AND deleted_at IS NULL`,
      [userId]
    );
    const activeProductCount = Number((countRows[0] as any)?.cnt ?? 0);
    // P2-5: expose the seller's authorised organisations so a multi-org seller
    // can select which organisation to view/request settlement for.
    const orgRows = await repo.findSellerOrgsForUser(userId);
    const orgs = (orgRows as any[]).filter((o: any) => Number(o.is_active) === 1).map((o: any) => ({
      id: Number(o.id),
      name: o.name,
    }));
    return { active, activeProductCount, orgs };
  },

  // ── Player Products ──

  async listPlayerProducts(userId: number, status?: string) {
    const pool = getPool();
    const params: any[] = [userId];
    let statusClause = '';
    if (status) { statusClause = 'AND p.status = ?'; params.push(status); }
    const [rows] = await pool.execute<RowData>(
      `SELECT p.id, p.name, p.description, p.price, p.condition_status, p.images, p.status,
              p.created_at, p.updated_at, p.category_id, p.sport_id, p.brand_id,
              GROUP_CONCAT(pt.tag_id) as tag_ids
       FROM products p
       LEFT JOIN product_tags pt ON pt.product_id = p.id
       WHERE p.seller_user_id = ? AND p.seller_type = 'player' AND p.deleted_at IS NULL ${statusClause}
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      params
    );
    return rows;
  },

  async createPlayerProduct(userId: number, data: any) {
    const pool = getPool();
    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM products
       WHERE seller_user_id = ? AND seller_type = 'player'
         AND status = 'active' AND deleted_at IS NULL`,
      [userId]
    );
    const activeCount = Number((countRows[0] as any).cnt);
    if (activeCount >= 5) {
      throw new ConflictError('You can have at most 5 active products. Mark some as sold first.');
    }

    const imagesJson = data.images?.length ? JSON.stringify(data.images) : null;
    const [result] = await pool.execute<RowData>(
      `INSERT INTO products (seller_user_id, seller_type, category_id, sport_id, brand_id, name, description, price,
         currency_code, quantity, status, condition_status, images)
       VALUES (?, 'player', ?, ?, ?, ?, ?, ?, 'EGP', 1, 'pending', ?, ?)`,
      [userId, data.categoryId, data.sportId || null, data.brandId || null, data.name, data.description || null, data.price, data.conditionStatus || null, imagesJson]
    );
    const id = (result as any).insertId;
    if (data.tagIds?.length) {
      await repo.setProductTags(id, data.tagIds);
    }
    const [rows] = await pool.execute<RowData>('SELECT * FROM products WHERE id = ?', [id]);
    return rows[0];
  },

  async updatePlayerProduct(userId: number, productId: number, data: any) {
    const pool = getPool();
    const [existing] = await pool.execute<RowData>(
      'SELECT id FROM products WHERE id = ? AND seller_user_id = ? AND seller_type = \'player\' AND deleted_at IS NULL',
      [productId, userId]
    );
    if (!existing.length) throw new NotFoundError('Product not found');

    const updates: string[] = [];
    const params: any[] = [];
    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.price !== undefined) { updates.push('price = ?'); params.push(data.price); }
    if (data.categoryId !== undefined) { updates.push('category_id = ?'); params.push(data.categoryId); }
    if (data.sportId !== undefined) { updates.push('sport_id = ?'); params.push(data.sportId || null); }
    if (data.brandId !== undefined) { updates.push('brand_id = ?'); params.push(data.brandId || null); }
    if (data.conditionStatus !== undefined) { updates.push('condition_status = ?'); params.push(data.conditionStatus); }
    if (data.images !== undefined) { updates.push('images = ?'); params.push(data.images?.length ? JSON.stringify(data.images) : null); }

    if (updates.length) {
      params.push(productId);
      await pool.execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    if (data.tagIds !== undefined) {
      await repo.setProductTags(productId, data.tagIds);
    }

    const [rows] = await pool.execute<RowData>('SELECT * FROM products WHERE id = ?', [productId]);
    return rows[0];
  },

  async markPlayerProductSold(userId: number, productId: number) {
    const pool = getPool();
    const [existing] = await pool.execute<RowData>(
      'SELECT id FROM products WHERE id = ? AND seller_user_id = ? AND seller_type = \'player\' AND deleted_at IS NULL',
      [productId, userId]
    );
    if (!existing.length) throw new NotFoundError('Product not found');

    await pool.execute(
      'UPDATE products SET status = \'sold\' WHERE id = ?',
      [productId]
    );
  },

  async updateSellerOrg(userId: number, data: { organisationId?: number; name?: string; description?: string; email?: string; phone?: string; website?: string; crNumber?: string; taxId?: string; isVatRegistered?: boolean; financialDetails?: any }) {
    const orgIds = await this._resolveSellerOrgIds(userId);
    if (!orgIds.length) throw new NotFoundError('Seller account');

    // F-11: resolve the target organisation EXPLICITLY. A single-org seller keeps
    // backward-compatible behavior (default to their only org). A multi-org seller
    // MUST specify which organisation to update — never silently pick orgIds[0].
    // The requested org is always verified against the authorised seller org ids
    // (strict organisation isolation).
    let orgId: number;
    if (data.organisationId == null) {
      if (orgIds.length > 1) {
        throw new ValidationError('organisationId is required when a seller manages multiple organisations');
      }
      orgId = orgIds[0];
    } else {
      if (!orgIds.includes(Number(data.organisationId))) {
        throw new ForbiddenError('You do not have access to this organisation');
      }
      orgId = Number(data.organisationId);
    }

    const org = { id: orgId };
    const { financialDetails, ...orgData } = data;
    // Identity fields (Name / Type / Country) are super-admin managed — sellers
    // can view them read-only on their profile but never change them.
    delete orgData.name;
    delete (orgData as any).slug;
    delete (orgData as any).orgTypeId;
    delete (orgData as any).org_type_id;
    delete (orgData as any).countryId;
    delete (orgData as any).country_id;
    delete (orgData as any).organisationId;
    if (Object.keys(orgData).length > 0) {
      await repo.updateOrganisation(org.id, orgData);
    }
    if (financialDetails) {
      await organisationService.upsertMainBranchFinancialDetails(org.id, financialDetails);
    }
    return repo.findOrgById(org.id);
  },

  // ── Admin endpoints ──
  async adminListProducts(filters: { search?: string; categoryId?: number; sellerId?: number; status?: string; page: number; limit: number }) {
    return repo.adminFindAllProducts(filters);
  },

  async adminUpdateProductStatus(productId: number, status: string) {
    const previous = await repo.findProductById(productId);
    if (!previous) throw new NotFoundError('Product');
    if (previous.status === status) {
      return previous; // no transition — nothing to announce
    }

    await repo.adminUpdateProduct(productId, { status });

    // Post-commit announcement: sellers, org staff, consumers and admins
    // refresh their product lists/details without a manual reload.
    eventBusV2.emit('marketplace:product-status-changed', {
      productId,
      name: (previous as any).name,
      previousStatus: previous.status,
      status,
      sellerType: (previous as any).seller_type,
      organisationId: (previous as any).seller_id ?? null,
      sellerUserId: (previous as any).seller_user_id ?? null,
    });

    return repo.findProductById(productId);
  },

  async adminUpdateProduct(productId: number, data: any) {
    const previous = await repo.findProductById(productId);
    if (!previous) throw new NotFoundError('Product');
    await repo.adminUpdateProduct(productId, data);

    // Post-commit announce when a full edit carries a status transition, so
    // seller/org/player audiences refresh (mirrors adminUpdateProductStatus).
    if (data.status !== undefined && previous.status !== data.status) {
      eventBusV2.emit('marketplace:product-status-changed', {
        productId,
        name: (previous as any).name,
        previousStatus: previous.status,
        status: data.status,
        sellerType: (previous as any).seller_type,
        organisationId: (previous as any).seller_id ?? null,
        sellerUserId: (previous as any).seller_user_id ?? null,
      });
    }

    return repo.findProductById(productId);
  },

  async adminDeleteProduct(productId: number) {
    const product = await repo.findProductById(productId);
    if (!product) throw new NotFoundError('Product');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM cart_items WHERE product_id = ?', [productId]);
      await conn.execute('DELETE FROM wishlist_items WHERE product_id = ?', [productId]);
      await conn.execute('UPDATE products SET is_active = 0 WHERE id = ? AND deleted_at IS NULL', [productId]);
      const [result] = await conn.execute(
        'UPDATE products SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
        [productId],
      );
      if (!(result as { affectedRows: number }).affectedRows) throw new NotFoundError('Product');
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async adminListOrders(filters: { status?: string; search?: string; sellerId?: number; page: number; limit: number }) {
    const result = await repo.adminFindAllOrders(filters);
    return this._groupOrdersByItem(result);
  },

  async adminGetOrderDetail(orderId: number) {
    return repo.findOrderById(orderId);
  },

  async adminListSellers(filters: { search?: string; orgType?: string; page: number; limit: number }) {
    const result = await repo.adminFindSellerOrgs(filters);
    const orgIds = (result.data || []).map((org: any) => org.id);
    // Batch: 3 queries instead of N×2
    const [statsMap, subsMap, latestSubsMap] = await Promise.all([
      repo.adminGetSellerStatsBatch(orgIds),
      repo.findActiveSubscriptionsBatch(orgIds),
      repo.findLatestSubscriptionsBatch(orgIds),
    ]);
    const enriched = (result.data || []).map((org: any) => ({
      ...org,
      stats: statsMap[org.id] || { total_products: 0, active_products: 0, total_orders: 0, total_revenue: 0 },
      subscription: subsMap[org.id] || null,
      subscriptionStatus: latestSubsMap[org.id]?.subscription_status || null,
    }));
    return { ...result, data: enriched };
  },

  async adminToggleSellerStatus(sellerId: number, isActive: boolean) {
    await repo.adminUpdateOrgStatus(sellerId, isActive);
    if (isActive) await repo.updateOrganisation(sellerId, { isVerified: true });
    return true;
  },

  async adminGetSellerDetail(sellerId: number) {
    const org = await repo.findOrgById(sellerId);
    if (!org) throw new NotFoundError('Seller not found');
    const stats = await repo.adminGetSellerStats(sellerId);
    const sub = await repo.findActiveSubscription(sellerId);
    return { ...org, stats, subscription: sub || null };
  },

  async adminListUpgradeRequests(filters: { status?: string; page: number; limit: number }) {
    return repo.adminFindUpgradeRequests(filters);
  },

  async adminRejectUpgrade(adminUserId: number, orgId: number, reason?: string) {
    await repo.adminRejectUpgrade(orgId, reason);
    await repo.createOrderStatusHistory({
      orderId: 0, toStatus: 'rejected', changedBy: adminUserId, changedByRole: 'admin', note: reason,
    });
  },

  async adminListReviews(filters: { productId?: number; page: number; limit: number }) {
    return repo.adminFindAllReviews(filters);
  },

  async adminDeleteReview(reviewId: number) {
    return repo.adminDeleteReview(reviewId);
  },

  // ── Brands & Tags (public listing) ──
  async getBrands() {
    return repo.findAllBrands();
  },

  async getTags() {
    return repo.findAllTags();
  },

  // ── Geo ──
  async getProvinces(userId: number) {
    const countryId = await repo.findUserCountryId(userId);
    return repo.findProvinces(countryId || undefined);
  },

  async getCities(provinceId: number) {
    return repo.findCitiesByProvince(provinceId);
  },

  // ── Shipping Rates (Seller) ──
  async getSellerShippingRates(sellerId: number) {
    return repo.findShippingRatesBySeller(sellerId);
  },

  async createSellerShippingRate(sellerId: number, data: any) {
    return repo.createShippingRate({ sellerId, ...data });
  },

  async updateSellerShippingRate(id: number, sellerId: number, data: any) {
    const ok = await repo.updateShippingRate(id, sellerId, data);
    if (!ok) throw new NotFoundError('Shipping rate');
    return repo.findShippingRatesBySeller(sellerId);
  },

  async deleteSellerShippingRate(id: number, sellerId: number) {
    const ok = await repo.deleteShippingRate(id, sellerId);
    if (!ok) throw new NotFoundError('Shipping rate');
  },

  // ── Check Shipping ──
  async checkShipping(userId: number, data: any) {
    let provinceId = data.provinceId;
    let cityId = data.cityId;
    if (data.addressId) {
      const addr = await repo.findAddressById(data.addressId, userId);
      if (!addr) throw new NotFoundError('Address');
      provinceId = addr.province_id;
      cityId = addr.city_id;
    }
    if (!provinceId) throw new ConflictError('Province is required to check shipping');

    const cartItems = await repo.findCartByUser(userId);
    if (!cartItems.length) throw new ConflictError('Cart is empty');

    const sellers = await repo.checkSellersShipping(cartItems, provinceId, cityId);
    const totalShipping = sellers.reduce((sum: number, s: any) => sum + (s.available ? s.price : 0), 0);
    return { sellers, total_shipping: totalShipping };
  },

  // ── Abandoned Order Cleanup ──
  // Cancels pending marketplace orders where payment was never completed.
  // Runs as a scheduled cron job. Idempotent: safe to run multiple times.
  async cancelAbandonedOrders(timeoutMinutes: number = 30) {
    const cutoff = toMySqlDateTime(new Date(Date.now() - timeoutMinutes * 60_000));
    log.info({ timeoutMinutes, cutoff }, 'cancelAbandonedOrders — starting');

    const rows = await repo.findAbandonedPendingOrders(cutoff);
    if (!rows.length) {
      log.info('cancelAbandonedOrders — no abandoned orders found');
      return { cancelled: 0 };
    }

    let cancelled = 0;
    for (const order of rows as any[]) {
      try {
        // Skip if order already has a paid payment (safety check)
        const hasPaidPayment = await repo.orderHasPaidPayment(order.id);
        if (hasPaidPayment) {
          log.warn({ orderId: order.id }, 'cancelAbandonedOrders — order has paid payment, skipping');
          continue;
        }

        await this._restoreOrderStock(order.id, 'Abandoned order — stock restored');
        await repo.updateOrderStatus(order.id, 'cancelled', 'Payment not completed within timeout');
        await repo.createOrderStatusHistory({
          orderId: order.id, toStatus: 'cancelled', changedBy: 0, changedByRole: 'system',
          note: `Payment not completed within ${timeoutMinutes} minutes`,
        });
        eventBusV2.emit('marketplace:order-cancelled', {
          orderId: order.id,
          userId: order.buyer_id || 0,
          reason: 'Payment timeout',
        });
        cancelled++;
        log.info({ orderId: order.id }, 'cancelAbandonedOrders — cancelled');
      } catch (err) {
        log.error({ err, orderId: order.id }, 'cancelAbandonedOrders — failed to cancel');
      }
    }

    log.info({ cancelled, total: rows.length }, 'cancelAbandonedOrders — completed');
    return { cancelled, total: rows.length };
  },
};
