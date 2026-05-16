import {
  ISO_PRO_AMBIENTE_ESTADO_KEY,
  isIsoProManagedStorageKey,
  isStorageKeyForAmbienteAtivo,
} from '../../../lib/isoProAmbiente';
import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import { resetSupabaseClient } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import { parseAuthSessionUser } from '../../auth/schemas/authLocal.zod';
import { getAuthSessionStorageKey } from '../../auth/services/auth.service';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { limparTodosRelatoriosFotograficosLocais } from '../../relatorios/services/relatorioFotografico.service';

/**
 * Lista chaves `localStorage` geridas pelo I.S.O PRO para o **ambiente ativo** (cadastros, sessão, RF, etc.).
 * Não inclui `iso-pro-desktop-ambientes-estado-v1`.
 */
export function listarChavesLocalStorageIsoPro(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k === ISO_PRO_AMBIENTE_ESTADO_KEY) continue;
    if (!isIsoProManagedStorageKey(k)) continue;
    if (!isStorageKeyForAmbienteAtivo(k)) continue;
    out.push(k);
  }
  return out.sort();
}

/**
 * Remove todas as chaves geridas pelo I.S.O PRO do **ambiente ativo** no `localStorage`, limpa relatorios fotograficos locais
 * (IndexedDB + chaves associadas) e invalida cache do snapshot em memoria.
 *
 * **Efeito:** sessao, utilizadores locais, configuracoes, cadastros e restantes dados da app neste navegador deixam de existir
 * aqui — equivalente a "saida de fabrica" **neste PC** (a nuvem Supabase nao e alterada).
 */
export async function executarLimpezaLocalFabricaIsoPro(): Promise<
  ServiceResult<{ chavesRemovidas: number; relatorios: ServiceResult<{ removidosCatalogo: number; chavesPayload: number }> }>
> {
  if (typeof localStorage === 'undefined') {
    return { success: false, error: 'Ambiente invalido (sem localStorage).' };
  }

  let actorLogin = 'desconhecido';
  try {
    const rawSession = localStorage.getItem(getAuthSessionStorageKey());
    if (rawSession) {
      const parsed: unknown = JSON.parse(rawSession);
      const user = parseAuthSessionUser(parsed);
      if (user?.login) actorLogin = user.login;
    }
  } catch {
    /* ignora sessao ilegivel */
  }

  const rel = await limparTodosRelatoriosFotograficosLocais();

  const chaves = listarChavesLocalStorageIsoPro();
  for (const k of chaves) {
    localStorage.removeItem(k);
  }

  invalidateIsoProSnapshotCache();
  resetSupabaseClient();

  appendAuthAuditEvent({
    type: 'fabrica_limpeza_local_executada',
    actorLogin,
    detail: `Limpeza local concluida (ambiente ativo): ${chaves.length} chave(s) e relatorios fotograficos locais.`,
  });

  return {
    success: true,
    data: {
      chavesRemovidas: chaves.length,
      relatorios: rel,
    },
  };
}
