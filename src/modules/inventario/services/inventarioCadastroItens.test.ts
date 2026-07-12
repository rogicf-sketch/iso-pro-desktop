import { describe, expect, it } from 'vitest';
import { montarItensInventarioDoCadastro } from './inventarioCadastroItens';

describe('montarItensInventarioDoCadastro', () => {
  it('inclui só materiais com saldo quando incluirSaldoZero é false', () => {
    const saldo = new Map([
      ['m1', 5],
      ['m2', 0],
    ]);
    const novos = montarItensInventarioDoCadastro({
      materiais: [
        { codigo: 'M1', descricao: 'Com saldo', unidade: 'UN' },
        { codigo: 'M2', descricao: 'Zero', unidade: 'UN' },
      ],
      saldoPorCodigo: saldo,
      itensExistentes: [],
      incluirSaldoZero: false,
    });
    expect(novos).toHaveLength(1);
    expect(novos[0]?.codigoMaterial).toBe('M1');
    expect(novos[0]?.saldoSistema).toBe(5);
  });

  it('inclui saldo zero quando incluirSaldoZero é true', () => {
    const saldo = new Map([['m2', 0]]);
    const novos = montarItensInventarioDoCadastro({
      materiais: [{ codigo: 'M2', descricao: 'Zero', unidade: 'PC' }],
      saldoPorCodigo: saldo,
      itensExistentes: [],
      incluirSaldoZero: true,
    });
    expect(novos).toHaveLength(1);
    expect(novos[0]?.saldoSistema).toBe(0);
  });

  it('nao duplica codigo ja presente no inventario', () => {
    const novos = montarItensInventarioDoCadastro({
      materiais: [{ codigo: 'M1', descricao: 'X', unidade: 'UN' }],
      saldoPorCodigo: new Map([['m1', 1]]),
      itensExistentes: [
        {
          id: 'x',
          codigoMaterial: 'M1',
          descricaoMaterial: 'X',
          unidade: 'UN',
          saldoSistema: 1,
          quantidadeContada: 0,
          localizacaoContada: '',
        },
      ],
      incluirSaldoZero: true,
    });
    expect(novos).toHaveLength(0);
  });
});
