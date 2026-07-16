import { activitiesRepository } from '../../activities/infrastructure/repositories/activities.repository.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { ResourceProvider, TimeSlot, ResourceCapabilities, LocationInfo } from '../types.js';

const log = createModuleLogger('scheduling');
const TERMINAL_STATUSES = ['completed', 'cancelled', 'no_show'];

export class CoachProvider implements ResourceProvider {
  readonly resourceType = 'coach';
  readonly entityId: number;

  constructor(coachId: number) {
    this.entityId = coachId;
  }

  async getAvailableSlots(date: string, dayOfWeek: number): Promise<TimeSlot[]> {
    const weeklySchedule = await activitiesRepository.getCoachAvailability(this.entityId);
    const daySlots = weeklySchedule.filter((s: any) => s.day_of_week === dayOfWeek);

    if (daySlots.length === 0) return [];

    const blackouts = await activitiesRepository.getCoachBlackouts(this.entityId, date);
    const isBlackout = blackouts.some((b: any) => b.blackout_date === date);
    if (isBlackout) return [];

    const existingSessions = await this.getExistingSessions(date);
    const available: TimeSlot[] = [];

    for (const slot of daySlots) {
      const slotStart = slot.start_time;
      const slotEnd = slot.end_time;

      const hasConflict = existingSessions.some((s: any) => {
        const sessionStart = String(s.start_time).slice(11, 16);
        const sessionEnd = String(s.end_time).slice(11, 16);
        return sessionStart < slotEnd && sessionEnd > slotStart;
      });

      if (!hasConflict) {
        available.push({ startTime: slotStart, endTime: slotEnd });
      }
    }

    return available;
  }

  async hasConflict(startTime: string, endTime: string, date: string): Promise<boolean> {
    const sessions = await this.getExistingSessions(date);
    return sessions.some((s: any) => {
      const sessionStart = String(s.start_time).slice(11, 16);
      const sessionEnd = String(s.end_time).slice(11, 16);
      return sessionStart < endTime && sessionEnd > startTime;
    });
  }

  async getCapabilities(): Promise<ResourceCapabilities> {
    const profile = await activitiesRepository.findCoachById(this.entityId);
    if (!profile) {
      return { sportIds: [] };
    }

    let sportIds: number[] = [];
    if (profile.sports) {
      try {
        sportIds = typeof profile.sports === 'string' ? JSON.parse(profile.sports) : profile.sports;
      } catch { sportIds = []; }
    }

    let sessionDurations: number[] | undefined;
    if (profile.session_durations) {
      try {
        sessionDurations = typeof profile.session_durations === 'string'
          ? JSON.parse(profile.session_durations)
          : profile.session_durations;
      } catch { sessionDurations = undefined; }
    }

    let certifications: string[] | undefined;
    if (profile.certifications) {
      try {
        const raw = typeof profile.certifications === 'string'
          ? JSON.parse(profile.certifications)
          : profile.certifications;
        certifications = Array.isArray(raw) ? raw.map((c: any) => c.name || c) : undefined;
      } catch { certifications = undefined; }
    }

    return {
      sportIds,
      experienceYears: profile.experience_years ?? undefined,
      certifications,
      sessionDurations,
      hourlyRate: profile.hourly_rate ? Number(profile.hourly_rate) : undefined,
      currencyCode: profile.currency_code ?? undefined,
    };
  }

  async getLocation(): Promise<LocationInfo | null> {
    const agreements = await activitiesRepository.findOrgAgreements(this.entityId);
    if (agreements.length === 0) return null;

    const first = agreements[0] as any;
    return {
      branchId: first.branch_id ?? undefined,
      branchName: first.branch_name ?? undefined,
      organisationId: first.organisation_id,
      organisationName: first.organisation_name ?? undefined,
    };
  }

  async isAvailable(): Promise<boolean> {
    const profile = await activitiesRepository.findCoachById(this.entityId);
    if (!profile) return false;
    const available = profile.status === 'approved' && profile.is_available === 1;
    log.debug({ coachId: this.entityId, status: profile.status, isAvailable: profile.is_available, result: available }, 'Coach availability check');
    return available;
  }

  private async getExistingSessions(date: string): Promise<any[]> {
    const sessions = await activitiesRepository.findScheduledSessionsOnDate(this.entityId, date);
    return sessions.filter((s: any) => !TERMINAL_STATUSES.includes(s.status));
  }
}
