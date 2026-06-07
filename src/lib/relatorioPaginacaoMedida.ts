/**
 * Paginacao de relatorios HTML por altura real (px), nao por quantidade fixa de itens.
 */

export type PaginacaoAlturaConfig = {
  /** Altura util da folha A4 em px (297mm - margens). */
  pageHeightPx: number;
  /** Cabecalho completo + metadados (1ª folha). */
  firstPageOverheadPx: number;
  /** Cabecalho repetido (folhas seguintes). */
  nextPageOverheadPx: number;
  /** Rodape (laudo, assinaturas) na ultima folha. */
  footerPx: number;
  /** Altura do thead da tabela. */
  tableHeaderPx: number;
  /** Linha "Folha X / Y". */
  folhaNumPx: number;
  /** Margem de seguranca contra arredondamento do browser. */
  safetyPx?: number;
};

/** A4 com margem 10mm: area util ~277mm de altura. */
export const ALTURA_UTIL_FOLHA_A4_MM = 277;

/** Largura util do conteudo A4 com margem 10mm (~190mm). */
export const LARGURA_UTIL_FOLHA_A4_MM = 190;

function somaAlturas(rowHeightsPx: number[], indices: number[]): number {
  return indices.reduce((acc, idx) => acc + rowHeightsPx[idx], 0);
}

/**
 * Distribui indices de linhas em folhas conforme altura medida de cada linha.
 * Ultima folha reserva espaco para o rodape (laudo/assinaturas).
 */
export function distribuirIndiceItensPorAltura(
  rowHeightsPx: number[],
  config: PaginacaoAlturaConfig,
): number[][] {
  const safety = config.safetyPx ?? 10;
  const total = rowHeightsPx.length;
  if (total === 0) return [[]];

  const budget = (isFirst: boolean, withFooter: boolean) => {
    let h = config.pageHeightPx;
    h -= isFirst ? config.firstPageOverheadPx : config.nextPageOverheadPx;
    h -= config.tableHeaderPx;
    h -= config.folhaNumPx;
    if (withFooter) h -= config.footerPx;
    return h - safety;
  };

  const pages: number[][] = [];
  let cursor = 0;

  while (cursor < total) {
    const isFirst = pages.length === 0;
    const restantes = Array.from({ length: total - cursor }, (_, k) => cursor + k);

    if (somaAlturas(rowHeightsPx, restantes) <= budget(isFirst, true)) {
      pages.push(restantes);
      break;
    }

    const limite = budget(isFirst, false);
    const pagina: number[] = [];
    let usado = 0;

    while (cursor < total) {
      const altura = rowHeightsPx[cursor];
      if (pagina.length > 0 && usado + altura > limite) break;

      if (pagina.length === 0 && altura > limite) {
        pagina.push(cursor);
        cursor += 1;
        break;
      }

      pagina.push(cursor);
      usado += altura;
      cursor += 1;
    }

    if (pagina.length === 0 && cursor < total) {
      pagina.push(cursor);
      cursor += 1;
    }

    pages.push(pagina);
  }

  return pages;
}

/** Versao compacta do algoritmo para script inline na pre-visualizacao HTML. */
export function scriptDistribuirItensPorAlturaInline(): string {
  return `
function distribuirItensPorAltura(rowHeights, cfg) {
  var safety = cfg.safetyPx != null ? cfg.safetyPx : 10;
  var total = rowHeights.length;
  if (!total) return [[]];
  function budget(isFirst, withFooter) {
    var h = cfg.pageHeightPx;
    h -= isFirst ? cfg.firstPageOverheadPx : cfg.nextPageOverheadPx;
    h -= cfg.tableHeaderPx;
    h -= cfg.folhaNumPx;
    if (withFooter) h -= cfg.footerPx;
    return h - safety;
  }
  function soma(indices) {
    var s = 0;
    for (var j = 0; j < indices.length; j++) s += rowHeights[indices[j]];
    return s;
  }
  var pages = [];
  var cursor = 0;
  while (cursor < total) {
    var isFirst = pages.length === 0;
    var restantes = [];
    for (var k = cursor; k < total; k++) restantes.push(k);
    if (soma(restantes) <= budget(isFirst, true)) {
      pages.push(restantes);
      break;
    }
    var limite = budget(isFirst, false);
    var pagina = [];
    var usado = 0;
    while (cursor < total) {
      var altura = rowHeights[cursor];
      if (pagina.length > 0 && usado + altura > limite) break;
      if (!pagina.length && altura > limite) {
        pagina.push(cursor);
        cursor += 1;
        break;
      }
      pagina.push(cursor);
      usado += altura;
      cursor += 1;
    }
    if (!pagina.length && cursor < total) {
      pagina.push(cursor);
      cursor += 1;
    }
    pages.push(pagina);
  }
  return pages;
}`;
}
