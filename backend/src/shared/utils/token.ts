import { randomBytes, createHash } from 'node:crypto';

export function generateSessionToken(): string {
  return randomBytes(48).toString('base64url');
}

export function generateRefreshToken(): string {
  return randomBytes(64).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateUUID(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function generateQRToken(bookingId: number): string {
  const payload = `${bookingId}:${Date.now()}:${randomBytes(8).toString('hex')}`;
  return `QR_${randomBytes(16).toString('base64url')}_${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}
