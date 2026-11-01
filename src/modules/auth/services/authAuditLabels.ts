import type { StatusTone } from '../../../components/ui/statusMeta';
import type { AuthAuditEventType } from './authAudit.service';

/** Rótulos PT para o dia a dia (código técnico fica no title/tooltip). */
export const AUTH_AUDIT_LABELS: Record<AuthAuditEventType, string> = {
  login_success: 'Login OK',
  login_failure: 'Falha de login',
  logout: 'Logout',
  session_invalidated: 'Sessao invalidada',
  user_saved: 'Usuario salvo',
  user_status_changed: 'Status de usuario',
  materiais_csv_imported: 'Import CSV materiais',
  desktop_binding_enabled: 'Vinculo desktop ativado',
  desktop_binding_removed: 'Vinculo desktop removido',
  desktop_binding_blocked: 'Desktop bloqueado',
  desktop_license_revoked: 'Licenca desktop revogada',
  desktop_license_restored: 'Licenca desktop reativada',
  documento_cancelado: 'Documento cancelado',
  documento_excluido_definitivamente: 'Documento excluido',
  documentos_excluidos_definitivamente: 'Documentos excluidos (massa)',
  recebimento_excluido_definitivamente: 'Recebimento excluido',
  recebimento_destravado_correcao: 'Recebimento destravado',
  recebimento_conferencia_finalizada: 'Conferencia finalizada',
  recebimento_criado: 'Recebimento criado',
  recebimento_editado: 'Recebimento editado',
  recebimento_cancelado: 'Recebimento cancelado',
  recebimentos_excluidos_definitivamente: 'Recebimentos excluidos (massa)',
  materiais_excluidos_definitivamente: 'Materiais excluidos',
  materiais_copia_local_desde_nuvem: 'Copia local materiais',
  material_criado: 'Material criado',
  material_editado: 'Material editado',
  inventario_criado: 'Inventario criado',
  inventario_editado: 'Inventario editado',
  inventario_fechado: 'Inventario fechado',
  documento_criado: 'Documento criado',
  documento_editado: 'Documento editado',
  atendimento_registrado: 'Atendimento registado',
  rir_destravado_correcao: 'RIR destravado',
  planejamento_limpeza_codigos_persistida: 'Limpeza codigos (ok)',
  planejamento_limpeza_codigos_bloqueada: 'Limpeza codigos bloqueada',
  planejamento_substituicao_limpou_historico: 'Substituicao limpou historico',
  planejamento_gravacao_bloqueada_remocao_nuvem: 'Gravacao bloqueada (nuvem)',
  fabrica_backup_pacote_descarregado: 'Backup fabrica descarregado',
  fabrica_limpeza_local_executada: 'Limpeza local fabrica',
  purga_nuvem_operacional_executada: 'Purga nuvem operacional',
  purga_nuvem_com_utilizadores_executada: 'Purga nuvem + utilizadores',
  limpeza_cadastros_local_executada: 'Limpeza cadastros local',
  limpeza_cadastros_nuvem_executada: 'Limpeza cadastros nuvem',
  mfa_challenge_success: 'MFA OK',
  mfa_challenge_failure: 'MFA falhou',
  mfa_enroll_success: 'MFA enroll OK',
  mfa_enroll_failure: 'MFA enroll falhou',
  mfa_unenroll_blocked: 'MFA: ultimo factor protegido',
};

const SUCCESS_TYPES = new Set<AuthAuditEventType>([
  'login_success',
  'logout',
  'user_saved',
  'materiais_csv_imported',
  'desktop_binding_enabled',
  'desktop_license_restored',
  'recebimento_conferencia_finalizada',
  'recebimento_criado',
  'recebimento_editado',
  'material_criado',
  'material_editado',
  'inventario_criado',
  'inventario_editado',
  'inventario_fechado',
  'documento_criado',
  'documento_editado',
  'atendimento_registrado',
  'mfa_challenge_success',
  'mfa_enroll_success',
  'planejamento_limpeza_codigos_persistida',
  'fabrica_backup_pacote_descarregado',
]);

const DANGER_TYPES = new Set<AuthAuditEventType>([
  'login_failure',
  'session_invalidated',
  'desktop_binding_blocked',
  'desktop_license_revoked',
  'documento_excluido_definitivamente',
  'documentos_excluidos_definitivamente',
  'recebimento_excluido_definitivamente',
  'recebimentos_excluidos_definitivamente',
  'materiais_excluidos_definitivamente',
  'mfa_challenge_failure',
  'mfa_enroll_failure',
  'purga_nuvem_operacional_executada',
  'purga_nuvem_com_utilizadores_executada',
]);

const WARNING_TYPES = new Set<AuthAuditEventType>([
  'documento_cancelado',
  'recebimento_cancelado',
  'recebimento_destravado_correcao',
  'rir_destravado_correcao',
  'user_status_changed',
  'desktop_binding_removed',
  'planejamento_limpeza_codigos_bloqueada',
  'planejamento_substituicao_limpou_historico',
  'planejamento_gravacao_bloqueada_remocao_nuvem',
  'mfa_unenroll_blocked',
  'fabrica_limpeza_local_executada',
  'limpeza_cadastros_local_executada',
  'limpeza_cadastros_nuvem_executada',
]);

export function authAuditLabel(type: string): string {
  return AUTH_AUDIT_LABELS[type as AuthAuditEventType] ?? type;
}

export function authAuditTone(type: string): StatusTone {
  const t = type as AuthAuditEventType;
  if (SUCCESS_TYPES.has(t)) return 'ok';
  if (DANGER_TYPES.has(t)) return 'danger';
  if (WARNING_TYPES.has(t)) return 'warning';
  return 'neutral';
}

/** Opções do filtro (rótulo humano; value = código). */
export const AUTH_AUDIT_FILTER_OPTIONS: { value: AuthAuditEventType; label: string }[] = (
  Object.keys(AUTH_AUDIT_LABELS) as AuthAuditEventType[]
)
  .map((value) => ({ value, label: AUTH_AUDIT_LABELS[value] }))
  .sort((a, b) => a.label.localeCompare(b.label, 'pt'));
