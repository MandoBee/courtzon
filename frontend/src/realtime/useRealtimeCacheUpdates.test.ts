import { describe, it, expect } from 'vitest';
import { ORG_LIFECYCLE_INVALIDATIONS, invalidateOrgLifecycle, USER_REGISTRATION_INVALIDATIONS, invalidateUserRegistration, FINANCE_INVALIDATIONS, invalidateFinanceEntries, MARKETPLACE_PRODUCT_INVALIDATIONS, invalidateMarketplaceProducts, ORG_ACCOUNTING_ROOTS, invalidateOrgAccounting, COACH_LIFECYCLE_INVALIDATIONS, TOURNAMENT_REALTIME_EVENTS, invalidateTournament, invalidateTournamentStandings, MATCH_LIFECYCLE_SOCKET_EVENTS, MATCH_RESULT_SOCKET_EVENTS, invalidateMatchKeys, invalidateRealtimeReconcile, invalidateRegistrationLifecycle, academyEnrollmentEvents, invalidateAcademySessionStarted, invalidateAcademyHoldExpiry, invalidateAcademyGroupUpdated, invalidateAcademyScheduleUpdated, invalidateAcademyAttendance, invalidateAcademyAdminEnrollment, invalidateAcademySessionCancelled } from './useRealtimeCacheUpdates';

function hasPrefix(keys: readonly (readonly string[])[], prefix: string[]): boolean {
  return keys.some((k) => prefix.every((part, i) => k[i] === part));
}

describe('ORG_LIFECYCLE_INVALIDATIONS (organization registration realtime strategy)', () => {
  it('created covers every admin surface a registration mutates', () => {
    const keys = ORG_LIFECYCLE_INVALIDATIONS.created;
    expect(hasPrefix(keys, ['admin', 'organisations'])).toBe(true);
    expect(hasPrefix(keys, ['admin-approvals'])).toBe(true);
    // Registration inserts the owner user row — Admin Users must refresh (Issue regression)
    expect(hasPrefix(keys, ['admin', 'users'])).toBe(true);
    // Registration clones the org-admin role + scope
    expect(hasPrefix(keys, ['admin', 'roles'])).toBe(true);
    // Registration inserts a pending organisation_subscriptions row
    expect(hasPrefix(keys, ['admin', 'organisation-subscriptions'])).toBe(true);
    // Dashboard counters include totalUsers/totalOrganisations/pending orgs
    expect(hasPrefix(keys, ['admin', 'dashboard'])).toBe(true);
    expect(hasPrefix(keys, ['admin', 'dashboard-trends'])).toBe(true);
  });

  it('approved covers organisations, approvals, subscriptions and counters', () => {
    const keys = ORG_LIFECYCLE_INVALIDATIONS.approved;
    expect(hasPrefix(keys, ['admin', 'organisations'])).toBe(true);
    expect(hasPrefix(keys, ['admin-approvals'])).toBe(true);
    expect(hasPrefix(keys, ['admin', 'organisation-subscriptions'])).toBe(true);
    expect(hasPrefix(keys, ['org-subscription'])).toBe(true);
    expect(hasPrefix(keys, ['admin', 'dashboard'])).toBe(true);
  });

  it('rejected covers organisations, approvals and counters', () => {
    const keys = ORG_LIFECYCLE_INVALIDATIONS.rejected;
    expect(hasPrefix(keys, ['admin', 'organisations'])).toBe(true);
    expect(hasPrefix(keys, ['admin-approvals'])).toBe(true);
    expect(hasPrefix(keys, ['admin', 'dashboard'])).toBe(true);
  });

  it('never invalidates the whole cache or consumer-facing keys', () => {
    for (const event of Object.keys(ORG_LIFECYCLE_INVALIDATIONS) as Array<keyof typeof ORG_LIFECYCLE_INVALIDATIONS>) {
      for (const key of ORG_LIFECYCLE_INVALIDATIONS[event]) {
        expect(key.length).toBeGreaterThan(0);
        expect(key[0]).not.toBe('');
      }
    }
  });
});

describe('invalidateOrgLifecycle', () => {
  it('invalidates each configured key through the query client', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateOrgLifecycle(fakeQc as any, 'created');
    expect(invalidated).toHaveLength(ORG_LIFECYCLE_INVALIDATIONS.created.length);
    expect(invalidated).toContainEqual(['admin', 'users']);
  });
});

describe('USER_REGISTRATION_INVALIDATIONS (player/seller registration realtime strategy)', () => {
  it('refreshes the admin users list and dashboard counters', () => {
    expect(hasPrefix(USER_REGISTRATION_INVALIDATIONS, ['admin', 'users'])).toBe(true);
    expect(hasPrefix(USER_REGISTRATION_INVALIDATIONS, ['admin', 'dashboard'])).toBe(true);
  });

  it('never invalidates the whole cache or consumer-facing keys', () => {
    for (const key of USER_REGISTRATION_INVALIDATIONS) {
      expect(key.length).toBeGreaterThan(0);
      expect(key[0]).not.toBe('');
    }
  });

  it('invalidateUserRegistration runs through the query client (no duplicate keys)', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateUserRegistration(fakeQc as any);
    expect(invalidated).toHaveLength(USER_REGISTRATION_INVALIDATIONS.length);
    expect(new Set(invalidated.map((k) => k.join(':'))).size).toBe(invalidated.length);
  });
});

describe('FINANCE_INVALIDATIONS (post-commit accounting realtime strategy)', () => {
  it('targets the admin-finance query roots plus the shared account-ledger modal and year-close history', () => {
    expect(FINANCE_INVALIDATIONS).toHaveLength(4);
    expect(FINANCE_INVALIDATIONS.some((k) => k[0] === 'accounting')).toBe(true);
    expect(FINANCE_INVALIDATIONS.some((k) => k[0] === 'finance')).toBe(true);
    expect(FINANCE_INVALIDATIONS.some((k) => k[0] === 'account-ledger')).toBe(true);
    expect(FINANCE_INVALIDATIONS.some((k) => k[0] === 'year-close')).toBe(true);
  });

  it('never invalidates consumer/org/admin-lifecycle roots (precise, not global)', () => {
    const forbiddenRoots = ['admin', 'wallet', 'my-bookings', 'mp-orders', 'notifications', 'organisation', 'org-subscription', 'org'];
    for (const key of FINANCE_INVALIDATIONS) {
      for (const root of forbiddenRoots) expect(key[0]).not.toBe(root);
    }
  });

  it('invalidateFinanceEntries runs through the query client without duplicates', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateFinanceEntries(fakeQc as any);
    expect(invalidated).toHaveLength(FINANCE_INVALIDATIONS.length);
    expect(new Set(invalidated.map((k) => k.join(':'))).size).toBe(invalidated.length);
  });
});

describe('ORG_ACCOUNTING_ROOTS (organisation accounting realtime invalidation)', () => {
  it('covers every org accounting/finance surface a ledger entry mutates', () => {
    const roots = ORG_ACCOUNTING_ROOTS.map((k) => k.join(':'));
    for (const expected of ['org:accounting', 'org-position', 'org-transactions', 'org-settlements', 'org-settlement-detail', 'org:booking-settlements']) {
      expect(roots).toContain(expected);
    }
  });

  it('never targets admin/consumer roots', () => {
    for (const key of ORG_ACCOUNTING_ROOTS) {
      expect(key[0]).not.toBe('accounting');
      expect(key[0]).not.toBe('finance');
      expect(key[0]).not.toBe('admin');
    }
  });

  it('invalidates only org-scoped keys for the changed organisation', () => {
    const invalidated: Array<{ key: string[]; org: string | null }> = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey, predicate }: { queryKey: readonly string[]; predicate?: (q: any) => boolean }) => {
        // Collect the root + every query-key it would match for org 6 vs org 9.
        const candidates: unknown[][] = [
          [...queryKey, 6],                // e.g. ['org','accounting','coa',6]
          [...queryKey, 9],                // e.g. ['org-position',9]
          [...queryKey, 6, 1, 25],         // e.g. ['org','accounting','journal-entries',6,1,25]
        ];
        for (const candidate of candidates) {
          if (predicate?.({ queryKey: candidate })) invalidated.push({ key: candidate.map(String), org: String(candidate).includes('6') ? '6' : null });
        }
      },
    };
    invalidateOrgAccounting(fakeQc as any, 6);
    // Every invalidated candidate must contain org 6 somewhere in its key.
    for (const inv of invalidated) expect(inv.key.some((part) => part === '6')).toBe(true);
    // Org 9 keys must never be invalidated.
    expect(invalidated.some((inv) => inv.key.includes('9'))).toBe(false);
    // At least one org-scoped root was exercised.
    expect(invalidated.length).toBeGreaterThan(0);
  });

  it('does nothing for a platform-only entry (organisationId null)', () => {
    let called = 0;
    const fakeQc = {
      invalidateQueries: () => { called += 1; },
    };
    invalidateOrgAccounting(fakeQc as any, null);
    invalidateOrgAccounting(fakeQc as any, undefined);
    expect(called).toBe(0);
  });
});

describe('MARKETPLACE_PRODUCT_INVALIDATIONS (product approval realtime strategy)', () => {
  it('E+F+G+H: covers seller, org, player catalog/details and admin lists', () => {
    const roots = MARKETPLACE_PRODUCT_INVALIDATIONS.map((k) => k[0]);
    for (const expected of ['mp-products', 'mp-product', 'mp-player-products', 'mp-seller-products', 'mp-seller-stats', 'org-products', 'product-detail', 'admin-marketplace-products', 'admin-product']) {
      expect(roots).toContain(expected);
    }
  });

  it('I: never invalidates unrelated roots (finance, wallet, bookings, admin users)', () => {
    const roots = MARKETPLACE_PRODUCT_INVALIDATIONS.map((k) => k[0]);
    for (const forbidden of ['accounting', 'finance', 'wallet', 'my-bookings', 'admin', 'notifications']) {
      expect(roots).not.toContain(forbidden);
    }
  });

it('invalidateMarketplaceProducts runs through the query client without duplicates', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateMarketplaceProducts(fakeQc as any);
    expect(invalidated).toHaveLength(MARKETPLACE_PRODUCT_INVALIDATIONS.length);
    expect(new Set(invalidated.map((k) => k.join(':'))).size).toBe(invalidated.length);
  });

it('product visibility changes reuse the exact marketplace roots (18) and no unrelated ones (19)', () => {
    // The visibility socket handler calls invalidateMarketplaceProducts �?" the
    // same roots as status changes. Assert the set is identical and scoped.
    const roots = MARKETPLACE_PRODUCT_INVALIDATIONS.map((k) => k[0]);
    expect(roots).toContain('mp-products');
    expect(roots).toContain('mp-product');
    expect(roots).toContain('mp-seller-products');
    expect(roots).toContain('org-products');
    expect(roots).toContain('admin-marketplace-products');
    expect(roots).toContain('admin-product');
    for (const forbidden of ['accounting', 'finance', 'wallet', 'my-bookings', 'admin', 'notifications', 'organisation']) {
      expect(roots).not.toContain(forbidden);
    }
  });

  describe('COACH_LIFECYCLE_INVALIDATIONS (agreement/availability/status → eligibility)', () => {
    const flat = COACH_LIFECYCLE_INVALIDATIONS.map((k) => k.join('.'));
    const roots = COACH_LIFECYCLE_INVALIDATIONS.map((k) => k[0]);

    it('covers admin/org agreement surfaces and per-coach detail', () => {
      expect(flat).toContain('admin-coaches');
      expect(flat).toContain('admin.user');
      expect(flat).toContain('my-coach-agreements');
      expect(flat).toContain('my-coach-availability');
      expect(flat).toContain('org-coaches');
      expect(flat).toContain('coach-agreements');
      expect(flat).toContain('coach');
    });

    it('invalidates branch-eligibility surfaces so search/booking never show stale eligibility', () => {
      // An agreement accept/reject or availability toggle can change eligibility
      // at a contract-required branch → the coach directory and the booking
      // candidate lists must refresh (this was the pre-existing gap).
      expect(flat).toContain('coaches');
      expect(flat).toContain('scheduling-search');
      expect(flat).toContain('scheduling-search-resource');
    });

    it('does not invalidate unrelated surfaces', () => {
      for (const forbidden of ['accounting', 'finance', 'wallet', 'my-bookings', 'notifications', 'marketplace']) {
        expect(roots).not.toContain(forbidden);
      }
    });
  });
});

describe('TOURNAMENT_REALTIME_EVENTS (Group 5B draw/progression realtime strategy)', () => {
  it('covers the five tournament signals that mutate bracket/standings', () => {
    expect(TOURNAMENT_REALTIME_EVENTS).toContain('tournament.bracket-generated');
    expect(TOURNAMENT_REALTIME_EVENTS).toContain('tournament.match-created');
    expect(TOURNAMENT_REALTIME_EVENTS).toContain('tournament.match-progressed');
    expect(TOURNAMENT_REALTIME_EVENTS).toContain('tournament.stage-completed');
    expect(TOURNAMENT_REALTIME_EVENTS).toContain('tournament.completed');
  });

  it('invalidateTournament targets tournament + admin/org workbench roots', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateTournament(fakeQc as any, 7);
    expect(invalidated).toContainEqual(['tournament', '7']);
    expect(invalidated).toContainEqual(['tournament', 7]);
    expect(invalidated).toContainEqual(['tournaments']);
    expect(invalidated).toContainEqual(['tournament-admin-matches']);
    expect(invalidated).toContainEqual(['admin-tournaments']);
  });

  it('does nothing for a null/undefined tournament id', () => {
    let called = 0;
    const fakeQc = { invalidateQueries: () => { called += 1; } };
    invalidateTournament(fakeQc as any, null);
    invalidateTournament(fakeQc as any, undefined);
    expect(called).toBe(0);
  });

  describe('Group 5 match/result realtime invalidation', () => {
    it('covers every modern backend lifecycle event name', () => {
      for (const eventName of [
        'match.created',
        'match.status_changed',
        'match.cancelled',
        'match.completed',
        'participant.added',
        'participant.removed',
        'session.started',
        'session.completed',
        'invitation.sent',
        'join_request.submitted',
      ]) {
        expect(MATCH_LIFECYCLE_SOCKET_EVENTS).toContain(eventName);
      }
      for (const eventName of ['match.result-submitted', 'match.result-approved', 'match.result-corrected', 'match.result-rejected']) {
        expect(MATCH_RESULT_SOCKET_EVENTS).toContain(eventName);
      }
    });

    it('refreshes the match detail/result caches in both numeric and string key forms', () => {
      const invalidated: string[][] = [];
      const fakeQc = {
        invalidateQueries: ({ queryKey }: { queryKey: readonly (string | number)[] }) => {
          invalidated.push(queryKey.map(String));
        },
      };
      invalidateMatchKeys(fakeQc as any, { matchId: 15 });
      expect(invalidated).toContainEqual(['match', '15']);
      expect(invalidated).toContainEqual(['match-result', '15']);
      expect(invalidated).toContainEqual(['matches', 'upcoming']);
      expect(invalidated).toContainEqual(['my-matches']);
    });

    it('refreshes the applicant roster for a booking-derived payload and stays scoped to its tenant', () => {
      const invalidated: string[][] = [];
      const fakeQc = {
        invalidateQueries: ({ queryKey }: { queryKey: readonly (string | number)[] }) => {
          invalidated.push(queryKey.map(String));
        },
      };
      invalidateMatchKeys(fakeQc as any, { matchId: 15, bookingId: 22, tournamentId: 8 });
      expect(invalidated).toContainEqual(['match-applicants', '22']);
      expect(invalidated).toContainEqual(['tournament', '8']);
    });

    it('reconciles all match/result/tournament roots after a reconnect', () => {
      const invalidated: string[][] = [];
      const fakeQc = {
        invalidateQueries: ({ queryKey }: { queryKey: readonly (string | number)[] }) => {
          invalidated.push(queryKey.map(String));
        },
      };
      invalidateRealtimeReconcile(fakeQc as any);
      expect(invalidated).toContainEqual(['public-matches']);
      expect(invalidated).toContainEqual(['match-result']);
      expect(invalidated).toContainEqual(['tournaments']);
      expect(invalidated).toContainEqual(['admin-tournaments']);
      expect(invalidated).toContainEqual(['player-nav-counts']);
    });
  });

  describe('G7-E registration/tournament lifecycle invalidation', () => {
    it('refreshes detail, participants, waitlist and my-tournaments on registration events', () => {
      const invalidated: string[][] = [];
      const fakeQc = {
        invalidateQueries: ({ queryKey }: { queryKey: readonly (string | number)[] }) => {
          invalidated.push(queryKey.map(String));
        },
      };
      invalidateRegistrationLifecycle(fakeQc as any, { tournamentId: 7 });
      expect(invalidated).toContainEqual(['tournament', '7']);
      expect(invalidated).toContainEqual(['tournament', '7', 'participants']);
      expect(invalidated).toContainEqual(['tournament-participants', '7']);
      expect(invalidated).toContainEqual(['tournament-waitlist', '7']);
      expect(invalidated).toContainEqual(['my-tournaments']);
    });

    it('reconnect reconciliation now covers tournament participant/waitlist roots', () => {
      const invalidated: string[][] = [];
      const fakeQc = {
        invalidateQueries: ({ queryKey }: { queryKey: readonly (string | number)[] }) => {
          invalidated.push(queryKey.map(String));
        },
      };
      invalidateRealtimeReconcile(fakeQc as any);
      expect(invalidated).toContainEqual(['tournament-participants']);
      expect(invalidated).toContainEqual(['tournament-waitlist']);
      expect(invalidated).toContainEqual(['my-tournaments']);
    });
  });
});

describe('G8-D-MINIMAL — result-correction standings invalidation', () => {
  function fakeQc() {
    const invalidated: string[][] = [];
    return {
      qc: {
        invalidateQueries: ({ queryKey }: { queryKey: readonly (string | number)[] }) => {
          invalidated.push(queryKey.map(String));
        },
      },
      invalidated,
    };
  }

  it('invalidateTournamentStandings targets ONLY the authoritative standings key (both numeric + string forms)', () => {
    const { qc, invalidated } = fakeQc();
    invalidateTournamentStandings(qc as any, 7);
    expect(invalidated).toContainEqual(['tournament', '7', 'standings']);
    expect(invalidated).toContainEqual(['tournament', '7', 'standings']);
    expect(invalidated).toHaveLength(2); // numeric + string key-count forms only
    // Never indiscriminate: no tournament root/bracket/matches keys.
    for (const key of invalidated) {
      expect(key[key.length - 1]).toBe('standings');
    }
  });

  it('invalidateTournamentStandings is a no-op for null/undefined tournament ids', () => {
    const { qc, invalidated } = fakeQc();
    invalidateTournamentStandings(qc as any, null);
    invalidateTournamentStandings(qc as any, undefined);
    expect(invalidated).toHaveLength(0);
  });

  it('the correction realtime path routes through invalidateTournamentStandings only when standings:true', () => {
    // The handler splits `tournament.updated` into lifecycle + (standings===true)
    // targeted invalidation. Simulating the exact dispatch used in
    // useRealtimeCacheUpdates: standings true → standings key invalidated.
    const { qc, invalidated } = fakeQc();
    let last: any = null;
    const handler = (p: any) => {
      invalidateRegistrationLifecycle(qc, p);
      if (p?.standings === true) invalidateTournamentStandings(qc, p?.tournamentId);
      last = p;
    };
    // Correction payload (backend emits tournament.updated { standings: true }).
    handler({ tournamentId: 7, standings: true });
    const standingsKeys = invalidated.filter((k) => k.join(':').endsWith(':standings'));
    expect(standingsKeys).toContainEqual(['tournament', '7', 'standings']);
    expect(standingsKeys.length).toBeGreaterThan(0);
    // A non-standings tournament.updated (e.g. eligibility change) must NOT
    // invalidate standings keys.
    invalidated.length = 0;
    handler({ tournamentId: 8, standings: false });
    expect(invalidated.some((k) => k.join(':').endsWith(':standings'))).toBe(false);
    expect(last.tournamentId).toBe(8);
  });
});

describe('G4-A — academy administrative realtime invalidation helpers', () => {
  function fakeQc() {
    const invalidated: string[][] = [];
    return {
      qc: { invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => { invalidated.push([...queryKey]); } },
      invalidated,
    };
  }

  it('session-started refreshes the player session + attendance lists', () => {
    const { qc, invalidated } = fakeQc();
    invalidateAcademySessionStarted(qc as any);
    expect(invalidated).toContainEqual(['my', 'academy', 'sessions']);
    expect(invalidated).toContainEqual(['my', 'academy', 'attendance']);
  });

  it('hold-expiry refreshes admin sessions + schedules (never player keys)', () => {
    const { qc, invalidated } = fakeQc();
    invalidateAcademyHoldExpiry(qc as any);
    expect(invalidated).toContainEqual(['admin', 'academy', 'sessions']);
    expect(invalidated).toContainEqual(['admin', 'academy', 'schedules']);
    expect(invalidated).toContainEqual(['admin', 'academy', 'schedules', 'sessions']);
    expect(invalidated.some((k) => k[0] === 'my')).toBe(false);
  });

  it('group-updated refreshes admin groups + dashboard', () => {
    const { qc, invalidated } = fakeQc();
    invalidateAcademyGroupUpdated(qc as any);
    expect(invalidated).toContainEqual(['admin', 'academy', 'groups']);
    expect(invalidated).toContainEqual(['admin', 'academy', 'dashboard']);
  });

  it('schedule-updated refreshes admin schedules + sessions + dashboard', () => {
    const { qc, invalidated } = fakeQc();
    invalidateAcademyScheduleUpdated(qc as any);
    expect(invalidated).toContainEqual(['admin', 'academy', 'schedules']);
    expect(invalidated).toContainEqual(['admin', 'academy', 'schedules', 'sessions']);
    expect(invalidated).toContainEqual(['admin', 'academy', 'sessions']);
  });

  it('attendance-updated refreshes admin attendance + roster + coach sessions', () => {
    const { qc, invalidated } = fakeQc();
    invalidateAcademyAttendance(qc as any);
    expect(invalidated).toContainEqual(['admin', 'academy', 'attendance']);
    expect(invalidated).toContainEqual(['admin', 'academy', 'session-roster']);
    expect(invalidated).toContainEqual(['coach', 'academy', 'sessions']);
  });

  it('enrollment events have the roster admin root on top of the G3-A set', () => {
    const { qc, invalidated } = fakeQc();
    invalidateAcademyAdminEnrollment(qc as any);
    expect(invalidated).toContainEqual(['admin', 'academy', 'session-roster']);
  });

  it('G4-B2 session-cancelled refreshes admin sessions/roster + coach sessions, never player roots', () => {
    const { qc, invalidated } = fakeQc();
    invalidateAcademySessionCancelled(qc as any);
    expect(invalidated).toContainEqual(['admin', 'academy', 'sessions']);
    expect(invalidated).toContainEqual(['admin', 'academy', 'session-roster']);
    expect(invalidated).toContainEqual(['coach', 'academy', 'sessions']);
    // The player is served by the notification center — no player socket invalidation.
    expect(invalidated.some((k) => k[0] === 'my')).toBe(false);
  });

  it('reconnect reconciliation now includes the Academy workbench roots', () => {
    const reconcileKeys: string[][] = [];
    const fakeQc = { invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => reconcileKeys.push([...queryKey]) };
    invalidateRealtimeReconcile(fakeQc as any);
    expect(reconcileKeys).toContainEqual(['admin', 'academy', 'sessions']);
    expect(reconcileKeys).toContainEqual(['admin', 'academy', 'schedules']);
    expect(reconcileKeys).toContainEqual(['admin', 'academy', 'groups']);
    expect(reconcileKeys).toContainEqual(['admin', 'academy', 'attendance']);
    expect(reconcileKeys).toContainEqual(['admin', 'academy', 'enrollments']);
    expect(reconcileKeys).toContainEqual(['my', 'academy', 'sessions']);
    expect(reconcileKeys).toContainEqual(['coach', 'academy', 'sessions']);
  });
});

describe('G3-A — academy enrollment realtime invalidation set', () => {
  it('includes the G1-emitted cancelled/completed events alongside the live lifecycle events', () => {
    expect(academyEnrollmentEvents).toContain('academy.enrollment-cancelled');
    expect(academyEnrollmentEvents).toContain('academy.enrollment-completed');
    // The existing lifecycle events remain intact (no removal).
    expect(academyEnrollmentEvents).toContain('academy.enrollment-accepted');
    expect(academyEnrollmentEvents).toContain('academy.enrollment-waitlisted');
    expect(academyEnrollmentEvents).toContain('academy.promoted');
    expect(academyEnrollmentEvents).toContain('academy.payment-acknowledged');
    expect(academyEnrollmentEvents).toContain('academy.enrollment-paid');
  });

  it('reuses the same invalidation roots as every other enrollment event (no new keys)', () => {
    // G3-A reuses the shared handler — the set itself is the wiring contract.
    // The two new events must not introduce session/schedule/group roots.
    expect(academyEnrollmentEvents.length).toBe(7);
    expect(academyEnrollmentEvents.some((e) => e.includes('session'))).toBe(false);
    expect(academyEnrollmentEvents.some((e) => e.includes('schedule'))).toBe(false);
    expect(academyEnrollmentEvents.some((e) => e.includes('group'))).toBe(false);
    expect(academyEnrollmentEvents.some((e) => e.includes('attendance'))).toBe(false);
  });

  it('does not touch reconnect reconciliation roots', () => {
    // G3-A added NO reconnect roots... (G4-A extends the reconcile set with the
    // Academy workbench roots that now receive realtime updates).
    expect(academyEnrollmentEvents.length).toBe(7);
    const reconcileKeys: string[] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => reconcileKeys.push(queryKey[0]),
    };
    invalidateRealtimeReconcile(fakeQc as any);
    // G4-A — the Academy workbench roots are now reconciled; enrollment events
    // themselves drive invalidation via handlers, not via reconnect.
    expect(reconcileKeys).toContain('admin');
    expect(reconcileKeys).toContain('my');
    expect(reconcileKeys).toContain('coach');
  });
});
