export type ServiceResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    source?: 'supabase' | 'local';
    fallbackReason?: string;
    /** Conflito de versao em `iso_pro_snapshot` apos retries; ideal recarregar dados na tela. */
    snapshotConflict?: boolean;
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
