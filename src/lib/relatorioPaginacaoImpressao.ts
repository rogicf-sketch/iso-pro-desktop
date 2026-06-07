/**
 * Utilitarios de paginacao explicita para relatorios HTML (impressao/PDF).
 * Cada folha HTML = uma secao com cabecalho repetido + bloco de conteudo.
 */

export type FolhaPaginada<T> = {
  itens: T[];
  incluirRodape: boolean;
};

/**
 * Pagina itens de relatorio garantindo:
 * - >8 itens sempre gera 2+ folhas HTML (cabecalho repetido na impressao)
 * - ultima folha reserva espaco para rodape (laudo, assinaturas)
 */
export function paginarItensRelatorioImpressao<T>(
  itens: T[],
  opts: {
    /** Max itens na 1ª folha (cabecalho completo ocupa espaco). */
    primeiraPagina: number;
    /** Max itens em folhas intermediarias. */
    intermediaria: number;
    /** Max itens na ultima folha quando inclui rodape. */
    ultimaComRodape: number;
    /** Acima deste total (e ate `splitForcadoAte`), divide em 2 folhas equilibradas. */
    splitForcadoAcimaDe: number;
    splitForcadoAte: number;
  },
): FolhaPaginada<T>[] {
  const {
    primeiraPagina,
    intermediaria,
    ultimaComRodape,
    splitForcadoAcimaDe,
    splitForcadoAte,
  } = opts;

  if (itens.length === 0) return [{ itens: [], incluirRodape: true }];
  if (itens.length <= ultimaComRodape) return [{ itens, incluirRodape: true }];

  if (itens.length > splitForcadoAcimaDe && itens.length <= splitForcadoAte) {
    const split = Math.ceil(itens.length / 2);
    return [
      { itens: itens.slice(0, split), incluirRodape: false },
      { itens: itens.slice(split), incluirRodape: true },
    ];
  }

  const folhas: FolhaPaginada<T>[] = [{ itens: itens.slice(0, primeiraPagina), incluirRodape: false }];
  let rest = itens.slice(primeiraPagina);

  while (rest.length > ultimaComRodape) {
    const sobraAposUltima = rest.length - ultimaComRodape;
    const take = Math.min(intermediaria, sobraAposUltima);
    if (take <= 0) break;
    folhas.push({ itens: rest.slice(0, take), incluirRodape: false });
    rest = rest.slice(take);
  }

  folhas.push({ itens: rest, incluirRodape: true });
  return folhas;
}

/** CSS comum: folhas explicitas, repeticao de thead e cabecalho na impressao. */
export function cssRelatorioFolhasImpressao(prefixo = 'iso'): string {
  const p = prefixo;
  return `
.${p}-print-sheet { display: block; width: 100%; }
.${p}-print-sheet--cont {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 2px dashed #cbd5e1;
}
.${p}-cabecalho-folha {
  break-inside: avoid;
  page-break-inside: avoid;
}
.${p}-folha-num {
  text-align: right;
  font-size: 9px;
  color: #94a3b8;
  margin-top: 6px;
}
@media print {
  .${p}-doc-inner { overflow: visible !important; }
  .${p}-print-sheet--cont {
    page-break-before: always;
    break-before: page;
    margin-top: 0 !important;
    padding-top: 0 !important;
    border-top: none !important;
  }
  .${p}-print-sheet + .${p}-print-sheet--cont {
    margin-top: 0 !important;
    padding-top: 0 !important;
  }
  .${p}-print-sheet--last {
    break-after: avoid-page;
    page-break-after: avoid;
  }
  .${p}-cabecalho-folha {
    break-after: avoid-page;
    page-break-after: avoid;
  }
  .${p}-table thead {
    display: table-header-group;
  }
  .${p}-thead-title-repeat {
    display: table-row;
  }
  .${p}-thead-title-repeat td {
    border: none !important;
    padding: 0 0 8px 0 !important;
    background: #fff !important;
  }
  .${p}-print-sheet--cont .${p}-thead-title-repeat {
    display: none;
  }
}
@media screen {
  .${p}-print-sheet--cont {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 2px dashed #cbd5e1;
  }
  .${p}-thead-title-repeat { display: none; }
}
`;
}
