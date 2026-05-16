import { parseCsvHeadersOnly } from './csv';

/** Modelo oficial I.S.O PRO inferido apenas pelos nomes de coluna do cabecalho. */
export type IsoProCsvImportKind =
  | 'recebimentos_plano'
  | 'recebimentos_itens'
  | 'documentos'
  | 'materiais'
  | 'fornecedores'
  | 'desconhecido';

/** Nomes curtos para a mensagem de erro (o detalhe do ficheiro modelo fica implicito na dica). */
const ROTULO: Record<Exclude<IsoProCsvImportKind, 'desconhecido'>, string> = {
  recebimentos_plano: 'Recebimentos (plano completo)',
  recebimentos_itens: 'Itens de recebimento (novo recebimento)',
  documentos: 'Documentos',
  materiais: 'Materiais',
  fornecedores: 'Fornecedores',
};

const DICA_MODELO = 'Use «Baixar modelo CSV» na pagina certa e volte a importar.';

function has(h: ReadonlySet<string>, k: string): boolean {
  return h.has(k);
}

/**
 * Heuristica alinhada aos modelos oficiais exportados pelo sistema.
 * Ficheiros personalizados podem devolver `desconhecido` (nao bloqueia).
 */
export function detectarModeloCsvImportacao(headers: readonly string[]): IsoProCsvImportKind {
  const h = new Set(headers.filter((x) => x && !x.startsWith('col_')));

  const recebPlano =
    has(h, 'fornecedor') &&
    has(h, 'data_recebimento') &&
    (has(h, 'nota_fiscal') || has(h, 'romaneio') || has(h, 'nota') || has(h, 'nf'));

  if (recebPlano) {
    return 'recebimentos_plano';
  }

  const documentos =
    has(h, 'numero') &&
    has(h, 'data_documento') &&
    (has(h, 'codigo_material') ||
      has(h, 'quantidade_projeto') ||
      has(h, 'quantidade_documento') ||
      has(h, 'quantidade_atendida'));

  if (documentos) {
    return 'documentos';
  }

  const materiais = has(h, 'estoque_minimo') && has(h, 'codigo_barras');
  if (materiais) {
    return 'materiais';
  }

  const itensReceb =
    has(h, 'localizacao') &&
    has(h, 'codigo') &&
    has(h, 'descricao') &&
    has(h, 'quantidade') &&
    !has(h, 'fornecedor') &&
    !has(h, 'data_recebimento') &&
    !has(h, 'data_documento') &&
    !has(h, 'numero');

  if (itensReceb) {
    return 'recebimentos_itens';
  }

  const fornecedores =
    has(h, 'cnpj') &&
    has(h, 'nome') &&
    has(h, 'ativo') &&
    (has(h, 'endereco') || has(h, 'email')) &&
    !has(h, 'matricula') &&
    !has(h, 'codigo_material') &&
    !has(h, 'quantidade');

  if (fornecedores) {
    return 'fornecedores';
  }

  return 'desconhecido';
}

/**
 * Se o cabecalho bate claramente com outro modelo oficial, devolve mensagem de erro;
 * caso contrario `null` (import segue com as validacoes ja existentes).
 */
export function mensagemSeCabecalhoImportCsvIncompativel(
  esperado: Exclude<IsoProCsvImportKind, 'desconhecido'>,
  text: string,
): string | null {
  const headers = parseCsvHeadersOnly(text);
  if (!headers?.length) {
    return null;
  }
  const det = detectarModeloCsvImportacao(headers);
  if (det === 'desconhecido' || det === esperado) {
    return null;
  }
  return `Este CSV parece ser de ${ROTULO[det]}, mas esta a importar em ${ROTULO[esperado]}. ${DICA_MODELO}`;
}
