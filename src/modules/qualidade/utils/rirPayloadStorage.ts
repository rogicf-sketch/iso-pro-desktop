/**
 * RIR completo no Storage (100 GB); índice leve no snapshot / Postgres (8 GB).
 */
import {
  canUseEvidenciasStorage,
  downloadEvidenciaJson,
  evidenciasPathRir,
  isStorageRef,
  uploadEvidenciaJson,
} from '../../../lib/evidenciasStorage';
import type { RirRegistro } from '../types/qualidade.types';

const emptyAssinatura = (): RirRegistro['assinaturaRecebimento'] => ({ nome: '', data: '' });

/** Tem payload offloaded (corpo no Storage). */
export function isRirPayloadOffloaded(reg: RirRegistro): boolean {
  const ref = reg.payloadStorageRef?.trim() ?? '';
  return isStorageRef(ref);
}

/**
 * Índice para snapshot/tabela: cabeçalho + ref Storage; sem itens/textos longos.
 */
export function slimRirForCloudIndex(reg: RirRegistro, storageRef: string): RirRegistro {
  return {
    ...reg,
    payloadStorageRef: storageRef,
    itensRir: [],
    instrumentos: '',
    documentosQc: '',
    observacoesQc: '',
    obsCurta: (reg.obsCurta ?? '').slice(0, 200),
    descricao: (reg.descricao ?? '').slice(0, 240),
    observacoes: (reg.observacoes ?? '').slice(0, 240),
    acaoImediata: (reg.acaoImediata ?? '').slice(0, 240),
    assinaturaRecebimento: reg.assinaturaRecebimento ?? emptyAssinatura(),
    assinaturaCq: reg.assinaturaCq ?? emptyAssinatura(),
    assinaturaCliente: reg.assinaturaCliente ?? emptyAssinatura(),
  };
}

/** Envia o RIR completo ao Storage e devolve o índice leve. */
export async function persistRirRegistroToStorage(reg: RirRegistro): Promise<RirRegistro> {
  if (!canUseEvidenciasStorage()) return reg;
  const id = reg.id.trim();
  if (!id) return reg;

  const full: RirRegistro = { ...reg };
  delete (full as { payloadStorageRef?: string }).payloadStorageRef;

  const path = evidenciasPathRir(id);
  const storageRef = await uploadEvidenciaJson(path, full);
  return slimRirForCloudIndex(reg, storageRef);
}

/**
 * Junta índice (tabela/snapshot) + corpo no Storage.
 * O índice manda no cabeçalho (status, codigo, laudo, …): o JSON no Storage
 * pode vir de cache CDN e sobrescreveria um "tratado" acabado de gravar.
 */
export function mergeRirIndexWithStorageBody(index: RirRegistro, full: RirRegistro): RirRegistro {
  return {
    ...full,
    id: index.id || full.id,
    codigo: index.codigo || full.codigo,
    status: index.status ?? full.status,
    dataRegistro: index.dataRegistro || full.dataRegistro,
    laudo: index.laudo ?? full.laudo,
    recebimentoId: index.recebimentoId || full.recebimentoId,
    recebimentoNotaFiscal: index.recebimentoNotaFiscal ?? full.recebimentoNotaFiscal,
    recebimentoFornecedor: index.recebimentoFornecedor ?? full.recebimentoFornecedor,
    recebimentoRomaneio: index.recebimentoRomaneio ?? full.recebimentoRomaneio,
    recebimentoData: index.recebimentoData ?? full.recebimentoData,
    fornecedorNome: index.fornecedorNome || full.fornecedorNome,
    procedimentoNumero: index.procedimentoNumero || full.procedimentoNumero,
    disciplina: index.disciplina || full.disciplina,
    uo: index.uo || full.uo,
    localObra: index.localObra || full.localObra,
    contratoNumero: index.contratoNumero || full.contratoNumero,
    responsavel: index.responsavel || full.responsavel,
    // Corpo pesado: preferir Storage se existir
    itensRir: Array.isArray(full.itensRir) && full.itensRir.length > 0 ? full.itensRir : index.itensRir ?? [],
    instrumentos: full.instrumentos || index.instrumentos || '',
    documentosQc: full.documentosQc || index.documentosQc || '',
    observacoesQc: full.observacoesQc || index.observacoesQc || '',
    payloadStorageRef: index.payloadStorageRef ?? full.payloadStorageRef,
  };
}

/** Se tiver `payloadStorageRef`, descarrega o corpo completo do Storage. */
export async function hydrateRirRegistroFromStorage(reg: RirRegistro): Promise<RirRegistro> {
  const ref = reg.payloadStorageRef?.trim() ?? '';
  if (!isStorageRef(ref)) return reg;
  if (!canUseEvidenciasStorage()) return reg;

  const full = await downloadEvidenciaJson<RirRegistro>(ref);
  if (!full || typeof full !== 'object') return reg;

  return mergeRirIndexWithStorageBody(reg, { ...full, payloadStorageRef: ref });
}
