type AuthAuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'session_invalidated'
  | 'user_saved'
  | 'user_status_changed'
  | 'materiais_csv_imported'
  | 'desktop_binding_enabled'
  | 'desktop_binding_removed'
  | 'desktop_binding_blocked'
  | 'desktop_license_revoked'
  | 'desktop_license_restored'
  | 'documento_cancelado'
  | 'documento_excluido_definitivamente'
  | 'documentos_excluidos_definitivamente'
  | 'recebimento_excluido_definitivamente'
  | 'recebimento_destravado_correcao'
  | 'recebimentos_excluidos_definitivamente'
  | 'materiais_excluidos_definitivamente';

export type AuthAuditEvent = {
  id: string;
  type: AuthAuditEventType;
  actorLogin: string;
  targetLogin?: string;
  detail: string;
  createdAt: string;
};

const AUTH_AUDIT_STORAGE_KEY = 'iso-pro-desktop-auth-audit';
const MAX_AUDIT_ITEMS = 300;

function readAuditEvents(): AuthAuditEvent[] {
  const raw = localStorage.getItem(AUTH_AUDIT_STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as AuthAuditEvent[];
  } catch {
    localStorage.removeItem(AUTH_AUDIT_STORAGE_KEY);
    return [];
  }
}

export function appendAuthAuditEvent(event: Omit<AuthAuditEvent, 'id' | 'createdAt'>) {
  const items = readAuditEvents();
  const nextItem: AuthAuditEvent = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  };

  const nextItems = [nextItem, ...items].slice(0, MAX_AUDIT_ITEMS);
  localStorage.setItem(AUTH_AUDIT_STORAGE_KEY, JSON.stringify(nextItems));
}

export function listAuthAuditEvents(limit = 20) {
  return readAuditEvents().slice(0, limit);
}

export function exportAuthAuditEventsCsv(items: AuthAuditEvent[]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    ['createdAt', 'type', 'actorLogin', 'targetLogin', 'detail'].join(','),
    ...items.map((item) =>
      [
        escape(item.createdAt),
        escape(item.type),
        escape(item.actorLogin),
        escape(item.targetLogin ?? ''),
        escape(item.detail),
      ].join(','),
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `auditoria-iso-pro-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
