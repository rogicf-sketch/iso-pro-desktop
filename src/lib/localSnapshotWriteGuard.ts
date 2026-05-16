import { parseLocalStorageRecordArray } from './schemas/localStorageRecordArray.zod';
import { hasSupabaseConfig } from './supabase';

const DICA_PADRAO =
  'Recarregue a pagina com rede estavel para alinhar com a nuvem, exporte os dados deste navegador antes de continuar, ou regularize outra sessao que tenha a lista completa.';

/**
 * Conta entradas num JSON-array guardado em `localStorage` (mesma convencao dos modulos ISO PRO).
 */
export function contarRegistosArrayLocalStorage(storageKey: string): number {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  const rows = parseLocalStorageRecordArray(parsed);
  return rows !== null ? rows.length : 0;
}

export type VerificacaoLocalVsGravacao = {
  storageKey: string;
  tamanhoNovaLista: number;
  /** Ex.: "recebimento(s)", "documento(s) de planejamento" */
  nomeCurto: string;
  /** Texto apos "removeria X ..." (ex.: documentos usam "desenho(s)") */
  substantivoRemovidos?: string;
};

/**
 * Evita `writeAll`/substituicao local quando o navegador tem mais linhas guardadas do que a lista
 * que viria do fluxo com nuvem (snapshot + `executeWrite`), o que apagaria cadastros so neste PC.
 */
export function mensagemSeSubstituirLocalPerderiaCadastros(
  verificacoes: VerificacaoLocalVsGravacao[],
  dicaResolucao?: string,
): string | null {
  if (!hasSupabaseConfig() || verificacoes.length === 0) return null;

  const fracassos: Array<{
    nomeCurto: string;
    noLocal: number;
    tamanhoNovaLista: number;
    substantivoRemovidos: string;
  }> = [];

  for (const v of verificacoes) {
    const noLocal = contarRegistosArrayLocalStorage(v.storageKey);
    if (noLocal > v.tamanhoNovaLista) {
      fracassos.push({
        nomeCurto: v.nomeCurto,
        noLocal,
        tamanhoNovaLista: v.tamanhoNovaLista,
        substantivoRemovidos: v.substantivoRemovidos?.trim() || 'registro(s)',
      });
    }
  }

  if (fracassos.length === 0) return null;

  const dica = dicaResolucao?.trim() || DICA_PADRAO;

  if (fracassos.length === 1) {
    const f = fracassos[0];
    const delta = f.noLocal - f.tamanhoNovaLista;
    return (
      `O armazenamento deste navegador tem ${f.noLocal} ${f.nomeCurto}, mas esta operacao gravaria apenas ${f.tamanhoNovaLista} para a nuvem (e substituiria a copia local), o que removeria ${delta} ${f.substantivoRemovidos} deste PC. ${dica}`
    );
  }

  const linhas = fracassos.map(
    (f) =>
      `${f.nomeCurto}: ${f.noLocal} no navegador vs ${f.tamanhoNovaLista} na operacao (perderia ${f.noLocal - f.tamanhoNovaLista} ${f.substantivoRemovidos})`,
  );
  return `Operacao bloqueada para evitar perda de dados: ${linhas.join('; ')}. ${dica}`;
}
