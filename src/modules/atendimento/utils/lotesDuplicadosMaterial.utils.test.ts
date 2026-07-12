import { describe, expect, it } from 'vitest';
import type { Atendimento } from '../types/atendimento.types';
import { encontrarOutrosLotesMesmoMaterialDocumento } from './lotesDuplicadosMaterial.utils';

function lote(
  id: string,
  numero: string,
  itens: Atendimento['itens'],
  extra?: Partial<Atendimento>,
): Atendimento {
  return {
    id,
    numero,
    documentoId: 'd1',
    documentoNumero: 'DOC-A',
    atendente: 'Op',
    atendenteMatricula: '',
    atendenteFuncao: '',
    recebedorTipo: 'interno',
    recebedorColaboradorId: null,
    recebedor: 'Rec',
    recebedorEmpresa: '',
    recebedorDocumento: '',
    recebedorTelefone: '',
    autorizadorInterno: '',
    motivoRetirada: '',
    origem: 'windows',
    status: 'concluido',
    dataAtendimento: '2026-06-01T10:00:00.000Z',
    itens,
    ...extra,
  };
}

describe('lotesDuplicadosMaterial.utils', () => {
  it('detecta outro lote com mesmo material e documento', () => {
    const alvo = lote('a1', 'ATD-1', [
      {
        id: 'i1',
        documentoItemId: 'di1',
        materialId: null,
        codigoMaterial: 'ATER0004',
        descricaoMaterial: 'Clip',
        unidade: 'PC',
        quantidadeAtendida: 70,
        documentoNumero: 'E.RAZN010-IE6-00002-ABOVE',
      },
    ]);

    const historico = [
      alvo,
      lote('a2', 'ATD-2', [
        {
          id: 'i2',
          documentoItemId: 'di2',
          materialId: null,
          codigoMaterial: 'ATER0004',
          descricaoMaterial: 'Clip',
          unidade: 'PC',
          quantidadeAtendida: 70,
          documentoNumero: 'E.RAZN010-IE6-00002-ABOVE',
        },
      ], { dataAtendimento: '2026-06-12T01:00:00.000Z', origem: 'mobile', recebedor: 'Gilson' }),
    ];

    const avisos = encontrarOutrosLotesMesmoMaterialDocumento(historico, alvo);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.loteNumero).toBe('ATD-2');
    expect(avisos[0]?.codigoMaterial).toBe('ATER0004');
  });

  it('ignora lotes estornados', () => {
    const alvo = lote('a1', 'ATD-1', [
      {
        id: 'i1',
        documentoItemId: 'di1',
        materialId: null,
        codigoMaterial: 'M1',
        descricaoMaterial: 'X',
        unidade: 'UN',
        quantidadeAtendida: 1,
        documentoNumero: 'DOC-A',
      },
    ]);
    const historico = [
      alvo,
      lote('a2', 'ATD-2', alvo.itens, { status: 'estornado' }),
    ];
    expect(encontrarOutrosLotesMesmoMaterialDocumento(historico, alvo)).toHaveLength(0);
  });
});
