import type { FolhaPaginada } from '../../../lib/relatorioPaginacaoImpressao';

/** Linhas útis por folha A4 (fonte 9pt, margens 7,5 mm). */
const LINHAS_FOLHA = 42;
/** Cabeçalho INS completo na 1ª folha (grade 3 colunas). */
const LINHAS_HDR_PRIMEIRA = 18;
/** Cabeçalho compacto nas folhas seguintes. */
const LINHAS_HDR_CONTINUACAO = 5;
/** Espaço para «Folha n/N». */
const LINHAS_RESERVA_FOLHA_NUM = 1;
/** Margem leve — compensa subestimativa sem esvaziar folhas. */
const LINHAS_MARGEM_SEGURANCA = 2;
/** Laudo + assinaturas — folha dedicada. */
const LINHAS_RODAPE_MIN = 16;
const FATOR_SEGURANCA = 1.1;

export type FolhaRirImpressao<T> = FolhaPaginada<T> & {
  somenteRodape?: boolean;
  /** @deprecated v64 — sem linhas vazias de preenchimento. */
  linhasPreenchimento?: number;
};

type ItemComTexto = { descricaoMaterial?: string; codigoMaterial?: string };

/** Estima quantas linhas de tabela um item ocupa (descrição integral). */
export function estimarLinhasItemRir(item: ItemComTexto): number {
  const desc = item.descricaoMaterial ?? '';
  const cod = item.codigoMaterial ?? '';
  const quebras = (desc.match(/\n/g) ?? []).length;
  /** Coluna descrição ~45% da largura útil A4 (~85–90 caracteres em 8,5pt). */
  const descLinhas = Math.max(1, Math.ceil(desc.length / 88) + quebras);
  /** Coluna código ~16% — quebra agressiva (break-all). */
  const codLinhas = Math.max(1, Math.ceil(cod.length / 16));
  const rowBase = Math.max(descLinhas, codLinhas);
  return Math.max(1, Math.ceil(rowBase * FATOR_SEGURANCA));
}

function capacidadeSlotsItens(indiceFolhaItens: number): number {
  const hdr = indiceFolhaItens === 0 ? LINHAS_HDR_PRIMEIRA : LINHAS_HDR_CONTINUACAO;
  return Math.max(3, LINHAS_FOLHA - hdr - LINHAS_RESERVA_FOLHA_NUM - LINHAS_MARGEM_SEGURANCA);
}

function pesoFolha<T extends ItemComTexto>(slice: T[]): number {
  return slice.reduce((s, it) => s + estimarLinhasItemRir(it), 0);
}

function paginarSomenteItens<T extends ItemComTexto>(itens: T[]): FolhaRirImpressao<T>[] {
  const n = itens.length;
  const pesos = itens.map(estimarLinhasItemRir);
  const folhas: FolhaRirImpressao<T>[] = [];
  let idx = 0;

  while (idx < n) {
    const indiceFolha = folhas.length;
    const cap = capacidadeSlotsItens(indiceFolha);
    let acum = 0;
    let fim = idx;
    while (fim < n && acum + pesos[fim]! <= cap) {
      acum += pesos[fim]!;
      fim++;
    }
    if (fim === idx) fim = idx + 1;

    const slice = itens.slice(idx, fim);
    folhas.push({
      itens: slice,
      incluirRodape: false,
      linhasPreenchimento: 0,
    });
    idx = fim;
    if (folhas.length > 48) break;
  }

  return folhas;
}

/**
 * Pagina itens RIR: folhas de material + folha de rodapé (sem linhas vazias).
 */
export function paginarItensRirImpressao<T extends ItemComTexto>(itens: T[]): FolhaRirImpressao<T>[] {
  const n = itens.length;
  if (n === 0) {
    return [{ itens: [], incluirRodape: true, somenteRodape: true, linhasPreenchimento: 0 }];
  }

  const folhasItens = paginarSomenteItens(itens);
  const ultima = folhasItens[folhasItens.length - 1]!;
  const capUltima = capacidadeSlotsItens(folhasItens.length - 1);
  const sobra = capUltima - pesoFolha(ultima.itens);

  if (sobra >= LINHAS_RODAPE_MIN) {
    ultima.incluirRodape = true;
    ultima.linhasPreenchimento = 0;
    return folhasItens;
  }

  return [
    ...folhasItens.map((f) => ({ ...f, linhasPreenchimento: 0 })),
    { itens: [], incluirRodape: true, somenteRodape: true, linhasPreenchimento: 0 },
  ];
}

/** Slots na 1ª folha de itens (testes / diagnóstico). */
export const RIR_SLOTS_LINHA_POR_FOLHA_ITENS = capacidadeSlotsItens(0);

/** @deprecated Mantido para testes legados. */
export const RIR_CAP_PRIMEIRA_FOLHA = 30;
export const RIR_CAP_FOLHA_INTERMEDIARIA = 40;
export const RIR_CAP_ULTIMA_COM_RODAPE = 30;
