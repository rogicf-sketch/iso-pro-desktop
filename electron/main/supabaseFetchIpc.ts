import { ipcMain, net } from 'electron';
import type { IncomingHttpHeaders } from 'node:http';
import https from 'node:https';

export type DesktopSupabaseFetchRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
};

export type DesktopSupabaseFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  /** Binários (JPEG, etc.) vêm em base64 — `response.text()` corrompia evidências no EXE. */
  bodyEncoding?: 'utf8' | 'base64';
};

const ALLOWED_SUPABASE_HOST_SUFFIX = '.supabase.co';

function isAllowedSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return u.hostname.endsWith(ALLOWED_SUPABASE_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** Imagens / octet-stream / PDF — não tratar como UTF-8. */
function shouldEncodeBodyAsBase64(contentType: string): boolean {
  const c = (contentType || '').toLowerCase();
  return (
    c.includes('image/') ||
    c.includes('application/octet-stream') ||
    c.includes('application/pdf') ||
    c.includes('audio/') ||
    c.includes('video/') ||
    c.includes('wasm')
  );
}

function headersFromNode(headers: IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) =>
      value == null ? [] : [[key, Array.isArray(value) ? value.join(', ') : String(value)]],
    ),
  );
}

function packBody(
  buf: Buffer,
  headers: Record<string, string>,
): Pick<DesktopSupabaseFetchResponse, 'body' | 'bodyEncoding'> {
  const contentType = headers['content-type'] ?? headers['Content-Type'] ?? '';
  if (shouldEncodeBodyAsBase64(contentType)) {
    return { body: buf.toString('base64'), bodyEncoding: 'base64' };
  }
  return { body: buf.toString('utf8'), bodyEncoding: 'utf8' };
}

function fetchViaNodeHttps(req: DesktopSupabaseFetchRequest): Promise<DesktopSupabaseFetchResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(req.url);
    const headers = { ...req.headers };
    if (req.body != null && req.body.length > 0) {
      headers['Content-Length'] = String(Buffer.byteLength(req.body, 'utf8'));
    }
    const request = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: req.method,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          const hdrs = headersFromNode(response.headers);
          const packed = packBody(Buffer.concat(chunks), hdrs);
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: response.statusMessage ?? '',
            headers: hdrs,
            ...packed,
          });
        });
      },
    );
    request.on('error', reject);
    if (req.body) request.write(req.body);
    request.end();
  });
}

/** Metricas planejamento podem chegar perto do statement_timeout (30s) + rede. */
const MAIN_FETCH_TIMEOUT_MS = 90_000;

async function fetchSupabaseInMain(req: DesktopSupabaseFetchRequest): Promise<DesktopSupabaseFetchResponse> {
  const run = async (): Promise<DesktopSupabaseFetchResponse> => {
    try {
      const response = await net.fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body ?? undefined,
      });
      const headers = Object.fromEntries(response.headers.entries());
      const contentType = response.headers.get('content-type') ?? '';
      if (shouldEncodeBodyAsBase64(contentType)) {
        const buf = Buffer.from(await response.arrayBuffer());
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers,
          body: buf.toString('base64'),
          bodyEncoding: 'base64',
        };
      }
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        body: await response.text(),
        bodyEncoding: 'utf8',
      };
    } catch (error) {
      console.warn('[I.S.O PRO] net.fetch Supabase falhou; tentando https nativo.', error);
      return fetchViaNodeHttps(req);
    }
  };
  return Promise.race([
    run(),
    new Promise<DesktopSupabaseFetchResponse>((_, reject) => {
      setTimeout(
        () => reject(new Error('Timeout ao contactar Supabase (processo principal).')),
        MAIN_FETCH_TIMEOUT_MS,
      );
    }),
  ]);
}

export function registerSupabaseFetchHandlers() {
  ipcMain.handle('desktop-supabase:fetch', async (_event, req: DesktopSupabaseFetchRequest) => {
    if (!req?.url || !req.method) {
      throw new Error('Pedido Supabase invalido.');
    }
    if (!isAllowedSupabaseUrl(req.url)) {
      throw new Error('URL Supabase nao permitida neste canal.');
    }
    return fetchSupabaseInMain(req);
  });
}
