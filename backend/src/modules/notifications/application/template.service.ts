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
    { eventName: 'wallet:low-balance', locale: 'en', categorySlug: 'payments', type: 'warning', priority: 'low',
      titleTemplate: 'Low Wallet Balance', bodyTemplate: 'Your wallet balance is {{currency}} {{balance}}. Please top up soon.',
      actionKey: 'view_wallet', routePattern: '/wallet' },
    { eventName: 'wallet:low-balance', locale: 'ar', categorySlug: 'payments', type: 'warning', priority: 'low',
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

    { eventName: 'auth:password-reset', locale: 'en', categorySlug: 'system', type: 'info', priority: 'high',
      titleTemplate: 'Reset your CourtZon password',
      bodyTemplate: 'Click this link to reset your password: {{resetLink}}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.',
      actionKey: 'reset_password', routePattern: '{{resetLink}}' },
    { eventName: 'auth:password-reset', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'high',
      titleTemplate: 'إعادة تعيين كلمة المرور',
      bodyTemplate: 'انقر على الرابط لإعادة تعيين كلمة المرور: {{resetLink}}\n\nتنتهي صلاحية هذا الرابط خلال ساعة.',
      actionKey: 'reset_password', routePattern: '{{resetLink}}' },

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
    { eventName: 'match:invitation', locale: 'en', categorySlug: 'system', type: 'info', priority: 'high',
      titleTemplate: 'Match Invitation', bodyTemplate: 'You have been invited to join a match!',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'match:invitation', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'high',
      titleTemplate: 'دعوة للمباراة', bodyTemplate: 'تمت دعوتك للانضمام إلى مباراة!',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },

    // ── Match Events ──
    { eventName: 'match:created', locale: 'en', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'Match Created', bodyTemplate: 'A new match has been created!',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'match:created', locale: 'ar', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'تم إنشاء مباراة', bodyTemplate: 'تم إنشاء مباراة جديدة!',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'match:cancelled', locale: 'en', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'Match Cancelled', bodyTemplate: 'The match has been cancelled.',
      actionKey: 'view_matches', routePattern: '/matches' },
    { eventName: 'match:cancelled', locale: 'ar', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'تم إلغاء المباراة', bodyTemplate: 'تم إلغاء المباراة.',
      actionKey: 'view_matches', routePattern: '/matches' },
    { eventName: 'match:completed', locale: 'en', categorySlug: 'bookings', type: 'success', priority: 'normal',
      titleTemplate: 'Match Completed', bodyTemplate: 'The match has been completed!',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'match:completed', locale: 'ar', categorySlug: 'bookings', type: 'success', priority: 'normal',
      titleTemplate: 'تمت المباراة', bodyTemplate: 'تمت المباراة بنجاح!',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'join_request:submitted', locale: 'en', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'New Applicant', bodyTemplate: 'A player wants to join your match.',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'join_request:submitted', locale: 'ar', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'متقدم جديد', bodyTemplate: 'يريد لاعب الانضمام إلى مباراتك.',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'join_request:approved', locale: 'en', categorySlug: 'bookings', type: 'success', priority: 'high',
      titleTemplate: 'Request Approved', bodyTemplate: 'You have been accepted into the match!',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'join_request:approved', locale: 'ar', categorySlug: 'bookings', type: 'success', priority: 'high',
      titleTemplate: 'تمت الموافقة', bodyTemplate: 'تم قبولك في المباراة!',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'join_request:rejected', locale: 'en', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'Request Declined', bodyTemplate: 'Your request to join the match was declined.',
      actionKey: 'view_matches', routePattern: '/matches' },
    { eventName: 'join_request:rejected', locale: 'ar', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'تم رفض الطلب', bodyTemplate: 'تم رفض طلب الانضمام إلى المباراة.',
      actionKey: 'view_matches', routePattern: '/matches' },
    { eventName: 'join_request:auto_rejected', locale: 'en', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'Match Closed', bodyTemplate: 'The match is no longer accepting applications.',
      actionKey: 'view_matches', routePattern: '/matches' },
    { eventName: 'join_request:auto_rejected', locale: 'ar', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'المباراة مغلقة', bodyTemplate: 'لم تعد المباراة تقبل الطلبات.',
      actionKey: 'view_matches', routePattern: '/matches' },
    { eventName: 'waiting_list:promoted', locale: 'en', categorySlug: 'bookings', type: 'success', priority: 'high',
      titleTemplate: 'Spot Opened!', bodyTemplate: 'A spot opened up in the match! Confirm now.',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'waiting_list:promoted', locale: 'ar', categorySlug: 'bookings', type: 'success', priority: 'high',
      titleTemplate: 'ظهر مكان شاغر!', bodyTemplate: 'ظهر مكان شاغر في المباراة! قم بالتأكيد الآن.',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },

    // ── Additional Booking Events ──
    { eventName: 'booking:auto-cancelled', locale: 'en', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'Booking Auto-Cancelled', bodyTemplate: 'Booking #{{bookingId}} was auto-cancelled due to non-payment.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:auto-cancelled', locale: 'ar', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'تم إلغاء الحجز تلقائياً', bodyTemplate: 'تم إلغاء الحجز رقم {{bookingId}} تلقائياً لعدم الدفع.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:application-declined', locale: 'en', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'Application Declined', bodyTemplate: 'Your application to join the match has been declined.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:application-declined', locale: 'ar', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'تم رفض طلبك', bodyTemplate: 'تم رفض طلب الانضمام للمباراة.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:expired', locale: 'en', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'Booking Expired', bodyTemplate: 'Your booking #{{bookingId}} has expired due to non-payment.',
      actionKey: 'view_bookings', routePattern: '/bookings' },
    { eventName: 'booking:expired', locale: 'ar', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'انتهت صلاحية الحجز', bodyTemplate: 'انتهت صلاحية حجزك رقم {{bookingId}} لعدم الدفع.',
      actionKey: 'view_bookings', routePattern: '/bookings' },
    { eventName: 'booking:no-show', locale: 'en', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'No-Show Recorded', bodyTemplate: 'You did not show up for booking #{{bookingId}}. A penalty may apply.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:no-show', locale: 'ar', categorySlug: 'bookings', type: 'warning', priority: 'high',
      titleTemplate: 'تسجيل عدم حضور', bodyTemplate: 'لم تحضر للحجز رقم {{bookingId}}. قد يتم تطبيق غرامة.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:check-in', locale: 'en', categorySlug: 'bookings', type: 'success', priority: 'normal',
      titleTemplate: 'Checked In', bodyTemplate: 'You have checked in for booking #{{bookingId}}. Enjoy!',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:check-in', locale: 'ar', categorySlug: 'bookings', type: 'success', priority: 'normal',
      titleTemplate: 'تم تسجيل الدخول', bodyTemplate: 'لقد سجلت حضورك للحجز رقم {{bookingId}}. استمتع!',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:fully-booked', locale: 'en', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'Match Fully Booked', bodyTemplate: 'Your match #{{bookingId}} has reached maximum players.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:fully-booked', locale: 'ar', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'اكتمل الحجز', bodyTemplate: 'وصلت مباراتك رقم {{bookingId}} إلى الحد الأقصى للاعبين.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },
    { eventName: 'booking:rescheduled', locale: 'en', categorySlug: 'bookings', type: 'info', priority: 'normal',
      titleTemplate: 'Booking Rescheduled', bodyTemplate: 'Booking #{{bookingId}} has been rescheduled.',
      actionKey: 'view_booking', routePattern: '/bookings/{{bookingId}}' },

    // ── Additional Payment Events ──
    { eventName: 'payment:initiated', locale: 'en', categorySlug: 'payments', type: 'info', priority: 'normal',
      titleTemplate: 'Payment Initiated', bodyTemplate: 'A payment of {{currency}} {{amount}} has been initiated.',
      actionKey: 'view_payment', routePattern: '/payments/{{paymentId}}' },
    { eventName: 'payment:wallet-topup', locale: 'en', categorySlug: 'payments', type: 'success', priority: 'normal',
      titleTemplate: 'Wallet Top-Up', bodyTemplate: 'Your wallet has been topped up with {{currency}} {{amount}}. New balance: {{balance}}.',
      actionKey: 'view_wallet', routePattern: '/wallet' },

    // ── Marketplace Missing Events ──
    { eventName: 'marketplace:order-confirmed', locale: 'en', categorySlug: 'marketplace', type: 'success', priority: 'high',
      titleTemplate: 'Order Confirmed', bodyTemplate: 'Order #{{orderId}} has been confirmed.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-confirmed', locale: 'ar', categorySlug: 'marketplace', type: 'success', priority: 'high',
      titleTemplate: 'تم تأكيد الطلب', bodyTemplate: 'تم تأكيد الطلب رقم {{orderId}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-cancelled', locale: 'en', categorySlug: 'marketplace', type: 'warning', priority: 'high',
      titleTemplate: 'Order Cancelled', bodyTemplate: 'Order #{{orderId}} has been cancelled{{#if reason}}: {{reason}}{{/if}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-refunded', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'Order Refunded', bodyTemplate: 'Refund of {{amount}} processed for order #{{orderId}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-refunded', locale: 'ar', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'تم استرداد الطلب', bodyTemplate: 'تم استرداد {{amount}} للطلب رقم {{orderId}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-cancelled', locale: 'ar', categorySlug: 'marketplace', type: 'warning', priority: 'high',
      titleTemplate: 'تم إلغاء الطلب', bodyTemplate: 'تم إلغاء الطلب رقم {{orderId}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:order-status-changed', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'Order Status Updated', bodyTemplate: 'Order #{{orderId}} status changed from {{fromStatus}} to {{toStatus}}.',
      actionKey: 'view_order', routePattern: '/marketplace/orders/{{orderId}}' },
    { eventName: 'marketplace:flash-sale', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'high',
      titleTemplate: 'Flash Sale!', bodyTemplate: '{{productName}} is now {{discountPercent}}% off! Ends {{endsAt}}.',
      actionKey: 'view_product', routePattern: '/marketplace/products/{{productId}}' },
    { eventName: 'marketplace:new-seller-registered', locale: 'en', categorySlug: 'marketplace', type: 'info', priority: 'normal',
      titleTemplate: 'New Seller Registered', bodyTemplate: '{{shopName}} has registered as a seller.',
      actionKey: 'view_seller', routePattern: '/admin/sellers/{{sellerId}}' },

    // ── User & Auth Missing ──
    { eventName: 'user:rejected', locale: 'en', categorySlug: 'system', type: 'error', priority: 'high',
      titleTemplate: 'Registration Rejected', bodyTemplate: 'Your account registration has been rejected{{#if reason}}: {{reason}}{{/if}}.',
      actionKey: 'view_support', routePattern: '/support' },
    { eventName: 'user:suspended', locale: 'en', categorySlug: 'system', type: 'error', priority: 'high',
      titleTemplate: 'Account Suspended', bodyTemplate: 'Your account has been suspended{{#if reason}}: {{reason}}{{/if}}.',
      actionKey: 'view_support', routePattern: '/support' },
    { eventName: 'user:activated', locale: 'en', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'Account Activated', bodyTemplate: 'Your account has been activated.',
      actionKey: 'view_dashboard', routePattern: '/app' },
    { eventName: 'user:profile-updated', locale: 'en', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'Profile Updated', bodyTemplate: 'Your profile has been updated successfully.',
      actionKey: 'view_profile', routePattern: '/profile' },
    { eventName: 'user:deleted', locale: 'en', categorySlug: 'system', type: 'error', priority: 'high',
      titleTemplate: 'Account Deleted', bodyTemplate: 'Your account has been deleted.',
      actionKey: 'view_home', routePattern: '/' },
    { eventName: 'auth:login', locale: 'en', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'New Login', bodyTemplate: 'A new login was detected on your account from IP {{ip}}.',
      actionKey: 'view_security', routePattern: '/profile/security' },
    { eventName: 'auth:logout', locale: 'en', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'Logged Out', bodyTemplate: 'You have been logged out.',
      actionKey: 'view_login', routePattern: '/login' },
    { eventName: 'auth:2fa-setup', locale: 'en', categorySlug: 'system', type: 'info', priority: 'high',
      titleTemplate: 'Two-Factor Authentication Enabled', bodyTemplate: 'Two-factor authentication via {{method}} has been enabled on your account.',
      actionKey: 'view_security', routePattern: '/profile/security' },

    // ── Organisation Missing ──
    { eventName: 'organisation:created', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Organisation Created', bodyTemplate: '{{name}} has been created.',
      actionKey: 'view_organisation', routePattern: '/org/{{organisationId}}' },
    { eventName: 'organisation:rejected', locale: 'en', categorySlug: 'system', type: 'error', priority: 'high',
      titleTemplate: 'Organisation Rejected', bodyTemplate: 'Your organisation has been rejected{{#if reason}}: {{reason}}{{/if}}.',
      actionKey: 'view_support', routePattern: '/support' },
    { eventName: 'organisation:subscription-expired', locale: 'en', categorySlug: 'system', type: 'error', priority: 'high',
      titleTemplate: 'Subscription Expired', bodyTemplate: 'Your {{planName}} subscription has expired. Renew now to continue.',
      actionKey: 'view_subscription', routePattern: '/org/{{organisationId}}/subscription' },
    { eventName: 'organisation:subscription-renewed', locale: 'en', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'Subscription Renewed', bodyTemplate: 'Your {{planName}} subscription has been renewed ({{billingCycle}}).',
      actionKey: 'view_subscription', routePattern: '/org/{{organisationId}}/subscription' },

    // ── Club ──
    { eventName: 'club:created', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Club Created', bodyTemplate: '{{name}} club has been created.',
      actionKey: 'view_club', routePattern: '/clubs/{{clubId}}' },
    { eventName: 'club:member-joined', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'New Club Member', bodyTemplate: 'A new member has joined {{clubName}}.',
      actionKey: 'view_club', routePattern: '/clubs/{{clubId}}' },
    { eventName: 'club:member-left', locale: 'en', categorySlug: 'system', type: 'info', priority: 'low',
      titleTemplate: 'Member Left', bodyTemplate: 'A member has left {{clubName}}.',
      actionKey: 'view_club', routePattern: '/clubs/{{clubId}}' },

    // ── Academy Missing ──
    { eventName: 'academy:enrolled', locale: 'ar', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'تم التسجيل في الأكاديمية', bodyTemplate: 'تم تسجيل {{studentName}} بنجاح.',
      actionKey: 'view_academy', routePattern: '/academies/{{academyId}}' },
    { eventName: 'academy:graduated', locale: 'en', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'Academy Graduation', bodyTemplate: '{{studentName}} has graduated from the academy.',
      actionKey: 'view_academy', routePattern: '/academies/{{academyId}}' },

    // ── Coaching Missing ──
    { eventName: 'coaching:session-scheduled', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'تم جدولة جلسة تدريب', bodyTemplate: 'تم جدولة جلستك التدريبية في {{startTime}}.',
      actionKey: 'view_session', routePattern: '/sessions/{{sessionId}}' },
    { eventName: 'coaching:session-cancelled', locale: 'ar', categorySlug: 'system', type: 'warning', priority: 'high',
      titleTemplate: 'تم إلغاء الجلسة', bodyTemplate: 'تم إلغاء جلستك التدريبية{{#if reason}}: {{reason}}{{/if}}.',
      actionKey: 'view_sessions', routePattern: '/coaching' },

    // ── Tournament Missing ──
    { eventName: 'tournament:registration-open', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Tournament Registration Open', bodyTemplate: 'Registration for {{name}} is now open!',
      actionKey: 'view_tournament', routePattern: '/tournaments/{{tournamentId}}' },
    { eventName: 'tournament:registration-closed', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Registration Closed', bodyTemplate: 'Registration for {{name}} is now closed.',
      actionKey: 'view_tournament', routePattern: '/tournaments/{{tournamentId}}' },
    { eventName: 'tournament:starting-soon', locale: 'ar', categorySlug: 'system', type: 'reminder', priority: 'high',
      titleTemplate: 'البطولة على وشك البدء', bodyTemplate: 'ستبدأ {{name}} في {{startDate}}. استعد!',
      actionKey: 'view_tournament', routePattern: '/tournaments/{{tournamentId}}' },
    { eventName: 'tournament:match-scheduled', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'تم جدولة المباراة', bodyTemplate: 'مباراتك ضد {{opponent}} مجدولة في {{date}}.',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },
    { eventName: 'tournament:result', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'نتيجة المباراة', bodyTemplate: 'نتيجة المباراة: {{result}}{{#if ranking}}. الترتيب: #{{ranking}}{{/if}}.',
      actionKey: 'view_match', routePattern: '/matches/{{matchId}}' },

    // ── Wallet ──
    { eventName: 'wallet:deposit', locale: 'en', categorySlug: 'payments', type: 'success', priority: 'normal',
      titleTemplate: 'Wallet Deposit', bodyTemplate: '{{currency}} {{amount}} has been deposited to your wallet. Balance: {{balance}}.',
      actionKey: 'view_wallet', routePattern: '/wallet' },
    { eventName: 'wallet:deposit', locale: 'ar', categorySlug: 'payments', type: 'success', priority: 'normal',
      titleTemplate: 'إيداع في المحفظة', bodyTemplate: 'تم إيداع {{currency}} {{amount}} في محفظتك. الرصيد: {{balance}}.',
      actionKey: 'view_wallet', routePattern: '/wallet' },
    { eventName: 'wallet:withdrawal', locale: 'en', categorySlug: 'payments', type: 'info', priority: 'normal',
      titleTemplate: 'Wallet Withdrawal', bodyTemplate: '{{currency}} {{amount}} has been withdrawn from your wallet. Balance: {{balance}}.',
      actionKey: 'view_wallet', routePattern: '/wallet' },
    { eventName: 'wallet:withdrawal', locale: 'ar', categorySlug: 'payments', type: 'info', priority: 'normal',
      titleTemplate: 'سحب من المحفظة', bodyTemplate: 'تم سحب {{currency}} {{amount}} من محفظتك. الرصيد: {{balance}}.',
      actionKey: 'view_wallet', routePattern: '/wallet' },

    // ── Coupon ──
    { eventName: 'coupon:published', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'New Coupon Available', bodyTemplate: 'Coupon "{{code}}" ({{discountValue}}{{discountType}}) is now available.',
      actionKey: 'view_coupon', routePattern: '/coupons' },
    { eventName: 'coupon:published', locale: 'ar', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'كوبون جديد متاح', bodyTemplate: 'الكوبون "{{code}}" ({{discountValue}}{{discountType}}) متاح الآن.',
      actionKey: 'view_coupon', routePattern: '/coupons' },

    // ── membership:upgraded ──
    { eventName: 'membership:upgraded', locale: 'en', categorySlug: 'system', type: 'success', priority: 'normal',
      titleTemplate: 'Membership Upgraded', bodyTemplate: 'Your {{type}} membership has been upgraded.',
      actionKey: 'view_membership', routePattern: '/memberships' },

    // ── Support Missing ──
    { eventName: 'support:ticket-closed', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Ticket Closed', bodyTemplate: 'Your support ticket #{{ticketId}} has been closed.',
      actionKey: 'view_tickets', routePattern: '/support/tickets' },
    { eventName: 'support:ticket-updated', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Ticket Updated', bodyTemplate: 'Your support ticket #{{ticketId}} status changed to {{status}}.',
      actionKey: 'view_ticket', routePattern: '/support/tickets/{{ticketId}}' },

    // ── Attendance ──
    { eventName: 'attendance:marked', locale: 'en', categorySlug: 'system', type: 'info', priority: 'normal',
      titleTemplate: 'Attendance Marked', bodyTemplate: 'Your attendance has been marked as {{status}}.',
      actionKey: 'view_session', routePattern: '/sessions/{{sessionId}}' },
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
