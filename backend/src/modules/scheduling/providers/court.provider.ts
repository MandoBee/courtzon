import { getPool } from '../../../database/mysql.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { bookingRepository } from '../../booking/infrastructure/repositories/booking.repository.js';
import { TimeEngine } from '../../time/time-engine.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { ResourceProvider, TimeSlot, ResourceCapabilities, LocationInfo } from '../types.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

const log = createModuleLogger('scheduling');

export class CourtProvider implements ResourceProvider {
  readonly resourceType = 'court';
  readonly entityId: number;

  constructor(resourceId: number) {
    this.entityId = resourceId;
  }

  async getAvailableSlots(date: string, _dayOfWeek: number): Promise<TimeSlot[]> {
    const resource = await resourceRepository.findById(this.entityId);
    if (!resource) return [];

    const opening = resource.opening_time || '08:00';
    const closing = resource.closing_time || '22:00';
    const duration = resource.slot_duration || resource.default_slot_duration || 60;

    const pool = getPool();
    const [branchRows] = await pool.execute<RowData>(
      `SELECT timezone FROM branches WHERE id = ?`, [resource.branch_id]
    );
    const tz = (branchRows[0] as any)?.timezone || 'Africa/Cairo';

    const slots = TimeEngine.generateSlots(date, opening, closing, duration, tz);
    const existingBookings = await bookingRepository.findBookingsByBusinessDate(this.entityId, date);
    const resolved = TimeEngine.resolveAvailability(slots, existingBookings);

    return resolved
      .filter(s => s.status === 'available')
      .map(s => ({ startTime: s.localStartTime, endTime: s.localEndTime }));
  }

  async hasConflict(startTime: string, endTime: string, date: string): Promise<boolean> {
    const existingBookings = await bookingRepository.findBookingsByBusinessDate(this.entityId, date);
    return existingBookings.some((b: any) => {
      const bStart = String(b.start_at_utc);
      const bEnd = String(b.end_at_utc);
      if (!bStart || !bEnd) return false;
      const slotStartMs = new Date(`${date}T${startTime}`).getTime();
      const slotEndMs = new Date(`${date}T${endTime}`).getTime();
      const bStartMs = new Date(bStart).getTime();
      const bEndMs = new Date(bEnd).getTime();
      return slotStartMs < bEndMs && slotEndMs > bStartMs;
    });
  }

  async getCapabilities(): Promise<ResourceCapabilities> {
    const resource = await resourceRepository.findById(this.entityId);
    if (!resource) return { sportIds: [] };

    return {
      sportIds: resource.sport_id ? [resource.sport_id] : [],
      hourlyRate: resource.hourly_price ? Number(resource.hourly_price) : undefined,
      currencyCode: undefined,
    };
  }

  async getLocation(): Promise<LocationInfo | null> {
    const resource = await resourceRepository.findById(this.entityId);
    if (!resource) return null;

    const pool = getPool();
    const [branchRows] = await pool.execute<RowData>(
      `SELECT b.id, b.name, b.organisation_id, b.latitude, b.longitude, o.name as org_name
       FROM branches b
       LEFT JOIN organisations o ON b.organisation_id = o.id
       WHERE b.id = ?`, [resource.branch_id]
    );
    const branch = branchRows[0] as any;
    if (!branch) return null;

    return {
      branchId: branch.id,
      branchName: branch.name,
      organisationId: branch.organisation_id,
      organisationName: branch.org_name ?? undefined,
      latitude: branch.latitude ? Number(branch.latitude) : undefined,
      longitude: branch.longitude ? Number(branch.longitude) : undefined,
    };
  }

  async isAvailable(): Promise<boolean> {
    const resource = await resourceRepository.findById(this.entityId);
    if (!resource) return false;
    const available = resource.is_active === 1;
    log.debug({ courtId: this.entityId, isActive: resource.is_active, result: available }, 'Court availability check');
    return available;
  }
}
