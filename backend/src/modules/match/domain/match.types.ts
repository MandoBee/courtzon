export type MatchType = 'public';

export type MatchStatus = 'open' | 'full' | 'closed' | 'in_progress' | 'completed' | 'cancelled' | 'void';

export type MatchFormatType = 'singles' | 'doubles' | 'team';

/**
 * Historical Match format snapshot — frozen at Match creation so later edits
 * to `sport_formats` never reinterpret an existing Match (Group 1).
 */
export interface MatchFormatSnapshot {
  formatId: number;
  formatType: MatchFormatType;
  playersPerSide: number | null;
  name: string;
}

export type Visibility = 'public' | 'invite_only';

export type InvitationStatus = 'sent' | 'read' | 'declined' | 'expired';

export type JoinRequestStatus = 'submitted' | 'withdrawn' | 'approved' | 'rejected' | 'auto_rejected';

export type ParticipantRole = 'host' | 'joiner';

export type ParticipantSide = 'home' | 'away';

export type SessionStatus = 'in_progress' | 'completed' | 'voided';
