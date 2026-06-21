import { batchInsert } from '../run.mjs'

const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')
function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16) }) }

export default async function seed(conn, ctx) {
  let total = 0

  const placements = [
    { id: 1, placement_key: 'homepage-banner', name: 'Homepage Banner', description: 'Main banner on homepage', dimensions: '1200x400', max_ads: 1, is_active: 1 },
    { id: 2, placement_key: 'sidebar-widget', name: 'Sidebar Widget', description: 'Sidebar advertisement', dimensions: '300x250', max_ads: 2, is_active: 1 },
    { id: 3, placement_key: 'booking-confirmation', name: 'Booking Confirmation', description: 'Ad shown on booking confirmation page', dimensions: '728x90', max_ads: 1, is_active: 1 },
    { id: 4, placement_key: 'mobile-banner', name: 'Mobile Banner', description: 'Mobile app banner', dimensions: '320x100', max_ads: 1, is_active: 1 },
    { id: 5, placement_key: 'search-results', name: 'Search Results', description: 'Ad between search results', dimensions: '600x200', max_ads: 2, is_active: 1 },
  ]
  total += await batchInsert(conn, 'ad_placements', ['id','placement_key','name','description','dimensions','max_ads','is_active'], placements)

  const campaigns = []
  for (let i = 0; i < 8; i++) {
    const startDate = new Date(Date.now() - 86400000 * (15 - i * 7))
    campaigns.push({
      id: i + 1,
      organisation_id: ctx.orgIds[i % ctx.orgIds.length],
      placement_id: placements[i % placements.length].id,
      name: ['Summer Sports Campaign','Padel Launch Promo','New Court Opening','Fitness Challenge','Tennis Tournament Ads','Kids Academy Campaign','Womens Sports Campaign','Holiday Special'][i],
      start_date: startDate.toISOString().slice(0, 19).replace('T', ' '),
      end_date: new Date(startDate.getTime() + 86400000 * 30).toISOString().slice(0, 19).replace('T', ' '),
      daily_budget: Math.round((200 + Math.random() * 500) * 100) / 100,
      total_budget: Math.round((5000 + Math.random() * 50000) * 100) / 100,
      currency_code: 'EGP',
      status: i < 5 ? 'active' : 'ended',
      created_by: ctx.userIds[i % ctx.userIds.length],
    })
  }
  total += await batchInsert(conn, 'ad_campaigns', ['id','organisation_id','placement_id','name','start_date','end_date','daily_budget','total_budget','currency_code','status','created_by'], campaigns)
  ctx.adCampaignIds = campaigns.map(c => c.id)

  const creatives = []
  let crvId = 1
  for (let i = 0; i < 15; i++) {
    creatives.push({
      id: crvId++,
      campaign_id: ctx.adCampaignIds[i % ctx.adCampaignIds.length],
      image_url: `/images/ads/creative-${(i % 5) + 1}.jpg`,
      click_url: 'https://courtzon.com/bookings',
      alt_text: ['Play More!','Join the Game!','Book Now!','New Courts!','Train Like a Pro!'][i % 5],
      sort_order: i % 3 + 1,
      is_active: 1,
    })
  }
  total += await batchInsert(conn, 'ad_creatives', ['id','campaign_id','image_url','click_url','alt_text','sort_order','is_active'], creatives)

  const rules = []
  let rlId = 1
  for (let i = 0; i < 10; i++) {
    rules.push({
      id: rlId++,
      campaign_id: ctx.adCampaignIds[i % ctx.adCampaignIds.length],
      countries: JSON.stringify(['EG','SA','AE']),
      sports: JSON.stringify([1, 2, 3]),
      player_levels: JSON.stringify([1, 2, 3]),
      age_min: 18,
      age_max: 45,
      gender: 'all',
      user_types: JSON.stringify(['player','coach']),
    })
  }
  total += await batchInsert(conn, 'ad_targeting_rules', ['id','campaign_id','countries','sports','player_levels','age_min','age_max','gender','user_types'], rules)

  const pricing = [
    { id: 1, placement_id: 1, pricing_model: 'cpm', price: 50.00, currency_code: 'EGP', is_active: 1 },
    { id: 2, placement_id: 2, pricing_model: 'cpc', price: 2.50, currency_code: 'EGP', is_active: 1 },
    { id: 3, placement_id: 3, pricing_model: 'flat', price: 150.00, currency_code: 'EGP', is_active: 1 },
    { id: 4, placement_id: 4, pricing_model: 'cpm', price: 40.00, currency_code: 'EGP', is_active: 1 },
  ]
  total += await batchInsert(conn, 'ad_pricing', ['id','placement_id','pricing_model','price','currency_code','is_active'], pricing)

  const impressions = []
  let impId = 1
  for (let i = 0; i < 100; i++) {
    impressions.push({
      id: impId++,
      campaign_id: ctx.adCampaignIds[i % ctx.adCampaignIds.length],
      creative_id: creatives[i % creatives.length].id,
      user_id: ctx.userIds[i % ctx.userIds.length],
      placement_key: placements[i % placements.length].placement_key,
      ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      cost: 0.05,
      served_at: new Date(Date.now() - 86400000 * (7 - i % 7)).toISOString().slice(0, 19).replace('T', ' '),
    })
  }
  total += await batchInsert(conn, 'ad_impressions', ['id','campaign_id','creative_id','user_id','placement_key','ip_address','user_agent','cost','served_at'], impressions)

  const clicks = []
  let clkId = 1
  for (let i = 0; i < 40; i++) {
    clicks.push({
      id: clkId++,
      impression_id: impressions[i % impressions.length].id,
      campaign_id: ctx.adCampaignIds[i % ctx.adCampaignIds.length],
      creative_id: creatives[i % creatives.length].id,
      user_id: ctx.userIds[i % ctx.userIds.length],
      clicked_at: new Date(Date.now() - 86400000 * (7 - i % 7)).toISOString().slice(0, 19).replace('T', ' '),
      cost: 2.50,
    })
  }
  total += await batchInsert(conn, 'ad_clicks', ['id','impression_id','campaign_id','creative_id','user_id','clicked_at','cost'], clicks)

  const pages = [
    { id: 1, title: 'About Us', slug: 'about-us', content: '<h1>About CourtZon</h1><p>Egypt premier sports booking platform.</p>', meta_title: 'About CourtZon', meta_description: 'Learn about CourtZon', is_published: 1, published_at: NOW, created_by: ctx.userIds[0] },
    { id: 2, title: 'Privacy Policy', slug: 'privacy-policy', content: '<h1>Privacy Policy</h1><p>Your privacy is important...</p>', meta_title: 'Privacy Policy', is_published: 1, published_at: NOW, created_by: ctx.userIds[0] },
    { id: 3, title: 'Terms of Service', slug: 'terms-of-service', content: '<h1>Terms of Service</h1><p>By using CourtZon you agree...</p>', meta_title: 'Terms of Service', is_published: 1, published_at: NOW, created_by: ctx.userIds[0] },
    { id: 4, title: 'Contact Us', slug: 'contact-us', content: '<h1>Contact Us</h1><p>Reach out to our support team...</p>', meta_title: 'Contact CourtZon', is_published: 1, published_at: NOW, created_by: ctx.userIds[1] },
    { id: 5, title: 'FAQ', slug: 'faq', content: '<h1>FAQ</h1><p>Find answers...</p>', meta_title: 'FAQ', is_published: 0, created_by: ctx.userIds[1] },
  ]
  total += await batchInsert(conn, 'cms_pages', ['id','title','slug','content','meta_title','meta_description','is_published','published_at','created_by'], pages)

  const sections = [
    { id: 1, page_id: 1, section_key: 'mission', title: 'Our Mission', content: '<p>To make sports accessible to everyone.</p>', sort_order: 1, is_active: 1 },
    { id: 2, page_id: 1, section_key: 'team', title: 'Our Team', content: '<p>Dedicated team of sports enthusiasts.</p>', sort_order: 2, is_active: 1 },
    { id: 3, page_id: 4, section_key: 'address', title: 'Address', content: '<p>123 Sports Avenue, New Cairo</p>', sort_order: 1, is_active: 1 },
    { id: 4, page_id: 4, section_key: 'phone', title: 'Phone', content: '<p>01012637733</p>', sort_order: 2, is_active: 1 },
  ]
  total += await batchInsert(conn, 'cms_sections', ['id','page_id','section_key','title','content','sort_order','is_active'], sections)

  const blogs = [
    { id: 1, title: 'Top 10 Padel Tips for Beginners', slug: 'padel-tips-beginners', content: '<article>Tips...</article>', excerpt: 'New to padel?', author_id: ctx.userIds[6], cover_image: '/images/blog/padel-tips.jpg', is_published: 1, published_at: new Date(Date.now() - 86400000 * 30).toISOString().slice(0, 19).replace('T', ' ') },
    { id: 2, title: 'Best Tennis Courts in Cairo', slug: 'best-tennis-courts-cairo', content: '<article>Courts...</article>', excerpt: 'Where to play tennis', author_id: ctx.userIds[8], cover_image: '/images/blog/tennis-courts.jpg', is_published: 1, published_at: new Date(Date.now() - 86400000 * 20).toISOString().slice(0, 19).replace('T', ' ') },
    { id: 3, title: 'Summer Fitness Guide 2026', slug: 'summer-fitness-2026', content: '<article>Fitness...</article>', excerpt: 'Stay active this summer', author_id: ctx.userIds[0], cover_image: '/images/blog/fitness.jpg', is_published: 1, published_at: new Date(Date.now() - 86400000 * 10).toISOString().slice(0, 19).replace('T', ' ') },
  ]
  total += await batchInsert(conn, 'cms_blogs', ['id','title','slug','content','excerpt','author_id','cover_image','is_published','published_at'], blogs)

  const translations = []
  let tlId = 1
  const trans = {
    'site.title': { en: 'CourtZon', ar: 'كورت زون' },
    'nav.bookings': { en: 'Bookings', ar: 'الحجوزات' },
    'nav.courts': { en: 'Courts', ar: 'الملاعب' },
    'button.book_now': { en: 'Book Now', ar: 'احجز الآن' },
    'button.cancel': { en: 'Cancel', ar: 'إلغاء' },
    'label.price': { en: 'Price', ar: 'السعر' },
    'message.welcome': { en: 'Welcome back!', ar: 'مرحباً بعودتك!' },
  }
  for (const [key, vals] of Object.entries(trans)) {
    translations.push({ id: tlId++, key: key, locale: 'en', value: vals.en, is_auto: 0 })
    translations.push({ id: tlId++, key: key, locale: 'ar', value: vals.ar, is_auto: 0 })
  }
  total += await batchInsert(conn, 'translations', ['id','key','locale','value','is_auto'], translations)

  const uploads = []
  for (let i = 0; i < 20; i++) {
    uploads.push({
      id: i + 1,
      owner_type: ['profile','booking','product','cms','announcement'][i % 5],
      owner_id: (i % 50) + 1,
      file_url: `https://courtzon.com/uploads/images/${(i % 10) + 1}.jpg`,
      file_type: 'image/jpeg',
      file_size: Math.floor(50000 + Math.random() * 500000),
      file_name: `photo_${i + 1}.jpg`,
      alt_text: `Upload ${i + 1}`,
      sort_order: 0,
      uploaded_by: ctx.userIds[i % ctx.userIds.length],
    })
  }
  total += await batchInsert(conn, 'media_uploads', ['id','owner_type','owner_id','file_url','file_type','file_size','file_name','alt_text','sort_order','uploaded_by'], uploads)

  const verTokens = []
  for (let i = 0; i < 5; i++) {
    verTokens.push({ id: i + 1, user_id: ctx.userIds[i], token: uuid(), expires_at: new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' '), is_used: i < 3 ? 1 : 0 })
  }
  total += await batchInsert(conn, 'email_verification_tokens', ['id','user_id','token','expires_at','is_used'], verTokens)

  const resetTokens = []
  for (let i = 0; i < 5; i++) {
    resetTokens.push({ id: i + 1, user_id: ctx.userIds[i], token: uuid(), expires_at: new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' '), used_at: i < 2 ? NOW : null })
  }
  total += await batchInsert(conn, 'password_reset_tokens', ['id','user_id','token','expires_at','used_at'], resetTokens)

  const follows = []
  let fwId = 1
  for (let i = 0; i < 30; i++) {
    follows.push({ id: fwId++, follower_id: ctx.userIds[i % ctx.userIds.length], following_id: ctx.userIds[(i + 3) % ctx.userIds.length] })
  }
  total += await batchInsert(conn, 'user_follows', ['id','follower_id','following_id'], follows)

  const friends = []
  let frId = 1
  for (let i = 0; i < 20; i++) {
    friends.push({
      id: frId++,
      requester_id: ctx.userIds[i % ctx.userIds.length],
      addressee_id: ctx.userIds[(i + 5) % ctx.userIds.length],
      status: i < 15 ? 'accepted' : 'pending',
    })
  }
  total += await batchInsert(conn, 'user_friends', ['id','requester_id','addressee_id','status'], friends)

  const cronJobs = [
    { id: 1, job_name: 'Send booking reminders', handler: 'notifications:send-reminders', cron_expression: '*/15 * * * *', is_active: 1 },
    { id: 2, job_name: 'Process expired bookings', handler: 'bookings:process-expired', cron_expression: '0 * * * *', is_active: 1 },
    { id: 3, job_name: 'Weekly analytics summary', handler: 'analytics:weekly-summary', cron_expression: '0 8 * * 1', is_active: 1 },
  ]
  total += await batchInsert(conn, 'cron_jobs', ['id','job_name','handler','cron_expression','is_active'], cronJobs)

  const scheduled = []
  for (let i = 0; i < 10; i++) {
    scheduled.push({
      id: i + 1,
      job_type: ['SendBookingReminder','ProcessPayment','GenerateReport','SendNotification','CleanupTempFiles'][i % 5],
      payload: JSON.stringify({ reference_id: i + 1 }),
      priority: 0,
      status: i < 4 ? 'completed' : 'pending',
      scheduled_at: new Date(Date.now() + 3600000 * (i + 1)).toISOString().slice(0, 19).replace('T', ' '),
      started_at: i < 4 ? NOW : null,
      completed_at: i < 4 ? NOW : null,
      error_message: null,
    })
  }
  total += await batchInsert(conn, 'scheduled_jobs', ['id','job_type','payload','priority','status','scheduled_at','started_at','completed_at','error_message'], scheduled)

  const revertLogs = []
  for (let i = 0; i < 5; i++) {
    revertLogs.push({
      id: i + 1,
      super_admin_id: ctx.userIds[0],
      audit_log_id: (i + 1),
      reason: `Reverting ${['user','booking','resource','order','product'][i]} update`,
      reverted_state: JSON.stringify({ status: 'active' }),
    })
  }
  total += await batchInsert(conn, 'revert_logs', ['id','super_admin_id','audit_log_id','reason','reverted_state'], revertLogs)

  const scopes = []
  let scId = 1
  for (let i = 0; i < 10; i++) {
    scopes.push({
      id: scId++,
      user_role_id: ctx.userIds[(i + 2) % ctx.userIds.length],
      scope_type: i < 5 ? 'organisation' : 'branch',
      scope_id: i < 5 ? ctx.orgIds[i % ctx.orgIds.length] : ctx.branchIds[i % ctx.branchIds.length],
    })
  }
  total += await batchInsert(conn, 'user_role_scopes', ['id','user_role_id','scope_type','scope_id'], scopes)

  return total
}
