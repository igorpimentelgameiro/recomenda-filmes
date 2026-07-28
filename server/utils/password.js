import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash).split(':');
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, KEY_LENGTH);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
