export interface SocketEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface RoomAssignment {
  userId: number;
  rooms: string[];
}

export type SocketRoom =
  | `user:${number}`
  | `organisation:${number}`
  | `branch:${number}`
  | `academy:${number}`
  | `booking:${number}`
  | `coach:${number}`
  | 'superadmin'
  | 'finance'
  | `marketplace:seller:${number}`;

export interface AuthenticatedSocket {
  userId: number;
  roles: string[];
  organisationIds: number[];
  branchIds: number[];
}

export const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
export const HEARTBEAT_INTERVAL = 25000;
export const HEARTBEAT_TIMEOUT = 10000;
