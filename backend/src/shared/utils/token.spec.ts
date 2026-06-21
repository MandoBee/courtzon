import { describe, it, expect } from 'vitest';
import { generateSessionToken, generateRefreshToken, generateUUID, generateQRToken, hashToken } from './token.js';

describe('generateSessionToken', () => {
  it('should produce a base64url string', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should produce unique tokens', () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(t1).not.toBe(t2);
  });
});

describe('generateRefreshToken', () => {
  it('should produce a longer base64url string', () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(generateSessionToken().length);
  });
});

describe('generateUUID', () => {
  it('should produce valid UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should produce unique UUIDs', () => {
    const u1 = generateUUID();
    const u2 = generateUUID();
    expect(u1).not.toBe(u2);
  });
});

describe('generateQRToken', () => {
  it('should produce a token starting with QR_', () => {
    const token = generateQRToken(1);
    expect(token).toMatch(/^QR_/);
  });

  it('should differ for different booking IDs', () => {
    const t1 = generateQRToken(1);
    const t2 = generateQRToken(2);
    expect(t1).not.toBe(t2);
  });
});

describe('hashToken', () => {
  it('should produce a SHA-256 hex string', () => {
    const hash = hashToken('sometoken');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('should produce different hashes for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('xyz'));
  });
});
