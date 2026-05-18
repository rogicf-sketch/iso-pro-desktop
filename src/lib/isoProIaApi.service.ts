import type { ConfiguracaoSistema } from '../modules/configuracoes/types/configuracao.types';

/** Credenciais OpenAI-compatíveis (reutilizável em vários relatórios). */
export type IsoProIaApiCredenciais = {
  apiKey: string;
  modelo: string;
  baseUrl: string;
};

export type IsoProIaApiResultado<T> = { ok: true; data: T } | { ok: false; erro: string };

export type IsoProIaTesteConexao = {
  modelo: string;
  latenciaMs: number;
  respostaAmostra: string;
};

const TESTE_TIMEOUT_MS = 20_000;
const DEFAULT_IA_BASE_URL = 'https://api.openai.com/v1';

/** Corrige URLs comuns (ex.: openrouter.ai sem /api/v1). */
export function normalizeIaApiBaseUrl(url: unknown): string {
  const t = String(url ?? '').trim().replace(/\/+$/, '');
  if (!t) return DEFAULT_IA_BASE_URL;
  const lower = t.toLowerCase();
  if (lower === 'https://openrouter.ai' || lower === 'http://openrouter.ai') {
    return 'https://openrouter.ai/api/v1';
  }
  if (lower === 'https://freetheai.xyz' || lower === 'https://www.freetheai.xyz') {
    return 'https://api.freetheai.xyz/v1';
  }
  return t;
}

export function credenciaisIaFromConfiguracao(cfg: ConfiguracaoSistema): IsoProIaApiCredenciais {
  return {
    apiKey: cfg.relatorioFinalIaApiKey.trim(),
    modelo: cfg.relatorioFinalIaModelo.trim() || 'gpt-4o-mini',
    baseUrl: normalizeIaApiBaseUrl(cfg.relatorioFinalIaBaseUrl),
  };
}

export function iaApiTemChaveMinima(cfg: ConfiguracaoSistema): boolean {
  return credenciaisIaFromConfiguracao(cfg).apiKey.length >= 8;
}

function urlChatCompletions(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/** Chamada HTTP central — outros módulos de relatório devem usar isto. */
export async function chamarChatCompletionsIa(
  cred: IsoProIaApiCredenciais,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<IsoProIaApiResultado<string>> {
  if (cred.apiKey.length < 8) {
    return { ok: false, erro: 'Informe uma chave de API válida (mínimo 8 caracteres).' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(urlChatCompletions(cred.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cred.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { ok: false, erro: `API retornou ${res.status}: ${errBody.slice(0, 280) || res.statusText}` };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (json.error?.message) {
      return { ok: false, erro: json.error.message };
    }

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, erro: 'Resposta vazia do modelo.' };
    }

    return { ok: true, data: content };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, erro: `Tempo esgotado (${Math.round(timeoutMs / 1000)} s).` };
    }
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha na chamada à API.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Ping leve para validar URL, chave e modelo antes de gerar relatórios. */
export async function testarConexaoIaApi(
  cfg: ConfiguracaoSistema,
): Promise<IsoProIaApiResultado<IsoProIaTesteConexao>> {
  const cred = credenciaisIaFromConfiguracao(cfg);
  const inicio = Date.now();

  const res = await chamarChatCompletionsIa(
    cred,
    {
      model: cred.modelo,
      max_tokens: 12,
      temperature: 0,
      messages: [{ role: 'user', content: 'Responda apenas a palavra OK.' }],
    },
    TESTE_TIMEOUT_MS,
  );

  if (!res.ok) {
    return res;
  }

  return {
    ok: true,
    data: {
      modelo: cred.modelo,
      latenciaMs: Date.now() - inicio,
      respostaAmostra: res.data.slice(0, 80),
    },
  };
}
