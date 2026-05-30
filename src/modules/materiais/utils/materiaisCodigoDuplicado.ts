/** Verifica codigo duplicado no cadastro (comparacao case-insensitive, ignora o registo em edicao). */
export function findMaterialComCodigoDuplicado<T extends { id: string; codigo: string }>(
  base: ReadonlyArray<T>,
  codigo: string,
  currentId?: string,
): T | undefined {
  const normalized = codigo.trim().toLowerCase();
  if (!normalized) return undefined;
  const skipId = currentId != null ? String(currentId) : '';
  return base.find(
    (item) => item.codigo.trim().toLowerCase() === normalized && String(item.id) !== skipId,
  );
}
