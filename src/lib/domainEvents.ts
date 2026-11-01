/**
 * P2 embrionário — catálogo de eventos de domínio (obra/ISO).
 * Não é Kafka: append best-effort em iso_pro_domain_events (+ auditoria local já existente).
 */

export const DOMAIN_EVENT_TYPES = [
  'recebimento.criado',
  'recebimento.editado',
  'recebimento.cancelado',
  'recebimento.conferencia_finalizada',
  'documento.criado',
  'documento.editado',
  'documento.cancelado',
  'inventario.criado',
  'inventario.editado',
  'inventario.fechado',
  'material.criado',
  'material.editado',
  'atendimento.registrado',
  'rir.destravado_correcao',
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/** Mapa audit local → evento de domínio (só tipos já emitidos no P1). */
export const AUTH_AUDIT_TO_DOMAIN_EVENT: Partial<Record<string, DomainEventType>> = {
  recebimento_criado: 'recebimento.criado',
  recebimento_editado: 'recebimento.editado',
  recebimento_cancelado: 'recebimento.cancelado',
  recebimento_conferencia_finalizada: 'recebimento.conferencia_finalizada',
  documento_criado: 'documento.criado',
  documento_editado: 'documento.editado',
  documento_cancelado: 'documento.cancelado',
  inventario_criado: 'inventario.criado',
  inventario_editado: 'inventario.editado',
  inventario_fechado: 'inventario.fechado',
  material_criado: 'material.criado',
  material_editado: 'material.editado',
  atendimento_registrado: 'atendimento.registrado',
  rir_destravado_correcao: 'rir.destravado_correcao',
};
