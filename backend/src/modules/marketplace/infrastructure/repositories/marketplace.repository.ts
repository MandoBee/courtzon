import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const marketplaceRepository = {
  // ── Categories ──
  async findCategories(parentId?: number | null) {
    const pool = getPool();
    const params: any[] = [];
    let sql = 'SELECT pc.* FROM product_categories pc WHERE pc.is_active = TRUE';
    if (parentId !== undefined) {
      sql += parentId === null ? ' AND pc.parent_id IS NULL' : ' AND pc.parent_id = ?';
      if (parentId !== null) params.push(parentId);
    }
    sql += ' ORDER BY pc.sort_order ASC';
    const [rows] = await pool.execute<RowData>(sql, params);
    return rows;
  },

  async findCategoryById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM product_categories WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findDescendantCategoryIds(parentId: number): Promise<number[]> {
    const pool = getPool();
    const ids: number[] = [];
    const stack = [parentId];
    while (stack.length) {
      const current = stack.pop()!;
      const [rows] = await pool.execute<RowData>(
        'SELECT id FROM product_categories WHERE parent_id = ? AND is_active = TRUE',
        [current]
      );
      for (const row of rows as any[]) {
        ids.push(row.id);
        stack.push(row.id);
      }
    }
    return ids;
  },

  // ── Products ──
  async findProducts(filters: {
    categoryId?: number; categoryIds?: number[]; sellerId?: number; sportId?: number; sportIds?: number[]; search?: string;
    minPrice?: number; maxPrice?: number; status?: string; stockStatus?: string; sellerType?: string;
    brandId?: number; brandIds?: number[]; tagIds?: number[]; gender?: string; branchId?: number;
    page: number; limit: number; sort: string;
  }) {
    const pool = getPool();
    const conditions: string[] = ['p.is_active = TRUE', 'p.deleted_at IS NULL'];
    const params: any[] = [];

    if (filters.status) { conditions.push("p.status = ?"); params.push(filters.status); }
    else { conditions.push("p.status = 'active'"); }
    if (filters.categoryIds?.length) {
      conditions.push(`p.category_id IN (${filters.categoryIds.map(() => '?').join(', ')})`);
      params.push(...filters.categoryIds);
    } else if (filters.categoryId) { conditions.push('p.category_id = ?'); params.push(filters.categoryId); }
    if (filters.sellerId) { conditions.push('p.seller_id = ?'); params.push(filters.sellerId); }
    if (filters.sportIds?.length) {
      conditions.push(`p.sport_id IN (${filters.sportIds.map(() => '?').join(', ')})`);
      params.push(...filters.sportIds);
    } else if (filters.sportId) {
      conditions.push('p.sport_id = ?');
      params.push(filters.sportId);
    }
    if (filters.search) {
      conditions.push('MATCH(p.name, p.name_ar, p.description, p.description_ar) AGAINST(? IN BOOLEAN MODE)');
      params.push(`${filters.search}*`);
    }
    if (filters.minPrice !== undefined) { conditions.push('p.price >= ?'); params.push(filters.minPrice); }
    if (filters.maxPrice !== undefined) { conditions.push('p.price <= ?'); params.push(filters.maxPrice); }
    if (filters.stockStatus === 'in_stock') { conditions.push('p.quantity > 0'); }
    if (filters.stockStatus === 'out_of_stock') { conditions.push('p.quantity <= 0'); }
    if (filters.sellerType === 'seller') { conditions.push("p.seller_type = 'org' AND ot.slug = 'shop'"); }
    else if (filters.sellerType === 'player') { conditions.push("p.seller_type = 'player'"); }
    if (filters.brandIds?.length) {
      conditions.push(`p.brand_id IN (${filters.brandIds.map(() => '?').join(', ')})`);
      params.push(...filters.brandIds);
    } else if (filters.brandId) {
      conditions.push('p.brand_id = ?');
      params.push(filters.brandId);
    }

    if (filters.gender) {
      const genders = filters.gender.split(',').filter(Boolean);
      if (genders.length) {
        conditions.push('p.gender IN (' + genders.map(() => '?').join(',') + ')');
        params.push(...genders);
      }
    }
    if (filters.branchId) { conditions.push('p.branch_id = ?'); params.push(filters.branchId); }

    let joins = '';
    if (filters.tagIds && filters.tagIds.length > 0) {
      joins = ' JOIN product_tags pt ON pt.product_id = p.id';
      conditions.push('pt.tag_id IN (' + filters.tagIds.map(() => '?').join(',') + ')');
      params.push(...filters.tagIds);
    }

    let sql = `SELECT p.*, pc.name as category_name,
                      COALESCE(o.name, u_player.full_name) as shop_name,
                      COALESCE(ot.slug, 'player') as org_type_slug,
                      u_player.phone_number as seller_phone,
                      u_player.full_name as seller_full_name
               FROM products p
                LEFT JOIN product_categories pc ON p.category_id = pc.id
               LEFT JOIN organisations o ON p.seller_id = o.id AND p.seller_type = 'org'
               LEFT JOIN organisation_types ot ON o.org_type_id = ot.id
               LEFT JOIN users u_org ON o.owner_id = u_org.id
               LEFT JOIN users u_player ON p.seller_user_id = u_player.id AND p.seller_type = 'player'${joins}
               WHERE ${conditions.join(' AND ')}`;

     switch (filters.sort) {
      case 'price_asc': sql += ' ORDER BY p.price ASC'; break;
      case 'price_desc': sql += ' ORDER BY p.price DESC'; break;
      case 'popular': sql += ' ORDER BY p.id DESC'; break;
      default: sql += ' ORDER BY p.created_at DESC';
    }

    const offset = (filters.page - 1) * filters.limit;
    sql += ' LIMIT ? OFFSET ?';
    params.push(filters.limit, offset);

    const [rows] = await pool.query<RowData>(sql, params);

    const countSql = `SELECT COUNT(*) as total FROM products p LEFT JOIN product_categories pc ON p.category_id = pc.id LEFT JOIN organisations o ON p.seller_id = o.id AND p.seller_type = 'org' LEFT JOIN organisation_types ot ON o.org_type_id = ot.id${joins} WHERE ${conditions.join(' AND ')}`;
    const [countRows] = await pool.query<RowData>(countSql, params.slice(0, -2));

    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  async findProductById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT p.*, pc.name as category_name,
              COALESCE(o.name, u_player.full_name) as shop_name,
              COALESCE(o.owner_id, p.seller_user_id) as seller_user_id,
              COALESCE(o.phone, u_player.phone_number) as seller_phone,
              COALESCE(ot.slug, 'player') as org_type_slug,
              u_player.full_name as seller_full_name,
              b.name as brand_name
       FROM products p
       LEFT JOIN product_categories pc ON p.category_id = pc.id
       LEFT JOIN organisations o ON p.seller_id = o.id AND p.seller_type = 'org'
       LEFT JOIN organisation_types ot ON o.org_type_id = ot.id
       LEFT JOIN users u_org ON o.owner_id = u_org.id
       LEFT JOIN users u_player ON p.seller_user_id = u_player.id AND p.seller_type = 'player'
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  },

  async createProduct(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO products (seller_id, branch_id, category_id, sport_id, brand_id, name, description, price, discounted_price, currency_code, gender, condition_status, quantity, is_digital, digital_download_url, video_url, images, metadata, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [data.sellerId, data.branchId || null, data.categoryId, data.sportId || null, data.brandId || null, data.name, data.description || null, data.price, data.discountedPrice || null, data.currencyCode, data.gender || 'unisex', data.conditionStatus || data.condition || null, data.quantity, data.isDigital, data.digitalDownloadUrl || null, data.videoUrl || null, data.images ? JSON.stringify(data.images) : null, data.metadata ? JSON.stringify(data.metadata) : null]
    );
    return (result as any).insertId;
  },

  async updateProduct(id: number, sellerId: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    if (data.categoryId !== undefined) { fields.push('category_id = ?'); params.push(data.categoryId); }
    if (data.branchId !== undefined) { fields.push('branch_id = ?'); params.push(data.branchId); }
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.price !== undefined) { fields.push('price = ?'); params.push(data.price); }
    if (data.discountedPrice !== undefined) { fields.push('discounted_price = ?'); params.push(data.discountedPrice); }
    if (data.currencyCode !== undefined) { fields.push('currency_code = ?'); params.push(data.currencyCode); }
    if (data.quantity !== undefined) { fields.push('quantity = ?'); params.push(data.quantity); }
    if (data.isDigital !== undefined) { fields.push('is_digital = ?'); params.push(data.isDigital); }
    if (data.digitalDownloadUrl !== undefined) { fields.push('digital_download_url = ?'); params.push(data.digitalDownloadUrl); }
    if (data.videoUrl !== undefined) { fields.push('video_url = ?'); params.push(data.videoUrl); }
    if (data.images !== undefined) { fields.push('images = ?'); params.push(JSON.stringify(data.images)); }
    if (data.metadata !== undefined) { fields.push('metadata = ?'); params.push(JSON.stringify(data.metadata)); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.brandId !== undefined) { fields.push('brand_id = ?'); params.push(data.brandId); }
    if (data.gender !== undefined) { fields.push('gender = ?'); params.push(data.gender); }
    if (data.condition !== undefined) { fields.push('condition_status = ?'); params.push(data.condition); }
    if (!fields.length) return false;
    params.push(id, sellerId);
    const [result] = await pool.execute(
      `UPDATE products SET ${fields.join(', ')} WHERE id = ? AND seller_id = ? AND deleted_at IS NULL`,
      params
    );
    return (result as any).affectedRows > 0;
  },

  async setProductTags(productId: number, tagIds: number[]) {
    const pool = getPool();
    await pool.execute('DELETE FROM product_tags WHERE product_id = ?', [productId]);
    if (tagIds.length === 0) return;
    const values = tagIds.map(() => '(?, ?)').join(',');
    const params: any[] = [];
    for (const tid of tagIds) { params.push(productId, tid); }
    await pool.execute(`INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES ${values}`, params);
  },

  async findProductTags(productId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT t.id, t.name, t.slug FROM tags t JOIN product_tags pt ON pt.tag_id = t.id WHERE pt.product_id = ?',
      [productId]
    );
    return rows;
  },

  async softDeleteProduct(id: number, sellerId: number) {
    const pool = getPool();
    const [result] = await pool.execute(
      'UPDATE products SET deleted_at = NOW() WHERE id = ? AND seller_id = ?',
      [id, sellerId]
    );
    return (result as any).affectedRows > 0;
  },

  async findOrgByOwnerId(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM organisations WHERE owner_id = ? AND is_active = TRUE AND deleted_at IS NULL',
      [userId]
    );
    return rows;
  },

  // ── Variants ──
  async findVariants(productId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM product_variants WHERE product_id = ? AND is_active = TRUE ORDER BY sort_order ASC',
      [productId]
    );
    return rows;
  },

  async createVariant(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO product_variants (product_id, sku, variant_name, variant_type, price_adjustment, quantity, sort_order, variant_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.productId, data.sku || null, data.variantName, data.variantType, data.priceAdjustment, data.quantity, data.sortOrder || 0, data.variantColor || null]
    );
    return (result as any).insertId;
  },

  async updateVariant(id: number, data: any, sellerId?: number) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    if (data.sku !== undefined) { fields.push('sku = ?'); params.push(data.sku); }
    if (data.variantName !== undefined) { fields.push('variant_name = ?'); params.push(data.variantName); }
    if (data.variantType !== undefined) { fields.push('variant_type = ?'); params.push(data.variantType); }
    if (data.priceAdjustment !== undefined) { fields.push('price_adjustment = ?'); params.push(data.priceAdjustment); }
    if (data.quantity !== undefined) { fields.push('quantity = ?'); params.push(data.quantity); }
    if (data.sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(data.sortOrder); }
    if (data.variantColor !== undefined) { fields.push('variant_color = ?'); params.push(data.variantColor); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); params.push(data.isActive); }
    if (!fields.length) return false;
    params.push(id);
    if (sellerId !== undefined) {
      const [result] = await pool.execute(
        `UPDATE product_variants pv
         JOIN products p ON p.id = pv.product_id
         SET ${fields.map(f => `pv.${f}`).join(', ')}
         WHERE pv.id = ? AND p.seller_id = ?`,
        [...params, sellerId],
      );
      return (result as any).affectedRows > 0;
    }
    const [result] = await pool.execute(`UPDATE product_variants SET ${fields.join(', ')} WHERE id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async deleteVariant(id: number, sellerId?: number) {
    const pool = getPool();
    if (sellerId !== undefined) {
      const [result] = await pool.execute(
        `UPDATE product_variants pv
         JOIN products p ON p.id = pv.product_id
         SET pv.is_active = FALSE
         WHERE pv.id = ? AND p.seller_id = ?`,
        [id, sellerId],
      );
      return (result as any).affectedRows > 0;
    }
    const [result] = await pool.execute('UPDATE product_variants SET is_active = FALSE WHERE id = ?', [id]);
    return (result as any).affectedRows > 0;
  },

  async findVariantById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pv.*, p.seller_id, p.id as product_id, p.name as product_name
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = ?`,
      [id],
    );
    return rows[0] || null;
  },

  async decrementStock(productId: number, variantId: number | undefined, quantity: number) {
    const pool = getPool();
    await pool.execute('UPDATE products SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [quantity, productId]);
    if (variantId) {
      await pool.execute('UPDATE product_variants SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?', [quantity, variantId]);
    }
  },

  async restoreStock(productId: number, variantId: number | undefined, quantity: number) {
    const pool = getPool();
    await pool.execute('UPDATE products SET quantity = quantity + ? WHERE id = ?', [quantity, productId]);
    if (variantId) {
      await pool.execute('UPDATE product_variants SET quantity = quantity + ? WHERE id = ?', [quantity, variantId]);
    }
  },

  // ── Wishlist ──
  async findWishlist(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT wi.*, p.name, p.price, p.discounted_price, p.currency_code, p.images, p.status, COALESCE(o.name, u.full_name) as shop_name
       FROM wishlist_items wi
       JOIN products p ON wi.product_id = p.id
       LEFT JOIN organisations o ON p.seller_id = o.id
       LEFT JOIN users u ON o.owner_id = u.id
       WHERE wi.user_id = ? AND p.deleted_at IS NULL
       ORDER BY wi.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async addWishlist(userId: number, productId: number) {
    const pool = getPool();
    await pool.execute(
      'INSERT IGNORE INTO wishlist_items (user_id, product_id) VALUES (?, ?)',
      [userId, productId]
    );
  },

  async removeWishlist(userId: number, productId: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?', [userId, productId]);
  },

  async isInWishlist(userId: number, productId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT 1 as found FROM wishlist_items WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );
    return rows.length > 0;
  },

  // ── Cart ──
  async findCartByUser(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT ci.*, p.name, p.price, p.discounted_price, p.currency_code, p.images, p.quantity as available_qty,
              COALESCE(o.name, u.full_name) as shop_name, p.seller_id,
              pv.variant_name, pv.price_adjustment, pv.sku
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       LEFT JOIN organisations o ON p.seller_id = o.id
       LEFT JOIN users u ON o.owner_id = u.id
       WHERE ci.user_id = ? AND p.deleted_at IS NULL
       ORDER BY ci.created_at ASC`,
      [userId]
    );
    return rows;
  },

  async findCartSellers(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT o.id as seller_id, o.name as org_name, o.phone,
              ot.slug as org_type_slug,
              (SELECT os.id FROM organisation_subscriptions os
               JOIN subscription_plans sp ON os.plan_id = sp.id
               WHERE os.organisation_id = o.id
                 AND os.subscription_status = 'active'
                 AND (os.end_date IS NULL OR os.end_date >= CURDATE())
                 AND (sp.price_monthly > 0 OR sp.price_yearly > 0)
               LIMIT 1) as has_paid_plan
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN organisations o ON p.seller_id = o.id
       JOIN organisation_types ot ON o.org_type_id = ot.id
       WHERE ci.user_id = ? AND p.deleted_at IS NULL AND o.deleted_at IS NULL`,
      [userId]
    );
    return rows;
  },

  async findCartItem(userId: number, productId: number, variantId?: number) {
    const pool = getPool();
    let sql = 'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?';
    const params: any[] = [userId, productId];
    if (variantId) { sql += ' AND variant_id = ?'; params.push(variantId); }
    else { sql += ' AND variant_id IS NULL'; }
    const [rows] = await pool.execute<RowData>(sql, params);
    return rows[0] || null;
  },

  async upsertCartItem(userId: number, productId: number, quantity: number, variantId?: number) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO cart_items (user_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [userId, productId, variantId || null, quantity]
    );
  },

  async upsertCartItemExact(userId: number, productId: number, quantity: number, variantId?: number) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO cart_items (user_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
      [userId, productId, variantId || null, quantity]
    );
  },

  async updateCartItemQuantity(userId: number, itemId: number, quantity: number) {
    const pool = getPool();
    if (quantity === 0) {
      const [result] = await pool.execute('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [itemId, userId]);
      return (result as any).affectedRows > 0;
    }
    const [result] = await pool.execute('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [quantity, itemId, userId]);
    return (result as any).affectedRows > 0;
  },

  async removeCartItem(userId: number, productId: number) {
    const pool = getPool();
    const [result] = await pool.execute('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [userId, productId]);
    return (result as any).affectedRows > 0;
  },

  async clearCart(userId: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM cart_items WHERE user_id = ?', [userId]);
  },

  // ── Addresses ──
  async findAddresses(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [userId]);
    return rows;
  },

  async findAddressById(id: number, userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [id, userId]);
    return rows[0] || null;
  },

  async createAddress(userId: number, data: any) {
    const pool = getPool();
    if (data.isDefault) {
      await pool.execute('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [userId]);
    }
    const [result] = await pool.execute(
      `INSERT INTO user_addresses (user_id, label, full_name, phone, street_address, city, state, postal_code, country, province_id, city_id, is_default, address_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, data.label || null, data.fullName, data.phone, data.streetAddress, data.city, data.state || null, data.postalCode || null, data.country || 'Egypt', data.provinceId || null, data.cityId || null, data.isDefault ? 1 : 0, data.addressType || 'both']
    );
    return (result as any).insertId;
  },

  async updateAddress(id: number, userId: number, data: any) {
    const pool = getPool();
    if (data.isDefault) {
      await pool.execute('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [userId]);
    }
    const fields: string[] = []; const params: any[] = [];
    if (data.label !== undefined) { fields.push('label = ?'); params.push(data.label); }
    if (data.fullName !== undefined) { fields.push('full_name = ?'); params.push(data.fullName); }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
    if (data.streetAddress !== undefined) { fields.push('street_address = ?'); params.push(data.streetAddress); }
    if (data.city !== undefined) { fields.push('city = ?'); params.push(data.city); }
    if (data.state !== undefined) { fields.push('state = ?'); params.push(data.state); }
    if (data.postalCode !== undefined) { fields.push('postal_code = ?'); params.push(data.postalCode); }
    if (data.country !== undefined) { fields.push('country = ?'); params.push(data.country); }
    if (data.provinceId !== undefined) { fields.push('province_id = ?'); params.push(data.provinceId || null); }
    if (data.cityId !== undefined) { fields.push('city_id = ?'); params.push(data.cityId || null); }
    if (data.isDefault !== undefined) { fields.push('is_default = ?'); params.push(data.isDefault ? 1 : 0); }
    if (data.addressType !== undefined) { fields.push('address_type = ?'); params.push(data.addressType); }
    if (!fields.length) return false;
    params.push(id, userId);
    const [result] = await pool.execute(`UPDATE user_addresses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async deleteAddress(id: number, userId: number) {
    const pool = getPool();
    const [result] = await pool.execute('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [id, userId]);
    return (result as any).affectedRows > 0;
  },

  // ── Coupons ──
  async findCouponByCode(code: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM coupons WHERE code = ? AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (starts_at IS NULL OR starts_at <= NOW())`,
      [code]
    );
    return rows[0] || null;
  },

  async countCouponUsage(couponId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT COUNT(*) as cnt FROM coupon_usage WHERE coupon_id = ?', [couponId]);
    return rows[0].cnt;
  },

  async countCouponUsageByUser(couponId: number, userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT COUNT(*) as cnt FROM coupon_usage WHERE coupon_id = ? AND user_id = ?', [couponId, userId]);
    return rows[0].cnt;
  },

  async recordCouponUsage(couponId: number, userId: number, orderId?: number) {
    const pool = getPool();
    await pool.execute('INSERT INTO coupon_usage (coupon_id, user_id, order_id) VALUES (?, ?, ?)', [couponId, userId, orderId || null]);
  },

  // ── Orders ──
  async createOrder(data: { buyerId: number; subtotal: number; shippingCost: number; commission: number; total: number; currencyCode: string; shippingAddress: any; notes: string; couponId?: number; discountAmount?: number; taxAmount?: number; paymentMethod?: string; estimatedDeliveryDate?: string | null }) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO orders (public_id, buyer_id, status, subtotal, shipping_cost, estimated_delivery_date, commission_amount, coupon_id, discount_amount, tax_amount, total, currency_code, shipping_address, notes, payment_method)
       VALUES (UUID(), ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.buyerId, data.subtotal, data.shippingCost, data.estimatedDeliveryDate || null, data.commission, data.couponId || null, data.discountAmount || 0, data.taxAmount || 0, data.total, data.currencyCode, data.shippingAddress ? JSON.stringify(data.shippingAddress) : null, data.notes || null, data.paymentMethod || 'wallet']
    );
    return (result as any).insertId;
  },

  async createOrderItem(data: { orderId: number; productId: number; variantId?: number; sellerId: number; quantity: number; unitPrice: number; totalPrice: number; commissionRate: number; commissionAmount: number }) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO order_items (order_id, product_id, variant_id, seller_id, quantity, unit_price, total_price, commission_rate, commission_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.orderId, data.productId, data.variantId || null, data.sellerId, data.quantity, data.unitPrice, data.totalPrice, data.commissionRate, data.commissionAmount]
    );
  },

  async findOrdersByBuyer(buyerId: number, page: number, limit: number, status?: string) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const params: any[] = [buyerId];
    let statusClause = '';
    if (status) { statusClause = ' AND status = ?'; params.push(status); }

    // Paginate orders first, then join items — prevents duplicate keys
    const [rows] = await pool.query<RowData>(
      `SELECT o.*, oi.product_id, oi.variant_id, oi.quantity, oi.unit_price, oi.total_price as item_total,
              p.name as product_name, p.images, pv.variant_name, COALESCE(org.name, u.full_name) as shop_name
       FROM (
         SELECT * FROM orders WHERE buyer_id = ?${statusClause} AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT ? OFFSET ?
       ) o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN product_variants pv ON oi.variant_id = pv.id
       LEFT JOIN organisations org ON oi.seller_id = org.id
       LEFT JOIN users u ON org.owner_id = u.id
       ORDER BY o.created_at DESC`,
      [...params, limit, offset]
    );
    const countParams = status ? [buyerId, status] : [buyerId];
    const statusWhere = status ? ' AND status = ?' : '';
    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) as total FROM orders WHERE buyer_id = ?${statusWhere} AND deleted_at IS NULL`,
      countParams
    );
    return { data: rows, total: countRows[0].total, page, limit };
  },

  async findOrdersBySeller(sellerId: number, filters: { status?: string; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT o.*, oi.product_id, oi.variant_id, oi.quantity, oi.unit_price, oi.total_price as item_total,
               p.name as product_name, p.images, pv.variant_name, buyer.full_name as buyer_name, buyer.full_phone as buyer_phone
               FROM order_items oi
               JOIN orders o ON o.id = oi.order_id
               JOIN products p ON oi.product_id = p.id
               LEFT JOIN product_variants pv ON oi.variant_id = pv.id
               LEFT JOIN users buyer ON o.buyer_id = buyer.id
               WHERE oi.seller_id = ?`;
    const params: any[] = [sellerId];
    if (filters.status) { sql += ' AND o.status = ?'; params.push(filters.status); }
    sql += ' ORDER BY o.created_at DESC';
    const offset = (filters.page - 1) * filters.limit;
    sql += ' LIMIT ? OFFSET ?';
    params.push(filters.limit, offset);

    const [rows] = await pool.query<RowData>(sql, params);

    const countSql = `SELECT COUNT(*) as total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ?${filters.status ? ' AND o.status = ?' : ''}`;
    const [countRows] = await pool.query<RowData>(countSql, filters.status ? [sellerId, filters.status] : [sellerId]);
    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  async findOrderById(id: number, buyerId?: number, sellerOrgId?: number) {
    const pool = getPool();
    let sql = `SELECT o.*, oi.id as item_id, oi.seller_id as item_seller_id, oi.product_id, oi.variant_id,
               oi.quantity, oi.unit_price, oi.total_price as item_total,
               oi.commission_rate, oi.commission_amount,
               p.name as product_name, p.branch_id, pv.variant_name, COALESCE(org.name, u.full_name) as shop_name, org.owner_id as seller_user_id,
               prov.name as province_name
               FROM orders o
               LEFT JOIN order_items oi ON o.id = oi.order_id
               LEFT JOIN products p ON oi.product_id = p.id
               LEFT JOIN product_variants pv ON oi.variant_id = pv.id
               LEFT JOIN organisations org ON oi.seller_id = org.id
               LEFT JOIN users u ON org.owner_id = u.id
               LEFT JOIN provinces prov ON prov.id = JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address, '$.province_id'))
               WHERE o.id = ?`;
    const params: any[] = [id];
    if (buyerId) { sql += ' AND o.buyer_id = ?'; params.push(buyerId); }
    if (sellerOrgId) { sql += ' AND oi.seller_id = ?'; params.push(sellerOrgId); }
    const [rows] = await pool.execute<RowData>(sql, params);
    return rows;
  },

  async updateOrderStatus(id: number, status: string, reason?: string) {
    const pool = getPool();
    const updates: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'cancelled') { updates.push('cancelled_at = NOW(), cancellation_reason = ?'); params.push(reason || null); }
    if (status === 'confirmed' || status === 'paid') { updates.push('paid_at = NOW(), payment_status = ?'); params.push('paid'); }
    if (status === 'delivered') { updates.push("payment_status = 'paid'"); }
    params.push(id);
    await pool.execute(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params);
  },

  async updateOrderTracking(id: number, carrier: string, trackingNumber: string) {
    const pool = getPool();
    await pool.execute('UPDATE orders SET shipping_carrier = ?, tracking_number = ? WHERE id = ?', [carrier, trackingNumber, id]);
  },

  async createOrderStatusHistory(data: { orderId: number; fromStatus?: string; toStatus: string; changedBy?: number; changedByRole: string; note?: string }) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_by_role, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.orderId, data.fromStatus || null, data.toStatus, data.changedBy || null, data.changedByRole, data.note || null]
    );
  },

  // ── Seller (via organisations) ──
  async findOrgByUserId(userId: number, orgTypeSlug?: string) {
    const pool = getPool();
    let sql = `SELECT o.* FROM organisations o
               JOIN organisation_types ot ON o.org_type_id = ot.id
               WHERE o.owner_id = ? AND o.is_active = TRUE AND o.deleted_at IS NULL`;
    const params: any[] = [userId];
    if (orgTypeSlug) { sql += ' AND ot.slug = ?'; params.push(orgTypeSlug); }
    sql += ' ORDER BY o.id DESC LIMIT 1';
    const [rows] = await pool.execute<RowData>(sql, params);
    return rows[0] || null;
  },

  async findOrgByUserScope(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT o.*, ot.slug as org_type_slug FROM organisations o
       JOIN organisation_types ot ON ot.id = o.org_type_id
       JOIN user_role_scopes urs ON urs.scope_id = o.id AND urs.scope_type = 'organisation'
       JOIN user_roles ur ON ur.id = urs.user_role_id
       WHERE ur.user_id = ? AND ur.is_active = TRUE AND o.is_active = TRUE AND o.deleted_at IS NULL
       ORDER BY o.id DESC LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  async findOrgById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM organisations WHERE id = ? AND is_active = TRUE AND deleted_at IS NULL', [id]);
    return rows[0] || null;
  },

  async createOrganisation(data: { orgTypeId: number; ownerId: number; name: string; slug: string; description?: string; email?: string; phone?: string }) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, description, email, phone, is_verified, is_active) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)',
      [data.orgTypeId, data.ownerId, data.name, data.slug, data.description || null, data.email || null, data.phone || null]
    );
    return (result as any).insertId;
  },

  async updateOrganisation(id: number, data: { name?: string; description?: string; email?: string; phone?: string; website?: string; crNumber?: string; taxId?: string; orgTypeId?: number; isVerified?: boolean }) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.email !== undefined) { fields.push('email = ?'); params.push(data.email); }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
    if (data.website !== undefined) { fields.push('website = ?'); params.push(data.website); }
    if (data.crNumber !== undefined) { fields.push('cr_number = ?'); params.push(data.crNumber); }
    if (data.taxId !== undefined) { fields.push('tax_id = ?'); params.push(data.taxId); }
    if (data.orgTypeId !== undefined) { fields.push('org_type_id = ?'); params.push(data.orgTypeId); }
    if (data.isVerified !== undefined) { fields.push('is_verified = ?'); params.push(data.isVerified); }
    if (!fields.length) return false;
    params.push(id);
    const [result] = await pool.execute(`UPDATE organisations SET ${fields.join(', ')} WHERE id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async findActiveSubscription(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT os.*, sp.plan_name, sp.applicable_org_types
       FROM organisation_subscriptions os
       JOIN subscription_plans sp ON os.plan_id = sp.id
       WHERE os.organisation_id = ? AND os.subscription_status = 'active'
         AND (os.end_date IS NULL OR os.end_date >= CURDATE())
       ORDER BY os.created_at DESC
       LIMIT 1`,
      [orgId]
    );
    return rows[0] || null;
  },

  async createSubscription(orgId: number, planId: number) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO organisation_subscriptions (organisation_id, plan_id, start_date, end_date, subscription_status, auto_renew)
       VALUES (?, ?, NULL, NULL, 'pending', FALSE)
       ON DUPLICATE KEY UPDATE plan_id = VALUES(plan_id), subscription_status = 'pending'`,
      [orgId, planId]
    );
  },

  async countOrgProducts(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      "SELECT COUNT(*) as cnt FROM products WHERE seller_id = ? AND is_active = TRUE AND deleted_at IS NULL AND status = 'active'",
      [orgId]
    );
    return rows[0].cnt;
  },

  async getSellerStats(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT
         (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ? AND o.status != 'cancelled') as total_orders,
         (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ? AND o.status = 'delivered') as completed_orders,
         (SELECT COALESCE(SUM(oi.total_price), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ? AND o.status = 'delivered') as total_revenue,
         (SELECT COALESCE(SUM(oi.commission_amount), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ? AND o.status = 'delivered') as total_commission,
         (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ? AND o.status = 'pending') as pending_orders,
         (SELECT COUNT(*) FROM products WHERE seller_id = ? AND deleted_at IS NULL AND status = 'active') as active_listings
      `,
      [orgId, orgId, orgId, orgId, orgId, orgId]
    );
    return rows[0];
  },

  // ── Reviews ──
  async findReviewsByProduct(productId: number, page: number, limit: number) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const [rows] = await pool.query<RowData>(
      `SELECT pr.*, u.full_name as user_name
       FROM product_reviews pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.product_id = ?
       ORDER BY pr.created_at DESC
       LIMIT ? OFFSET ?`,
      [productId, limit, offset]
    );
    const [countRows] = await pool.query<RowData>('SELECT COUNT(*) as total FROM product_reviews WHERE product_id = ?', [productId]);
    return { data: rows, total: countRows[0].total, page, limit };
  },

  async createReview(data: { productId: number; userId: number; rating: number; reviewText?: string }) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO product_reviews (product_id, user_id, rating, review_text, is_verified_purchase)
       VALUES (?, ?, ?, ?, TRUE)`,
      [data.productId, data.userId, data.rating, data.reviewText || null]
    );
    return (result as any).insertId;
  },

  async findOrdersContainingProduct(userId: number, productId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT 1 as found FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.buyer_id = ? AND oi.product_id = ? AND o.status NOT IN ('cancelled', 'refunded')
       LIMIT 1`,
      [userId, productId]
    );
    return rows.length > 0;
  },

  // ── Commission ──
  // ── Player / Seller upgrade helpers ──
  async findOrgTypeIdBySlug(slug: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT id FROM organisation_types WHERE slug = ?', [slug]);
    return rows.length ? rows[0].id : null;
  },

  async findRoleIdBySlug(slug: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT id FROM roles WHERE slug = ? AND is_active = TRUE ORDER BY id LIMIT 1', [slug]);
    return rows.length ? rows[0].id : null;
  },

  async assignUserRole(userId: number, roleId: number) {
    const pool = getPool();
    await pool.execute(
      'INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, TRUE) ON DUPLICATE KEY UPDATE is_active = TRUE',
      [userId, roleId]
    );
  },

  async findSubscriptionPlansByOrgType(orgTypeSlug: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT sp.* FROM subscription_plans sp
       JOIN organisation_types ot ON ot.slug = ?
       WHERE sp.is_active = TRUE AND sp.is_internal = FALSE
         AND (sp.applicable_org_types IS NULL OR JSON_CONTAINS(sp.applicable_org_types, CAST(ot.id AS CHAR)))
       ORDER BY COALESCE(sp.price_monthly, sp.price_yearly, 0) ASC`,
      [orgTypeSlug]
    );
    return rows;
  },

  // ── Admin: Products ──
  async adminFindAllProducts(filters: { search?: string; categoryId?: number; sellerId?: number; status?: string; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT p.*, pc.name as category_name,
                      COALESCE(o.name, u_pl.full_name) as org_name,
                      COALESCE(u_org.full_name, u_pl.full_name) as owner_name
               FROM products p
                LEFT JOIN product_categories pc ON p.category_id = pc.id
               LEFT JOIN organisations o ON p.seller_id = o.id AND p.seller_type = 'org'
               LEFT JOIN users u_org ON o.owner_id = u_org.id
               LEFT JOIN users u_pl ON p.seller_user_id = u_pl.id AND p.seller_type = 'player'
               WHERE p.deleted_at IS NULL`;
     const params: any[] = [];
    if (filters.search) { sql += ' AND p.name LIKE ?'; params.push(`%${filters.search}%`); }
    if (filters.categoryId) { sql += ' AND p.category_id = ?'; params.push(filters.categoryId); }
    if (filters.sellerId) { sql += ' AND p.seller_id = ?'; params.push(filters.sellerId); }
    if (filters.status) { sql += ' AND p.status = ?'; params.push(filters.status); }
    sql += ' ORDER BY p.created_at DESC';
    const offset = (filters.page - 1) * filters.limit;
    sql += ' LIMIT ? OFFSET ?'; params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);

    let countSql = 'SELECT COUNT(*) as total FROM products p WHERE p.deleted_at IS NULL';
    const countParams: any[] = [];
    if (filters.search) { countSql += ' AND p.name LIKE ?'; countParams.push(`%${filters.search}%`); }
    if (filters.categoryId) { countSql += ' AND p.category_id = ?'; countParams.push(filters.categoryId); }
    if (filters.sellerId) { countSql += ' AND p.seller_id = ?'; countParams.push(filters.sellerId); }
    if (filters.status) { countSql += ' AND p.status = ?'; countParams.push(filters.status); }
    const [countRows] = await pool.query<RowData>(countSql, countParams);
    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  async adminUpdateProduct(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.price !== undefined) { fields.push('price = ?'); params.push(data.price); }
    if (data.discountedPrice !== undefined) { fields.push('discounted_price = ?'); params.push(data.discountedPrice); }
    if (data.quantity !== undefined) { fields.push('quantity = ?'); params.push(data.quantity); }
    if (data.currencyCode !== undefined) { fields.push('currency_code = ?'); params.push(data.currencyCode); }
    if (data.categoryId !== undefined) { fields.push('category_id = ?'); params.push(data.categoryId); }
    if (data.sportId !== undefined) { fields.push('sport_id = ?'); params.push(data.sportId || null); }
    if (data.brandId !== undefined) { fields.push('brand_id = ?'); params.push(data.brandId || null); }
    if (data.conditionStatus !== undefined) { fields.push('condition_status = ?'); params.push(data.conditionStatus); }
    if (data.branchId !== undefined) { fields.push('branch_id = ?'); params.push(data.branchId || null); }
    if (data.images !== undefined) { fields.push('images = ?'); params.push(data.images?.length ? JSON.stringify(data.images) : null); }
    if (!fields.length) return false;
    params.push(id);
    await pool.execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);

    if (data.tagIds !== undefined) {
      await this.setProductTags(id, data.tagIds);
    }
    return true;
  },

  async adminDeleteProduct(id: number) {
    const pool = getPool();
    const [result] = await pool.execute('UPDATE products SET deleted_at = NOW() WHERE id = ?', [id]);
    return (result as any).affectedRows > 0;
  },

  // ── Admin: Orders ──
  async adminFindAllOrders(filters: { status?: string; search?: string; sellerId?: number; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT o.*, oi.id as item_id, oi.product_id, oi.variant_id, oi.quantity, oi.unit_price, oi.total_price as item_total,
               p.name as product_name, buyer.full_name as buyer_name, buyer.full_phone as buyer_phone, org.name as org_name
               FROM orders o
               JOIN order_items oi ON o.id = oi.order_id
               JOIN products p ON oi.product_id = p.id
               JOIN organisations org ON oi.seller_id = org.id
               JOIN users buyer ON o.buyer_id = buyer.id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters.status) { sql += ' AND o.status = ?'; params.push(filters.status); }
    if (filters.search) { sql += ' AND (buyer.full_name LIKE ? OR p.name LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`); }
    if (filters.sellerId) { sql += ' AND oi.seller_id = ?'; params.push(filters.sellerId); }
    sql += ' ORDER BY o.created_at DESC';
    const offset = (filters.page - 1) * filters.limit;
    sql += ' LIMIT ? OFFSET ?'; params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);

    let countSql = 'SELECT COUNT(DISTINCT o.id) as total FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE 1=1';
    const countParams: any[] = [];
    if (filters.status) { countSql += ' AND o.status = ?'; countParams.push(filters.status); }
    if (filters.sellerId) { countSql += ' AND oi.seller_id = ?'; countParams.push(filters.sellerId); }
    const [countRows] = await pool.query<RowData>(countSql, countParams);
    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  // ── Admin: Sellers ──
  async adminFindSellerOrgs(filters: { search?: string; orgType?: string; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT o.*, ot.name as org_type_name, ot.slug as org_type_slug, u.full_name as owner_name, u.email as owner_email, u.phone_number as owner_phone
               FROM organisations o
               JOIN organisation_types ot ON o.org_type_id = ot.id
               JOIN users u ON o.owner_id = u.id
                WHERE o.deleted_at IS NULL AND ot.slug IN ('shop', 'sports-club', 'sports-academy', 'fitness-center', 'gym')`;
    const params: any[] = [];
    if (filters.search) { sql += ' AND (o.name LIKE ? OR u.full_name LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`); }
    if (filters.orgType) { sql += ' AND ot.slug = ?'; params.push(filters.orgType); }
    sql += ' ORDER BY o.created_at DESC';
    const offset = (filters.page - 1) * filters.limit;
    sql += ' LIMIT ? OFFSET ?'; params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);

    let countSql = `SELECT COUNT(*) as total FROM organisations o JOIN organisation_types ot ON o.org_type_id = ot.id WHERE o.deleted_at IS NULL AND ot.slug IN ('shop', 'sports-club', 'sports-academy', 'fitness-center', 'gym')`;
    const countParams: any[] = [];
    if (filters.orgType) { countSql += ' AND ot.slug = ?'; countParams.push(filters.orgType); }
    const [countRows] = await pool.query<RowData>(countSql, countParams.length ? countParams : undefined);
    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  async adminUpdateOrgStatus(id: number, isActive: boolean) {
    const pool = getPool();
    const [result] = await pool.execute('UPDATE organisations SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    return (result as any).affectedRows > 0;
  },

  async adminGetSellerStats(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE seller_id = ? AND deleted_at IS NULL) as total_products,
         (SELECT COUNT(*) FROM products WHERE seller_id = ? AND deleted_at IS NULL AND status = 'active') as active_products,
         (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ?) as total_orders,
         (SELECT COALESCE(SUM(oi.total_price), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = ? AND o.status = 'delivered') as total_revenue
      `,
      [orgId, orgId, orgId, orgId]
    );
    return rows[0];
  },

  // ── Admin: Upgrade Requests ──
  async adminFindUpgradeRequests(filters: { status?: string; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT our.*, o.name as org_name, o.email as org_email, o.phone as org_phone, u.full_name as requester_name, u.email as requester_email, sp.plan_name
               FROM organisation_upgrade_requests our
               JOIN organisations o ON our.organisation_id = o.id
               JOIN users u ON our.requested_by = u.id
               LEFT JOIN subscription_plans sp ON our.requested_plan_id = sp.id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters.status) { sql += ' AND our.status = ?'; params.push(filters.status); }
    sql += ' ORDER BY our.created_at DESC';
    const offset = (filters.page - 1) * filters.limit;
    sql += ' LIMIT ? OFFSET ?'; params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);

    let countSql = 'SELECT COUNT(*) as total FROM organisation_upgrade_requests WHERE 1=1';
    if (filters.status) { countSql += ' AND status = ?'; }
    const [countRows] = await pool.query<RowData>(countSql, filters.status ? [filters.status] : undefined);
    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  async adminRejectUpgrade(orgId: number, reason?: string) {
    const pool = getPool();
    await pool.execute(
      `UPDATE organisation_upgrade_requests SET status = 'rejected', notes = CONCAT(COALESCE(notes, ''), ' | Rejected: ', ?) WHERE organisation_id = ? AND status = 'pending'`,
      [reason || 'No reason provided', orgId]
    );
  },

  // ── Admin: Reviews ──
  async adminFindAllReviews(filters: { productId?: number; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT pr.*, u.full_name as user_name, p.name as product_name
               FROM product_reviews pr
               JOIN users u ON pr.user_id = u.id
               JOIN products p ON pr.product_id = p.id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters.productId) { sql += ' AND pr.product_id = ?'; params.push(filters.productId); }
    sql += ' ORDER BY pr.created_at DESC';
    const offset = (filters.page - 1) * filters.limit;
    sql += ' LIMIT ? OFFSET ?'; params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);

    let countSql = 'SELECT COUNT(*) as total FROM product_reviews WHERE 1=1';
    if (filters.productId) { countSql += ' AND product_id = ?'; }
    const [countRows] = await pool.query<RowData>(countSql, filters.productId ? [filters.productId] : undefined);
    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  async adminDeleteReview(id: number) {
    const pool = getPool();
    const [result] = await pool.execute('DELETE FROM product_reviews WHERE id = ?', [id]);
    return (result as any).affectedRows > 0;
  },

  // ── Settlements ──
  async findSettlementsByOrg(orgId: number, page: number, limit: number) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const [rows] = await pool.query<RowData>(
      'SELECT * FROM settlements WHERE organisation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [orgId, limit, offset]
    );
    const [countRows] = await pool.query<RowData>(
      'SELECT COUNT(*) as total FROM settlements WHERE organisation_id = ?', [orgId]
    );
    return { data: rows, total: countRows[0].total, page, limit };
  },

  async createSettlement(orgId: number, data: { amount: number; fee: number; netAmount: number; notes?: string }) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO settlements (organisation_id, amount, fee, net_amount, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [orgId, data.amount, data.fee, data.netAmount, data.notes || null]
    );
    return (result as any).insertId;
  },

  async getSettlementBalance(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT
         (SELECT COALESCE(SUM(oi.total_price - oi.commission_amount), 0)
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.seller_id = ? AND o.status = 'delivered') as available_balance,
         (SELECT COALESCE(SUM(amount), 0)
          FROM settlements
          WHERE organisation_id = ? AND status IN ('pending','approved')) as pending_settlements`,
      [orgId, orgId]
    );
    return rows[0];
  },

  // ── Product Images, Specs, Related ──
  async findProductImages(productId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
      [productId]
    );
    return rows;
  },

  async findProductSpecs(productId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM product_specifications WHERE product_id = ? ORDER BY sort_order ASC',
      [productId]
    );
    return rows;
  },

  async findRelatedProducts(productId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT rp.*, p.name as related_product_name, p.price as related_product_price, p.images as related_product_images
       FROM related_products rp
       JOIN products p ON p.id = rp.related_product_id
       WHERE rp.product_id = ? ORDER BY rp.sort_order ASC`,
      [productId]
    );
    return rows;
  },

  // ── Brands ──
  async findAllBrands() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id, name, slug, logo_url FROM brands ORDER BY sort_order ASC, name ASC'
    );
    return rows;
  },

  // ── Tags ──
  async findAllTags() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id, name, slug FROM tags ORDER BY name ASC'
    );
    return rows;
  },

  // ── Geo ──
  async findUserCountryId(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT country_id FROM users WHERE id = ?', [userId]);
    return rows[0]?.country_id || null;
  },

  async findProvinces(countryId?: number) {
    const pool = getPool();
    const sql = countryId
      ? 'SELECT id, name FROM provinces WHERE country_id = ? AND is_active = TRUE ORDER BY name ASC'
      : 'SELECT id, name FROM provinces WHERE is_active = TRUE ORDER BY name ASC';
    const params = countryId ? [countryId] : [];
    const [rows] = await pool.execute<RowData>(sql, params);
    return rows;
  },

  async findCitiesByProvince(provinceId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT id, name FROM cities WHERE province_id = ? AND is_active = TRUE ORDER BY name ASC', [provinceId]);
    return rows;
  },

  // ── Shipping Rates ──
  async findShippingRatesBySeller(sellerId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT sr.*, p.name as province_name, c.name as city_name
       FROM seller_shipping_rates sr
       LEFT JOIN provinces p ON sr.province_id = p.id
       LEFT JOIN cities c ON sr.city_id = c.id
       WHERE sr.seller_id = ?
       ORDER BY p.name ASC, c.name ASC`,
      [sellerId]
    );
    return rows;
  },

  async createShippingRate(data: { sellerId: number; provinceId?: number | null; cityId?: number | null; price: number; estimatedDays?: number | null }) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO seller_shipping_rates (seller_id, province_id, city_id, price, estimated_days) VALUES (?, ?, ?, ?, ?)`,
      [data.sellerId, data.provinceId || null, data.cityId || null, data.price, data.estimatedDays || null]
    );
    return (result as any).insertId;
  },

  async updateShippingRate(id: number, sellerId: number, data: { provinceId?: number | null; cityId?: number | null; price?: number; estimatedDays?: number | null }) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    if (data.provinceId !== undefined) { fields.push('province_id = ?'); params.push(data.provinceId || null); }
    if (data.cityId !== undefined) { fields.push('city_id = ?'); params.push(data.cityId || null); }
    if (data.price !== undefined) { fields.push('price = ?'); params.push(data.price); }
    if (data.estimatedDays !== undefined) { fields.push('estimated_days = ?'); params.push(data.estimatedDays || null); }
    if (!fields.length) return false;
    params.push(id, sellerId);
    const [result] = await pool.execute(`UPDATE seller_shipping_rates SET ${fields.join(', ')} WHERE id = ? AND seller_id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async deleteShippingRate(id: number, sellerId: number) {
    const pool = getPool();
    const [result] = await pool.execute('DELETE FROM seller_shipping_rates WHERE id = ? AND seller_id = ?', [id, sellerId]);
    return (result as any).affectedRows > 0;
  },

  async findShippingRateForSeller(sellerId: number, provinceId: number, cityId?: number) {
    const pool = getPool();
    let [rows] = await pool.execute<RowData>(
      'SELECT price, estimated_days FROM seller_shipping_rates WHERE seller_id = ? AND province_id = ? AND city_id = ? LIMIT 1',
      [sellerId, provinceId, cityId || null]
    );
    if (rows.length === 0 && cityId) {
      [rows] = await pool.execute<RowData>(
        'SELECT price, estimated_days FROM seller_shipping_rates WHERE seller_id = ? AND province_id = ? AND city_id IS NULL LIMIT 1',
        [sellerId, provinceId]
      );
    }
    return rows[0] || null;
  },

  async checkSellersShipping(cartItems: any[], provinceId: number, cityId?: number) {
    const pool = getPool();
    const sellerIds = [...new Set(cartItems.map((i: any) => i.seller_id))];
    const result = [];
    for (const sellerId of sellerIds) {
      const rate = await this.findShippingRateForSeller(sellerId, provinceId, cityId);
      const seller = cartItems.find((i: any) => i.seller_id === sellerId);
      result.push({
        seller_id: sellerId,
        shop_name: seller?.shop_name || `Seller #${sellerId}`,
        available: !!rate,
        price: rate ? Number(rate.price) : 0,
        estimated_days: rate ? Number(rate.estimated_days) : null,
      });
    }
    return result;
  },

  // ── Order Financials (CourtZon Accounting Model) ──

  async updateOrderFinancials(orderId: number, financials: {
    courtzonCommission: number;
    courtzonFee?: number;
    orgProductShare: number;
    orgShippingShare: number;
    cashHolder: 'org' | 'courtzon';
    cashCollectionStatus: string;
  }) {
    const pool = getPool();
    await pool.execute(
      `UPDATE orders SET
        courtzon_commission = ?,
        courtzon_fee = ?,
        org_product_share = ?,
        org_shipping_share = ?,
        cash_holder = ?,
        cash_collection_status = ?
       WHERE id = ?`,
      [
        financials.courtzonCommission,
        financials.courtzonFee ?? financials.courtzonCommission,
        financials.orgProductShare,
        financials.orgShippingShare,
        financials.cashHolder,
        financials.cashCollectionStatus,
        orderId,
      ],
    );
  },

  async updateCashCollectionStatus(orderId: number, status: string) {
    const pool = getPool();
    await pool.execute('UPDATE orders SET cash_collection_status = ? WHERE id = ?', [status, orderId]);
  },

  async getUnsettledOrders(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT o.id as order_id,
              o.public_id as order_public_id,
              o.subtotal, o.shipping_cost, o.total,
              o.payment_method, o.payment_status,
              o.courtzon_commission, o.courtzon_fee,
              o.org_product_share, o.org_shipping_share,
              o.cash_holder, o.cash_collection_status,
              o.created_at as order_date
       FROM orders o
       WHERE EXISTS (
         SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.seller_id = ?
       )
       AND o.status = 'delivered'
       AND o.settlement_status = 'pending'
       AND (o.payment_method = 'cash' OR o.payment_status = 'paid')
       ORDER BY o.id`,
      [orgId],
    );
    return rows;
  },

  async getUnsettledOrdersBySeller(orgId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT o.id as order_id,
              o.public_id as order_public_id,
              o.payment_method, o.payment_status,
              o.status as order_status,
              o.created_at as order_date,
              SUM(oi.total_price) as seller_subtotal,
              SUM(oi.commission_amount) as seller_fee,
              SUM(oi.total_price) - SUM(oi.commission_amount) as seller_product_net,
              CASE WHEN o.subtotal > 0
                THEN ROUND(o.shipping_cost * (SUM(oi.total_price) / o.subtotal), 2)
                ELSE 0
              END as seller_shipping,
              CASE WHEN o.subtotal > 0
                THEN ROUND(o.courtzon_fee * (SUM(oi.total_price) / o.subtotal), 2)
                ELSE 0
              END as seller_courtzon_fee
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.seller_id = ?
         AND oi.settlement_status = 'pending'
         AND o.status = 'delivered'
         AND o.settlement_status = 'pending'
         AND (o.payment_method = 'cash' OR o.payment_status = 'paid')
       GROUP BY o.id
       ORDER BY o.id`,
      [orgId],
    );
    return rows;
  },

  async getSettlementBalanceBySeller(orgId: number): Promise<{
    available_balance: number;
    pending_fee: number;
    order_count: number;
  }> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT
         SUM(oi.total_price - oi.commission_amount) as product_net,
         SUM(oi.commission_amount) as total_fee,
         COUNT(DISTINCT o.id) as order_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_id = ?
         AND oi.settlement_status = 'pending'
         AND o.status = 'delivered'
         AND (o.payment_method = 'cash' OR o.payment_status = 'paid')`,
      [orgId],
    );
    const r = rows[0] as any;
    const productNet = Number(r?.product_net || 0);
    const totalFee = Number(r?.total_fee || 0);
    const orderCount = Number(r?.order_count || 0);
    return {
      available_balance: Math.round(productNet * 100) / 100,
      pending_fee: Math.round(totalFee * 100) / 100,
      order_count: orderCount,
    };
  },

  async markOrderSettled(orderId: number) {
    const pool = getPool();
    await pool.execute('UPDATE orders SET settlement_status = ? WHERE id = ?', ['settled', orderId]);
  },

  async markOrderItemsSettled(orderIds: number[], sellerId: number) {
    if (!orderIds.length) return;
    const pool = getPool();
    const placeholders = orderIds.map(() => '?').join(',');
    await pool.execute(
      `UPDATE order_items SET settlement_status = 'settled'
       WHERE order_id IN (${placeholders}) AND seller_id = ?`,
      [...orderIds, sellerId],
    );
  },

  async markOrdersFullySettled(orderIds: number[]) {
    if (!orderIds.length) return;
    const pool = getPool();
    const placeholders = orderIds.map(() => '?').join(',');
    await pool.execute(
      `UPDATE orders o SET settlement_status = 'settled'
       WHERE o.id IN (${placeholders})
       AND NOT EXISTS (
         SELECT 1 FROM order_items oi
         WHERE oi.order_id = o.id AND oi.settlement_status = 'pending'
       )`,
      orderIds,
    );
  },

  async unmarkSettlementOrders(settlementId: number) {
    const pool = getPool();
    const [soRows] = await pool.execute<RowData>(
      'SELECT order_id FROM settlement_orders WHERE settlement_id = ?',
      [settlementId],
    );
    const orderIds = soRows.map((r: any) => r.order_id);
    if (!orderIds.length) return;
    const placeholders = orderIds.map(() => '?').join(',');
    await pool.execute(
      `UPDATE order_items oi SET oi.settlement_status = 'pending'
       WHERE oi.order_id IN (${placeholders})
       AND oi.settlement_status = 'settled'`,
      orderIds,
    );
    await pool.execute(
      `UPDATE orders o SET o.settlement_status = 'pending'
       WHERE o.id IN (${placeholders})`,
      orderIds,
    );
  },

  // ── Marketplace Accounting Ledger ──

  async insertLedgerEntry(data: {
    orderId: number;
    orderItemId?: number;
    branchId?: number;
    organisationId: number;
    entryType: string;
    paymentMethod?: string;
    amount: number;
    currencyCode?: string;
    description?: string;
    metadata?: any;
  }) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO marketplace_ledger_entries
       (order_id, order_item_id, branch_id, organisation_id, entry_type, payment_method, amount, currency_code, description, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.orderId, data.orderItemId ?? null, data.branchId ?? null, data.organisationId,
        data.entryType, data.paymentMethod ?? null, data.amount, data.currencyCode ?? 'EGP',
        data.description ?? null, data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
  },

  async getLedgerBalance(organisationId: number): Promise<{
    due_to_collect: number;
    due_to_transfer: number;
    due_to_courtzon: number;
    total_reversals: number;
    total_refunds: number;
  }> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT entry_type, SUM(amount) as total
       FROM marketplace_ledger_entries
       WHERE organisation_id = ?
       GROUP BY entry_type`,
      [organisationId]
    );
    const result = { due_to_collect: 0, due_to_transfer: 0, due_to_courtzon: 0, total_reversals: 0, total_refunds: 0 };
    for (const r of rows as any[]) {
      switch (r.entry_type) {
        case 'due_to_collect': result.due_to_collect = Number(r.total); break;
        case 'due_to_transfer': result.due_to_transfer = Number(r.total); break;
        case 'due_to_courtzon': result.due_to_courtzon = Number(r.total); break;
        case 'reversal': result.total_reversals = Number(r.total); break;
        case 'refund': result.total_refunds = Number(r.total); break;
      }
    }
    return result;
  },

  async getLedgerEntries(organisationId: number, filters?: { entryType?: string; orderId?: number }) {
    const pool = getPool();
    const conditions = ['organisation_id = ?'];
    const params: any[] = [organisationId];
    if (filters?.entryType) { conditions.push('entry_type = ?'); params.push(filters.entryType); }
    if (filters?.orderId) { conditions.push('order_id = ?'); params.push(filters.orderId); }
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM marketplace_ledger_entries WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    return rows;
  },
};
