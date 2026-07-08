import type { FastifyRequest, FastifyReply } from 'fastify';
import { marketplaceService as svc } from '../application/marketplace.service.js';
import { marketplaceRepository as repo } from '../infrastructure/repositories/marketplace.repository.js';
import { recordAudit } from '../../audit-log/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import {
  CreateProductSchema, UpdateProductSchema, ProductQuerySchema,
  AddToCartSchema, UpdateCartItemSchema, CreateOrderSchema, UpdateOrderStatusSchema,
  CreateReviewSchema, CategoryQuerySchema,
  CreateVariantSchema, UpdateVariantSchema, ApplyCouponSchema,
  CreateAddressSchema, UpdateAddressSchema, SellerOrderQuerySchema,
  CreatePlayerProductSchema, UpdatePlayerProductSchema,
  CreateShippingRateSchema, UpdateShippingRateSchema, CheckShippingSchema,
} from './marketplace.dto.js';

// ── Categories ──
export async function getCategoriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = CategoryQuerySchema.parse(request.query);
  const categories = await svc.getCategories(query.parentId);
  return reply.send({ data: categories });
}

export async function getCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const category = await svc.getCategory(Number(id));
  return reply.send(category);
}

// ── Products ──
export async function listProductsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ProductQuerySchema.parse(request.query);
  if (query.tagIds) {
    (query as any).tagIds = query.tagIds.split(',').map(Number).filter(Boolean);
  }
  if (query.sportIds) {
    (query as any).sportIds = query.sportIds.split(',').map(Number).filter(Boolean);
  }
  if (query.brandIds) {
    (query as any).brandIds = query.brandIds.split(',').map(Number).filter(Boolean);
  }
  const result = await svc.listProducts(query);
  return reply.send(result);
}

export async function getProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const product = await svc.getProduct(Number(id));
  return reply.send(product);
}

export async function createProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateProductSchema.parse(request.body);
  const userId = (request as any).userId;
  const product = await svc.createProduct(userId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT.CREATE',
    entityType: 'product',
    entityId: (product as any)?.id,
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(product);
}

export async function updateProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateProductSchema.parse(request.body);
  const userId = (request as any).userId;
  const product = await svc.updateProduct(userId, Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT.UPDATE',
    entityType: 'product',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(product);
}

export async function deleteProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  await svc.deleteProduct(userId, Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT.DELETE',
    entityType: 'product',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Variants ──
export async function createVariantHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CreateVariantSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await svc.createVariant(userId, Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'VARIANT.CREATE',
    entityType: 'variant',
    entityId: (result as any)?.id,
    afterState: { productId: Number(id) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function updateVariantHandler(request: FastifyRequest, reply: FastifyReply) {
  const { variantId } = request.params as any;
  const body = UpdateVariantSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await svc.updateVariant(userId, Number(variantId), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'VARIANT.UPDATE',
    entityType: 'variant',
    entityId: Number(variantId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function deleteVariantHandler(request: FastifyRequest, reply: FastifyReply) {
  const { variantId } = request.params as any;
  const userId = (request as any).userId;
  await svc.deleteVariant(userId, Number(variantId));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'VARIANT.DELETE',
    entityType: 'variant',
    entityId: Number(variantId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Wishlist ──
export async function getWishlistHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const items = await svc.getWishlist(userId);
  return reply.send({ data: items });
}

export async function addWishlistHandler(request: FastifyRequest, reply: FastifyReply) {
  const { productId } = request.params as any;
  const userId = (request as any).userId;
  const result = await svc.addWishlist(userId, Number(productId));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'WISHLIST.ADD',
    entityType: 'wishlist',
    entityId: Number(productId),
    afterState: { productId: Number(productId) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function removeWishlistHandler(request: FastifyRequest, reply: FastifyReply) {
  const { productId } = request.params as any;
  const userId = (request as any).userId;
  await svc.removeWishlist(userId, Number(productId));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'WISHLIST.REMOVE',
    entityType: 'wishlist',
    entityId: Number(productId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Cart ──
export async function getCartHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const cart = await svc.getCart(userId);
  return reply.send(cart);
}

export async function addToCartHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = AddToCartSchema.parse(request.body);
  const userId = (request as any).userId;
  const cart = await svc.addToCart(userId, body.productId, body.quantity, body.variantId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'CART.ADD',
    entityType: 'cart',
    entityId: body.productId,
    afterState: { productId: body.productId, quantity: body.quantity },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(cart);
}

export async function updateCartItemHandler(request: FastifyRequest, reply: FastifyReply) {
  const { itemId } = request.params as any;
  const body = UpdateCartItemSchema.parse(request.body);
  const userId = (request as any).userId;
  const cart = await svc.updateCartItem(userId, Number(itemId), body.quantity);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'CART.UPDATE',
    entityType: 'cart',
    entityId: Number(itemId),
    afterState: { quantity: body.quantity },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(cart);
}

export async function removeCartItemHandler(request: FastifyRequest, reply: FastifyReply) {
  const { productId } = request.params as any;
  const userId = (request as any).userId;
  const cart = await svc.removeCartItem(userId, Number(productId));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'CART.REMOVE',
    entityType: 'cart',
    entityId: Number(productId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(cart);
}

// ── Coupons ──
export async function validateCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = ApplyCouponSchema.parse(request.body);
  const result = await svc.validateCoupon(body.code, body.subtotal);
  return reply.send(result);
}

// ── Addresses ──
export async function getAddressesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const addresses = await svc.getAddresses(userId);
  return reply.send({ data: addresses });
}

export async function createAddressHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateAddressSchema.parse(request.body);
  const userId = (request as any).userId;
  const address = await svc.createAddress(userId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ADDRESS.CREATE',
    entityType: 'address',
    entityId: (address as any)?.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(address);
}

export async function updateAddressHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateAddressSchema.parse(request.body);
  const userId = (request as any).userId;
  const address = await svc.updateAddress(userId, Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ADDRESS.UPDATE',
    entityType: 'address',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(address);
}

export async function deleteAddressHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  await svc.deleteAddress(userId, Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ADDRESS.DELETE',
    entityType: 'address',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Orders ──
export async function checkoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateOrderSchema.parse(request.body);
  const userId = (request as any).userId;
  const order = await svc.checkout(userId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORDER.CREATE',
    entityType: 'order',
    entityId: (order as any)?.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(order);
}

export async function updateOrderStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateOrderStatusSchema.parse(request.body);
  const userId = (request as any).userId;
  const order = await svc.updateOrderStatus(Number(id), userId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORDER.UPDATE_STATUS',
    entityType: 'order',
    entityId: Number(id),
    afterState: { status: body.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(order);
}

export async function cancelOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  await svc.cancelOrder(Number(id), userId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ORDER.CANCEL',
    entityType: 'order',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function getOrdersHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { page, limit, status } = request.query as any;
  const orders = await svc.getOrders(userId, Number(page) || 1, Number(limit) || 20, status);
  return reply.send(orders);
}

export async function getOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const order = await svc.getOrderForUser(Number(id), userId);
  return reply.send(order);
}

// ── Seller Orders ──
export async function getSellerOrdersHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const query = SellerOrderQuerySchema.parse(request.query);
  const result = await svc.getSellerOrders(userId, query);
  return reply.send(result);
}

export async function getSellerStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const stats = await svc.getSellerStats(userId);
  return reply.send(stats);
}

// ── Public Seller Profile (via organisations) ──
export async function getPublicSellerProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sellerId } = request.params as any;
  const org = await svc.getPublicSellerProfile(Number(sellerId));
  if (!org) return reply.status(404).send({ error: 'Seller not found' });
  return reply.send(org);
}

// ── Player Sell Activation ──
export async function activatePlayerSellHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const result = await svc.activatePlayerSell(userId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SELLER.ACTIVATE_PLAYER',
    entityType: 'seller',
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function getPlayerStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const status = await svc.getPlayerStatus(userId);
  return reply.send(status);
}

// ── Player Products ──

export async function listPlayerProductsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { status } = request.query as any;
  const products = await svc.listPlayerProducts(userId, status);
  return reply.send(products);
}

export async function createPlayerProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = CreatePlayerProductSchema.parse(request.body);
  const product = await svc.createPlayerProduct(userId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PLAYER_PRODUCT.CREATE',
    entityType: 'player_product',
    entityId: (product as any)?.id,
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(product);
}

export async function updatePlayerProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { productId } = request.params as any;
  const body = UpdatePlayerProductSchema.parse(request.body);
  const product = await svc.updatePlayerProduct(userId, Number(productId), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PLAYER_PRODUCT.UPDATE',
    entityType: 'player_product',
    entityId: Number(productId),
    afterState: { name: body.name, price: body.price },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(product);
}

export async function markPlayerProductSoldHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { productId } = request.params as any;
  await svc.markPlayerProductSold(userId, Number(productId));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PLAYER_PRODUCT.MARK_SOLD',
    entityType: 'player_product',
    entityId: Number(productId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

// ── Seller Upgrade ──
export async function upgradeToSellerHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as any;
  const result = await svc.upgradeToSeller(userId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SELLER.UPGRADE_REQUEST',
    entityType: 'seller',
    entityId: (result as any)?.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function getSellerPlansHandler(_request: FastifyRequest, reply: FastifyReply) {
  const plans = await svc.getSellerPlans();
  return reply.send({ data: plans });
}

export async function approveSellerUpgradeHandler(request: FastifyRequest, reply: FastifyReply) {
  const adminUserId = (request as any).userId;
  const { orgId } = request.params as any;
  const result = await svc.approveSellerUpgrade(adminUserId, Number(orgId));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SELLER.APPROVE_UPGRADE',
    entityType: 'seller',
    entityId: Number(orgId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

// ── Reviews ──
export async function getProductReviewsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { page, limit } = request.query as any;
  const reviews = await svc.getReviews(Number(id), Number(page) || 1, Number(limit) || 20);
  return reply.send(reviews);
}

export async function createReviewHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CreateReviewSchema.parse(request.body);
  const userId = (request as any).userId;
  const reviewId = await svc.createReview(userId, Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'REVIEW.CREATE',
    entityType: 'review',
    entityId: reviewId,
    afterState: { productId: Number(id), rating: body.rating },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id: reviewId });
}

// ── Seller products (manage) ──
export async function getSellerProductsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { page, limit, sportId, status, branchId } = request.query as any;
  const result = await svc.getSellerProducts(userId, Number(page) || 1, Number(limit) || 20, { sportId: sportId ? Number(sportId) : undefined, status, branchId: branchId ? Number(branchId) : undefined });
  return reply.send(result);
}

// ── Seller update shop settings ──
export async function updateSellerShopHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const data = request.body as any;
  const org = await svc.updateSellerOrg(userId, data);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SELLER.UPDATE_SHOP',
    entityType: 'seller',
    entityId: (org as any)?.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(org);
}

// ── Cart Seller Info ──
export async function getCartSellerInfoHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const sellers = await svc.getCartSellerInfo(userId);
  return reply.send({ data: sellers });
}

// ── Settlements ──
export async function getSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { page, limit } = request.query as any;
  const result = await svc.getSettlementsByUser(userId, Number(page) || 1, Number(limit) || 20);
  return reply.send(result);
}

export async function getSettlementBalanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const balance = await svc.getSettlementBalanceByUser(userId);
  return reply.send(balance);
}

export async function requestSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const result = await svc.requestSettlement(userId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SETTLEMENT.REQUEST',
    entityType: 'settlement',
    entityId: (result as any)?.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

// ── Admin: Products ──
export async function adminListProductsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const result = await svc.adminListProducts({
    search: query.search, categoryId: query.categoryId ? Number(query.categoryId) : undefined,
    sellerId: query.sellerId ? Number(query.sellerId) : undefined, status: query.status,
    page: Number(query.page) || 1, limit: Number(query.limit) || 20,
  });
  return reply.send(result);
}

export async function adminUpdateProductStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { status } = request.body as any;
  const product = await svc.adminUpdateProductStatus(Number(id), status);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT.ADMIN_UPDATE_STATUS',
    entityType: 'product',
    entityId: Number(id),
    afterState: { status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(product);
}

export async function adminUpdateProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const product = await svc.adminUpdateProduct(Number(id), body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT.ADMIN_UPDATE',
    entityType: 'product',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(product);
}

export async function adminDeleteProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.adminDeleteProduct(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT.ADMIN_DELETE',
    entityType: 'product',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Admin: Orders ──
export async function adminListOrdersHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const result = await svc.adminListOrders({
    status: query.status, search: query.search,
    sellerId: query.sellerId ? Number(query.sellerId) : undefined,
    page: Number(query.page) || 1, limit: Number(query.limit) || 20,
  });
  return reply.send(result);
}

export async function adminGetOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const order = await svc.adminGetOrderDetail(Number(id));
  return reply.send(order);
}

// ── Admin: Sellers ──
export async function adminListSellersHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const result = await svc.adminListSellers({
    search: query.search, orgType: query.orgType,
    page: Number(query.page) || 1, limit: Number(query.limit) || 20,
  });
  return reply.send(result);
}

export async function adminGetSellerHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const seller = await svc.adminGetSellerDetail(Number(id));
  return reply.send(seller);
}

export async function adminToggleSellerStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { isActive } = request.body as any;
  await svc.adminToggleSellerStatus(Number(id), isActive);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SELLER.TOGGLE_STATUS',
    entityType: 'seller',
    entityId: Number(id),
    afterState: { isActive },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Admin: Upgrade Requests ──
export async function adminListUpgradeRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const result = await svc.adminListUpgradeRequests({
    status: query.status,
    page: Number(query.page) || 1, limit: Number(query.limit) || 20,
  });
  return reply.send(result);
}

export async function adminRejectUpgradeHandler(request: FastifyRequest, reply: FastifyReply) {
  const adminUserId = (request as any).userId;
  const { orgId } = request.params as any;
  const { reason } = request.body as any;
  await svc.adminRejectUpgrade(adminUserId, Number(orgId), reason);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SELLER.REJECT_UPGRADE',
    entityType: 'seller',
    entityId: Number(orgId),
    reason,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Admin: Reviews ──
export async function adminListReviewsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const result = await svc.adminListReviews({
    productId: query.productId ? Number(query.productId) : undefined,
    page: Number(query.page) || 1, limit: Number(query.limit) || 20,
  });
  return reply.send(result);
}

export async function adminDeleteReviewHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.adminDeleteReview(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'REVIEW.DELETE',
    entityType: 'review',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Brands & Tags (public) ──
export async function listBrandsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const brands = await svc.getBrands();
  return reply.send(brands);
}

export async function listTagsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const tags = await svc.getTags();
  return reply.send(tags);
}

// ── Geo ──
export async function getProvincesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const provinces = await svc.getProvinces(userId);
  return reply.send({ data: provinces });
}

export async function getCitiesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const cities = await svc.getCities(Number(id));
  return reply.send({ data: cities });
}

// ── Shipping Rates ──
async function getSellerOrgId(userId: number): Promise<number> {
  const orgs = await repo.findOrgByOwnerId(userId);
  if (!orgs.length) throw new NotFoundError('Organisation');
  return orgs[0].id;
}

export async function getSellerShippingRatesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const q = request.query as any;
  if (q?.orgId) {
    const rates = await svc.getSellerShippingRates(Number(q.orgId));
    return reply.send({ data: rates });
  }
  const orgs = await repo.findOrgByOwnerId(userId);
  if (!orgs.length) throw new NotFoundError('Organisation');
  const rates = await svc.getSellerShippingRates(orgs[0].id);
  return reply.send({ data: rates });
}

export async function createSellerShippingRateHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = CreateShippingRateSchema.parse(request.body);
  const sellerId = body.orgId ?? (await getSellerOrgId(userId));
  const id = await svc.createSellerShippingRate(sellerId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SHIPPING_RATE.CREATE',
    entityType: 'shipping_rate',
    entityId: id,
    afterState: { sellerId, price: body.price },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

export async function updateSellerShippingRateHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  const body = UpdateShippingRateSchema.parse(request.body);
  const sellerId = body.orgId ?? (await getSellerOrgId(userId));
  await svc.updateSellerShippingRate(Number(id), sellerId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SHIPPING_RATE.UPDATE',
    entityType: 'shipping_rate',
    entityId: Number(id),
    afterState: { sellerId, price: body.price },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deleteSellerShippingRateHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  const body = request.body as any;
  const sellerId = body?.orgId ?? (await getSellerOrgId(userId));
  await svc.deleteSellerShippingRate(Number(id), sellerId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SHIPPING_RATE.DELETE',
    entityType: 'shipping_rate',
    entityId: Number(id),
    afterState: { sellerId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

// ── Check Shipping ──
export async function checkShippingHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = CheckShippingSchema.parse(request.body);
  const result = await svc.checkShipping(userId, body);
  return reply.send(result);
}
