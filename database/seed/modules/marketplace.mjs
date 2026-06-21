import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')

export default async function seed(conn, ctx) {
  let total = 0

  const cats = [
    { id: 1, parent_id: null, sport_id: 2, name: 'Racket Sports', slug: 'racket-sports', description: 'Tennis, padel, squash equipment', sort_order: 1, is_active: 1 },
    { id: 2, parent_id: null, sport_id: 1, name: 'Football', slug: 'football', description: 'Football gear and accessories', sort_order: 2, is_active: 1 },
    { id: 3, parent_id: null, sport_id: 6, name: 'Swimming', slug: 'swimming', description: 'Swimwear, goggles, accessories', sort_order: 3, is_active: 1 },
    { id: 4, parent_id: null, sport_id: 11, name: 'Fitness', slug: 'fitness', description: 'Gym and workout equipment', sort_order: 4, is_active: 1 },
    { id: 5, parent_id: null, sport_id: null, name: 'Apparel', slug: 'apparel', description: 'Sports clothing and footwear', sort_order: 5, is_active: 1 },
    { id: 6, parent_id: 1, sport_id: 3, name: 'Tennis Rackets', slug: 'tennis-rackets', description: 'Professional and amateur tennis rackets', sort_order: 1, is_active: 1 },
    { id: 7, parent_id: 1, sport_id: 2, name: 'Padel Rackets', slug: 'padel-rackets', description: 'Padel rackets for all levels', sort_order: 2, is_active: 1 },
    { id: 8, parent_id: 1, sport_id: 5, name: 'Squash Rackets', slug: 'squash-rackets', description: 'Squash rackets by top brands', sort_order: 3, is_active: 1 },
    { id: 9, parent_id: 2, sport_id: 1, name: 'Football Boots', slug: 'football-boots', description: 'Boots for all surfaces', sort_order: 1, is_active: 1 },
    { id: 10, parent_id: 2, sport_id: 1, name: 'Football Accessories', slug: 'football-accessories', description: 'Shin guards, socks, gloves', sort_order: 2, is_active: 1 },
    { id: 11, parent_id: 5, sport_id: null, name: 'Men\'s Apparel', slug: 'mens-apparel', description: 'Jerseys, shorts, tracksuits', sort_order: 1, is_active: 1 },
    { id: 12, parent_id: 5, sport_id: null, name: 'Women\'s Apparel', slug: 'womens-apparel', description: 'Sports tops, leggings, dresses', sort_order: 2, is_active: 1 },
  ]
  total += await batchInsert(conn, 'product_categories', ['id','parent_id','sport_id','name','slug','description','sort_order','is_active'], cats)
  ctx.categoryIds = cats.map(c => c.id)

  const sellers = []
  for (let i = 0; i < 5; i++) {
    sellers.push({
      id: i + 1,
      user_id: ctx.userIds[(i + 2) % ctx.userIds.length],
      shop_name: ['CourtZon Pro Shop','Sports Egypt','Elite Gear','Padel World Cairo','Fitness Hub EG'][i],
      shop_description: `Premium sports equipment store based in ${['Cairo','Alexandria','New Cairo','Heliopolis','Sheikh Zayed'][i]}`,
      shop_logo_url: `/images/shops/logo-${i + 1}.png`,
      is_subscribed: 1,
      subscription_expires_at: new Date(Date.now() + 86400000 * 365).toISOString().slice(0, 19).replace('T', ' '),
      max_free_listings: 5,
      total_listings: 10 + i * 3,
      is_active: 1,
    })
  }
  total += await batchInsert(conn, 'seller_profiles', ['id','user_id','shop_name','shop_description','shop_logo_url','is_subscribed','subscription_expires_at','max_free_listings','total_listings','is_active'], sellers)
  ctx.sellerIds = sellers.map(s => s.id)

  const products = []
  for (let i = 0; i < 60; i++) {
    const catId = cats[(i % cats.length)].id
    const sellerId = sellers[i % sellers.length].id
    const price = [350, 1200, 2500, 800, 150, 450, 600, 900, 300, 750][i % 10]
    const names = [
      'Wilson Pro Staff Tennis Racket','Bullpadel Vertex Padel Racket','Head Speed Tennis Racket',
      'Dunlop Sonic Core Squash Racket','Nike Mercurial Football Boots','Adidas Predator Football Boots',
      'Speedo Fastskin Swim Goggles','Arena Pro Swimsuit','GymPro 20kg Dumbbell Set','Yoga Mat Premium 6mm',
      'Nike Dri-FIT Training Top','Adidas Tiro Track Pants','Under Armour HeatGear Leggings',
      'Puma Evopower Shin Guards','Wilson Tour Tennis Balls (3-pack)','Bullpadel Premium Padel Balls',
      'Head Pro Grip Overgrips (10-pack)','Speedo Swim Cap Silicone','GymPro Resistance Bands Set',
      'Nike Elite Basketball',
    ]
    const status = i < 50 ? 'active' : (i < 55 ? 'draft' : 'archived')
    products.push({
      id: i + 1,
      seller_id: sellerId,
      category_id: catId,
      name: names[i % 20],
      description: `Professional-grade product designed for optimal performance. Suitable for athletes of all levels.`,
      price: price,
      compare_price: i % 3 === 0 ? Math.round(price * 1.2) : null,
      currency_code: 'EGP',
      quantity: 10 + (i * 3),
      reserved_quantity: 0,
      status: status,
      images: JSON.stringify([`/images/products/product-${(i % 20) + 1}.jpg`]),
      metadata: JSON.stringify({ brand: ['Wilson','Bullpadel','Head','Dunlop','Nike','Adidas','Speedo','Arena','GymPro','Generic'][i % 10], color: 'Various' }),
      is_active: 1,
    })
  }
  total += await batchInsert(conn, 'products', ['id','seller_id','category_id','name','description','price','compare_price','currency_code','quantity','reserved_quantity','status','images','metadata','is_active'], products)
  ctx.productIds = products.map(p => p.id)

  const variants = []
  let varId = 1
  for (const prod of products.slice(0, 20)) {
    const colors = [{ name: 'Black', adj: 0 }, { name: 'White', adj: 0 }]
    for (const c of colors) {
      variants.push({
        id: varId++,
        product_id: prod.id,
        sku: `SKU-${String(prod.id).padStart(5, '0')}-${c.name.toUpperCase().slice(0, 3)}`,
        variant_name: `${prod.name} - ${c.name}`,
        variant_type: 'color',
        price_adjustment: 0,
        quantity: 10 + (varId % 20),
        sort_order: colors.indexOf(c) + 1,
        is_active: 1,
      })
    }
  }
  total += await batchInsert(conn, 'product_variants', ['id','product_id','sku','variant_name','variant_type','price_adjustment','quantity','sort_order','is_active'], variants)

  const reviews = []
  let rvId = 1
  for (let i = 0; i < 120; i++) {
    const prod = products[i % products.length]
    const userId = ctx.userIds[(i + 5) % ctx.userIds.length]
    reviews.push({
      id: rvId++,
      product_id: prod.id,
      user_id: userId,
      rating: Math.floor(3 + Math.random() * 3),
      review_text: `Really happy with this purchase. ${['Perfect for my weekly matches.','Good quality for the price.','Delivered quickly and well packaged.','Would buy again.','My new favorite sports gear!'][i % 5]}`,
      is_verified_purchase: i % 2 === 0 ? 1 : 0,
    })
  }
  total += await batchInsert(conn, 'product_reviews', ['id','product_id','user_id','rating','review_text','is_verified_purchase'], reviews)

  const coupons = []
  for (let i = 0; i < 15; i++) {
    const code = ['WELCOME20','SPRING25','SUMMER15','PADEL10','COURTZON','FITNESS','TENNISPRO','SWIM20','EGYPT5','NEWUSER','SPORTS15','VIP25','GEAR10','PLAYMORE','BOOKING20'][i]
    coupons.push({
      id: i + 1,
      code: code,
      discount_type: i % 2 === 0 ? 'percentage' : 'fixed',
      discount_value: [20, 25, 15, 10, 15, 20, 20, 15, 5, 50, 15, 25, 10, 20, 20][i],
      min_order_amount: i % 2 === 0 ? 200.00 : null,
      max_uses: i % 3 === 0 ? 100 : null,
      max_uses_per_user: 1,
      starts_at: new Date(Date.now() - 86400000 * 60).toISOString().slice(0, 19).replace('T', ' '),
      expires_at: new Date(Date.now() + 86400000 * 120).toISOString().slice(0, 19).replace('T', ' '),
      is_active: 1,
    })
  }
  total += await batchInsert(conn, 'coupons', ['id','code','discount_type','discount_value','min_order_amount','max_uses','max_uses_per_user','starts_at','expires_at','is_active'], coupons)
  ctx.couponIds = coupons.map(c => c.id)

  const orders = []
  let ordId = 1
  for (let i = 0; i < 80; i++) {
    const userId = ctx.userIds[i % ctx.userIds.length]
    const ordDate = new Date(Date.now() - 86400000 * (60 - i))
    const subtotal = Math.round((300 + Math.random() * 2000) * 100) / 100
    const discount = i % 4 === 0 ? Math.round(subtotal * 0.2 * 100) / 100 : 0
    const shipping = i % 5 === 0 ? 50 : 0
    const tax = Math.round(subtotal * 0.14 * 100) / 100
    const totalVal = Math.round((subtotal - discount + shipping + tax) * 100) / 100
    const paidAt = i % 5 !== 4 ? ordDate.toISOString().slice(0, 19).replace('T', ' ') : null
    orders.push({
      id: ordId++,
      public_id: `ord${String(i + 1).padStart(8, '0')}-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      buyer_id: userId,
      status: ['delivered','delivered','delivered','shipped','cancelled'][i % 5],
      payment_status: ['paid','paid','paid','unpaid','refunded'][i % 5],
      subtotal: subtotal,
      shipping_cost: shipping,
      commission_amount: Math.round(subtotal * 0.1 * 100) / 100,
      coupon_id: i % 4 === 0 ? ctx.couponIds[i % ctx.couponIds.length] : null,
      discount_amount: discount,
      tax_amount: tax,
      total: totalVal,
      currency_code: 'EGP',
      payment_method: ['card','wallet','cash','bank_transfer','card'][i % 5],
      shipping_address: JSON.stringify({ full_name: `User ${userId}`, phone: '+2010xxxxxxx', city: 'Cairo', street: '123 Main St' }),
      notes: i % 10 === 0 ? 'Gift wrap please' : null,
      paid_at: paidAt,
      created_at: ordDate.toISOString().slice(0, 19).replace('T', ' '),
    })
  }
  total += await batchInsert(conn, 'orders', ['id','public_id','buyer_id','status','payment_status','subtotal','shipping_cost','commission_amount','coupon_id','discount_amount','tax_amount','total','currency_code','payment_method','shipping_address','notes','paid_at','created_at'], orders)
  ctx.orderIds = orders.map(o => o.id)

  const orderItems = []
  let oiId = 1
  for (const order of orders) {
    const itemCount = 1 + (order.id % 3)
    for (let j = 0; j < itemCount; j++) {
      const prod = products[(order.id + j) % products.length]
      const qty = 1 + (j % 2)
      orderItems.push({
        id: oiId++,
        order_id: order.id,
        product_id: prod.id,
        variant_id: null,
        seller_id: sellers[j % sellers.length].id,
        quantity: qty,
        unit_price: prod.price,
        total_price: prod.price * qty,
        commission_rate: 10.00,
        commission_amount: Math.round(prod.price * qty * 0.1 * 100) / 100,
      })
    }
  }
  total += await batchInsert(conn, 'order_items', ['id','order_id','product_id','variant_id','seller_id','quantity','unit_price','total_price','commission_rate','commission_amount'], orderItems)

  const hist = []
  let hsId = 1
  for (const order of orders) {
    const statusFlow = ['pending','confirmed','processing','shipped','delivered']
    if (order.status === 'cancelled') {
      hist.push({ id: hsId++, order_id: order.id, from_status: 'pending', to_status: 'cancelled', changed_by: order.buyer_id, changed_by_role: 'buyer', note: 'Order cancelled', created_at: new Date(new Date(order.created_at).getTime() + 3600000).toISOString().slice(0, 19).replace('T', ' ') })
    } else {
      for (let s = 0; s < statusFlow.indexOf(order.status); s++) {
        hist.push({
          id: hsId++,
          order_id: order.id,
          from_status: statusFlow[s],
          to_status: statusFlow[s + 1],
          changed_by: order.buyer_id,
          changed_by_role: 'system',
          note: null,
          created_at: new Date(new Date(order.created_at).getTime() + 3600000 * (s + 1)).toISOString().slice(0, 19).replace('T', ' '),
        })
      }
    }
  }
  total += await batchInsert(conn, 'order_status_history', ['id','order_id','from_status','to_status','changed_by','changed_by_role','note','created_at'], hist)

  const couponUsage = []
  let cuId = 1
  for (let i = 0; i < 30; i++) {
    couponUsage.push({
      id: cuId++,
      coupon_id: ctx.couponIds[i % ctx.couponIds.length],
      order_id: ctx.orderIds[i % ctx.orderIds.length],
      user_id: ctx.userIds[i % ctx.userIds.length],
      used_at: NOW,
    })
  }
  total += await batchInsert(conn, 'coupon_usage', ['id','coupon_id','order_id','user_id','used_at'], couponUsage)

  const cartItems = []
  let ciId = 1
  for (let i = 0; i < 40; i++) {
    const prod = products[i % products.length]
    cartItems.push({
      id: ciId++,
      user_id: ctx.userIds[i % ctx.userIds.length],
      product_id: prod.id,
      variant_id: null,
      quantity: 1 + (i % 3),
      reserved_until: new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' '),
    })
  }
  total += await batchInsert(conn, 'cart_items', ['id','user_id','product_id','variant_id','quantity','reserved_until'], cartItems)

  const wishItems = []
  let wiId = 1
  for (let i = 0; i < 25; i++) {
    wishItems.push({
      id: wiId++,
      user_id: ctx.userIds[i % ctx.userIds.length],
      product_id: products[i % products.length].id,
    })
  }
  total += await batchInsert(conn, 'wishlist_items', ['id','user_id','product_id'], wishItems)

  const sellerSubs = []
  for (let i = 0; i < sellers.length; i++) {
    sellerSubs.push({
      id: i + 1,
      seller_id: sellers[i].id,
      price: [0, 999, 2499, 0, 999][i],
      currency_code: 'EGP',
      is_active: 1,
    })
  }
  total += await batchInsert(conn, 'seller_subscriptions', ['id','seller_id','price','currency_code','is_active'], sellerSubs)

  return total
}
