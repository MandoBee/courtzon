import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { marketplaceRepository as repo } from '../infrastructure/repositories/marketplace.repository.js';
import { paymentService } from '../../payment/application/payment.service.js';
import { paymentRepository } from '../../payment/infrastructure/repositories/payment.repository.js';
import { commissionService } from '../../../shared/services/commission.service.js';
import { organisationService } from '../../organisations/application/organisation.service.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { cascadeProductSoftDelete } from '../../../shared/cascade/index.js';
import { getPlanNumericLimit } from '../../../shared/utils/plan-limits.util.js';
import { userRepository } from '../../auth/infrastructure/repositories/user.repository.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBus } from '../../../shared/event-bus/index.js';

const log = createModuleLogger('marketplace');

type RowData = mysql.RowDataPacket[];

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
    return repo.findProducts(filters);
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
    let org = await repo.findOrgByUserId(userId, 'seller');
    let orgType = 'seller';
    if (!org) {
      org = await repo.findOrgByUserId(userId, 'player');
      if (org) orgType = 'player';
    }
    if (!org) {
      org = await repo.findOrgByUserScope(userId);
      orgType = org?.org_type_slug || 'seller';
    }
    if (!org) throw new ForbiddenError('You must be a seller to create products');
    if (!org.is_active) throw new ForbiddenError('Seller account is inactive');

    const defaultLimit = orgType === 'player' ? 5 : 3;
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
    let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) org = await repo.findOrgByUserScope(userId);
    if (!org) throw new ForbiddenError('Not a seller');

    data.status = 'pending';
    const { variants, tagIds, ...productData } = data;
    const updated = await repo.updateProduct(productId, org.id, productData);
    if (!updated) throw new NotFoundError('Product');
    if (variants !== undefined) {
      const existingVariants = await repo.findVariants(productId);
      const incomingIds = variants.filter((v: any) => v.id).map((v: any) => v.id);
      for (const existing of existingVariants) {
        if (!incomingIds.includes(existing.id)) {
          await repo.deleteVariant(existing.id, org.id);
        }
      }
      for (const v of variants) {
        if (v.id) {
          await repo.updateVariant(v.id, v, org.id);
        } else {
          await repo.createVariant({ ...v, productId });
        }
      }
    }
    if (tagIds !== undefined) {
      await repo.setProductTags(productId, tagIds);
    }
    return this.getProduct(productId);
  },

  async deleteProduct(userId: number, productId: number) {
    let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) org = await repo.findOrgByUserScope(userId);
    if (!org) throw new ForbiddenError('Not a seller');
    const product = await repo.findProductById(productId);
    if (!product || product.seller_id !== org.id) throw new NotFoundError('Product');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeProductSoftDelete(productId, conn);
      const [result] = await conn.execute(
        'UPDATE products SET deleted_at = NOW() WHERE id = ? AND seller_id = ? AND deleted_at IS NULL',
        [productId, org.id],
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
    let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) org = await repo.findOrgByUserScope(userId);
    if (!org) throw new ForbiddenError('Not a seller');
    const product = await repo.findProductById(productId);
    if (!product) throw new NotFoundError('Product');
    if (product.seller_id !== org.id) throw new ForbiddenError('Not your product');
    const id = await repo.createVariant({ ...data, productId });
    return { id };
  },

  async updateVariant(userId: number, variantId: number, data: any) {
    let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) org = await repo.findOrgByUserScope(userId);
    if (!org) throw new ForbiddenError('Not a seller');
    const variant = await repo.findVariantById(variantId);
    if (!variant) throw new NotFoundError('Variant');
    if (variant.seller_id !== org.id) throw new ForbiddenError('Variant does not belong to your organisation');
    const ok = await repo.updateVariant(variantId, data, org.id);
    if (!ok) throw new NotFoundError('Variant');
    return { success: true };
  },

  async deleteVariant(userId: number, variantId: number) {
    let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) org = await repo.findOrgByUserScope(userId);
    if (!org) throw new ForbiddenError('Not a seller');
    const variant = await repo.findVariantById(variantId);
    if (!variant) throw new NotFoundError('Variant');
    if (variant.seller_id !== org.id) throw new ForbiddenError('Variant does not belong to your organisation');
    await repo.deleteVariant(variantId, org.id);
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
    const cartItems = await repo.findCartByUser(userId);
    if (!cartItems.length) throw new ConflictError('Cart is empty');

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
      if (!product || product.status !== 'active') {
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
        const comm = await commissionService.calculate(product.seller_id, 'marketplace', 100);
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
    let shippingCost = 0;
    let maxDays = 0;
    const shippingErrors: string[] = [];
    for (const sid of sellerIds) {
      const rate = await repo.findShippingRateForSeller(sid, provinceId, cityId);
      const shopName = cartItems.find((i: any) => i.seller_id === sid)?.shop_name || `Seller #${sid}`;
      if (!rate) {
        shippingErrors.push(`"${shopName}" does not ship to your address`);
      } else {
        shippingCost += Number(rate.price);
        if (rate.estimated_days && Number(rate.estimated_days) > maxDays) {
          maxDays = Number(rate.estimated_days);
        }
      }
    }
    if (shippingErrors.length) {
      throw new ConflictError(shippingErrors.join('. '));
    }
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

    // Calculate commission on discounted subtotal
    const afterDiscount = subtotal - discountAmount;
    const totalCommission = [...seenSellers.values()].reduce((s, v) => {
      const sellerShare = sellerShares.get(v.sellerId) || 0;
      const discountFactor = subtotal > 0 ? afterDiscount / subtotal : 1;
      const adjustedShare = sellerShare * discountFactor;
      return s + (v.rateType === 'fixed' ? v.commission : (v.commission / 100) * adjustedShare);
    }, 0);

    const taxAmount = 0;
    const total = afterDiscount + shippingCost;

    const shippingAddress = addr;

    const orderId = await repo.createOrder({
      buyerId: userId, subtotal, shippingCost, commission: totalCommission, total,
      couponId, discountAmount, taxAmount, currencyCode,
      shippingAddress: shippingAddress || null, notes: data.notes || '',
      paymentMethod: data.paymentMethod || 'wallet',
      estimatedDeliveryDate,
    });

    // ── Second pass: create order items using pre-fetched product map ──
    for (const item of cartItems) {
      const product = productMap.get(item.product_id)!; // guaranteed to exist from first pass
      const sellerInfo = seenSellers.get(product.seller_id)!;
      const basePrice = Number(item.price) || 0;
      const discPrice = item.discounted_price ? Number(item.discounted_price) : null;
      const adjustment = Number(item.price_adjustment || 0);
      const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
      const price = (hasDiscount ? discPrice : basePrice) + adjustment;
      const itemTotal = price * item.quantity;
      const discountFactor = subtotal > 0 ? afterDiscount / subtotal : 1;
      const adjustedTotal = itemTotal * discountFactor;
      const commissionAmount = sellerInfo.rateType === 'fixed'
        ? sellerInfo.commission
        : (sellerInfo.commission / 100) * adjustedTotal;
      await repo.createOrderItem({
        orderId, productId: item.product_id, variantId: item.variant_id || undefined,
        sellerId: product.seller_id, quantity: item.quantity, unitPrice: price,
        totalPrice: itemTotal, commissionRate: sellerInfo.commission, commissionAmount,
      });
    }

    await repo.createOrderStatusHistory({
      orderId, toStatus: 'pending', changedBy: userId, changedByRole: 'buyer',
      note: 'Order placed',
    });

    // Record coupon usage
    if (couponId) {
      await repo.recordCouponUsage(couponId, userId, orderId);
    }

    // ── Decrement stock atomically (prevents overselling) ──
    try {
      for (const item of cartItems) {
        await repo.decrementStock(item.product_id, item.variant_id || undefined, item.quantity);
        const product = productMap.get(item.product_id);
        if (product) {
          await repo.insertLedgerEntry({
            orderId, organisationId: product.seller_id,
            entryType: 'inventory_deduction', amount: item.quantity,
            currencyCode, description: `Stock: -${item.quantity} x ${product.name} (#${product.id})`,
            metadata: { productId: item.product_id, variantId: item.variant_id, quantity: item.quantity },
          });
        }
      }
    } catch (stockErr: any) {
      // Atomic decrement failed — restore any stock that was decremented, cancel order
      await this._restoreOrderStock(orderId, stockErr.message || 'Insufficient stock');
      await repo.updateOrderStatus(orderId, 'cancelled', 'Insufficient stock');
      await repo.createOrderStatusHistory({
        orderId, toStatus: 'cancelled', changedBy: userId, changedByRole: 'system',
        note: 'Insufficient stock — cancelled by overselling guard',
      });
      eventBus.emit('marketplace:order-cancelled', {
        orderId, userId, reason: 'Insufficient stock',
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

    // Process payment (cart cleared inside on success)
    const firstSellerId = cartItems[0]?.seller_id;
    eventBus.emit('marketplace:order-placed', {
      orderId,
      userId,
      sellerId: firstSellerId || 0,
      total,
      organisationId: firstSellerId || undefined,
    });
    return this._processOrderPayment(userId, orderId, total, currencyCode, data.paymentMethod, data.returnUrl, customerData);
  },

  async _processOrderPayment(userId: number, orderId: number, total: number, currency: string, paymentMethod: string, returnUrl?: string, customerData?: { customerEmail?: string; customerPhone?: string; customerName?: string; customerAddress?: Record<string, any> }) {
    if (paymentMethod === 'wallet') {
      try {
        const result = await paymentService.charge(userId, {
          referenceType: 'order',
          referenceId: orderId,
          amount: total,
          currency,
          paymentMethod: 'wallet',
        });
        if (result.success) {
          await this._fulfillAndConfirmOrder(orderId, userId, 'Payment via wallet');
          const orderRows = await repo.findOrderById(orderId);
          if (orderRows?.length) {
            const order = this._formatOrder(orderRows);
            return order;
          }
          return this.getOrderForUser(orderId, userId);
        }
      } catch {
        await this._restoreOrderStock(orderId, 'Wallet payment failed — stock restored');
      }
    } else if (paymentMethod === 'cash') {
      await this._fulfillAndConfirmOrder(orderId, userId, 'Payment on delivery (cash)');
      return this.getOrderForUser(orderId, userId);
    } else {
      // ── Card / Online payment via gateway ──
      // Clear cart immediately after order creation — order is now the source of truth.
      // If gateway fails, restore cart AND stock.
      const cartSnapshot = await repo.getCartItems(userId);
      await repo.clearCart(userId);

      try {
        const result = await paymentService.charge(userId, {
          referenceType: 'order',
          referenceId: orderId,
          amount: total,
          currency,
          paymentMethod: paymentMethod as any,
          returnUrl,
          ...customerData,
        });

        if (!result.success) {
          await repo.restoreCart(userId, cartSnapshot);
          await this._restoreOrderStock(orderId, 'Gateway charge failed — stock restored');
          const errMsg = (result as any).errorMessage || 'Payment gateway rejected the transaction';
          const rawResp = (result as any).rawResponse ? JSON.stringify((result as any).rawResponse).substring(0, 300) : '';
          log.error({ orderId, errorMessage: errMsg, rawResponse: rawResp }, 'Gateway charge failed');
          throw new ConflictError(errMsg);
        }

        const paymentUrl = 'paymentUrl' in result ? result.paymentUrl : undefined;
        const clientSecret = 'clientSecret' in result ? result.clientSecret : undefined;
        if (!paymentUrl && !clientSecret) {
          await repo.restoreCart(userId, cartSnapshot);
          await this._restoreOrderStock(orderId, 'Gateway returned no payment URL — stock restored');
          throw new ConflictError('Payment gateway did not return a checkout URL or client secret');
        }

        const paymentId = 'paymentId' in result ? result.paymentId : undefined;
        const order = await this.getOrder(orderId);
        return { ...order, paymentUrl, clientSecret, paymentId };
      } catch (err) {
        await repo.restoreCart(userId, cartSnapshot);
        await this._restoreOrderStock(orderId, 'Gateway charge exception — stock restored');
        throw err;
      }
    }

    const orderRows = await repo.findOrderById(orderId);
    if (orderRows?.length) {
      return this._formatOrder(orderRows);
    }
    return this.getOrderForUser(orderId, userId);
  },

  async getOrders(userId: number, page: number, limit: number, status?: string) {
    const result = await repo.findOrdersByBuyer(userId, page, limit, status);
    return this._groupOrdersByItem(result);
  },

  async getOrderCounts(userId: number) {
    return repo.getOrderCountsByBuyer(userId);
  },

  _groupOrdersByItem(result: { data: any[]; total: number; page: number; limit: number }) {
    const orders = new Map<number, any>();
    for (const row of result.data as any[]) {
      if (!orders.has(row.id)) {
        orders.set(row.id, {
          id: row.id,
          public_id: row.public_id,
          status: row.status,
          payment_status: row.payment_status,
          subtotal: row.subtotal,
          shipping_cost: row.shipping_cost,
          discount_amount: row.discount_amount,
          total: row.total,
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
      const order = orders.get(row.id);
      if (row.product_id) {
        order.items.push({
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
    return { ...result, data: Array.from(orders.values()) };
  },

  async getOrderForUser(orderId: number, userId: number) {
    let rows = await repo.findOrderById(orderId, userId);
    let viewedAsSeller = false;
    if (!rows.length) {
      // Try without buyer filter (order was just created, race condition)
      rows = await repo.findOrderById(orderId);
    }
    if (!rows.length) {
      let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
      if (!org) org = await repo.findOrgByUserScope(userId);
      if (org) { rows = await repo.findOrderById(orderId, undefined, org.id); viewedAsSeller = true; }
    }
    if (!rows.length) throw new NotFoundError('Order');
    const order = this._formatOrder(rows);
    order.viewedAsSeller = viewedAsSeller;
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

    // Restore cart from order items
    const orderRows = await repo.findOrderById(orderId);
    if (orderRows?.length) {
      await repo.restoreCartFromOrder(userId, orderRows);
    }
  },

  async updateOrderStatus(orderId: number, userId: number, data: any) {
    const order = await this.getOrder(orderId);
    const userRole = await this._getUserRoleInOrder(userId, order);

    this._validateStatusTransition(order.status, data.status, userRole);

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
    } else if (data.status === 'cancelled' || data.status === 'refunded') {
      await this._recordReversalFinancials(orderId, data.status, data.note);
      // Restore stock for cancelled/refunded orders
      const orderRows = await repo.findOrderById(orderId);
      if (orderRows?.length) {
        for (const row of orderRows as any[]) {
          if (!row.product_id) continue;
          await repo.restoreStock(row.product_id, row.variant_id, row.quantity);
          await repo.insertLedgerEntry({
            orderId, organisationId: row.item_seller_id || 0,
            entryType: 'reversal', amount: row.quantity,
            currencyCode: order.currency_code,
            description: `Reversal: +${row.quantity} stock restored for ${row.product_name || 'item #' + row.product_id}`,
            metadata: { reason: data.status, productId: row.product_id },
          });
        }
      }
    }

    // If cancelled and payment was made, process refund
    if (data.status === 'cancelled' && order.payment_status === 'paid') {
      try {
        const paymentTxn = await paymentRepository.findByOrderId(orderId);
        if (paymentTxn && paymentTxn.id) {
          await paymentService.refund(paymentTxn.id, order.total, 'Order cancelled');
        }
      } catch {
        // Refund failure is non-fatal
      }
    }

    const firstItem = order.items?.[0];
    const sellerId = firstItem?.sellerId ?? 0;

    eventBus.emit('marketplace:order-status-changed', {
      orderId, userId,
      fromStatus: order.status,
      toStatus: data.status,
    });

    if (data.status === 'shipped') {
      eventBus.emit('marketplace:order-shipped', {
        orderId, userId,
        trackingNumber: data.trackingNumber,
      });
    } else if (data.status === 'delivered') {
      eventBus.emit('marketplace:order-delivered', { orderId, userId });
    } else if (data.status === 'cancelled') {
      eventBus.emit('marketplace:order-cancelled', {
        orderId, userId, reason: data.note,
      });
    } else if (data.status === 'refunded') {
      eventBus.emit('marketplace:order-refunded', {
        orderId, userId, reason: data.note,
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

    await this._fulfillAndConfirmOrder(data.referenceId, order.buyer_id, 'Payment confirmed');
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
    const currencyCode = (orderRows[0] as any).currency_code || 'EGP';
    for (const row of orderRows as any[]) {
      if (!row.product_id) continue;
      await repo.restoreStock(row.product_id, row.variant_id, row.quantity);
      await repo.insertLedgerEntry({
        orderId, organisationId: row.item_seller_id || 0,
        entryType: 'reversal', amount: row.quantity,
        currencyCode,
        description: reason ? `${reason} — ${row.product_name || 'item #' + row.product_id}` : `Stock restored for ${row.product_name || 'item #' + row.product_id}`,
        metadata: { reason, productId: row.product_id },
      });
    }
  },

  async handlePaymentFailed(data: { paymentId: number; referenceType: string; referenceId: number; amount: number; reason?: string; metadata?: Record<string, any> }) {
    if (data.referenceType !== 'order' || !data.referenceId) return;

    log.error({ orderId: data.referenceId, reason: data.reason }, 'handlePaymentFailed: order payment failed');
    await this._restoreOrderStock(data.referenceId, data.reason || 'Payment failed');
    // Update order status
    await repo.updateOrderStatus(data.referenceId, 'cancelled', data.reason || 'Payment failed');
    // Notify
    const orderRows = await repo.findOrderById(data.referenceId);
    const userId = data.metadata?.userId || (orderRows?.length ? orderRows[0].buyer_id : 0) || 0;
    eventBus.emit('marketplace:order-cancelled', {
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
    // Read the order first to determine payment method
    const orderRows = await repo.findOrderById(orderId);
    const paymentMethod = orderRows?.length ? (orderRows[0] as any).payment_method : 'unknown';
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
    const sellerId = orderRows?.[0]?.seller_id || 0;
    eventBus.emit('marketplace:order-confirmed', {
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
  // Updates cash collection status and creates double-entry revenue recognition.
  // New model: courtzon_fee = fee on (products + shipping), shipping belongs to org.
  async _recordDeliveryFinancials(orderId: number) {
    const rows = await repo.findOrderById(orderId);
    if (!rows?.length) return;
    const order = rows[0] as any;
    const isCOD = order.payment_method === 'cash';

    // Update cash collection status
    await repo.updateCashCollectionStatus(orderId, isCOD ? 'held_by_org' : 'held_by_courtzon');

    // Use order-level courtzon_fee (fee on products+shipping)
    const courtzonFee = Number(order.courtzon_fee || order.courtzon_commission || 0);
    const totalProduct = Number(order.subtotal || 0);
    const totalShipping = Number(order.shipping_cost || 0);
    const totalAmount = totalProduct + totalShipping;
    const netAmount = totalAmount - courtzonFee;

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

    // Credit: CourtZon fee
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

    // Credit: org revenue (net = total - fee, includes shipping)
    const firstSeller = sellerDetails.keys().next().value;
    const firstBranchId = firstSeller ? sellerDetails.get(firstSeller)?.branchId : null;
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

    // Ledger entries
    for (const [sellerId] of sellerDetails) {
    if (courtzonFee > 0) {
        await repo.insertLedgerEntry({
          orderId, organisationId: sellerId,
          entryType: 'due_to_courtzon',
          paymentMethod: isCOD ? 'cod' : 'online',
          amount: courtzonFee,
          currencyCode: order.currency_code || 'EGP',
          description: `CourtZon fee for order #${orderId} (seller ${sellerId})`,
          metadata: { commissionRate: rows.find((r: any) => r.item_seller_id === sellerId)?.commission_rate },
        });
      }
    }
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

  async _getUserRoleInOrder(userId: number, order: any): Promise<'buyer' | 'seller' | 'admin'> {
    if (order.buyer_id === userId) return 'buyer';
    const orgs = await repo.findOrgByOwnerId(userId);
    if (orgs?.length) {
      const orgIds = new Set(orgs.map((o: any) => o.id));
      if (order.items?.some((i: any) => orgIds.has(i.sellerId))) {
        return 'seller';
      }
    }
    return 'admin';
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
    let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) org = await repo.findOrgByUserScope(userId);
    if (!org) throw new ForbiddenError('Not a seller');
    const result = await repo.findOrdersBySeller(org.id, filters);
    return this._groupOrdersByItem(result);
  },

  async getSellerStats(userId: number) {
    let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) org = await repo.findOrgByUserScope(userId);
    if (!org) throw new ForbiddenError('Not a seller');
    return repo.getSellerStats(org.id);
  },

  // ── Seller products (manage) ──
  async getSellerProducts(userId: number, page: number, limit: number, filters?: { sportId?: number; status?: string; branchId?: number }) {
    let org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) {
      // Fallback: find org via scoped roles (org-admin, shop-admin, etc.)
      org = await repo.findOrgByUserScope(userId);
    }
    if (!org) throw new ForbiddenError('Not a seller');
    return repo.findProducts({ sellerId: org.id, page, limit, sort: 'newest', status: filters?.status, sportId: filters?.sportId, branchId: filters?.branchId });
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

    eventBus.emit('marketplace:new-seller-registered', {
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
    const org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) throw new ForbiddenError('No seller account found');
    return (await import('../../settlement/application/settlement.service.js')).settlementService.getOrganisationSettlements(org.id, page, limit);
  },

  async getSettlementBalanceByUser(userId: number) {
    const org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) throw new ForbiddenError('No seller account found');
    const balance = await repo.getSettlementBalanceBySeller(org.id);
    return {
      available_balance: balance.available_balance,
      pending_fee: balance.pending_fee,
      pending_settlements: 0,
      unsettled_orders: balance.order_count,
    };
  },

  async requestSettlement(userId: number) {
    const org = await repo.findOrgByUserId(userId, 'seller') || await repo.findOrgByUserId(userId, 'player');
    if (!org) throw new ForbiddenError('No seller account found');
    return (await import('../../settlement/application/settlement.service.js')).settlementService.requestSettlement({
      organisationId: org.id,
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
    return { active, activeProductCount };
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

  async updateSellerOrg(userId: number, data: { name?: string; description?: string; email?: string; phone?: string; website?: string; crNumber?: string; taxId?: string; isVatRegistered?: boolean; financialDetails?: any }) {
    let org = await repo.findOrgByUserId(userId, 'player');
    if (!org) org = await repo.findOrgByUserId(userId, 'seller');
    if (!org) throw new NotFoundError('Seller account');
    const { financialDetails, ...orgData } = data;
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
    await repo.adminUpdateProduct(productId, { status });
    return repo.findProductById(productId);
  },

  async adminUpdateProduct(productId: number, data: any) {
    await repo.adminUpdateProduct(productId, data);
    return repo.findProductById(productId);
  },

  async adminDeleteProduct(productId: number) {
    const product = await repo.findProductById(productId);
    if (!product) throw new NotFoundError('Product');
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeProductSoftDelete(productId, conn);
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
    // Batch: 2 queries instead of N×2
    const [statsMap, subsMap] = await Promise.all([
      repo.adminGetSellerStatsBatch(orgIds),
      repo.findActiveSubscriptionsBatch(orgIds),
    ]);
    const enriched = (result.data || []).map((org: any) => ({
      ...org,
      stats: statsMap[org.id] || { total_products: 0, active_products: 0, total_orders: 0, total_revenue: 0 },
      subscription: subsMap[org.id] || null,
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
    const cutoff = new Date(Date.now() - timeoutMinutes * 60_000).toISOString().slice(0, 19).replace('T', ' ');
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
        eventBus.emit('marketplace:order-cancelled', {
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
