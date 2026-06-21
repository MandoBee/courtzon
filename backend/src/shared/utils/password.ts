import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const HASH_ALGORITHM = 'sha512';
const KEY_LENGTH = 64;
const ITERATIONS = 210000;
const SALT_LENGTH = 32;

function fromBase64url(base64url: string): Buffer {
  return Buffer.from(base64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function toBase64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, HASH_ALGORITHM);
  const version = Buffer.from([2]);
  const iterationsBuf = Buffer.alloc(4);
  iterationsBuf.writeUInt32BE(ITERATIONS);
  const keyLenBuf = Buffer.alloc(2);
  keyLenBuf.writeUInt16BE(KEY_LENGTH);
  const parts = [version, iterationsBuf, keyLenBuf, salt, hash];
  const combined = Buffer.concat(parts);
  return `$pbkdf2-${HASH_ALGORITHM}$${toBase64url(combined)}`;
}

export function verifyPassword(password: string, hashed: string): boolean {
  if (!hashed.startsWith('$pbkdf2-')) {
    return false;
  }
  const parts = hashed.split('$');
  if (parts.length !== 3) {
    return false;
  }
  const raw = fromBase64url(parts[2]);
  if (raw.length < 7) {
    return false;
  }
  const version = raw[0];
  if (version !== 2) {
    return false;
  }
  const iterations = raw.readUInt32BE(1);
  const keyLen = raw.readUInt16BE(5);
  const salt = raw.subarray(7, 7 + SALT_LENGTH);
  const storedHash = raw.subarray(7 + SALT_LENGTH);
  const computedHash = pbkdf2Sync(password, salt, iterations, keyLen, HASH_ALGORITHM);
  if (computedHash.length !== storedHash.length) {
    return false;
  }
  return timingSafeEqual(computedHash, storedHash);
}
