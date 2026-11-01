/** Payload/ resposta partilhados com `electron/main/supabaseFetchIpc.ts`. */
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
  /** Binários (JPEG evidências) — ver `electron/main/supabaseFetchIpc.ts`. */
  bodyEncoding?: 'utf8' | 'base64';
};

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Fetch Supabase via processo principal (Electron) — contorna falhas de rede/TLS no renderer sandbox. */
export function createDesktopSupabaseFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const bridge = window.isoProDesktop?.supabaseFetch;
    if (!bridge) {
      return fetch(input, init);
    }

    const req = input instanceof Request ? input : new Request(input, init);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      // net.fetch / https recalculam Content-Length; valor do Request no renderer
      // pode truncar o body no processo principal (metricas/PDF falhavam, lista ok).
      const k = key.toLowerCase();
      if (k === 'content-length' || k === 'host' || k === 'connection' || k === 'transfer-encoding') {
        return;
      }
      headers[key] = value;
    });

    const bodyText =
      req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.clone().text();
    if (bodyText != null && bodyText.length > 0 && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    const payload: DesktopSupabaseFetchRequest = {
      url: req.url,
      method: req.method,
      headers,
      body: bodyText,
    };

    let result: DesktopSupabaseFetchResponse;
    try {
      // Soft-abort no Confirmar: nao esperar IPC eternamente se o signal ja disparou.
      const bridgePromise = bridge(payload);
      result = signal
        ? await new Promise<DesktopSupabaseFetchResponse>((resolve, reject) => {
            const onAbort = () => reject(new DOMException('The user aborted a request.', 'AbortError'));
            signal.addEventListener('abort', onAbort, { once: true });
            bridgePromise.then(
              (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
              },
              (error) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
              },
            );
          })
        : await bridgePromise;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const msg = error instanceof Error ? error.message : 'Falha na ligacao Supabase.';
      throw new TypeError(msg);
    }

    const bodyInit: BodyInit =
      result.bodyEncoding === 'base64' ? base64ToArrayBuffer(result.body) : result.body;

    return new Response(bodyInit, {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    });
  };
}

export function canUseDesktopSupabaseFetch(): boolean {
  return typeof window !== 'undefined' && typeof window.isoProDesktop?.supabaseFetch === 'function';
}
