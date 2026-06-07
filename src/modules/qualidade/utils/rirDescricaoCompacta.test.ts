import { describe, expect, it } from 'vitest';
import {
  compactarDescricaoMaterialRir,
  extrairNotaTecnicaGeralRir,
  formatarQuantidadeRir,
  formatarDescricaoCompactaHtmlRir,
} from './rirDescricaoCompacta';

const DESC_CABO =
  'FIO/CABO COM ISOLAÇÃO EM COMPOSTO POLIOLEFÍNICO (PVC) ANTI-CHAMA, CONDUTOR FLEXÍVEL DE COBRE, CLASSE 4/5, SEÇÃO NOMINAL 2,5 mm², COR VERMELHA, NBR NM 247-3, CLASSE DE TENSÃO 450/750V';

describe('rirDescricaoCompacta', () => {
  it('formata quantidade com milhar pt-BR', () => {
    expect(formatarQuantidadeRir(9800)).toBe('9.800');
    expect(formatarQuantidadeRir(2000)).toBe('2.000');
  });

  it('compacta cabo elétrico para bitola e cor', () => {
    const curta = compactarDescricaoMaterialRir(DESC_CABO);
    expect(curta).toContain('2,5 mm²');
    expect(curta).toContain('Vermelha');
    expect(curta.length).toBeLessThan(DESC_CABO.length * 0.5);
  });

  it('gera nota técnica geral quando há repetição', () => {
    const itens = [
      { descricaoMaterial: DESC_CABO },
      { descricaoMaterial: DESC_CABO.replace('VERMELHA', 'AZUL').replace('2,5', '4,0') },
    ];
    const nota = extrairNotaTecnicaGeralRir(itens);
    expect(nota).toBeTruthy();
    expect(nota!).toContain('Especificações gerais');
  });

  it('destaca bitola e cor no HTML', () => {
    const html = formatarDescricaoCompactaHtmlRir(DESC_CABO);
    expect(html).toContain('<strong>');
    expect(html).toContain('mm²');
  });
});
