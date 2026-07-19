export type ServiceResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  /** Gravacao local ok, mas algo secundario falhou (ex.: sync na nuvem). */
  warning?: string;
  /** Mensagem informativa complementar (ex.: sync na nuvem concluida). */
  info?: string;
  meta?: {
    source?: 'supabase' | 'local' | 'remote';
    fallbackReason?: string;
    /** Conflito de versao em `iso_pro_snapshot` apos retries; ideal recarregar dados na tela. */
    snapshotConflict?: boolean;
    /** Producao sem Supabase: gravacao local de negocio bloqueada por politica. */
    writeBlocked?: boolean;
    /** Copia nuvem→`localStorage` de materiais bloqueada pelo guarda de contagens; UI pode oferecer repetir com forcar. */
    syncMateriaisLocalBloqueado?: boolean;
    /** Leitura serviu cache local enquanto a nuvem ainda podia estar a responder (SWR). */
    staleWhileRevalidate?: boolean;
    /** Estorno V2 (RPC transacional). */
    estornoV2?: boolean;
    idempotencyKey?: string;
    durationMs?: number;
    serverDurationMs?: number;
    idempotentHit?: boolean;
    rpcMissing?: boolean;
    documentosAfetados?: unknown;
  };
};

/** Retorno tipico de acoes de salvar via `executeWrite` para formularios. */
export type ServiceWriteResult = Pick<ServiceResult<unknown>, 'success' | 'error' | 'meta'>;

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
