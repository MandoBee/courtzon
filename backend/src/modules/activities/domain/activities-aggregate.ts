export type ActivityStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface ActivityRecord {
  id: number;
  activity_type: string;
  status: ActivityStatus;
  user_id: number;
  aggregate_version: number;
}

export const ALLOWED_ACTIVITY_TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function assertValidActivityTransition(from: ActivityStatus, to: ActivityStatus): void {
  const allowed = ALLOWED_ACTIVITY_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal activity state transition: ${from} → ${to}`);
  }
}
