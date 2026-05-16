/**
 * Frase exacta para confirmar purge operacional na nuvem (Edge Function `purge_cloud_data`).
 * O desktop envia `tenantId` = empresa activa (`getActiveTenantId()`); a Edge so apaga dados desse tenant.
 */
export const PURGE_CLOUD_FRASE_OPERACIONAL = 'APAGAR_DADOS_NUVEM';

/** Frase exacta adicional quando se inclui apagar utilizadores e perfis na base. */
export const PURGE_CLOUD_FRASE_UTILIZADORES = 'APAGAR_UTILIZADORES_E_PERFIS';
