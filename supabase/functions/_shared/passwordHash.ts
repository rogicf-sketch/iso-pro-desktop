import bcrypt from 'npm:bcryptjs@2.4.3';

const BCRYPT_PREFIXES = ['$2a$', '$2b$', '$2y$'] as const;

export function isPasswordHash(stored: string): boolean {
  const s = String(stored ?? '').trim();
  return BCRYPT_PREFIXES.some((p) => s.startsWith(p));
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const p = plain.trim();
  const s = String(stored ?? '');
  if (!p || !s) return false;
  if (isPasswordHash(s)) {
    return bcrypt.compare(p, s);
  }
  return p === s;
}

export async function hashPasswordForStorage(plain: string): Promise<string> {
  const trimmed = plain.trim();
  if (!trimmed) throw new Error('Senha vazia.');
  if (isPasswordHash(trimmed)) return trimmed;
  return bcrypt.hash(trimmed, 10);
}
