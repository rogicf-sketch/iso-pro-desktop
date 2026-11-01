import { getActiveTenantId } from './isoProTenant';
import { AUTH_AUDIT_TO_DOMAIN_EVENT } from './domainEvents';
import { getSupabase, hasSupabaseConfig } from './supabase';

/**
 * Espelha eventos de auditoria críticos em iso_pro_domain_events (P2).
 * Best-effort: nunca bloqueia a UI.
 */
export function appendDomainEventFromAuditBestEffort(input: {
  auditType: string;
  actorLogin: string;
  entityType?: string;
  entityId?: string;
  detail?: string;
  before?: unknown;
  after?: unknown;
}): void {
  const eventType = AUTH_AUDIT_TO_DOMAIN_EVENT[input.auditType];
  if (!eventType) return;
  if (!hasSupabaseConfig()) return;
  const supabase = getSupabase();
  if (!supabase) return;

  void (async () => {
    try {
      const { error } = await supabase.rpc('iso_pro_append_domain_event', {
        p_tenant_id: getActiveTenantId(),
        p_event_type: eventType,
        p_entity_type: input.entityType ?? null,
        p_entity_id: input.entityId ?? null,
        p_actor_login: input.actorLogin,
        p_payload: {
          detail: input.detail ?? null,
          before: input.before ?? null,
          after: input.after ?? null,
          auditType: input.auditType,
        },
        p_source: 'auth_audit',
      });
      if (error && !/does not exist|PGRST202|404/i.test(error.message)) {
        console.warn('[I.S.O PRO] domain_event append:', error.message);
      }
    } catch {
      /* ignore */
    }
  })();
}
