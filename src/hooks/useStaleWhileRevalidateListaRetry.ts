import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

/**
 * SWR devolveu copia local rapida: revalidar em breve para meta/fonte virarem nuvem de verdade.
 * Padrao alinhado a Colaboradores/Fornecedores — usar em todas as listas com withLocalFallback.
 */
export function useStaleWhileRevalidateListaRetry(options: {
  staleWhileRevalidate: boolean;
  hasCloudConfig: boolean;
  queryClient: QueryClient;
  queryKeyPrefix: readonly unknown[];
  deps?: readonly unknown[];
  maxRetries?: number;
  delayMs?: number;
}) {
  const swrRetryRef = useRef(0);
  const maxRetries = options.maxRetries ?? 2;
  const delayMs = options.delayMs ?? 1_800;

  useEffect(() => {
    if (!options.staleWhileRevalidate || !options.hasCloudConfig) {
      swrRetryRef.current = 0;
      return;
    }
    if (swrRetryRef.current >= maxRetries) return;
    swrRetryRef.current += 1;
    const id = window.setTimeout(() => {
      void options.queryClient.invalidateQueries({ queryKey: options.queryKeyPrefix });
    }, delayMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps opcional (ex.: filters)
  }, [options.staleWhileRevalidate, options.hasCloudConfig, options.queryClient, maxRetries, delayMs, ...(options.deps ?? [])]);
}
