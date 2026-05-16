/** Disparado apos gravar Configuracoes (ex.: URL Supabase), para atualizar banner/estado na UI. */
export const ISO_PRO_CONFIG_UPDATED_EVENT = 'iso-pro-config-updated';

export function dispatchIsoProConfigUpdatedEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ISO_PRO_CONFIG_UPDATED_EVENT));
}
