export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface SessionRecord {
  id: number;
  coach_id: number;
  user_id: number;
  booking_id: number | null;
  status: SessionStatus;
  start_time: string;
  end_time: string;
  aggregate_version: number;
}

export interface BookSessionRequest {
  coachId: number;
  userId: number;
  resourceId: number;
  date: string;
  startTime: string;
  endTime: string;
  branchId: number;
  organisationId: number;
}

export function isTimeSlotAvailable(existingSlots: Array<{ startTime: string; endTime: string }>, newStart: string, newEnd: string): boolean {
  const newStartM = toMinutes(newStart);
  const newEndM = toMinutes(newEnd);
  return !existingSlots.some(slot => {
    const slotStartM = toMinutes(slot.startTime);
    const slotEndM = toMinutes(slot.endTime);
    return newStartM < slotEndM && newEndM > slotStartM;
  });
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
