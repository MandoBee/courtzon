export interface TimeSlot {
  startTime: string;
  endTime: string;
}

export interface ResourceCapabilities {
  sportIds: number[];
  experienceYears?: number;
  certifications?: string[];
  sessionDurations?: number[];
  hourlyRate?: number;
  currencyCode?: string;
}

export interface LocationInfo {
  branchId?: number;
  branchName?: string;
  organisationId?: number;
  organisationName?: string;
  latitude?: number;
  longitude?: number;
}

export interface ResourceProvider {
  readonly resourceType: string;
  readonly entityId: number;

  getAvailableSlots(date: string, dayOfWeek: number): Promise<TimeSlot[]>;
  hasConflict(startTime: string, endTime: string, date: string): Promise<boolean>;
  getCapabilities(): Promise<ResourceCapabilities>;
  getLocation(): Promise<LocationInfo | null>;
  isAvailable(): Promise<boolean>;
}

export interface ResourceSlot {
  resourceType: string;
  resourceId: number;
  provider: ResourceProvider;
  slot: TimeSlot;
  capabilities: ResourceCapabilities;
  location: LocationInfo | null;
}

export type CrossConstraint =
  | { type: 'sport_match'; from: string; to: string }
  | { type: 'location_match'; from: string; to: string };

export interface ActivityConfig {
  activityType: string;
  requiredResources: { resourceType: string }[];
  crossConstraints: CrossConstraint[];
}

export interface BookingRequest {
  activityType: string;
  date: string;
  dayOfWeek: number;
  durationMinutes: number;
  constraints: Record<string, any>;
}

export interface BookingCandidate {
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  resources: ResourceSlot[];
  totalPrice: number;
  currencyCode?: string;
  score: number;
}
