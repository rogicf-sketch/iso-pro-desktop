import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

/**
 * Invalida cache do Painel/badges (TTL 90s) apos writes SoT que alteram contagens.
 * Best-effort: nunca bloqueia a operacao de negocio.
 */
export function invalidateOperacaoContagensBestEffort(): void {
  if (!hasSupabaseConfig()) return;
  const supabase = getSupabase();
  if (!supabase) return;
  void (async () => {
    try {
      const { error } = await supabase.rpc('iso_pro_invalidate_operacao_contagens', {
        p_tenant_id: getActiveTenantId(),
      });
      if (error && !/does not exist|PGRST202|404/i.test(error.message)) {
        console.warn('[I.S.O PRO] invalidate operacao_contagens:', error.message);
      }
    } catch {
      /* ignore */
    }
  })();
}
