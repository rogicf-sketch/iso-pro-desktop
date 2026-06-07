import { describe, expect, it } from 'vitest';
import { estimarLinhasItemRir, paginarItensRirImpressao } from './rirPaginacaoImpressao';

const DESC_LONGA =
  'FIO/CABO COM ISOLAÇÃO EM COMPOSTO POLIOLEFÍNICO (PVC) ANTI-CHAMA, CONDUTOR FLEXÍVEL DE COBRE, SEÇÃO NOMINAL 2,5 mm², COR VERMELHA';

describe('paginarItensRirImpressao', () => {
  it('muitos itens longos geram folha final com rodapé', () => {
    const descLonga = 'Cabo '.repeat(200);
    const itens = Array.from({ length: 8 }, (_, i) => ({
      id: `i${i}`,
      codigoMaterial: `COD-${i}`,
      descricaoMaterial: descLonga,
      quantidade: 1,
      unidade: 'M',
      certificado: 'N/A',
    }));
    const folhas = paginarItensRirImpressao(itens);
    expect(folhas.length).toBeGreaterThanOrEqual(2);
    const ultima = folhas[folhas.length - 1]!;
    expect(ultima.incluirRodape).toBe(true);
    expect(folhas.reduce((n, f) => n + f.itens.length, 0)).toBe(8);
    const temRodapeDedicado = ultima.somenteRodape === true && ultima.itens.length === 0;
    const temRodapeMesclado = ultima.itens.length > 0;
    expect(temRodapeDedicado || temRodapeMesclado).toBe(true);
  });

  it('item curto pode mesclar rodapé na mesma folha', () => {
    const folhas = paginarItensRirImpressao([
      { descricaoMaterial: 'Parafuso', codigoMaterial: 'P1' },
    ]);
    expect(folhas.length).toBe(1);
    expect(folhas[0]?.incluirRodape).toBe(true);
    expect(folhas[0]?.somenteRodape).toBeFalsy();
  });

  it('13 cabos longos cabem em no maximo 4 folhas de itens', () => {
    const itens = Array.from({ length: 13 }, (_, i) => ({
      id: `i${i}`,
      codigoMaterial: `PVCDD00VS2C-VD-${i} mm2`,
      descricaoMaterial: DESC_LONGA,
      quantidade: 12800 - i * 400,
      unidade: 'M',
      certificado: 'N/A',
    }));
    const folhas = paginarItensRirImpressao(itens);
    const folhasItens = folhas.filter((f) => f.itens.length > 0);
    expect(folhasItens.length).toBeLessThanOrEqual(4);
    expect(folhas.reduce((n, f) => n + f.itens.length, 0)).toBe(13);
    expect(folhasItens.every((f) => f.itens.length >= 2 || folhasItens.length === 1)).toBe(true);
  });

  it('descrição longa ocupa mais linhas estimadas que texto curto', () => {
    const curto = estimarLinhasItemRir({ descricaoMaterial: 'Parafuso', codigoMaterial: 'P1' });
    const longo = estimarLinhasItemRir({
      descricaoMaterial: DESC_LONGA,
      codigoMaterial: 'PVCDD00VS2C-VD-2.5 mm2',
    });
    expect(longo).toBeGreaterThan(curto);
  });
});
