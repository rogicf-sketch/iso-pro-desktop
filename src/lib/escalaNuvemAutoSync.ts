/**
 * Sincronização automática snapshot → tabelas de escala.
 * Corre em fundo na entrada do PC: só quando a tabela está vazia (reparação inicial).
 * Não substitui o dual-write incremental ao gravar documentos/recebimentos.
 */
import { getActiveTenantId } from './isoProTenant';
import { hasSupabaseConfig } from './supabase';
import { listDocumentosPlanejamentoPageFromCloud, syncDocumentosPlanejamentoFromSnapshot } from './documentosPlanejamentoTabelas';
import { listRecebimentosPageFromCloud, syncRecebimentosFromSnapshot } from './recebimentosTabelas';
import { listInventariosPageFromCloud, syncInventariosFromSnapshot } from './inventariosTabelas';
import { syncRirFromSnapshot, syncRncFromSnapshot } from './qualidadeTabelas';

const SESSION_KEY_PREFIX = 'iso_pro_escala_auto_sync_v1';

function sessionKey(): string {
  return `${SESSION_KEY_PREFIX}:${getActiveTenantId()}`;
}

function jaTentouNestaSessao(): boolean {
  try {
    return sessionStorage.getItem(sessionKey()) === '1';
  } catch {
    return false;
  }
}

function marcarTentativaSessao(): void {
  try {
    sessionStorage.setItem(sessionKey(), '1');
  } catch {
    /* ignore */
  }
}

export type EscalaAutoSyncResultado = {
  ran: boolean;
  documentos?: number;
  recebimentos?: number;
  inventarios?: number;
  skippedReason?: string;
};

/**
 * Se as tabelas de escala estiverem vazias, preenche a partir do snapshot (uma vez por sessão).
 * Não bloqueia a UI — chamar com `void …`.
 */
export async function tentarAutoSyncEscalaNuvemNaEntrada(): Promise<EscalaAutoSyncResultado> {
  if (!hasSupabaseConfig()) {
    return { ran: false, skippedReason: 'sem-supabase' };
  }
  if (jaTentouNestaSessao()) {
    return { ran: false, skippedReason: 'ja-tentou-sessao' };
  }
  marcarTentativaSessao();

  try {
    const [docs, recs, inv] = await Promise.all([
      listDocumentosPlanejamentoPageFromCloud({ offset: 0, limit: 1 }),
      listRecebimentosPageFromCloud({ offset: 0, limit: 1 }),
      listInventariosPageFromCloud({ offset: 0, limit: 1 }),
    ]);

    const needDocs = !docs.error && docs.total === 0;
    const needRecs = !recs.error && recs.total === 0;
    const needInv = !inv.error && inv.total === 0;

    if (!needDocs && !needRecs && !needInv) {
      return { ran: false, skippedReason: 'ja-com-dados' };
    }

    const out: EscalaAutoSyncResultado = { ran: true };

    if (needDocs) {
      const r = await syncDocumentosPlanejamentoFromSnapshot();
      if (r.ok) out.documentos = r.documentos ?? 0;
    }
    if (needRecs) {
      const r = await syncRecebimentosFromSnapshot();
      if (r.ok) out.recebimentos = r.recebimentos ?? 0;
    }
    if (needInv) {
      const [invR, rirR, rncR] = await Promise.all([
        syncInventariosFromSnapshot(),
        syncRirFromSnapshot(),
        syncRncFromSnapshot(),
      ]);
      if (invR.ok) out.inventarios = invR.inventarios ?? 0;
      void rirR;
      void rncR;
    }

    return out;
  } catch (err) {
    console.warn('[escala-auto-sync] falhou (não bloqueia o PC):', err);
    return { ran: false, skippedReason: 'erro' };
  }
}
