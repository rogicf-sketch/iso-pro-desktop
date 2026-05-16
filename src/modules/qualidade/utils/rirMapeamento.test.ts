import { describe, expect, it } from 'vitest';
import type { Recebimento } from '../../recebimentos/types/recebimento.types';
import {
  RIR_OBS_ITENS_RECEBIMENTO_FIM,
  RIR_OBS_ITENS_RECEBIMENTO_INICIO,
  mapRecebimentoItensParaRirItens,
  montarCorpoObservacoesItensRecebimento,
  substituirBlocoObservacoesItensNoTexto,
} from './rirMapeamento';

function recMinimo(partial: Partial<Recebimento> & Pick<Recebimento, 'id' | 'itens'>): Recebimento {
  return {
    fornecedor: '',
    dataRecebimento: '2026-01-01',
    notaFiscal: '',
    romaneio: '',
    conferente: '',
    modoRecebimento: 'aguardando_conferencia',
    status: 'aguardando_conferencia',
    observacoes: '',
    ...partial,
  };
}

describe('rirMapeamento', () => {
  it('montarCorpoObservacoesItensRecebimento ignora itens sem observacaoItem', () => {
    const rec = recMinimo({
      id: '1',
      itens: [
        {
          id: 'a',
          codigoMaterial: 'X',
          descricaoMaterial: 'Desc',
          unidade: 'UN',
          disciplina: '',
          localizacao: 'L',
          quantidadeRecebida: 1,
          quantidadeConferida: 1,
          pesoUnitario: 0,
          pesoTotal: 0,
        },
      ],
    });
    expect(montarCorpoObservacoesItensRecebimento(rec)).toBe('');
  });

  it('montarCorpoObservacoesItensRecebimento formata itens com observacaoItem', () => {
    const rec = recMinimo({
      id: '1',
      itens: [
        {
          id: 'a',
          codigoMaterial: 'COD1',
          descricaoMaterial: 'Material um',
          unidade: 'PÇ',
          disciplina: 'Tub',
          localizacao: 'A1',
          quantidadeRecebida: 2,
          quantidadeConferida: 2,
          pesoUnitario: 0,
          pesoTotal: 0,
          observacaoItem: 'Falta uma unidade na palete.',
        },
        {
          id: 'b',
          codigoMaterial: 'COD2',
          descricaoMaterial: 'Material dois',
          unidade: 'M',
          disciplina: 'Tub',
          localizacao: 'A2',
          quantidadeRecebida: 1,
          quantidadeConferida: 1,
          pesoUnitario: 0,
          pesoTotal: 0,
          observacaoItem: 'Linha1\nLinha2',
        },
      ],
    });
    const body = montarCorpoObservacoesItensRecebimento(rec);
    expect(body).toContain('• COD1 — Material um');
    expect(body).toContain('Falta uma unidade na palete.');
    expect(body).toContain('• COD2 — Material dois');
    expect(body).toContain('Linha1\n  Linha2');
  });

  it('substituirBlocoObservacoesItensNoTexto insere bloco e preserva texto manual', () => {
    const merged = substituirBlocoObservacoesItensNoTexto('Notas QC proprias.', '• X — Y\n  obs');
    expect(merged.startsWith(RIR_OBS_ITENS_RECEBIMENTO_INICIO)).toBe(true);
    expect(merged).toContain(RIR_OBS_ITENS_RECEBIMENTO_FIM);
    expect(merged.endsWith('Notas QC proprias.')).toBe(true);
  });

  it('substituirBlocoObservacoesItensNoTexto substitui bloco anterior ao atualizar recebimento', () => {
    const first = substituirBlocoObservacoesItensNoTexto('', '• A\n  um');
    const second = substituirBlocoObservacoesItensNoTexto(`${first}\n\nManual fixo`, '• B\n  dois');
    expect(second).toContain('• B');
    expect(second).toContain('dois');
    expect(second).not.toContain('• A');
    expect(second).toContain('Manual fixo');
  });

  it('substituirBlocoObservacoesItensNoTexto com corpo vazio remove só o bloco', () => {
    const comBloco = substituirBlocoObservacoesItensNoTexto('', '• Z\n  z');
    const limpo = substituirBlocoObservacoesItensNoTexto(`${comBloco}\n\nResto manual`, '');
    expect(limpo).toBe('Resto manual');
    expect(limpo.includes(RIR_OBS_ITENS_RECEBIMENTO_INICIO)).toBe(false);
  });

  it('mapRecebimentoItensParaRirItens mantém compatibilidade', () => {
    const rec = recMinimo({
      id: 'r',
      itens: [
        {
          id: 'i1',
          codigoMaterial: 'C',
          descricaoMaterial: 'D',
          unidade: 'UN',
          disciplina: '',
          localizacao: 'L',
          quantidadeRecebida: 3,
          quantidadeConferida: 3,
          pesoUnitario: 1,
          pesoTotal: 3,
          observacaoItem: 'ignorado no map de linhas',
        },
      ],
    });
    const rows = mapRecebimentoItensParaRirItens(rec);
    expect(rows).toHaveLength(1);
    expect(rows[0].codigoMaterial).toBe('C');
    expect(rows[0]).not.toHaveProperty('observacaoItem');
  });
});
