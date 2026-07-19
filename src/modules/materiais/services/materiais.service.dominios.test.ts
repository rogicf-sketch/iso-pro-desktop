import { describe, expect, it } from 'vitest';
import { mergeDominiosComValoresEmUso } from './materiais.service';

describe('mergeDominiosComValoresEmUso', () => {
  it('não duplica variantes com/sem acento (Elétrica vs Eletrica)', () => {
    const out = mergeDominiosComValoresEmUso(
      ['Tubulação', 'Elétrica', 'Equipamentos'],
      ['Eletrica', 'Tubulacao', 'Instrumentação'],
    );
    expect(out).toEqual(['Elétrica', 'Equipamentos', 'Instrumentação', 'Tubulação']);
  });

  it('prefere a grafia da lista configurada', () => {
    expect(mergeDominiosComValoresEmUso(['Elétrica'], ['ELETRICA'])).toEqual(['Elétrica']);
  });

  it('mantém valores em uso que não têm equivalente configurado', () => {
    expect(mergeDominiosComValoresEmUso(['UN'], ['CX', 'un'])).toEqual(['CX', 'UN']);
  });
});
