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

const IPV6_RE =
  /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})$|^:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)$|^fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}$|^::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])$/;

export function isValidPublicIpv4(ip: string): boolean {
  const n = normalizeIp(ip);
  if (!IPV4_RE.test(n)) return false;
  return !isPrivateOrLocalIp(n);
}

export function isValidPublicIp(raw: string): boolean {
  const n = normalizeIp(raw);
  if (IPV4_RE.test(n)) return !isPrivateOrLocalIp(n);
  if (IPV6_RE.test(n)) return !isPrivateOrLocalIp(n);
  return false;
}

export function getClientIp(request: FastifyRequest): string | null {
  const cfIp = request.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim() && isValidPublicIp(cfIp.trim())) {
    return cfIp.trim();
  }

  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first && isValidPublicIp(first)) return first;
  }

  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim() && isValidPublicIp(realIp.trim())) {
    return realIp.trim();
  }

  const ip = request.ip ? normalizeIp(request.ip) : null;
  if (ip && isValidPublicIp(ip)) return ip;

  return null;
}

export interface IpSources {
  cfConnectingIp: string | null;
  xForwardedFor: string | null;
  xRealIp: string | null;
  requestIp: string | null;
  clientIp: string | null;
}

export function getAllIpSources(request: FastifyRequest): IpSources {
  return {
    cfConnectingIp: typeof request.headers['cf-connecting-ip'] === 'string'
      ? request.headers['cf-connecting-ip'] : null,
    xForwardedFor: typeof request.headers['x-forwarded-for'] === 'string'
      ? request.headers['x-forwarded-for'] : null,
    xRealIp: typeof request.headers['x-real-ip'] === 'string'
      ? request.headers['x-real-ip'] : null,
    requestIp: request.ip ?? null,
    clientIp: getClientIp(request),
  };
}
