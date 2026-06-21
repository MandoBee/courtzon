import { randomBytes, pbkdf2Sync } from 'node:crypto';

const HASH_ALGORITHM = 'sha512';
const KEY_LENGTH = 64;
const ITERATIONS = 210000;
const SALT_LENGTH = 32;

function toBase64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hashPassword(password) {
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

console.log(hashPassword('123456'));
