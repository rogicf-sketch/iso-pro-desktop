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

/** Se tiver `payloadStorageRef`, descarrega o corpo completo do Storage. */
export async function hydrateRirRegistroFromStorage(reg: RirRegistro): Promise<RirRegistro> {
  const ref = reg.payloadStorageRef?.trim() ?? '';
  if (!isStorageRef(ref)) return reg;
  if (!canUseEvidenciasStorage()) return reg;

  const full = await downloadEvidenciaJson<RirRegistro>(ref);
  if (!full || typeof full !== 'object') return reg;

  return {
    ...full,
    id: reg.id || full.id,
    payloadStorageRef: ref,
  };
}
