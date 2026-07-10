export type MatchType = 'public';

export type MatchStatus = 'open' | 'full' | 'closed' | 'in_progress' | 'completed' | 'cancelled' | 'void';

export type Visibility = 'public' | 'invite_only';

export type InvitationStatus = 'sent' | 'read' | 'declined' | 'expired';

export type JoinRequestStatus = 'submitted' | 'withdrawn' | 'approved' | 'rejected' | 'auto_rejected';

export type ParticipantRole = 'host' | 'joiner';

export type SessionStatus = 'in_progress' | 'completed' | 'voided';
