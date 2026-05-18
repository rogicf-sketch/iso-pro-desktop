import type { Atendimento } from '../../atendimento/types/atendimento.types';
import type { DocumentoListItem } from '../../documentos/types/documento.types';
import type { InventarioListItem } from '../../inventario/types/inventario.types';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import type { RirRegistro, RncRegistro } from '../../qualidade/types/qualidade.types';
import type { RelatorioFotograficoMeta } from './relatorioFotografico.types';
import type { AnaliseRelatorioFinalObra } from '../utils/relatorioFinalObraAnalise';
import type { RelatorioFinalObraApresentacao } from './relatorioFinalObraApresentacao.types';

/** Texto exibido na pré-visualização (não consome sequência RFO-AAAA-NNNNN). */
export const RFO_NUMERO_PREVIA = 'Pré-visualização';

export type RelatorioFinalObraContexto = {
  numeroRelatorio: string;
  /** `true` após «Registrar relatório» — número oficial RFO atribuído. */
  registrado: boolean;
  geradoEm: string;
  cliente: string;
  projeto: string;
  contrato: string;
  local: string;
  rodapeNome: string;
  rodapeCnpj: string;
};

export type RelatorioFinalObraTotais = {
  documentos: number;
  documentosCancelados: number;
  recebimentos: number;
  recebimentosCancelados: number;
  rir: number;
  rirCancelados: number;
  rnc: number;
  rncCancelados: number;
  atendimentos: number;
  atendimentosEstornados: number;
  inventarios: number;
  inventariosAbertos: number;
  relatoriosFotograficos: number;
  materiais: number;
  colaboradores: number;
  fornecedores: number;
};

export type RelatorioFinalObraDados = {
  contexto: RelatorioFinalObraContexto;
  totais: RelatorioFinalObraTotais;
  documentos: DocumentoListItem[];
  recebimentos: RecebimentoListItem[];
  rir: RirRegistro[];
  rnc: RncRegistro[];
  atendimentos: Atendimento[];
  inventarios: InventarioListItem[];
  relatoriosFotograficos: RelatorioFotograficoMeta[];
  /** Preenchido por `enriquecerRelatorioFinalObra` antes de gerar PDF/Word. */
  apresentacao?: RelatorioFinalObraApresentacao;
  /** Destaques reordenados/priorizados pela IA (quando configurada). */
  analiseEnriquecida?: AnaliseRelatorioFinalObra;
};
