export interface Session {
  id: string;
  userId: number;
  expiresAt: string;
  refreshTokenExpiresAt: string;
  rememberMe: boolean;
}
