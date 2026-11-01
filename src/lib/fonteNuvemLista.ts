/**
 * Indica se a lista pode ser tratada como «nuvem OK» (esconde faixa amarela).
 * Leitura honesta: cache local / SWR NUNCA conta como nuvem saudável.
 */
export function resolveFonteNuvemOk(options: {
  listSource: string;
  hasCloudConfig: boolean;
  staleWhileRevalidate?: boolean;
  fallbackReason?: string;
}): boolean {
  if (!options.hasCloudConfig) return false;
  if (options.staleWhileRevalidate) return false;
  if (options.fallbackReason) return false;
  return options.listSource === 'supabase';
}
