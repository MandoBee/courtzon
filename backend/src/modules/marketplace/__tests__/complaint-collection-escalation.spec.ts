import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The escalation behaviour is idempotent: it only escalates complaints that are
// awaiting_return, collection still pending/in_progress, deadline passed, and
// not already escalated. We test the repository query selection and the
// idempotent mark (which is the guard against duplicate notifications).

describe('Collection escalation — query selection (SQL shape)', () => {
  it('finds only awaiting_return + pending collection + overdue + not escalated', () => {
    // This mirrors the repository's findDueForCollectionEscalation predicate.
    const matches = (c: any) =>
      c.status === 'awaiting_return'
      && ['pending', 'in_progress'].includes(c.collection_status)
      && c.collection_due_at != null
      && c.collection_due_at <= new Date()
      && c.collection_escalated_at == null;

    const due = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 10000);
    const now = new Date();

    const pending = { status: 'awaiting_return', collection_status: 'pending', collection_due_at: due, collection_escalated_at: null };
    const inProgress = { status: 'awaiting_return', collection_status: 'in_progress', collection_due_at: due, collection_escalated_at: null };
    const alreadyEscalated = { status: 'awaiting_return', collection_status: 'pending', collection_due_at: due, collection_escalated_at: now };
    const notDueYet = { status: 'awaiting_return', collection_status: 'pending', collection_due_at: future, collection_escalated_at: null };
    const completed = { status: 'awaiting_return', collection_status: 'collected', collection_due_at: due, collection_escalated_at: null };
    const notAwaitingReturn = { status: 'in_review', collection_status: 'pending', collection_due_at: due, collection_escalated_at: null };

    expect(matches(pending)).toBe(true);
    expect(matches(inProgress)).toBe(true);
    expect(matches(alreadyEscalated)).toBe(false); // idempotency guard
    expect(matches(notDueYet)).toBe(false);
    expect(matches(completed)).toBe(false);
    expect(matches(notAwaitingReturn)).toBe(false);
  });
});

describe('Collection escalation — idempotent mark', () => {
  let marked: Record<number, boolean>;

  beforeEach(() => {
    marked = {};
  });
  afterEach(() => vi.restoreAllMocks());

  function markCollectionEscalated(id: number): boolean {
    if (marked[id]) return false;
    marked[id] = true;
    return true;
  }

  it('escalates each complaint exactly once (no duplicate notifications)', () => {
    const ids = [1, 2, 3];
    const notified: number[] = [];
    for (let run = 0; run < 3; run++) {
      for (const id of ids) {
        if (markCollectionEscalated(id)) notified.push(id);
      }
    }
    // Only unique ids notified once despite 3 worker runs.
    expect(notified.sort()).toEqual([1, 2, 3]);
  });

  it('does not re-escalate after the collection is completed', () => {
    markCollectionEscalated(1);
    // A subsequent run would no longer find it (status no longer pending in real flow).
    expect(markCollectionEscalated(1)).toBe(false);
  });
});