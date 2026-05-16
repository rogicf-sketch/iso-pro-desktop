/** Disparado quando uma chave do `localStorage` existente falha parse/validacao (UI pode avisar o utilizador). */
export const ISO_PRO_LOCAL_STORAGE_INVALIDO_EVENT = 'iso-pro-local-storage-invalido';

export type LocalStorageInvalidoDetail = {
  modulo: string;
  storageKey: string;
  detalhe?: string;
};

/**
 * Politica: cadastro existente no `localStorage` **nunca** e substituido por dados de exemplo
 * quando o JSON falha ao ler ou deixa de passar na validacao — isso apagava trabalho real sem acao do utilizador.
 */
export function avisarPreservacaoLocalStorageCorrupto(modulo: string, storageKey: string, detalhe?: string) {
  const extra = detalhe ? ` ${detalhe}` : '';
  console.warn(
    `[I.S.O PRO] ${modulo} — "${storageKey}": armazenamento local ilegivel ou invalido.${extra} ` +
      'O valor bruto no navegador nao foi sobrescrito com dados de exemplo; em memoria usa-se lista vazia ou padroes seguros ate recuperar backup ou corrigir o JSON.',
  );

  if (typeof window !== 'undefined') {
    const detail: LocalStorageInvalidoDetail = { modulo, storageKey, detalhe };
    window.dispatchEvent(new CustomEvent(ISO_PRO_LOCAL_STORAGE_INVALIDO_EVENT, { detail }));
  }
}
