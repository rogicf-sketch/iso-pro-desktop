import { describe, expect, it } from 'vitest';
import { preservarAtendimentoNosItens } from './preservarAtendimentoNosItens';
import type { DocumentoItem } from '../types/documento.types';

function item(partial: Partial<DocumentoItem> & Pick<DocumentoItem, 'id' | 'codigoMaterial'>): DocumentoItem {
  return {
    descricaoMaterial: partial.descricaoMaterial ?? 'Desc',
    unidade: partial.unidade ?? 'UN',
    quantidadeProjeto: partial.quantidadeProjeto ?? 10,
    quantidadeAtendida: partial.quantidadeAtendida ?? 0,
    localizacao: partial.localizacao,
    ...partial,
  };
}

describe('preservarAtendimentoNosItens', () => {
  it('permite aumentar quantidade e adicionar item novo', () => {
    const existentes = [item({ id: 'a', codigoMaterial: 'C1', quantidadeProjeto: 10, quantidadeAtendida: 3 })];
    const novos = [
      item({ id: 'a', codigoMaterial: 'C1', quantidadeProjeto: 15, quantidadeAtendida: 0 }),
      item({ id: 'b', codigoMaterial: 'C2', quantidadeProjeto: 2, quantidadeAtendida: 0 }),
    ];
    const r = preservarAtendimentoNosItens(existentes, novos);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens[0].quantidadeAtendida).toBe(3);
    expect(r.itens[0].quantidadeProjeto).toBe(15);
    expect(r.itens[1].quantidadeAtendida).toBe(0);
  });

  it('bloqueia reduzir abaixo do atendido', () => {
    const existentes = [item({ id: 'a', codigoMaterial: 'C1', quantidadeProjeto: 10, quantidadeAtendida: 5 })];
    const novos = [item({ id: 'a', codigoMaterial: 'C1', quantidadeProjeto: 4, quantidadeAtendida: 5 })];
    const r = preservarAtendimentoNosItens(existentes, novos);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/nao pode ser menor/i);
  });

  it('bloqueia remover item com atendimento', () => {
    const existentes = [
      item({ id: 'a', codigoMaterial: 'C1', quantidadeAtendida: 2 }),
      item({ id: 'b', codigoMaterial: 'C2', quantidadeAtendida: 0 }),
    ];
    const novos = [item({ id: 'b', codigoMaterial: 'C2', quantidadeAtendida: 0 })];
    const r = preservarAtendimentoNosItens(existentes, novos);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/remover o item C1/i);
  });

  it('permite remover item sem atendimento', () => {
    const existentes = [
      item({ id: 'a', codigoMaterial: 'C1', quantidadeAtendida: 0 }),
      item({ id: 'b', codigoMaterial: 'C2', quantidadeAtendida: 1 }),
    ];
    const novos = [item({ id: 'b', codigoMaterial: 'C2', quantidadeProjeto: 5, quantidadeAtendida: 1 })];
    const r = preservarAtendimentoNosItens(existentes, novos);
    expect(r.ok).toBe(true);
  });
});
