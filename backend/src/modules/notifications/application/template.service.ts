import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

export interface NotificationTemplate {
  id: number;
  eventName: string;
  locale: string;
  categorySlug: string;
  type: string;
  priority: string;
  titleTemplate: string;
  bodyTemplate: string | null;
  actionKey: string | null;
  routePattern: string | null;
  imageUrl: string | null;
  actions: any[] | null;
  version: number;
}

const DEFAULT_LOCALE = 'en';
const templateCache = new Map<string, NotificationTemplate>();

export async function getTemplate(eventName: string, locale: string = DEFAULT_LOCALE): Promise<NotificationTemplate | null> {
  const cacheKey = `${eventName}:${locale}`;
  const cached = templateCache.get(cacheKey);
  if (cached) return cached;

  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM notification_templates
     WHERE event_name = ? AND locale = ? AND is_active = TRUE
     LIMIT 1`,
    [eventName, locale],
  );

  if (rows.length) {
    const tpl = mapRow(rows[0]);
    templateCache.set(cacheKey, tpl);
    return tpl;
  }

  if (locale !== DEFAULT_LOCALE) {
    return getTemplate(eventName, DEFAULT_LOCALE);
  }

  return null;
}

export function resolveTemplate(tpl: NotificationTemplate, data: Record<string, any>): { title: string; body: string | null } {
  const title = replacePlaceholders(tpl.titleTemplate, data);
  const body = tpl.bodyTemplate ? replacePlaceholders(tpl.bodyTemplate, data) : null;
  return { title, body };
}

function replacePlaceholders(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = resolveNested(data, key);
    if (val === null || val === undefined) return `{{${key}}}`;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });
}

function resolveNested(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function mapRow(row: any): NotificationTemplate {
  return {
    id: row.id,
    eventName: row.event_name,
    locale: row.locale,
    categorySlug: row.category_slug,
    type: row.type,
    priority: row.priority,
    titleTemplate: row.title_template,
    bodyTemplate: row.body_template,
    actionKey: row.action_key,
    routePattern: row.route_pattern,
    imageUrl: row.image_url,
    actions: row.actions ? (typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions) : null,
    version: row.version || 1,
  };
}

export async function seedTemplates(): Promise<void> {
  const pool = getPool();

  const templates: Array<{
    eventName: string; locale: string; categorySlug: string; type: string; priority: string;
    titleTemplate: string; bodyTemplate: string; actionKey: string; routePattern: string;
  }> = [
    // Bookings
    { eventName: 'booking:created', locale: 'en', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'New Booking Created', bodyTemplate: 'Your booking #{{bookingId}} has been created successfully.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:created', locale: 'ar', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'تم إنشاء حجز جديد', bodyTemplate: 'تم إنشاء الحجز رقم {{bookingId}} بنجاح.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:confirmed', locale: 'en', categorySlug: 'bookings', type: 'success', priority: 'high',
      titleTemplate: 'Booking Confirmed', bodyTemplate: 'Booking #{{bookingId}} has been confirmed.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:confirmed', locale: 'ar', categorySlug: 'bookings', type: 'success', priority: 'high',
      titleTemplate: 'تم تأكيد الحجز', bodyTemplate: 'تم تأكيد الحجز رقم {{bookingId}}.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:cancelled', locale: 'en', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'Booking Cancelled', bodyTemplate: 'Booking #{{bookingId}} has been cancelled{{#if reason}}: {{reason}}{{/if}}.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:cancelled', locale: 'ar', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'تم إلغاء الحجز', bodyTemplate: 'تم إلغاء الحجز رقم {{bookingId}}.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:reminder', locale: 'en', categorySlug: 'bookings', type: 'reminder', priority: 'high',
      titleTemplate: 'Booking Reminder', bodyTemplate: 'Your booking #{{bookingId}} starts at {{startTime}}.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:reminder', locale: 'ar', categorySlug: 'bookings', type: 'reminder', priority: 'high',
      titleTemplate: 'تذكير بالحجز', bodyTemplate: 'حجزك رقم {{bookingId}} يبدأ في {{startTime}}.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:completed', locale: 'en', categorySlug: 'bookings', type: 'success', priority: 'normal',
      titleTemplate: 'Booking Completed', bodyTemplate: 'Your booking #{{bookingId}} has been completed. Thank you!',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:completed', locale: 'ar', categorySlug: 'bookings', type: 'success', priority: 'normal',
      titleTemplate: 'اكتمل الحجز', bodyTemplate: 'اكتمل حجزك رقم {{bookingId}}. شكراً لك!',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },

    // Payments
    { eventName: 'payment:completed', locale: 'en', categorySlug: 'payments', type: 'success', priority: 'high',
      titleTemplate: 'Payment Completed', bodyTemplate: 'Payment of {{currency}} {{amount}} via {{gateway}} completed successfully.',
      actionKey: 'view_payment', routePattern: '/payments/{{paymentId}}' },
    { eventName: 'payment:completed', locale: 'ar', categorySlug: 'payments', type: 'success', priority: 'high',
      titleTemplate: 'تم الدفع', bodyTemplate: 'تم دفع {{currency}} {{amount}} عبر {{gateway}} بنجاح.',
      actionKey: 'view_payment', routePattern: '/payments/{{paymentId}}' },
    { eventName: 'payment:failed', locale: 'en', categorySlug: 'payments', type: 'error', priority: 'high',
      titleTemplate: 'Payment Failed', bodyTemplate: 'Payment of {{currency}} {{amount}} failed: {{error}}',
      actionKey: 'view_payment', routePattern: '/payments/{{paymentId}}' },
    { eventName: 'payment:failed', locale: 'ar', categorySlug: 'payments', type: 'error', priority: 'high',
      titleTemplate: 'فشل الدفع', bodyTemplate: 'فشل دفع {{currency}} {{amount}}: {{error}}',
      actionKey: 'view_payment', routePattern: '/payments/{{paymentId}}' },
    { eventName: 'payment:refunded', locale: 'en', categorySlug: 'payments', type: 'info', priority: 'normal',
      titleTemplate: 'Payment Refunded', bodyTemplate: 'Refund of {{amount}} processed for payment #{{paymentId}}.',
      actionKey: 'view_payment', routePattern: '/payments/{{paymentId}}' },
    { eventName: 'payment:refunded', locale: 'ar', categorySlug: 'payments', type: 'info', priority: 'normal',
      titleTemplate: 'تم استرداد المبلغ', bodyTemplate: 'تم استرداد {{amount}} للدفعة رقم {{paymentId}}.',
      actionKey: 'view_payment', routePattern: '/payments/{{paymentId}}' },
    { eventName: 'payment:wallet-low-balance', locale: 'en', categorySlug: 'payments', type: 'warning', priority: 'low',
      titleTemplate: 'Low Wallet Balance', bodyTemplate: 'Your wallet balance is {{currency}} {{balance}}. Please top up soon.',
      actionKey: 'view_wallet', routePattern: '/wallet' },
    { eventName: 'payment:wallet-low-balance', locale: 'ar', categorySlug: 'payments', type: 'warning', priority: 'low',
      titleTemplate: 'رصيد المحفظة منخفض', bodyTemplate: 'رصيد محفظتك هو {{currency}} {{balance}}. يرجى إعادة الشحن قريباً.',
      actionKey: 'view_wallet', routePattern: '/wallet' },

    // Marketplace
    { eventName: 'marketplace:order-placed', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'New Order Placed', bodyTemplate: 'Order #{{orderId}} has been placed ({{total}}).',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-placed', locale: 'ar', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'طلب جديد', bodyTemplate: 'تم تقديم الطلب رقم {{orderId}} بقيمة {{total}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-shipped', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'Order Shipped', bodyTemplate: 'Order #{{orderId}} has been shipped{{#if trackingNumber}}. Tracking: {{trackingNumber}}{{/if}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-shipped', locale: 'ar', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'تم الشحن', bodyTemplate: 'تم شحن الطلب رقم {{orderId}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-delivered', locale: 'en', categorySlug: 'marketplace', type: 'success', priority: 'normal',
      titleTemplate: 'Order Delivered', bodyTemplate: 'Order #{{orderId}} has been delivered. Enjoy!',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-delivered', locale: 'ar', categorySlug: 'marketplace', type: 'success', priority: 'normal',
      titleTemplate: 'تم التوصيل', bodyTemplate: 'تم توصيل الطلب رقم {{orderId}}. استمتع!',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:new-review', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'low',
      titleTemplate: 'New Review', bodyTemplate: 'You received a {{rating}}-star review.',
      actionKey: 'view_review', routePattern: '/marketplace/products/{{productId}}' },
    { eventName: 'marketplace:new-review', locale: 'ar', categorySlug: 'marketplace', type: 'info', priority: 'low',
      titleTemplate: 'تقييم جديد', bodyTemplate: 'لقد تلقيت تقييماً بـ {{rating}} نجوم.',
      actionKey: 'view_review', routePattern: '/marketplace/products/{{productId}}' },
    { eventName: 'marketplace:product-back-in-stock', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'Back in Stock', bodyTemplate: '{{productName}} is back in stock!',
      actionKey: 'view_product', routePattern: '/marketplace/products/{{productId}}' },
    { eventName: 'marketplace:product-back-in-stock', locale: 'ar', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'متوفر مرة أخرى', bodyTemplate: '{{productName}} متوفر مرة أخرى!',
      actionKey: 'view_product', routePattern: '/marketplace/products/{{productId}}' },
    { eventName: 'marketplace:price-drop', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'Price Drop', bodyTemplate: '{{productName}} dropped from {{oldPrice}} to {{newPrice}}!',
      actionKey: 'view_product', routePattern: '/marketplace/products/{{productId}}' },
    { eventName: 'marketplace:price-drop', locale: 'ar', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'تخفيض السعر', bodyTemplate: '{{productName}} انخفض من {{oldPrice}} إلى {{newPrice}}!',
      actionKey: 'view_product', routePattern: '/marketplace/products/{{productId}}' },

    // User & Auth
    { eventName: 'user:registered', locale: 'en', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'New User Registered', bodyTemplate: 'User {{email}} has registered.',
      actionKey: 'view_user', routePattern: '/admin/users/{{userId}}' },
    { eventName: 'user:registered', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'مستخدم جديد', bodyTemplate: 'قام المستخدم {{email}} بالتسجيل.',
      actionKey: 'view_user', routePattern: '/admin/users/{{userId}}' },
    { eventName: 'user:approved', locale: 'en', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'Account Approved', bodyTemplate: 'Your account has been approved with role: {{role}}.',
      actionKey: 'view_dashboard', routePattern: '/app' },
    { eventName: 'user:approved', locale: 'ar', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'تم الموافقة على الحساب', bodyTemplate: 'تمت الموافقة على حسابك بدور: {{role}}.',
      actionKey: 'view_dashboard', routePattern: '/app' },
    { eventName: 'auth:password-changed', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Password Changed', bodyTemplate: 'Your password has been changed successfully.',
      actionKey: 'view_settings', routePattern: '/profile/settings' },
    { eventName: 'auth:password-changed', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'تم تغيير كلمة المرور', bodyTemplate: 'تم تغيير كلمة المرور بنجاح.',
      actionKey: 'view_settings', routePattern: '/profile/settings' },

    // Friend requests
    { eventName: 'friend:request', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Friend Request', bodyTemplate: '{{fromUserName}} sent you a friend request.',
      actionKey: 'view_friends', routePattern: '/friends' },
    { eventName: 'friend:request', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'طلب صداقة', bodyTemplate: 'أرسل لك {{fromUserName}} طلب صداقة.',
      actionKey: 'view_friends', routePattern: '/friends' },
    { eventName: 'friend:accepted', locale: 'en', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'Friend Request Accepted', bodyTemplate: 'Your friend request has been accepted!',
      actionKey: 'view_friends', routePattern: '/friends' },
    { eventName: 'friend:accepted', locale: 'ar', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'تم قبول طلب الصداقة', bodyTemplate: 'تم قبول طلب الصداقة!',
      actionKey: 'view_friends', routePattern: '/friends' },

    // Organisation
    { eventName: 'organisation:approved', locale: 'en', categorySlug: 'system', type: 'success', priority: 'high',
      titleTemplate: 'Organisation Approved', bodyTemplate: '{{name}} has been approved!',
      actionKey: 'view_organisation', routePattern: '/org/{{organisationId}}' },
    { eventName: 'organisation:approved', locale: 'ar', categorySlug: 'system', type: 'success', priority: 'high',
      titleTemplate: 'تمت الموافقة على المنشأة', bodyTemplate: 'تمت الموافقة على {{name}}!',
      actionKey: 'view_organisation', routePattern: '/org/{{organisationId}}' },
    { eventName: 'organisation:subscription-expiring', locale: 'en', categorySlug: 'system', type: 'warning', priority: 'high',
      titleTemplate: 'Subscription Expiring Soon', bodyTemplate: 'Your {{planName}} subscription expires in {{daysLeft}} days.',
      actionKey: 'view_subscription', routePattern: '/org/{{organisationId}}/subscription' },
    { eventName: 'organisation:subscription-expiring', locale: 'ar', categorySlug: 'system', type: 'warning', priority: 'high',
      titleTemplate: 'الاشتراك على وشك الانتهاء', bodyTemplate: 'سينتهي اشتراكك في {{planName}} بعد {{daysLeft}} أيام.',
      actionKey: 'view_subscription', routePattern: '/org/{{organisationId}}/subscription' },

    // Membership
    { eventName: 'membership:expiring', locale: 'en', categorySlug: 'system', type: 'warning', priority: 'normal',
      titleTemplate: 'Membership Expiring', bodyTemplate: 'Your {{type}} membership expires in {{daysLeft}} days.',
      actionKey: 'view_membership', routePattern: '/memberships' },
    { eventName: 'membership:expiring', locale: 'ar', categorySlug: 'system', type: 'warning', priority: 'normal',
      titleTemplate: 'العضوية على وشك الانتهاء', bodyTemplate: 'ستنتهي عضويتك في {{type}} بعد {{daysLeft}} أيام.',
      actionKey: 'view_membership', routePattern: '/memberships' },
    { eventName: 'membership:expired', locale: 'en', categorySlug: 'system', type: 'error', priority: 'normal',
      titleTemplate: 'Membership Expired', bodyTemplate: 'Your {{type}} membership has expired. Renew now!',
      actionKey: 'renew_membership', routePattern: '/memberships/renew' },
    { eventName: 'membership:expired', locale: 'ar', categorySlug: 'system', type: 'error', priority: 'normal',
      titleTemplate: 'انتهت العضوية', bodyTemplate: 'انتهت عضويتك في {{type}}. جدد الآن!',
      actionKey: 'renew_membership', routePattern: '/memberships/renew' },

    // System
    { eventName: 'system:announcement', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: '{{title}}', bodyTemplate: '{{body}}',
      actionKey: 'view_announcement', routePattern: '/app' },
    { eventName: 'system:announcement', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: '{{title}}', bodyTemplate: '{{body}}',
      actionKey: 'view_announcement', routePattern: '/app' },
    { eventName: 'system:birthday', locale: 'en', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'Happy Birthday!', bodyTemplate: 'Happy Birthday, {{name}}! Enjoy your special day.',
      actionKey: 'view_dashboard', routePattern: '/app' },
    { eventName: 'system:birthday', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'عيد ميلاد سعيد!', bodyTemplate: 'عيد ميلاد سعيد، {{name}}! استمتع بيومك الخاص.',
      actionKey: 'view_dashboard', routePattern: '/app' },
    { eventName: 'system:digest', locale: 'en', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'Notification Summary', bodyTemplate: 'You have {{count}} new notifications.',
      actionKey: 'view_notifications', routePattern: '/notifications' },
    { eventName: 'system:digest', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'ملخص الإشعارات', bodyTemplate: 'لديك {{count}} إشعارات جديدة.',
      actionKey: 'view_notifications', routePattern: '/notifications' },

    // Academy
    { eventName: 'academy:enrolled', locale: 'en', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'Enrolled in Academy', bodyTemplate: '{{studentName}} has been enrolled successfully.',
      actionKey: 'view_academy', routePattern: '/academies/{{academyId}}' },
    { eventName: 'academy:session-reminder', locale: 'en', categorySlug: 'system', type: 'reminder', priority: 'high',
      titleTemplate: 'Session Reminder', bodyTemplate: 'Your session at {{academyName}} starts at {{startTime}}.',
      actionKey: 'view_session', routePattern: '/sessions/{{sessionId}}' },

    // Coaching
    { eventName: 'coaching:session-scheduled', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Coaching Session Scheduled', bodyTemplate: 'Your coaching session is scheduled for {{startTime}}.',
      actionKey: 'view_session', routePattern: '/sessions/{{sessionId}}' },
    { eventName: 'coaching:session-reminder', locale: 'en', categorySlug: 'system', type: 'reminder', priority: 'high',
      titleTemplate: 'Coaching Session Reminder', bodyTemplate: 'Your session with {{coachName}} starts at {{startTime}}.',
      actionKey: 'view_session', routePattern: '/sessions/{{sessionId}}' },
    { eventName: 'coaching:session-cancelled', locale: 'en', categorySlug: 'system', type: 'warning', priority: 'high',
      titleTemplate: 'Coaching Session Cancelled', bodyTemplate: 'Your coaching session has been cancelled{{#if reason}}: {{reason}}{{/if}}.',
      actionKey: 'view_sessions', routePattern: '/coaching' },

    // Tournaments
    { eventName: 'tournament:created', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'New Tournament', bodyTemplate: '{{name}} tournament has been created.',
      actionKey: 'view_tournament', routePattern: '/tournaments/{{tournamentId}}' },
    { eventName: 'tournament:starting-soon', locale: 'en', categorySlug: 'system', type: 'reminder', priority: 'high',
      titleTemplate: 'Tournament Starting Soon', bodyTemplate: '{{name}} starts on {{startDate}}. Get ready!',
      actionKey: 'view_tournament', routePattern: '/tournaments/{{tournamentId}}' },
    { eventName: 'tournament:match-scheduled', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Match Scheduled', bodyTemplate: 'Your match against {{opponent}} is scheduled for {{date}}.',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'tournament:result', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Match Result', bodyTemplate: 'Match result: {{result}}{{#if ranking}}. Ranking: #{{ranking}}{{/if}}.',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },

    // Support
    { eventName: 'support:ticket-opened', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Support Ticket Opened', bodyTemplate: 'Ticket #{{ticketId}}: {{subject}} has been opened.',
      actionKey: 'view_ticket', routePattern: '/support/tickets/{{ticketId}}' },
    { eventName: 'support:ticket-resolved', locale: 'en', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'Ticket Resolved', bodyTemplate: 'Your support ticket #{{ticketId}} has been resolved.',
      actionKey: 'view_ticket', routePattern: '/support/tickets/{{ticketId}}' },

    // Security
    { eventName: 'security:suspicious-login', locale: 'en', categorySlug: 'system', type: 'warning', priority: 'critical',
      titleTemplate: 'Suspicious Login', bodyTemplate: 'A suspicious login was detected from IP {{ip}}{{#if location}} ({{location}}){{/if}}.',
      actionKey: 'view_security', routePattern: '/profile/security' },
    { eventName: 'security:suspicious-login', locale: 'ar', categorySlug: 'system', type: 'warning', priority: 'critical',
      titleTemplate: 'محاولة تسجيل دخول مشبوهة', bodyTemplate: 'تم اكتشاف محاولة تسجيل دخول مشبوهة من IP {{ip}}.',
      actionKey: 'view_security', routePattern: '/profile/security' },
    { eventName: 'security:account-locked', locale: 'en', categorySlug: 'system', type: 'error', priority: 'critical',
      titleTemplate: 'Account Locked', bodyTemplate: 'Your account has been locked: {{reason}}.',
      actionKey: 'view_support', routePattern: '/support' },
    { eventName: 'security:account-locked', locale: 'ar', categorySlug: 'system', type: 'error', priority: 'critical',
      titleTemplate: 'الحساب مغلق', bodyTemplate: 'تم إغلاق حسابك: {{reason}}.',
      actionKey: 'view_support', routePattern: '/support' },

    // Community
    { eventName: 'community:mention', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'You Were Mentioned', bodyTemplate: '{{mentionedBy}} mentioned you in a post.',
      actionKey: 'view_post', routePattern: '/community/posts/{{postId}}' },
    { eventName: 'community:mention', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'تم ذكرك', bodyTemplate: 'ذكرك {{mentionedBy}} في منشور.',
      actionKey: 'view_post', routePattern: '/community/posts/{{postId}}' },
  ];

  for (const tpl of templates) {
    const [existing] = await pool.execute<RowData>(
      'SELECT id FROM notification_templates WHERE event_name = ? AND locale = ?', [tpl.eventName, tpl.locale],
    );
    if (!existing.length) {
      await pool.execute(
        `INSERT INTO notification_templates
         (event_name, locale, category_slug, type, priority, title_template, body_template, action_key, route_pattern, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [tpl.eventName, tpl.locale, tpl.categorySlug, tpl.type, tpl.priority, tpl.titleTemplate, tpl.bodyTemplate, tpl.actionKey, tpl.routePattern],
      );
    }
  }
}
