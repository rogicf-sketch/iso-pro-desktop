import { describe, expect, it } from 'vitest';

import type { EstornoLogRegistro } from '../types/atendimento.types';
import { itensAtendimentoFromEstornoLog } from './montarReciboVisualizarHistorico';

describe('itensAtendimentoFromEstornoLog', () => {
  it('monta itens do recibo a partir do log (lote estornado sem itens no array)', () => {
    const log: EstornoLogRegistro[] = [
      {
        id: 'e1',
        dataEstorno: '2026-07-18T22:02:25.574Z',
        loteNumero: 'ATD-20260711-00080',
        loteId: 'ATD-20260711-00080::1',
        atendimentoItemId: '994479',
        documentoNumero: 'E.RAZN010-IE6-00013-ABOVE SPDA',
        codigoMaterial: 'ARLCPB0G',
        descricaoMaterial: 'ARRUELA',
        unidade: 'PC',
        quantidadeEstornada: 2,
        quantidadeRetiradaOriginal: 2,
        quantidadeRestanteNoLote: 0,
        nomeQuemEstorna: 'Administrador',
        nomeQuemDevolve: 'Flavio',
        motivoEstorno: 'teste',
        estornoParcialLote: false,
      },
      {
        id: 'e2',
        dataEstorno: '2026-07-18T22:02:25.574Z',
        loteNumero: 'ATD-20260711-00080',
        loteId: 'ATD-20260711-00080::1',
        atendimentoItemId: '994480',
        documentoNumero: 'E.RAZN010-IE6-00013-ABOVE SPDA',
        codigoMaterial: 'ATER0003',
        descricaoMaterial: 'BARRA',
        unidade: 'PC',
        quantidadeEstornada: 51,
        quantidadeRetiradaOriginal: 51,
        quantidadeRestanteNoLote: 0,
        nomeQuemEstorna: 'Administrador',
        nomeQuemDevolve: 'Flavio',
        motivoEstorno: 'teste',
        estornoParcialLote: false,
      },
    ];
    const itens = itensAtendimentoFromEstornoLog(log);
    expect(itens).toHaveLength(2);
    expect(itens[0]!.codigoMaterial).toBe('ARLCPB0G');
    expect(itens[0]!.quantidadeAtendida).toBe(2);
    expect(itens[1]!.quantidadeAtendida).toBe(51);
    expect(itens.reduce((s, i) => s + i.quantidadeAtendida, 0)).toBe(53);
  });
});
