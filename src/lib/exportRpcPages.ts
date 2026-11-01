import type { SupabaseClient } from '@supabase/supabase-js';

/** Página default / teto alinhado às RPCs `iso_pro_export_*_page`. */
export const EXPORT_RPC_PAGE_SIZE = 5000;
export const EXPORT_RPC_WAVE_CONCURRENCY = 6;

export type ExportRpcPageEnvelope<TRow> = {
  rows?: TRow[];
  total?: number;
  offset?: number;
  limit?: number;
  _source?: string;
  _error?: string;
  _hint?: string;
};

export type ExportRpcPagesResult<TRow> = {
  rows: TRow[];
  source: string;
  error?: string;
  /** true quando a função RPC ainda não existe no projeto (usar fallback). */
  missingRpc?: boolean;
};

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

type PageFetch<TRow> = {
  rows: TRow[];
  total: number;
  source: string;
};

/**
 * Carrega todas as páginas de uma RPC de exportação (envelope `{ rows, total }`).
 * Dispara a 1.ª onda (inclui offset 0) em paralelo — não serializa a 1.ª página.
 */
export async function fetchAllExportRpcPages<TRow>(options: {
  supabase: SupabaseClient;
  rpcName: string;
  tenantId: string;
  pageSize?: number;
  waveConcurrency?: number;
  /** Args extra (ex.: p_desde) — fundidos em cada pedido RPC. */
  rpcArgs?: Record<string, unknown>;
}): Promise<ExportRpcPagesResult<TRow>> {
  const pageSize = Math.min(
    Math.max(options.pageSize ?? EXPORT_RPC_PAGE_SIZE, 1),
    EXPORT_RPC_PAGE_SIZE,
  );
  const wave = Math.max(1, Math.min(options.waveConcurrency ?? EXPORT_RPC_WAVE_CONCURRENCY, 12));
  const { supabase, rpcName, tenantId } = options;
  const rpcArgs = options.rpcArgs ?? {};

  const fetchPage = async (offset: number): Promise<PageFetch<TRow>> => {
    const { data, error } = await supabase.rpc(rpcName, {
      ...rpcArgs,
      p_tenant_id: tenantId,
      p_offset: offset,
      p_limit: pageSize,
    });
    if (error) throw new Error(error.message);
    const body = (data ?? {}) as ExportRpcPageEnvelope<TRow>;
    if (body._error) throw new Error(body._error);
    return {
      rows: Array.isArray(body.rows) ? body.rows : [],
      total: Number(body.total),
      source: String(body._source ?? 'tables'),
    };
  };

  try {
    const all: TRow[] = [];
    let source = 'tables';
    let knownTotal = Number.NaN;
    let offsetBase = 0;

    while (true) {
      const offsets: number[] = [];
      for (let i = 0; i < wave; i += 1) {
        const off = offsetBase + i * pageSize;
        if (Number.isFinite(knownTotal) && knownTotal >= 0 && off >= knownTotal) break;
        offsets.push(off);
      }
      if (offsets.length === 0) break;

      let pages: PageFetch<TRow>[];
      try {
        pages = await Promise.all(offsets.map((off) => fetchPage(off)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha ao carregar exportacao.';
        if (offsetBase === 0 && isRpcMissingError(msg)) {
          return { rows: [], source: 'missing', error: msg, missingRpc: true };
        }
        throw e;
      }

      if (offsetBase === 0 && pages[0]) {
        source = pages[0].source;
        if (Number.isFinite(pages[0].total) && pages[0].total >= 0) {
          knownTotal = pages[0].total;
        }
      }

      let shortPage = false;
      for (const page of pages) {
        all.push(...page.rows);
        if (page.rows.length < pageSize) {
          shortPage = true;
          break;
        }
      }

      if (shortPage) break;
      if (Number.isFinite(knownTotal) && knownTotal >= 0 && all.length >= knownTotal) break;
      offsetBase += wave * pageSize;
    }

    return { rows: all, source };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao carregar exportacao.';
    if (isRpcMissingError(msg)) {
      return { rows: [], source: 'missing', error: msg, missingRpc: true };
    }
    return { rows: [], source: 'error', error: msg };
  }
}

/**
 * Carrega páginas CSV (`{ chunk, n }`) em ondas paralelas desde offset 0.
 */
export async function fetchAllExportCsvChunks(options: {
  supabase: SupabaseClient;
  rpcName: string;
  tenantId: string;
  pageSize?: number;
  waveConcurrency?: number;
}): Promise<{
  chunks: string[];
  source: string;
  error?: string;
  missingRpc?: boolean;
  rowCount: number;
  format: string;
}> {
  const pageSize = Math.min(
    Math.max(options.pageSize ?? EXPORT_RPC_PAGE_SIZE, 1),
    EXPORT_RPC_PAGE_SIZE,
  );
  const wave = Math.max(1, Math.min(options.waveConcurrency ?? EXPORT_RPC_WAVE_CONCURRENCY, 12));
  const { supabase, rpcName, tenantId } = options;

  type CsvPage = { chunk: string; n: number; source: string; format: string };

  const fetchPage = async (offset: number): Promise<CsvPage> => {
    const { data, error } = await supabase.rpc(rpcName, {
      p_tenant_id: tenantId,
      p_offset: offset,
      p_limit: pageSize,
    });
    if (error) throw new Error(error.message);
    const body = (data ?? {}) as {
      chunk?: string;
      n?: number;
      _source?: string;
      _error?: string;
      _format?: string;
    };
    if (body._error) throw new Error(body._error);
    return {
      chunk: typeof body.chunk === 'string' ? body.chunk : '',
      n: Number(body.n) || 0,
      source: String(body._source ?? 'tables'),
      format: String(body._format ?? ''),
    };
  };

  try {
    const chunks: string[] = [];
    let source = 'tables';
    let format = '';
    let rowCount = 0;
    let offsetBase = 0;

    while (true) {
      const offsets: number[] = [];
      for (let i = 0; i < wave; i += 1) offsets.push(offsetBase + i * pageSize);

      let pages: CsvPage[];
      try {
        pages = await Promise.all(offsets.map((off) => fetchPage(off)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha ao carregar exportacao.';
        if (offsetBase === 0 && isRpcMissingError(msg)) {
          return { chunks: [], source: 'missing', error: msg, missingRpc: true, rowCount: 0, format: '' };
        }
        throw e;
      }

      if (offsetBase === 0 && pages[0]) {
        source = pages[0].source;
        format = pages[0].format;
      }

      let shortPage = false;
      for (const page of pages) {
        if (page.chunk) chunks.push(page.chunk);
        rowCount += page.n;
        if (page.n < pageSize) {
          shortPage = true;
          break;
        }
      }

      if (shortPage) break;
      offsetBase += wave * pageSize;
    }

    return { chunks, source, rowCount, format };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao carregar exportacao.';
    if (isRpcMissingError(msg)) {
      return { chunks: [], source: 'missing', error: msg, missingRpc: true, rowCount: 0, format: '' };
    }
    return { chunks: [], source: 'error', error: msg, rowCount: 0, format: '' };
  }
}
