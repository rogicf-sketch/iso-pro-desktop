import { QueryClient } from '@tanstack/react-query';

/**
 * Cache de consultas para listas: ao trocar de modulo e voltar, dados recentes
 * reaparecem na hora (staleTime) e atualizam em segundo plano se estiverem velhos.
 * Desktop: sem refetch ao focar janela (evita sensacao de "travou" ao Alt+Tab).
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
