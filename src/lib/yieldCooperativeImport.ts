/**
 * Cede o event loop durante importacoes grandes para a UI (Electron/Chromium)
 * nao ficar em "Nao responde" enquanto processa CSV/JSON em memoria.
 */

/** A cada quantas linhas de dados ceder o controlo (agrupamento / aplicacao de import). */
export const IMPORT_COOPERATIVE_YIELD_EVERY_ROWS = 200;

/** So usar cooperacao quando ha trabalho suficiente para justificar yields extra. */
export const IMPORT_COOPERATIVE_MIN_CSV_ROWS = 300;

export async function yieldToMain(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Chamado com indice 0-based da linha; cede apos cada N linhas (ex.: apos 199, 399, ... com N=200). */
export async function yieldCooperativeEveryRows(rowIndex: number, every = IMPORT_COOPERATIVE_YIELD_EVERY_ROWS): Promise<void> {
  if (rowIndex > 0 && rowIndex % every === 0) {
    await yieldToMain();
  }
}

/** `count` = numero de linhas de dados ja processadas (1-based apos incluir a ultima). */
export async function yieldCooperativeAfterRowCount(count: number, every = IMPORT_COOPERATIVE_YIELD_EVERY_ROWS): Promise<void> {
  if (count > 0 && count % every === 0) {
    await yieldToMain();
  }
}
