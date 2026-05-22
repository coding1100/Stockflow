import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing using Node's built-in scrypt (no native bcrypt dependency).
 * Format: `scrypt$<saltHex>$<hashHex>`. Shared by the seed and the NextAuth
 * credentials provider so verification is symmetric.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
