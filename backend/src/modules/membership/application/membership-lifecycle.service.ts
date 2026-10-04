import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { recordAudit } from '../../audit-log/index.js';
import { membershipP1Repository } from '../infrastructure/repositories/membership-p1.repository.js';
import { membershipP2Repository } from '../infrastructure/repositories/membership-p2.repository.js';
import { deriveEligibility, type MembershipEligibilityFacts } from '../domain/membership-p2.types.js';

const log = createModuleLogger('membership-subscription-lifecycle');

/**
 * G11.22 P2 — subscription lifecycle workers (overdue / expiry / grace /
 * reminders). Decisions #2/#4/#5: overdue NEVER deactivates; the membership
 * stays 'active' until the normal period end (+ derived grace window);
 * post-expiry payments remain collectible.
 */
export const membershipLifecycleService = {

  /**
   * Daily sweep — mark pending installments overdue (decision #2). Multiple
   * overdue installments are allowed (each is flagged independently). This ONLY
   * changes the installment status; the subscription status is untouched.
   */
  async processOverdue(): Promise<number> {
    const candidates = await membershipP2Repository.listOverdueCandidates();
    let marked = 0;
    for (const row of candidates) {
      const changed = await membershipP2Repository.markOverdue(Number(row.id));
      if (!changed) continue;
      marked++;
      recordAudit({
        actorId: null as unknown as number,
        action: 'MEMBERSHIP_INSTALLMENT.OVERDUE',
        entityType: 'membership_installment',
        entityId: Number(row.id),
        afterState: { subscriptionId: Number(row.subscription_id), seq: Number(row.seq), dueDate: row.due_date },
      });
      eventBusV2.emit('membership:installment-overdue', {
        subscriptionId: Number(row.subscription_id), installmentId: Number(row.id), seq: Number(row.seq),
        amount: Number(row.amount), dueDate: row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : String(row.due_date).slice(0, 10),
      } as Record<string, unknown>, {
        aggregateType: 'membership_installment', aggregateId: String(row.id), aggregateVersion: 1,
      });
    }
    if (marked) log.info({ marked }, 'Membership installments marked overdue');
    return marked;
  },

  /**
   * Daily sweep — expire subscriptions whose term AND grace have fully ended.
   * While inside the grace window the membership stays 'active' (derived grace,
   * decision #5). Grace-started is emitted on the day the term ends (grace
   * window opens) so players get one deterministic notice.
   */
  async processExpiry(): Promise<{ expired: number; inGrace: number }> {
    const candidates = await membershipP2Repository.listExpiredCandidates();
    let expired = 0;
    let inGrace = 0;
    for (const row of candidates) {
      const userId = Number(row.user_id);
      const organisationId = Number(row.organisation_id);
      const subscriptionId = Number(row.id);
      const graceUntil = row.grace_until ? (row.grace_until instanceof Date ? row.grace_until.toISOString().slice(0, 10) : String(row.grace_until).slice(0, 10)) : null;
      const endDate = row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date).slice(0, 10)) : null;

      if (!graceUntil || graceUntil < this.today()) {
        const changed = await membershipP2Repository.setSubscriptionExpired(subscriptionId);
        if (!changed) continue;
        expired++;
        recordAudit({ actorId: null as unknown as number, action: 'MEMBERSHIP_SUBSCRIPTION.EXPIRED', entityType: 'membership_subscription', entityId: subscriptionId, afterState: { subscriptionId } });
        eventBusV2.emit('membership:expired', { subscriptionId, userId, organisationId, endDate } as Record<string, unknown>, {
          aggregateType: 'membership_subscription', aggregateId: String(subscriptionId), aggregateVersion: 1,
        });
      } else {
        // Inside the grace window — stay active. Detect the day the grace
        // window opened (end_date = yesterday) to emit grace-started ONCE.
        inGrace++;
        if (endDate && this.daysSince(endDate) === 1) {
          recordAudit({ actorId: null as unknown as number, action: 'MEMBERSHIP_SUBSCRIPTION.GRACE_STARTED', entityType: 'membership_subscription', entityId: subscriptionId, afterState: { subscriptionId, graceUntil } });
          eventBusV2.emit('membership:grace-started', { subscriptionId, userId, organisationId, graceUntil } as Record<string, unknown>, {
            aggregateType: 'membership_subscription', aggregateId: String(subscriptionId), aggregateVersion: 1,
          });
        }
      }
    }
    if (expired || inGrace) log.info({ expired, inGrace }, 'Membership subscription expiry sweep complete');
    return { expired, inGrace };
  },

  /**
   * Daily sweep — send upcoming due / renewal / grace-ending reminders.
   * Never changes state; purely notification emissions.
   */
  async processReminders(): Promise<number> {
    let emitted = 0;

    // Renewal reminders (7/3/1 days) + renewal-due on the final day.
    for (const days of [7, 3, 1]) {
      const rows = await membershipP2Repository.listRenewalReminderCandidates(days);
      for (const r of rows) {
        const eventName = days === 1 && this.daysUntil(String(r.end_date).slice(0, 10) || '') === 1
          ? 'membership:renewal-due'
          : 'membership:renewal-reminder';
        eventBusV2.emit(eventName, {
          subscriptionId: Number(r.id), userId: Number(r.user_id), organisationId: Number(r.organisation_id),
          planId: Number(r.plan_id), daysLeft: days, endDate: r.end_date instanceof Date ? r.end_date.toISOString().slice(0, 10) : String(r.end_date).slice(0, 10),
        } as Record<string, unknown>, {
          aggregateType: 'membership_subscription', aggregateId: String(r.id), aggregateVersion: 1,
        });
        emitted++;
      }
    }

    // Grace ending soon (3 days).
    const graceRows = await membershipP2Repository.listGraceEndingSoon(3);
    for (const r of graceRows) {
      const graceUntil = r.grace_until instanceof Date ? r.grace_until.toISOString().slice(0, 10) : String(r.grace_until).slice(0, 10);
      eventBusV2.emit('membership:grace-ending', {
        subscriptionId: Number(r.id), userId: Number(r.user_id), organisationId: Number(r.organisation_id), graceUntil, daysLeft: 3,
      } as Record<string, unknown>, {
        aggregateType: 'membership_subscription', aggregateId: String(r.id), aggregateVersion: 1,
      });
      emitted++;
    }

    // Installment due reminders (3/1 days before due_date).
    for (const days of [3, 1]) {
      const dueRows = await membershipP2Repository.listInstallmentDueSoon(days);
      for (const r of dueRows) {
        eventBusV2.emit('membership:installment-due', {
          subscriptionId: Number(r.subscription_id), installmentId: Number(r.id), seq: Number(r.seq),
          amount: Number(r.amount), dueDate: r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date).slice(0, 10),
          userId: Number(r.user_id), organisationId: Number(r.organisation_id),
        } as Record<string, unknown>, {
          aggregateType: 'membership_installment', aggregateId: String(r.id), aggregateVersion: 1,
        });
        emitted++;
      }
    }

    if (emitted) log.info({ emitted }, 'Membership subscription reminders dispatched');
    return emitted;
  },

  /** Eligibility FACTS service — pure facts, no enforcement (decision #28). */
  async getEligibility(subscriptionId: number): Promise<MembershipEligibilityFacts | null> {
    const row = await membershipP1Repository.findSubscription(subscriptionId);
    if (!row) return null;
    const instRows = await membershipP2Repository.listInstallmentsBySubscription(subscriptionId);
    return deriveEligibility({
      subscriptionId: Number(row.id),
      status: row.status,
      paymentStatus: row.payment_status,
      endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date).slice(0, 10)) : null,
      graceUntil: row.grace_until ? (row.grace_until instanceof Date ? row.grace_until.toISOString().slice(0, 10) : String(row.grace_until).slice(0, 10)) : null,
      installments: instRows.map((i) => ({
        amount: Number(i.amount), commissionAmount: Number(i.commission_amount), status: i.status,
      })),
    });
  },

  today(): string {
    return new Date().toISOString().slice(0, 10);
  },

  daysSince(iso: string): number {
    const now = new Date(`${this.today()}T00:00:00Z`).getTime();
    return Math.max(0, Math.floor((now - new Date(`${iso}T00:00:00Z`).getTime()) / 86400000));
  },

  daysUntil(iso: string): number {
    const now = new Date(`${this.today()}T00:00:00Z`).getTime();
    return Math.max(0, Math.floor((new Date(`${iso}T00:00:00Z`).getTime() - now) / 86400000));
  },
};