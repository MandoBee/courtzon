import { describe, it, expect } from 'vitest';
import { Match } from '../domain/match.entity.js';
import { Invitation } from '../domain/invitation.entity.js';
import { JoinRequest } from '../domain/join-request.entity.js';

function createMatch(status: 'open' | 'full' | 'closed' | 'in_progress' | 'completed' | 'cancelled' | 'void' = 'open') {
  return new Match({
    id: 1, type: 'public', status, bookingId: 1, sportId: 1,
    version: 1, createdAt: new Date(), updatedAt: new Date(),
  });
}

function createInvitation(status: 'sent' | 'read' | 'declined' | 'expired' = 'sent') {
  return new Invitation({
    id: 1, matchId: 1, userId: 100, status, sentAt: new Date(),
    readAt: null, respondedAt: null, expiresAt: null,
  });
}

function createJoinRequest(status: 'submitted' | 'withdrawn' | 'approved' | 'rejected' | 'auto_rejected' = 'submitted') {
  return new JoinRequest({
    id: 1, matchId: 1, userId: 100, status, submittedAt: new Date(),
    respondedAt: null, responderId: null, rejectionReason: null,
  });
}

describe('Match state machine', () => {
  it('starts as open', () => {
    const m = createMatch();
    expect(m.status).toBe('open');
  });

  it('transitions open → full', () => {
    const m = createMatch('open');
    m.transition('full');
    expect(m.status).toBe('full');
  });

  it('transitions open → closed', () => {
    const m = createMatch('open');
    m.transition('closed');
    expect(m.status).toBe('closed');
  });

  it('transitions open → cancelled', () => {
    const m = createMatch('open');
    m.transition('cancelled');
    expect(m.status).toBe('cancelled');
  });

  it('transitions full → open (spot opens)', () => {
    const m = createMatch('full');
    m.transition('open');
    expect(m.status).toBe('open');
  });

  it('transitions closed → in_progress', () => {
    const m = createMatch('closed');
    m.transition('in_progress');
    expect(m.status).toBe('in_progress');
  });

  it('transitions in_progress → completed', () => {
    const m = createMatch('in_progress');
    m.transition('completed');
    expect(m.status).toBe('completed');
  });

  it('rejects invalid transition', () => {
    const m = createMatch('completed');
    expect(() => m.transition('open')).toThrow();
  });

  it('rejects open → in_progress (must close first)', () => {
    const m = createMatch('open');
    expect(() => m.transition('in_progress')).toThrow();
  });

  it('increments version on save', () => {
    const m = createMatch();
    const v = m.version;
    m.incrementVersion();
    expect(m.version).toBe(v + 1);
  });

  it('tracks participant count', () => {
    const m = createMatch();
    expect(m.participantCount).toBe(0);
  });
});

describe('Invitation state machine', () => {
  it('starts as sent', () => {
    const i = createInvitation();
    expect(i.status).toBe('sent');
  });

  it('transitions sent → read', () => {
    const i = createInvitation('sent');
    i.markRead();
    expect(i.status).toBe('read');
  });

  it('transitions sent → declined', () => {
    const i = createInvitation('sent');
    i.decline();
    expect(i.status).toBe('declined');
  });

  it('transitions sent → expired', () => {
    const i = createInvitation('sent');
    i.expire();
    expect(i.status).toBe('expired');
  });

  it('transitions read → declined', () => {
    const i = createInvitation('read');
    i.decline();
    expect(i.status).toBe('declined');
  });

  it('rejects declined → sent', () => {
    const i = createInvitation('declined');
    expect(() => i.markRead()).toThrow();
  });

  it('rejects expired → read', () => {
    const i = createInvitation('expired');
    expect(() => i.markRead()).toThrow();
  });
});

describe('JoinRequest state machine', () => {
  it('starts as submitted', () => {
    const jr = createJoinRequest();
    expect(jr.status).toBe('submitted');
  });

  it('transitions submitted → approved', () => {
    const jr = createJoinRequest('submitted');
    jr.approve(1);
    expect(jr.status).toBe('approved');
    expect(jr.responderId).toBe(1);
  });

  it('transitions submitted → rejected', () => {
    const jr = createJoinRequest('submitted');
    jr.reject(1, 'Not the right fit');
    expect(jr.status).toBe('rejected');
    expect(jr.rejectionReason).toBe('Not the right fit');
  });

  it('transitions submitted → withdrawn', () => {
    const jr = createJoinRequest('submitted');
    jr.withdraw();
    expect(jr.status).toBe('withdrawn');
  });

  it('transitions submitted → auto_rejected', () => {
    const jr = createJoinRequest('submitted');
    jr.autoReject();
    expect(jr.status).toBe('auto_rejected');
  });

  it('rejects approved → withdrawn', () => {
    const jr = createJoinRequest('approved');
    expect(() => jr.withdraw()).toThrow();
  });

  it('rejects rejected → approved', () => {
    const jr = createJoinRequest('rejected');
    expect(() => jr.approve(1)).toThrow();
  });
});
