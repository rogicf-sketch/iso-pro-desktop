/**
 * Evidência fotográfica: JPEG comprimido.
 * Preferencialmente `imageRef` (IndexedDB) + `dataUrl` vazio no JSON local;
 * `dataUrl` preenchido após hidratar (UI / impressão / nuvem).
 */
export type RelatorioFotograficoFoto = {
  id: string;
  dataUrl?: string;
  /** Chave `iso-media:rf:...` no IndexedDB quando a foto não está inline. */
  imageRef?: string;
  legenda: string;
  createdAt: string;
  /** Se false, a legenda não aparece na impressão (só a imagem e o número da foto). */
  mostrarLegendaImpressao: boolean;
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
