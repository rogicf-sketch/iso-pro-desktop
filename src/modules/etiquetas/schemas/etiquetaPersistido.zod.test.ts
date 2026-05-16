import { describe, expect, it } from 'vitest';
import { parseEtiquetasPersistidas } from './etiquetaPersistido.zod';

describe('parseEtiquetasPersistidas', () => {
  it('aceita etiqueta valida minima', () => {
    const raw = [
      {
        id: 'e1',
        titulo: 'T',
        codigo: 'C',
        descricao: 'D',
        modelo: 'industrial',
        formato: 'a4_2col',
        larguraMm: 100,
        alturaMm: 50,
        moduloOrigem: 'livre',
        referenciaId: 'r',
        quantidadeCopias: 1,
        status: 'pronta',
        criadoPor: 'Admin',
        dataCriacao: '2026-01-01T00:00:00.000Z',
        observacoes: '',
      },
    ];
    const out = parseEtiquetasPersistidas(raw);
    expect(out).not.toBeNull();
    expect(out![0].id).toBe('e1');
  });

  it('aceita descricao e observacoes omitidos (defaults)', () => {
    const raw = [
      {
        id: 'e1',
        titulo: 'T',
        codigo: 'C',
        modelo: 'industrial',
        formato: 'a4_2col',
        larguraMm: 100,
        alturaMm: 50,
        moduloOrigem: 'livre',
        referenciaId: 'r',
        quantidadeCopias: 1,
        status: 'pronta',
        criadoPor: 'Admin',
        dataCriacao: '2026-01-01T00:00:00.000Z',
      },
    ];
    const out = parseEtiquetasPersistidas(raw);
    expect(out).not.toBeNull();
    expect(out![0].descricao).toBe('');
    expect(out![0].observacoes).toBe('');
  });

  it('rejeita modelo invalido', () => {
    const raw = [
      {
        id: 'e1',
        titulo: 'T',
        codigo: 'C',
        descricao: '',
        modelo: 'nope',
        formato: 'a4_2col',
        larguraMm: 100,
        alturaMm: 50,
        moduloOrigem: 'livre',
        referenciaId: 'r',
        quantidadeCopias: 1,
        status: 'pronta',
        criadoPor: 'Admin',
        dataCriacao: '2026-01-01T00:00:00.000Z',
        observacoes: '',
      },
    ];
    expect(parseEtiquetasPersistidas(raw)).toBeNull();
  });
});
