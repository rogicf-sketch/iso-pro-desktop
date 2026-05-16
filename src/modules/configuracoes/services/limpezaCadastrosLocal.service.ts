import {
  ISO_PRO_AMBIENTE_ESTADO_KEY,
  getScopedIsoProStorageKey,
  isIsoProManagedStorageKey,
  isStorageKeyForAmbienteAtivo,
} from '../../../lib/isoProAmbiente';
import { ISO_PRO_TENANT_CONTEXT_STORAGE_KEY } from '../../../lib/isoProTenant';
import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import type { ServiceResult } from '../../../types/common.types';
import {
  appendAuthAuditEvent,
  getAuthAuditStorageKey,
} from '../../auth/services/authAudit.service';
import { getAuthSessionStorageKey, getAuthUsersStorageKey, getCurrentUser } from '../../auth/services/auth.service';
import { limparTodosRelatoriosFotograficosLocais } from '../../relatorios/services/relatorioFotografico.service';

function chavesPreservarLimpezaCadastros(): Set<string> {
  return new Set([
    getScopedIsoProStorageKey('iso-pro-desktop-configuracoes-sistema'),
    getAuthSessionStorageKey(),
    getAuthAuditStorageKey(),
    getAuthUsersStorageKey(),
    getScopedIsoProStorageKey('iso-pro-desktop-perfis-acesso'),
    ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
  ]);
}

/**
 * Remove dados de cadastro (materiais, documentos, etc.) em `localStorage`, mantendo configuracoes,
 * sessao e utilizadores/perfis locais. Limpa tambem relatorios fotograficos locais e invalida cache do snapshot.
 */
export async function executarLimpezaCadastrosLocal(): Promise<
  ServiceResult<{ chavesRemovidas: number; relatorios: Awaited<ReturnType<typeof limparTodosRelatoriosFotograficosLocais>> }>
> {
  if (typeof localStorage === 'undefined') {
    return { success: false, error: 'Ambiente invalido (sem localStorage).' };
  }

  const rel = await limparTodosRelatoriosFotograficosLocais();

  let chavesRemovidas = 0;
  const preservar = chavesPreservarLimpezaCadastros();
  const aRemover: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k === ISO_PRO_AMBIENTE_ESTADO_KEY) continue;
    if (!isIsoProManagedStorageKey(k)) continue;
    if (!isStorageKeyForAmbienteAtivo(k)) continue;
    if (preservar.has(k)) continue;
    aRemover.push(k);
  }
  for (const k of aRemover) {
    localStorage.removeItem(k);
    chavesRemovidas += 1;
  }

  invalidateIsoProSnapshotCache();

  appendAuthAuditEvent({
    type: 'limpeza_cadastros_local_executada',
    actorLogin: getCurrentUser()?.login ?? 'desconhecido',
    detail: `Removidas ${chavesRemovidas} chave(s) de cadastro local; preservadas configuracao, sessao e utilizadores locais.`,
  });

  return { success: true, data: { chavesRemovidas, relatorios: rel } };
}
