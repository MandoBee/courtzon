import type { SocketRoom, SocketEvent } from './realtime-types.js';

export function buildUserRooms(userId: number, roles: string[], organisationIds: number[], branchIds: number[]): SocketRoom[] {
  const rooms: SocketRoom[] = [`user:${userId}`];
  for (const orgId of organisationIds) rooms.push(`organisation:${orgId}`);
  for (const branchId of branchIds) rooms.push(`branch:${branchId}`);
  if (roles.includes('super_admin') || roles.includes('super-admin')) rooms.push('superadmin');
  if (roles.some(r => r.startsWith('finance') || r === 'super_admin')) rooms.push('finance');
  return rooms;
}

export function createSocketEvent(type: string, payload: Record<string, unknown>): SocketEvent {
  return { type, payload, timestamp: new Date().toISOString() };
}

export function shouldBroadcastToRoom(room: SocketRoom, eventName: string): boolean {
  if (room.startsWith('superadmin') || room === 'finance') return true;
  if (room.startsWith('user:') || room.startsWith('organisation:') || room.startsWith('branch:')) return true;
  if (room.startsWith('booking:') || room.startsWith('academy:') || room.startsWith('coach:')) return true;
  if (room.startsWith('marketplace:')) return true;
  return false;
}
