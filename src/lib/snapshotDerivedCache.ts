/** Invalidadores de caches derivados do snapshot (documentos, recebimentos, etc.). */

type Invalidator = () => void;

const invalidators = new Set<Invalidator>();

export function registerSnapshotDerivedCacheInvalidator(fn: Invalidator): () => void {
  invalidators.add(fn);
  return () => {
    invalidators.delete(fn);
  };
}

export function invalidateSnapshotDerivedCaches(): void {
  for (const fn of invalidators) {
    fn();
  }
}
