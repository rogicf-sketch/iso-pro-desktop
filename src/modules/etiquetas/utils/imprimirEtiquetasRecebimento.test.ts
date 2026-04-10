import { describe, expect, it } from 'vitest';

import { quantidadeExibidaEtiquetaItem } from './imprimirEtiquetasRecebimento';

import type { RecebimentoItem } from '../../recebimentos/types/recebimento.types';



function item(partial: Partial<RecebimentoItem>): RecebimentoItem {

  return {

    id: '1',

    codigoMaterial: 'X',

    descricaoMaterial: 'D',

    unidade: 'M',

    disciplina: '',

    localizacao: 'L',

    quantidadeRecebida: 500,

    quantidadeConferida: 0,

    pesoUnitario: 0,

    pesoTotal: 0,

    ...partial,

  };

}



describe('quantidadeExibidaEtiquetaItem', () => {

  it('sempre usa quantidade recebida no sistema, independente do status ou da conferida', () => {

    expect(quantidadeExibidaEtiquetaItem(item({ quantidadeRecebida: 500, quantidadeConferida: 120 }))).toBe(500);

    expect(quantidadeExibidaEtiquetaItem(item({ quantidadeRecebida: 500, quantidadeConferida: 0 }))).toBe(500);

    expect(quantidadeExibidaEtiquetaItem(item({ quantidadeRecebida: 500, quantidadeConferida: 500 }))).toBe(500);

  });



  it('trata valor nao numerico como zero', () => {

    expect(quantidadeExibidaEtiquetaItem(item({ quantidadeRecebida: NaN as unknown as number }))).toBe(0);

  });

});


