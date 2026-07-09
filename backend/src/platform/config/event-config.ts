export type Priority = 'critical' | 'high' | 'normal' | 'low';

export type Category =
  | 'booking'
  | 'payment'
  | 'marketplace'
  | 'academy'
  | 'coaching'
  | 'tournament'
  | 'match'
  | 'auth'
  | 'user'
  | 'organisation'
  | 'club'
  | 'membership'
  | 'subscription'
  | 'wallet'
  | 'wallet_alert'
  | 'settlement'
  | 'coupon'
  | 'review'
  | 'attendance'
  | 'support'
  | 'security'
  | 'community'
  | 'friend'
  | 'chat'
  | 'system'
  | 'marketing'
  | 'workflow'
  | 'notification'
  | 'audit'
  | 'media'
  | 'search'
  | 'ai'
  | 'platform'
  | (string & {});

export interface RecipientStrategy {
  type: 'user' | 'role' | 'organisation' | 'club' | 'branch' | 'entity' | 'custom' | 'all';
  entityType?: string;
  roleSlug?: string;
  resolveConfig?: Record<string, unknown>;
}

export interface ChannelStrategy {
  channel: 'in_app' | 'push' | 'email' | 'sms' | 'whatsapp' | 'webhook' | (string & {});
  condition: 'always' | 'user_preference' | 'if_available' | 'fallback';
  priority?: number;
}

export interface EventMetadata {
  name: string;
  version: number;
  domain: string;
  description?: string;
  producer?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  tags?: string[];
  since?: string;
}

export interface EventAction {
  key: string;
  label: string;
  route: string;
  icon?: string;
  confirmMessage?: string;
  condition?: string;
}

export interface RealtimeSignal {
  room: string;
  event: string;
  condition?: string;
  data?: Record<string, string>;
}

export interface EventDeepLink {
  actionKey: string;
  route: string;
  paramsFrom: Record<string, string>;
}

export interface EventTemplate {
  key: string;
  locales: string[];
  defaultLocale?: string;
}

export interface EventConfig<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  event: string;
  metadata: EventMetadata;
  category: Category;
  priority: Priority;
  recipients: RecipientStrategy[];
  template: EventTemplate;
  channels: ChannelStrategy[];
  realtime?: RealtimeSignal[];
  deepLink?: EventDeepLink;
  actions?: EventAction[];
  featureFlag?: string;
  ttl?: number;
  digestable?: boolean;
  quietHoursBypass?: boolean;
  examplePayload?: TPayload;
}
