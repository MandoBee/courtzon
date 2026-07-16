export const Events = {
  Auth: {
    PASSWORD_RESET: 'auth:password-reset',
    LOGIN: 'auth:login',
    LOGIN_FAILED: 'auth:login-failed',
    LOGOUT: 'auth:logout',
    PASSWORD_CHANGED: 'auth:password-changed',
    MFA_ENABLED: 'auth:mfa-enabled',
    MFA_DISABLED: 'auth:mfa-disabled',
    MFA_SETUP: 'auth:2fa-setup',
  } as const,

  User: {
    REGISTERED: 'user:registered',
    APPROVED: 'user:approved',
    REJECTED: 'user:rejected',
    SUSPENDED: 'user:suspended',
    ACTIVATED: 'user:activated',
    REACTIVATED: 'user:reactivated',
    PROFILE_UPDATED: 'user:profile-updated',
    DELETED: 'user:deleted',
  } as const,

  Booking: {
    CREATED: 'booking:created',
    CONFIRMED: 'booking:confirmed',
    CANCELLED: 'booking:cancelled',
    COMPLETED: 'booking:completed',
    EXPIRED: 'booking:expired',
    NO_SHOW: 'booking:no-show',
    CHECK_IN: 'booking:check-in',
    REMINDER: 'booking:reminder',
    RESCHEDULED: 'booking:rescheduled',
    FULLY_BOOKED: 'booking:fully-booked',
    AUTO_CANCELLED: 'booking:auto-cancelled',
    APPLICATION_DECLINED: 'booking:application-declined',
    MATCHMAKING_COMPLETE: 'booking:matchmaking-complete',
  } as const,

  Payment: {
    COMPLETED: 'payment:completed',
    FAILED: 'payment:failed',
    REFUNDED: 'payment:refunded',
    WALLET_CREDITED: 'payment:wallet-credited',
    WALLET_DEBITED: 'payment:wallet-debited',
    WALLET_LOW_BALANCE: 'payment:wallet-low-balance',
    WALLET_TOPUP: 'payment:wallet-topup',
  } as const,

  Marketplace: {
    ORDER_PLACED: 'marketplace:order-placed',
    ORDER_CONFIRMED: 'marketplace:order-confirmed',
    ORDER_SHIPPED: 'marketplace:order-shipped',
    ORDER_DELIVERED: 'marketplace:order-delivered',
    ORDER_CANCELLED: 'marketplace:order-cancelled',
    ORDER_REFUNDED: 'marketplace:order-refunded',
    ORDER_STATUS_CHANGED: 'marketplace:order-status-changed',
    NEW_REVIEW: 'marketplace:new-review',
    PRODUCT_BACK_IN_STOCK: 'marketplace:product-back-in-stock',
    PRICE_DROP: 'marketplace:price-drop',
    FLASH_SALE: 'marketplace:flash-sale',
    NEW_SELLER_REGISTERED: 'marketplace:new-seller-registered',
  } as const,

  Organisation: {
    CREATED: 'organisation:created',
    UPDATED: 'organisation:updated',
    APPROVED: 'organisation:approved',
    REJECTED: 'organisation:rejected',
    SUSPENDED: 'organisation:suspended',
    MEMBER_JOINED: 'organisation:member-joined',
    MEMBER_LEFT: 'organisation:member-left',
    SUBSCRIPTION_EXPIRING: 'organisation:subscription-expiring',
    SUBSCRIPTION_EXPIRED: 'organisation:subscription-expired',
    SUBSCRIPTION_RENEWED: 'organisation:subscription-renewed',
  } as const,

  Club: {
    CREATED: 'club:created',
    MEMBER_JOINED: 'club:member-joined',
    MEMBER_LEFT: 'club:member-left',
    NEW_EVENT: 'club:new-event',
  } as const,

  Academy: {
    ENROLLED: 'academy:enrolled',
    SESSION_REMINDER: 'academy:session-reminder',
    GRADUATED: 'academy:graduated',
  } as const,

  Coaching: {
    SESSION_SCHEDULED: 'coaching:session-scheduled',
    SESSION_CANCELLED: 'coaching:session-cancelled',
    SESSION_REMINDER: 'coaching:session-reminder',
    COACH_INVITED: 'coach:invited',
    AGREEMENT_ADDED: 'coach:agreement-added',
  } as const,

  Tournament: {
    CREATED: 'tournament:created',
    STARTING_SOON: 'tournament:starting-soon',
    REGISTRATION_OPEN: 'tournament:registration-open',
    REGISTRATION_CLOSED: 'tournament:registration-closed',
    MATCH_SCHEDULED: 'tournament:match-scheduled',
    RESULT: 'tournament:result',
  } as const,

  Match: {
    INVITATION: 'match:invitation',
  } as const,

  Community: {
    NEW_POST: 'community:new-post',
    NEW_COMMENT: 'community:new-comment',
    MENTION: 'community:mention',
    REPLY: 'community:reply',
    LIKE: 'community:like',
  } as const,

  Friend: {
    REQUEST: 'friend:request',
    ACCEPTED: 'friend:accepted',
    BLOCKED: 'friend:blocked',
  } as const,

  Chat: {
    NEW_MESSAGE: 'chat:new-message',
    MISSED_CALL: 'chat:missed-call',
    GROUP_CREATED: 'chat:group-created',
    GROUP_JOINED: 'chat:group-joined',
  } as const,

  Membership: {
    EXPIRING: 'membership:expiring',
    EXPIRED: 'membership:expired',
    RENEWED: 'membership:renewed',
    UPGRADED: 'membership:upgraded',
  } as const,

  Subscription: {
    RENEWAL_REMINDER: 'subscription:renewal-reminder',
    UPGRADED: 'subscription:upgraded',
    CANCELLED: 'subscription:cancelled',
  } as const,

  Wallet: {
    DEPOSIT: 'wallet:deposit',
    WITHDRAWAL: 'wallet:withdrawal',
    LOW_BALANCE: 'wallet:low-balance',
    TRANSACTION: 'wallet:transaction',
  } as const,

  Settlement: {
    COMPLETED: 'settlement:completed',
    FAILED: 'settlement:failed',
  } as const,

  Coupon: {
    PUBLISHED: 'coupon:published',
  } as const,

  Review: {
    RECEIVED: 'review:received',
  } as const,

  Attendance: {
    RECORDED: 'attendance:recorded',
    MARKED: 'attendance:marked',
  } as const,

  Support: {
    TICKET_OPENED: 'support:ticket-opened',
    TICKET_UPDATED: 'support:ticket-updated',
    TICKET_RESOLVED: 'support:ticket-resolved',
    TICKET_CLOSED: 'support:ticket-closed',
  } as const,

  Security: {
    SUSPICIOUS_LOGIN: 'security:suspicious-login',
    ACCOUNT_LOCKED: 'security:account-locked',
    PERMISSION_CHANGED: 'security:permission-changed',
  } as const,

  System: {
    ANNOUNCEMENT: 'system:announcement',
    MAINTENANCE: 'system:maintenance',
    BIRTHDAY: 'system:birthday',
    DIGEST: 'system:digest',
  } as const,

  Workflow: {
    STARTED: 'workflow:started',
    STEP_COMPLETED: 'workflow:step-completed',
    COMPLETED: 'workflow:completed',
    FAILED: 'workflow:failed',
    CANCELLED: 'workflow:cancelled',
  } as const,

  Notification: {
    DELIVERED: 'notification:delivered',
    FAILED: 'notification:failed',
    BOUNCED: 'notification:bounced',
    READ: 'notification:read',
    CLICKED: 'notification:clicked',
    BROADCAST: 'notification:broadcast',
    BROADCAST_SENT: 'notification:broadcast-sent',
  } as const,

  Audit: {
    RECORDED: 'audit:recorded',
    EXPORTED: 'audit:exported',
  } as const,

  Media: {
    UPLOADED: 'media:uploaded',
    DELETED: 'media:deleted',
    PROCESSED: 'media:processed',
    OPTIMIZED: 'media:optimized',
  } as const,

  Search: {
    INDEXED: 'search:indexed',
    REINDEXED: 'search:reindexed',
  } as const,

  AI: {
    ANALYSIS_COMPLETED: 'ai:analysis-completed',
    PREDICTION_READY: 'ai:prediction-ready',
    RECOMMENDATION_GENERATED: 'ai:recommendation-generated',
  } as const,

  Platform: {
    CONFIG_CHANGED: 'platform:config-changed',
    FEATURE_FLAG_TOGGLED: 'platform:feature-flag-toggled',
    TENANT_PROVISIONED: 'platform:tenant-provisioned',
  } as const,
} as const;

function deepFreeze<T>(obj: T): T {
  if (typeof obj === 'object' && obj !== null && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        deepFreeze(value);
      }
    }
  }
  return obj;
}

deepFreeze(Events);

export type EventGroup = keyof typeof Events;
export type EventName = (typeof Events)[EventGroup][keyof (typeof Events)[EventGroup]];
