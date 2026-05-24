/** Chaves frequentemente usadas em ataques de poluição de protótipo via JSON.parse / objetos híbridos. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_DEPTH = 48;

/**
 * Remove chaves perigosas e limita profundidade (evita recursão infinita / objetos circulares problemáticos).
 * Não substitui validação de esquema — é defesa em profundidade antes do Zod.
 */
export function stripJsonPollution<T = unknown>(input: unknown): T {
  const seen = new WeakSet<object>();
  function walk(value: unknown, depth: number): unknown {
    if (depth > MAX_DEPTH) return null;
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value as object)) return null;
    seen.add(value as object);
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, depth + 1));
    }
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      out[key] = walk(obj[key], depth + 1);
    }
    return out;
  }
  return walk(input, 0) as T;
}
