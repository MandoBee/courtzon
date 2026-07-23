export interface SessionRecord {
  id: number;
  user_id: number;
  is_revoked: boolean;
  expires_at: string;
  suspicious: boolean;
}

export interface RevokeSessionRequest {
  sessionId: number;
  actorId?: number;
}

export function canRevokeSession(session: SessionRecord): boolean {
  return !session.is_revoked;
}
