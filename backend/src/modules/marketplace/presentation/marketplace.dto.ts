import { z } from 'zod';

export const CategoryQuerySchema = z.object({
  parentId: z
    .union([z.literal('null'), z.string()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'null' ? null : Number(v))),
});

export const CreateProductSchema = z.object({
  categoryId: z.number().int().positive(),
  branchId: z.number().int().positive().optional(),
  sportId: z.number().int().positive().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().positive(),
  discountedPrice: z.number().positive().optional(),
  currencyCode: z.string().length(3),
  quantity: z.number().int().min(0),
  isDigital: z.boolean().optional().default(false),
  digitalDownloadUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  images: z.array(z.string()).max(5).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  brandId: z.number().int().positive().optional(),
  gender: z.enum(['male', 'female', 'unisex']).optional().default('unisex'),
  condition: z.enum(['new','like_new','good','fair','used']).optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
  variants: z.array(z.object({
    sku: z.string().optional(),
    variantName: z.string().min(1),
    variantType: z.string().min(1),
    priceAdjustment: z.number().default(0),
    quantity: z.number().int().min(0).default(0),
    sortOrder: z.number().int().default(0),
    variantColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })).optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const ProductQuerySchema = z.object({
  categoryId: z.string().transform(Number).optional(),
  sellerId: z.string().transform(Number).optional(),
  branchId: z.string().transform(Number).optional(),
  sportId: z.string().transform(Number).optional(),
  sportIds: z.string().optional(),
  search: z.string().optional(),
  minPrice: z.string().transform(Number).optional(),
  maxPrice: z.string().transform(Number).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  page: z.string().transform(Number).optional().default(1),
  limit: z.string().transform(Number).optional().default(20),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'popular']).optional().default('newest'),
  stockStatus: z.enum(['in_stock', 'out_of_stock']).optional(),
  sellerType: z.enum(['all', 'seller', 'player']).optional().default('all'),
  brandId: z.string().transform(Number).optional(),
  brandIds: z.string().optional(),
  tagIds: z.string().optional(),
  gender: z.string().optional(),
});

export const AddToCartSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().optional(),
  quantity: z.number().int().positive().default(1),
});

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().min(0),
});

export const CreateOrderSchema = z.object({
  shippingAddress: z.record(z.string(), z.any()).optional(),
  addressId: z.number().int().positive().optional(),
  couponCode: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(['cash', 'card', 'online', 'wallet']).default('wallet'),
  returnUrl: z.string().url().optional(),
});

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['cancelled', 'confirmed', 'processing', 'shipped', 'delivered', 'refunded']),
  trackingNumber: z.string().optional(),
  shippingCarrier: z.string().optional(),
  note: z.string().optional(),
});

export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().optional(),
});

export const CreateVariantSchema = z.object({
  sku: z.string().optional(),
  variantName: z.string().min(1),
  variantType: z.string().min(1),
  priceAdjustment: z.number().default(0),
  quantity: z.number().int().min(0).default(0),
  sortOrder: z.number().int().default(0),
});

export const UpdateVariantSchema = CreateVariantSchema.partial();

export const ApplyCouponSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().positive(),
});

export const CreateAddressSchema = z.object({
  label: z.string().optional(),
  fullName: z.string().min(1),
  phone: z.string().min(1),
  streetAddress: z.string().min(1),
  city: z.string().min(1),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional().default('Egypt'),
  provinceId: z.number().int().positive().optional().nullable(),
  cityId: z.number().int().positive().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  addressType: z.enum(['shipping', 'billing', 'both']).optional().default('both'),
});

export const UpdateAddressSchema = CreateAddressSchema.partial();

export const SellerOrderQuerySchema = z.object({
  status: z.string().optional(),
  page: z.string().transform(Number).optional().default(1),
  limit: z.string().transform(Number).optional().default(20),
});

export const CreatePlayerProductSchema = z.object({
  categoryId: z.number().int().positive(),
  sportId: z.number().int().positive().optional(),
  brandId: z.number().int().positive().optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().positive(),
  conditionStatus: z.enum(['new','like_new','good','fair','used']).optional(),
  images: z.array(z.string()).max(5).optional(),
});

export const UpdatePlayerProductSchema = CreatePlayerProductSchema.partial();

export const CreateShippingRateSchema = z.object({
  orgId: z.number().int().positive().optional(),
  provinceId: z.number().int().positive().optional().nullable(),
  cityId: z.number().int().positive().optional().nullable(),
  price: z.number().positive(),
  estimatedDays: z.number().int().positive().optional().nullable(),
});

export const UpdateShippingRateSchema = CreateShippingRateSchema.partial();

export const CheckShippingSchema = z.object({
  addressId: z.number().int().positive().optional(),
  provinceId: z.number().int().positive().optional(),
  cityId: z.number().int().positive().optional(),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type AddToCartInput = z.infer<typeof AddToCartSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
