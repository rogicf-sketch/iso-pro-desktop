/** Compara estado inicial vs. atual (formularios simples em memoria). */
export function isPlainFormDirty<T>(initial: T, current: T): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}
