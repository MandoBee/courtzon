export function room(prefix: string, id: string | number): string {
  return `${prefix}:${id}`;
}

export function userRoom(id: number): string {
  return room('user', id);
}

export function orgRoom(id: number): string {
  return room('organisation', id);
}

export function branchRoom(id: number): string {
  return room('branch', id);
}

export function bookingRoom(id: number): string {
  return room('booking', id);
}

export function matchRoom(id: number): string {
  return room('match', id);
}

export function conversationRoom(id: number): string {
  return room('conversation', id);
}

export const ADMIN_ROOM = 'admin';
export const PLAYER_ROOM = 'player';
export const COACH_ROOM = 'coach';
