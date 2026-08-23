import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission, requireApprovedOrg } from '../../../shared/middleware/auth.middleware.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as ctrl from './marketplace.controller.js';

export async function marketplaceRoutes(app: FastifyInstance, opts: { requireFeatureFlag: (key: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void> }): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', opts.requireFeatureFlag('app.marketplace_enabled'));

  // ── Browse routes (self-service, permission-gated for audit consistency) ──
  const browseMod = { preHandler: [requirePermission(['marketplace.view'])] };
  app.get('/marketplace/categories', browseMod, ctrl.getCategoriesHandler);
  app.get('/marketplace/categories/:id', browseMod, ctrl.getCategoryHandler);
  app.get('/marketplace/products', browseMod, ctrl.listProductsHandler);
  app.get('/marketplace/products/:id', browseMod, ctrl.getProductHandler);
  app.get('/marketplace/brands', browseMod, ctrl.listBrandsHandler);
  app.get('/marketplace/tags', browseMod, ctrl.listTagsHandler);
  app.get('/marketplace/shops/:sellerId', browseMod, ctrl.getPublicSellerProfileHandler);
  app.get('/marketplace/products/:id/reviews', browseMod, ctrl.getProductReviewsHandler);
  app.post('/marketplace/products/:id/reviews', browseMod, ctrl.createReviewHandler);

  // Selling routes
  const sellMod = { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] };
  app.post('/marketplace/products', sellMod, ctrl.createProductHandler);
  app.put('/marketplace/products/:id', sellMod, ctrl.updateProductHandler);
app.put('/marketplace/products/:id/visibility', sellMod, ctrl.setProductVisibilityHandler);
  app.delete('/marketplace/products/:id', sellMod, ctrl.deleteProductHandler);
  app.post('/marketplace/products/:id/variants', sellMod, ctrl.createVariantHandler);
  app.put('/marketplace/variants/:variantId', sellMod, ctrl.updateVariantHandler);
  app.delete('/marketplace/variants/:variantId', sellMod, ctrl.deleteVariantHandler);

  // Shipping rates (seller)
  app.get('/marketplace/seller/shipping-rates', sellMod, ctrl.getSellerShippingRatesHandler);
  app.post('/marketplace/seller/shipping-rates', sellMod, ctrl.createSellerShippingRateHandler);
  app.put('/marketplace/seller/shipping-rates/:id', sellMod, ctrl.updateSellerShippingRateHandler);
  app.delete('/marketplace/seller/shipping-rates/:id', sellMod, ctrl.deleteSellerShippingRateHandler);

  // Geo & coupon validation (browse)
  app.get('/marketplace/provinces', browseMod, ctrl.getProvincesHandler);
  app.get('/marketplace/provinces/:id/cities', browseMod, ctrl.getCitiesHandler);
  app.post('/marketplace/coupons/validate', browseMod, ctrl.validateCouponHandler);

  // Cart (self-service)
  const cartMod = { preHandler: [requirePermission(['marketplace.cart.view'])] };
  app.get('/marketplace/cart', cartMod, ctrl.getCartHandler);
  app.get('/marketplace/cart/seller-info', cartMod, ctrl.getCartSellerInfoHandler);
  app.post('/marketplace/cart', cartMod, ctrl.addToCartHandler);
  app.put('/marketplace/cart/:itemId', cartMod, ctrl.updateCartItemHandler);
  app.delete('/marketplace/cart/:productId', cartMod, ctrl.removeCartItemHandler);
  app.post('/marketplace/cart/check-shipping', cartMod, ctrl.checkShippingHandler);

  // Wishlist (self-service)
  const wishlistMod = { preHandler: [requirePermission(['marketplace.wishlist.view'])] };
  app.get('/marketplace/wishlist', wishlistMod, ctrl.getWishlistHandler);
  app.post('/marketplace/wishlist/:productId', wishlistMod, ctrl.addWishlistHandler);
  app.delete('/marketplace/wishlist/:productId', wishlistMod, ctrl.removeWishlistHandler);

  // Addresses (self-service)
  const addressMod = { preHandler: [requirePermission(['marketplace.addresses.manage'])] };
  app.get('/marketplace/addresses', addressMod, ctrl.getAddressesHandler);
  app.post('/marketplace/addresses', addressMod, ctrl.createAddressHandler);
  app.put('/marketplace/addresses/:id', addressMod, ctrl.updateAddressHandler);
  app.delete('/marketplace/addresses/:id', addressMod, ctrl.deleteAddressHandler);

  // Orders (self-service)
  const orderMod = { preHandler: [requirePermission(['marketplace.order.view'])] };
  app.post('/marketplace/orders', orderMod, ctrl.checkoutHandler);
  app.get('/marketplace/orders', orderMod, ctrl.getOrdersHandler);
  app.get('/marketplace/orders/counts', orderMod, ctrl.getOrderCountsHandler);
  app.get('/marketplace/orders/:id', orderMod, ctrl.getOrderHandler);
  app.put('/marketplace/orders/:id/status', orderMod, ctrl.updateOrderStatusHandler);
  app.post('/marketplace/orders/:id/cancel', orderMod, ctrl.cancelOrderHandler);

  // Seller Orders
  app.get('/marketplace/seller/orders', { preHandler: [requirePermission(['marketplace.seller.manage-orders']), requireApprovedOrg()] }, ctrl.getSellerOrdersHandler);
  app.get('/marketplace/seller/stats', { preHandler: [requirePermission(['marketplace.seller.stats']), requireApprovedOrg()] }, ctrl.getSellerStatsHandler);

  // Player sell activation
  app.post('/marketplace/player/activate', { preHandler: [requirePermission(['marketplace.player.activate'])] }, ctrl.activatePlayerSellHandler);
  app.get('/marketplace/player/status', { preHandler: [requirePermission(['marketplace.player.status'])] }, ctrl.getPlayerStatusHandler);

  // Player products CRUD (max 5 items, no payment, direct contact)
  app.get('/marketplace/player/products', { preHandler: [requirePermission(['marketplace.player-products.manage'])] }, ctrl.listPlayerProductsHandler);
  app.post('/marketplace/player/products', { preHandler: [requirePermission(['marketplace.player-products.manage'])] }, ctrl.createPlayerProductHandler);
  app.put('/marketplace/player/products/:productId', { preHandler: [requirePermission(['marketplace.player-products.manage'])] }, ctrl.updatePlayerProductHandler);
  app.patch('/marketplace/player/products/:productId/sold', { preHandler: [requirePermission(['marketplace.player-products.manage'])] }, ctrl.markPlayerProductSoldHandler);

  // Seller upgrade
  app.get('/marketplace/seller/plans', { preHandler: [requirePermission(['marketplace.sell'])] }, ctrl.getSellerPlansHandler);
  app.post('/marketplace/seller/upgrade', { preHandler: [requirePermission(['marketplace.sell'])] }, ctrl.upgradeToSellerHandler);
  app.post('/marketplace/admin/approve-upgrade/:orgId', { preHandler: [requirePermission(['marketplace.moderate'])] }, ctrl.approveSellerUpgradeHandler);

  // Seller products & shop settings
  app.get('/marketplace/seller/products', { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] }, ctrl.getSellerProductsHandler);
  app.put('/marketplace/seller/shop', { preHandler: [requirePermission(['marketplace.sell']), requireApprovedOrg()] }, ctrl.updateSellerShopHandler);

  // Settlements
  app.get('/marketplace/seller/settlements', { preHandler: [requirePermission(['marketplace.seller.settlements']), requireApprovedOrg()] }, ctrl.getSettlementsHandler);
  app.get('/marketplace/seller/settlements/balance', { preHandler: [requirePermission(['marketplace.seller.settlements']), requireApprovedOrg()] }, ctrl.getSettlementBalanceHandler);
  app.post('/marketplace/seller/settlements', { preHandler: [requirePermission(['marketplace.seller.request-settlement']), requireApprovedOrg()] }, ctrl.requestSettlementHandler);

  // ── Admin: Marketplace Management ──
  const adminMod = { preHandler: [requirePermission(['marketplace.moderate'])] };

  app.get('/marketplace/admin/products', adminMod, ctrl.adminListProductsHandler);
  app.put('/marketplace/admin/products/:id/status', adminMod, ctrl.adminUpdateProductStatusHandler);
  app.put('/marketplace/admin/products/:id', adminMod, ctrl.adminUpdateProductHandler);
  app.delete('/marketplace/admin/products/:id', adminMod, ctrl.adminDeleteProductHandler);
  app.get('/marketplace/admin/orders', adminMod, ctrl.adminListOrdersHandler);
  app.get('/marketplace/admin/orders/:id', adminMod, ctrl.adminGetOrderHandler);
  app.get('/marketplace/admin/sellers', adminMod, ctrl.adminListSellersHandler);
  app.get('/marketplace/admin/sellers/:id', adminMod, ctrl.adminGetSellerHandler);
  app.put('/marketplace/admin/sellers/:id/status', adminMod, ctrl.adminToggleSellerStatusHandler);
  app.get('/marketplace/admin/upgrade-requests', adminMod, ctrl.adminListUpgradeRequestsHandler);
  app.post('/marketplace/admin/upgrade-requests/:orgId/reject', adminMod, ctrl.adminRejectUpgradeHandler);
  app.get('/marketplace/admin/reviews', adminMod, ctrl.adminListReviewsHandler);
  app.delete('/marketplace/admin/reviews/:id', adminMod, ctrl.adminDeleteReviewHandler);
}
