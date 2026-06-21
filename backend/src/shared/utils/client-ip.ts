import type { FastifyRequest } from 'fastify';

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const n = normalizeIp(ip);
  if (n === '127.0.0.1' || n === '::1' || n === 'localhost') return true;
  if (n.startsWith('10.')) return true;
  if (n.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(n)) return true;
  if (n.startsWith('fc') || n.startsWith('fd') || n.startsWith('fe80')) return true;
  return false;
}

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

export function isValidPublicIpv4(ip: string): boolean {
  const n = normalizeIp(ip);
  if (!IPV4_RE.test(n)) return false;
  return !isPrivateOrLocalIp(n);
}

export function getClientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first && isValidPublicIpv4(first)) return first;
  }

  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim() && isValidPublicIpv4(realIp.trim())) {
    return realIp.trim();
  }

  const ip = request.ip ? normalizeIp(request.ip) : null;
  if (ip && isValidPublicIpv4(ip)) return ip;

  return null;
}
