import { describe, expect, it } from 'vitest';
import { parseInventariosPersistidos } from './inventarioPersistido.zod';

describe('parseInventariosPersistidos', () => {
  it('aceita inventario com itens', () => {
    const raw = [
      {
        id: 'i1',
        codigo: 'INV-1',
        descricao: 'D',
        responsavel: 'R',
        dataInventario: '2026-01-01',
        status: 'aberto',
        observacoes: '',
        itens: [
          {
            id: 'li1',
            codigoMaterial: 'M',
            descricaoMaterial: 'X',
            unidade: 'UN',
            saldoSistema: 1,
            quantidadeContada: 1,
          },
        ],
      },
    ];
    const out = parseInventariosPersistidos(raw);
    expect(out).not.toBeNull();
    expect(out![0].itens).toHaveLength(1);
  });

  it('aceita observacoes omitida', () => {
    const raw = [
      {
        id: 'i1',
        codigo: 'INV-1',
        descricao: 'D',
        responsavel: 'R',
        dataInventario: '2026-01-01',
        status: 'fechado',
        itens: [],
      },
    ];
    const out = parseInventariosPersistidos(raw);
    expect(out).not.toBeNull();
    expect(out![0].observacoes).toBe('');
  });

  it('rejeita status invalido', () => {
    const raw = [
      {
        id: 'i1',
        codigo: 'INV-1',
        descricao: 'D',
        responsavel: 'R',
        dataInventario: '2026-01-01',
        status: 'x',
        observacoes: '',
        itens: [],
      },
    ];
    expect(parseInventariosPersistidos(raw)).toBeNull();
  });
});
