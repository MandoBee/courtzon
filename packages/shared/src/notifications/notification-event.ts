export interface SocketNotificationEvent {
  id: number;
  userId: number;
  title: string;
  body?: string | null;
  icon?: string | null;
  created_at: string;
}
