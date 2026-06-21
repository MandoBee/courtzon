import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('hashPassword', () => {
  it('should return a string starting with $pbkdf2-sha512$', () => {
    const hash = hashPassword('testpassword');
    expect(hash).toMatch(/^\$pbkdf2-sha512\$/);
  });

  it('should produce different hashes for same password (different salt)', () => {
    const h1 = hashPassword('hello');
    const h2 = hashPassword('hello');
    expect(h1).not.toBe(h2);
  });
});

describe('verifyPassword', () => {
  it('should verify correct password', () => {
    const hash = hashPassword('mypassword');
    expect(verifyPassword('mypassword', hash)).toBe(true);
  });

  it('should reject incorrect password', () => {
    const hash = hashPassword('mypassword');
    expect(verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('should reject malformed hash string', () => {
    expect(verifyPassword('any', 'notahash')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(verifyPassword('any', '')).toBe(false);
  });
});
