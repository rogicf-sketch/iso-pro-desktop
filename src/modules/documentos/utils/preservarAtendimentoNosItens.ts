import type { DocumentoItem } from '../types/documento.types';

function chaveCodigo(codigo: string): string {
  return codigo.trim().toLowerCase();
}

/**
 * Ao editar um documento que ja teve atendimento:
 * - nao remove itens com quantidadeAtendida > 0
 * - nao reduz quantidadeProjeto abaixo do ja atendido
 * - força quantidadeAtendida do registo existente (nao confia so no formulario)
 */
export function preservarAtendimentoNosItens(
  existentes: DocumentoItem[],
  novos: DocumentoItem[],
): { ok: true; itens: DocumentoItem[] } | { ok: false; error: string } {
  const porId = new Map(existentes.map((item) => [item.id, item]));
  const porCodigo = new Map(
    existentes
      .filter((item) => item.codigoMaterial.trim())
      .map((item) => [chaveCodigo(item.codigoMaterial), item]),
  );

  for (const antigo of existentes) {
    const atendida = Math.max(0, Number(antigo.quantidadeAtendida) || 0);
    if (atendida <= 0) continue;
    const aindaExiste = novos.some(
      (item) =>
        item.id === antigo.id || chaveCodigo(item.codigoMaterial) === chaveCodigo(antigo.codigoMaterial),
    );
    if (!aindaExiste) {
      return {
        ok: false,
        error: `Nao e permitido remover o item ${antigo.codigoMaterial.trim()} com atendimento ja registrado (${atendida}).`,
      };
    }
  }

  const itens: DocumentoItem[] = [];
  for (const item of novos) {
    const previo =
      porId.get(item.id) ??
      (item.codigoMaterial.trim() ? porCodigo.get(chaveCodigo(item.codigoMaterial)) : undefined);
    const atendida = previo
      ? Math.max(0, Number(previo.quantidadeAtendida) || 0)
      : Math.max(0, Number(item.quantidadeAtendida) || 0);
    const projeto = Math.max(0, Number(item.quantidadeProjeto) || 0);
    if (atendida > 0 && projeto + 1e-9 < atendida) {
      return {
        ok: false,
        error: `A quantidade do item ${item.codigoMaterial.trim() || previo?.codigoMaterial.trim() || '?'} nao pode ser menor que a ja atendida (${atendida}).`,
      };
    }
    itens.push({
      ...item,
      quantidadeProjeto: projeto,
      quantidadeAtendida: atendida,
    });
  }

  return { ok: true, itens };
}
