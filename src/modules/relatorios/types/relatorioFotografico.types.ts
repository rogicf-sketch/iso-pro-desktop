/**
 * Evidência fotográfica: JPEG comprimido.
 * Local: `imageRef` IndexedDB (`iso-media:`) + `dataUrl` vazio.
 * Nuvem: `imageRef` Storage (`iso-storage:evidencias/...`) — binário no bucket de 100 GB.
 * `dataUrl` só após hidratar (UI / impressão).
 */
export type RelatorioFotograficoFoto = {
  id: string;
  dataUrl?: string;
  /** Chave `iso-media:rf:...` (IndexedDB) ou `iso-storage:evidencias/...` (Supabase Storage). */
  imageRef?: string;
  legenda: string;
  /**
   * Etiqueta curta impressa junto à foto (ex.: BOBINA 01, ITEM 3).
   * Opcional — não substitui a legenda.
   */
  etiqueta: string;
  createdAt: string;
  /** Se false, a legenda não aparece na impressão (só a imagem e o número da foto). */
  mostrarLegendaImpressao: boolean;
};

/** Bloco de assinatura / visto digital no PDF. */
export type RelatorioFotograficoAssinatura = {
  nome: string;
  /** Data ISO ou texto livre (ex. 21/07/2026 08:20). */
  data: string;
};

export type RelatorioFotograficoPayload = {
  version: 1;
  /** Identificador único deste relatório no catálogo local. */
  reportId: string;
  /** Última gravação local ou na nuvem (ISO). */
  salvoEm: string;
  /**
   * Código do relatório (ex.: RF-2026-00001). Gerado automaticamente na primeira gravação ou impressão.
   */
  numeroRelatorio: string;
  /** Título principal do relatório (capa / impressão). */
  titulo: string;
  observacoes: string;
  rirCodigo: string;
  recebimentoId: string;
  /** Rótulo amigável na UI (ex.: NF · fornecedor · data). */
  recebimentoLabel: string;
  /** Campos do cabeçalho de impressão (editáveis; podem ser preenchidos pelo recebimento). */
  notaFiscal: string;
  fornecedor: string;
  romaneio: string;
  /** Espelha Configurações → Cliente (UO / identificação da obra). */
  centroCusto: string;
  projeto: string;
  /** Espelha Configurações → Local. */
  localObra: string;
  /** Incluir logo institucional na primeira página do PDF/impressão. */
  incluirLogoImpressao: boolean;
  /** Incluir bloco de assinaturas / visto digital no final do PDF. */
  incluirAssinaturasImpressao: boolean;
  assinaturaRecebimento: RelatorioFotograficoAssinatura;
  assinaturaQualidade: RelatorioFotograficoAssinatura;
  assinaturaFiscalizacao: RelatorioFotograficoAssinatura;
  fotos: RelatorioFotograficoFoto[];
  /** Quantidade de vezes que o relatório HTML foi gerado (métrica). */
  relatoriosGerados: number;
};

/** Resumo para a lista de relatórios (UI). */
export type RelatorioFotograficoMeta = {
  id: string;
  titulo: string;
  numeroRelatorio: string;
  salvoEm: string;
  fotoCount: number;
};

export function defaultRelatorioFotograficoAssinatura(): RelatorioFotograficoAssinatura {
  return { nome: '', data: '' };
}
