import { describe, expect, it } from 'vitest';
import { parseMateriaisPersistidos } from './materialPersistido.zod';

describe('parseMateriaisPersistidos', () => {
  it('aceita material valido minimo', () => {
    const raw = [
      {
        id: 'm1',
        codigo: 'C1',
        codigoBarras: '',
        descricao: 'D',
        diametro: '-',
        disciplina: 'X',
        unidade: 'UN',
        peso: 1,
        estoqueMinimo: 0,
        saldoAtual: 0,
        ativo: true,
        observacao: '',
      },
    ];
    const out = parseMateriaisPersistidos(raw);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    expect(out![0].codigo).toBe('C1');
  });

  it('rejeita quando ativo nao e boolean', () => {
    const raw = [
      {
        id: 'm1',
        codigo: 'C1',
        codigoBarras: '',
        descricao: 'D',
        diametro: '-',
        disciplina: 'X',
        unidade: 'UN',
        peso: 1,
        estoqueMinimo: 0,
        saldoAtual: 0,
        ativo: 'sim',
        observacao: '',
      },
    ];
    expect(parseMateriaisPersistidos(raw)).toBeNull();
  });

  it('rejeita quando nao e array', () => {
    expect(parseMateriaisPersistidos({})).toBeNull();
  });

  it('aceita legado sem codigoBarras diametro observacao (preenche defaults)', () => {
    const raw = [
      {
        id: 'm1',
        codigo: 'C1',
        descricao: 'D',
        disciplina: 'X',
        unidade: 'UN',
        peso: 1,
        estoqueMinimo: 0,
        saldoAtual: 0,
        ativo: true,
      },
    ];
    const out = parseMateriaisPersistidos(raw);
    expect(out).not.toBeNull();
    expect(out![0].codigoBarras).toBe('');
    expect(out![0].diametro).toBe('');
    expect(out![0].observacao).toBe('');
  });
});
