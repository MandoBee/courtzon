import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission, requireApprovedOrg } from '../../../shared/middleware/auth.middleware.js';
import { requireFeatureFlag } from '../../../shared/middleware/feature-flag.middleware.js';
import * as ctrl from './marketplace.controller.js';

export async function marketplaceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireFeatureFlag('app.marketplace_enabled'));

  // Categories — view any authenticated user, manage requires permission
  app.get('/marketplace/categories', ctrl.getCategoriesHandler);
  app.get('/marketplace/categories/:id', ctrl.getCategoryHandler);

  // Products — view any authenticated user, CUD requires seller permission
  app.get('/marketplace/products', ctrl.listProductsHandler);
  app.get('/marketplace/products/:id', ctrl.getProductHandler);
  app.post('/marketplace/products', { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] }, ctrl.createProductHandler);
  app.put('/marketplace/products/:id', { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] }, ctrl.updateProductHandler);
  app.delete('/marketplace/products/:id', { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] }, ctrl.deleteProductHandler);

  // Variants (seller, scoped to product)
  app.post('/marketplace/products/:id/variants', { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] }, ctrl.createVariantHandler);
  app.put('/marketplace/variants/:variantId', { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] }, ctrl.updateVariantHandler);
  app.delete('/marketplace/variants/:variantId', { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] }, ctrl.deleteVariantHandler);

  // Wishlist — any authenticated user
  app.get('/marketplace/wishlist', ctrl.getWishlistHandler);
  app.post('/marketplace/wishlist/:productId', ctrl.addWishlistHandler);
  app.delete('/marketplace/wishlist/:productId', ctrl.removeWishlistHandler);

  // Cart — any authenticated user
  app.get('/marketplace/cart', ctrl.getCartHandler);
  app.get('/marketplace/cart/seller-info', ctrl.getCartSellerInfoHandler);
  app.post('/marketplace/cart', ctrl.addToCartHandler);
  app.put('/marketplace/cart/:itemId', ctrl.updateCartItemHandler);
  app.delete('/marketplace/cart/:productId', ctrl.removeCartItemHandler);

  // Geo
  app.get('/marketplace/provinces', ctrl.getProvincesHandler);
  app.get('/marketplace/provinces/:id/cities', ctrl.getCitiesHandler);

  // Shipping rates (seller)
  app.get('/marketplace/seller/shipping-rates', ctrl.getSellerShippingRatesHandler);
  app.post('/marketplace/seller/shipping-rates', ctrl.createSellerShippingRateHandler);
  app.put('/marketplace/seller/shipping-rates/:id', ctrl.updateSellerShippingRateHandler);
  app.delete('/marketplace/seller/shipping-rates/:id', ctrl.deleteSellerShippingRateHandler);

  // Check shipping
  app.post('/marketplace/cart/check-shipping', ctrl.checkShippingHandler);

  // Coupons
  app.post('/marketplace/coupons/validate', ctrl.validateCouponHandler);

  // Addresses — any authenticated user
  app.get('/marketplace/addresses', ctrl.getAddressesHandler);
  app.post('/marketplace/addresses', ctrl.createAddressHandler);
  app.put('/marketplace/addresses/:id', ctrl.updateAddressHandler);
  app.delete('/marketplace/addresses/:id', ctrl.deleteAddressHandler);

  // Orders — any authenticated user (own orders)
  app.post('/marketplace/orders', ctrl.checkoutHandler);
  app.get('/marketplace/orders', ctrl.getOrdersHandler);
  app.get('/marketplace/orders/:id', ctrl.getOrderHandler);
  app.put('/marketplace/orders/:id/status', ctrl.updateOrderStatusHandler);
  app.post('/marketplace/orders/:id/cancel', ctrl.cancelOrderHandler);

  // Seller Orders
  app.get('/marketplace/seller/orders', { preHandler: [requireApprovedOrg()] }, ctrl.getSellerOrdersHandler);
  app.get('/marketplace/seller/stats', { preHandler: [requireApprovedOrg()] }, ctrl.getSellerStatsHandler);

  // Player sell activation
  app.post('/marketplace/player/activate', ctrl.activatePlayerSellHandler);
  app.get('/marketplace/player/status', ctrl.getPlayerStatusHandler);

  // Player products CRUD (max 5 items, no payment, direct contact)
  app.get('/marketplace/player/products', ctrl.listPlayerProductsHandler);
  app.post('/marketplace/player/products', ctrl.createPlayerProductHandler);
  app.put('/marketplace/player/products/:productId', ctrl.updatePlayerProductHandler);
  app.patch('/marketplace/player/products/:productId/sold', ctrl.markPlayerProductSoldHandler);

  // Seller upgrade
  app.get('/marketplace/seller/plans', ctrl.getSellerPlansHandler);
  app.post('/marketplace/seller/upgrade', ctrl.upgradeToSellerHandler);
  app.post('/marketplace/admin/approve-upgrade/:orgId', { preHandler: [requirePermission(['marketplace.moderate'])] }, ctrl.approveSellerUpgradeHandler);

  // Seller products & shop settings
  app.get('/marketplace/seller/products', { preHandler: [requireApprovedOrg()] }, ctrl.getSellerProductsHandler);
  app.put('/marketplace/seller/shop', { preHandler: [requireApprovedOrg()] }, ctrl.updateSellerShopHandler);

  // Settlements
  app.get('/marketplace/seller/settlements', { preHandler: [requirePermission(['marketplace.seller.settlements']), requireApprovedOrg()] }, ctrl.getSettlementsHandler);
  app.get('/marketplace/seller/settlements/balance', { preHandler: [requirePermission(['marketplace.seller.settlements']), requireApprovedOrg()] }, ctrl.getSettlementBalanceHandler);
  app.post('/marketplace/seller/settlements', { preHandler: [requirePermission(['marketplace.seller.request-settlement']), requireApprovedOrg()] }, ctrl.requestSettlementHandler);

  // Public seller shop
  app.get('/marketplace/shops/:sellerId', ctrl.getPublicSellerProfileHandler);

  // Reviews
  app.get('/marketplace/products/:id/reviews', ctrl.getProductReviewsHandler);
  app.post('/marketplace/products/:id/reviews', ctrl.createReviewHandler);

  // ── Admin: Marketplace Management ──
  const adminMod = { preHandler: [requirePermission(['marketplace.moderate'])] };

  // Products
  app.get('/marketplace/admin/products', adminMod, ctrl.adminListProductsHandler);
  app.put('/marketplace/admin/products/:id/status', adminMod, ctrl.adminUpdateProductStatusHandler);
  app.put('/marketplace/admin/products/:id', adminMod, ctrl.adminUpdateProductHandler);
  app.delete('/marketplace/admin/products/:id', adminMod, ctrl.adminDeleteProductHandler);

  // Orders
  app.get('/marketplace/admin/orders', adminMod, ctrl.adminListOrdersHandler);
  app.get('/marketplace/admin/orders/:id', adminMod, ctrl.adminGetOrderHandler);

  // Sellers
  app.get('/marketplace/admin/sellers', adminMod, ctrl.adminListSellersHandler);
  app.get('/marketplace/admin/sellers/:id', adminMod, ctrl.adminGetSellerHandler);
  app.put('/marketplace/admin/sellers/:id/status', adminMod, ctrl.adminToggleSellerStatusHandler);

  // Upgrade Requests
  app.get('/marketplace/admin/upgrade-requests', adminMod, ctrl.adminListUpgradeRequestsHandler);
  app.post('/marketplace/admin/upgrade-requests/:orgId/reject', adminMod, ctrl.adminRejectUpgradeHandler);

  // Reviews
  app.get('/marketplace/admin/reviews', adminMod, ctrl.adminListReviewsHandler);
  app.delete('/marketplace/admin/reviews/:id', adminMod, ctrl.adminDeleteReviewHandler);

  // Brands & Tags (public)
  app.get('/marketplace/brands', ctrl.listBrandsHandler);
  app.get('/marketplace/tags', ctrl.listTagsHandler);
}
