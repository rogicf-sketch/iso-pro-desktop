import { describe, expect, it } from 'vitest';
import { isRirPayloadOffloaded, slimRirForCloudIndex } from './rirPayloadStorage';
import type { RirRegistro } from '../types/qualidade.types';

const base: RirRegistro = {
  id: 'rir-1',
  codigo: 'RIR-1',
  dataRegistro: '2026-07-20',
  recebimentoId: 'rec-1',
  uo: 'UO',
  localObra: 'Obra',
  contratoNumero: '',
  fornecedorNome: 'Forn',
  inspecaoQuantitativa: true,
  inspecaoQualitativa: true,
  inspecaoDimensional: false,
  procedimentoNumero: '',
  solCompraPackList: '',
  obsCurta: 'obs',
  itensRir: [
    {
      id: 'i1',
      codigoMaterial: 'M1',
      quantidade: 2,
      unidade: 'UN',
      descricaoMaterial: 'Item',
      certificado: 'C1',
    },
  ],
  instrumentos: 'paquimetro',
  documentosQc: 'docs',
  observacoesQc: 'qc',
  laudo: 'aprovado',
  assinaturaRecebimento: { nome: 'A', data: '2026-07-20' },
  assinaturaCq: { nome: '', data: '' },
  assinaturaCliente: { nome: '', data: '' },
  origem: '',
  responsavel: 'Resp',
  descricao: 'Descricao longa do RIR',
  status: 'aberto',
  acaoImediata: '',
  observacoes: '',
};

describe('rirPayloadStorage', () => {
  it('slimRirForCloudIndex remove itens e guarda ref Storage', () => {
    const ref = 'iso-storage:evidencias/t/rir/rir-1.json';
    const slim = slimRirForCloudIndex(base, ref);
    expect(slim.itensRir).toEqual([]);
    expect(slim.instrumentos).toBe('');
    expect(slim.payloadStorageRef).toBe(ref);
    expect(slim.codigo).toBe('RIR-1');
    expect(isRirPayloadOffloaded(slim)).toBe(true);
    expect(isRirPayloadOffloaded(base)).toBe(false);
  });
});
