import { ipcMain, net } from 'electron';
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

function fetchViaNodeHttps(req: DesktopSupabaseFetchRequest): Promise<DesktopSupabaseFetchResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(req.url);
    const request = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: response.statusMessage ?? '',
            headers: Object.fromEntries(
              Object.entries(response.headers).flatMap(([key, value]) =>
                value == null ? [] : [[key, Array.isArray(value) ? value.join(', ') : String(value)]],
              ),
            ),
            body,
          });
        });
      },
    );
    request.on('error', reject);
    if (req.body) request.write(req.body);
    request.end();
  });
}

async function fetchSupabaseInMain(req: DesktopSupabaseFetchRequest): Promise<DesktopSupabaseFetchResponse> {
  try {
    const response = await net.fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ?? undefined,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  } catch (error) {
    console.warn('[I.S.O PRO] net.fetch Supabase falhou; tentando https nativo.', error);
    return fetchViaNodeHttps(req);
  }
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
