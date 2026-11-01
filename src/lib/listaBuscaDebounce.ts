/** Pausa padrao (ms) antes de aplicar o texto de busca nas listagens — alinha modulos com Etiquetas > recebimento. */
export const LISTA_BUSCA_DEBOUNCE_MS = 380;

/** Colagens longas (nº de desenho / NF): debounce mais curto para a lista reagir mais cedo. */
export function listaBuscaDebounceMs(texto: string): number {
  const n = String(texto ?? '').trim().length;
  if (n >= 12) return 100;
  if (n >= 5 && /^[0-9./-]+$/.test(String(texto ?? '').trim())) return 160;
  return LISTA_BUSCA_DEBOUNCE_MS;
}
