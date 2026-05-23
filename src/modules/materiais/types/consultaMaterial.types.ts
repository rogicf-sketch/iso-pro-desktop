import type { StatusPlanejamentoMaterial } from '../../documentos/services/documentoPlanejamento';
import type { Material } from './material.types';

export type ConsultaMaterialDocumentoLinha = {
  documentoId: string;
  numero: string;
  revisao: string;
  descricao: string;
  quantidadeProjeto: number;
  quantidadeAtendida: number;
  quantidadePendente: number;
  statusLinha: StatusPlanejamentoMaterial;
  statusLabel: string;
};

export type ConsultaMaterialLote = {
  atendimentoId: string;
  numero: string;
  dataAtendimento: string;
  documentoNumero: string;
  atendente: string;
  recebedor: string;
  quantidade: number;
  unidade: string;
  status: 'concluido' | 'estornado';
};

export type ConsultaMaterialResult = {
  codigoConsultado: string;
  codigoNormalizado: string;
  material: Material | null;
  saldoAtual: number | null;
  statusGlobal: StatusPlanejamentoMaterial | null;
  statusGlobalLabel: string | null;
  quantidadePlanejada: number;
  percentualAlerta: number;
  limiteAlerta: number | null;
  emAlertaEstoque: boolean;
  documentos: ConsultaMaterialDocumentoLinha[];
  lotes: ConsultaMaterialLote[];
};
