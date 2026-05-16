import { z } from 'zod';

const authAuditEventTypeSchema = z.enum([
  'login_success',
  'login_failure',
  'logout',
  'session_invalidated',
  'user_saved',
  'user_status_changed',
  'materiais_csv_imported',
  'desktop_binding_enabled',
  'desktop_binding_removed',
  'desktop_binding_blocked',
  'desktop_license_revoked',
  'desktop_license_restored',
  'documento_cancelado',
  'documento_excluido_definitivamente',
  'documentos_excluidos_definitivamente',
  'recebimento_excluido_definitivamente',
  'recebimento_destravado_correcao',
  'recebimentos_excluidos_definitivamente',
  'materiais_excluidos_definitivamente',
  'materiais_copia_local_desde_nuvem',
  'rir_destravado_correcao',
  'planejamento_limpeza_codigos_persistida',
  'planejamento_limpeza_codigos_bloqueada',
  'fabrica_backup_pacote_descarregado',
  'fabrica_limpeza_local_executada',
  'purga_nuvem_operacional_executada',
  'purga_nuvem_com_utilizadores_executada',
  'limpeza_cadastros_local_executada',
  'limpeza_cadastros_nuvem_executada',
]);

export const authAuditEventSchema = z.object({
  id: z.string(),
  type: authAuditEventTypeSchema,
  actorLogin: z.string(),
  targetLogin: z.string().optional(),
  detail: z.string(),
  createdAt: z.string(),
});

export const authAuditEventsListSchema = z.array(authAuditEventSchema);

export function parseAuthAuditEventsList(raw: unknown): z.infer<typeof authAuditEventSchema>[] | null {
  const result = authAuditEventsListSchema.safeParse(raw);
  return result.success ? result.data : null;
}
