/**
 * Extrai o codigo de material de linhas vindas de CSV/JSON (planilhas, exports legados).
 * Aceita camelCase, snake_case e PascalCase comuns.
 */
export function extrairCodigoMaterialDeObjetoImport(item: Record<string, unknown>): string {
  const raw =
    item.codigoMaterial ??
    item.codigo_material ??
    item.CodigoMaterial ??
    item.CODIGO_MATERIAL ??
    item.codigo;
  return String(raw ?? '')
    .trim()
    .normalize('NFC');
}
