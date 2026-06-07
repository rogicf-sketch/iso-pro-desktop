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
};

/** Fetch Supabase via processo principal (Electron) — contorna falhas de rede/TLS no renderer sandbox. */
export function createDesktopSupabaseFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const bridge = window.isoProDesktop?.supabaseFetch;
    if (!bridge) {
      return fetch(input, init);
    }

    const req = input instanceof Request ? input : new Request(input, init);
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const payload: DesktopSupabaseFetchRequest = {
      url: req.url,
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.clone().text(),
    };

    let result: DesktopSupabaseFetchResponse;
    try {
      result = await bridge(payload);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha na ligacao Supabase.';
      throw new TypeError(msg);
    }

    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    });
  };
}

export function canUseDesktopSupabaseFetch(): boolean {
  return typeof window !== 'undefined' && typeof window.isoProDesktop?.supabaseFetch === 'function';
}
