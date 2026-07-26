export interface NotificationAction {
  route: string;
  tab?: string;
  params?: Record<string, string | number | boolean | null>;
  replace?: boolean;
  openInNewTab?: boolean;
}
