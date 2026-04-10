import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Recebimento } from '../../recebimentos/types/recebimento.types';
import { concluirConferencia } from './conferencia.service';
import * as recebimentos from '../../recebimentos/services/recebimentos.service';

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  buscarRecebimentoPorId: vi.fn(),
  finalizarConferenciaRecebimento: vi.fn(),
  listarRecebimentos: vi.fn(),
}));

const recebimentoAguardando: Recebimento = {
  id: 'rec-1',
  fornecedor: 'Forn Teste',
  dataRecebimento: '2026-04-01',
  notaFiscal: 'NF-1',
  romaneio: 'ROM-1',
  conferente: 'Ana',
  modoRecebimento: 'aguardando_conferencia',
  status: 'aguardando_conferencia',
  observacoes: '',
  itens: [
    {
      id: 'item-1',
      codigoMaterial: 'M1',
      descricaoMaterial: 'Mat',
      unidade: 'kg',
      disciplina: 'tub',
      localizacao: 'G-1',
      quantidadeRecebida: 5,
      quantidadeConferida: 0,
      pesoUnitario: 0,
      pesoTotal: 0,
    },
  ],
};

describe('conferencia.service / concluirConferencia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recebimentos.buscarRecebimentoPorId).mockResolvedValue({
      success: true,
      data: recebimentoAguardando,
    });
  });

  it('propaga meta.snapshotConflict quando finalizarConferenciaRecebimento falha com conflito', async () => {
    vi.mocked(recebimentos.finalizarConferenciaRecebimento).mockResolvedValue({
      success: false,
      error: 'Conflito de versao.',
      meta: { snapshotConflict: true },
    });

    const result = await concluirConferencia({
      id: 'rec-1',
      conferente: 'Ana',
      observacoes: '',
      itens: [{ id: 'item-1', quantidadeConferida: 5 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Conflito de versao.');
    expect(result.meta?.snapshotConflict).toBe(true);
  });

  it('propaga meta em sucesso', async () => {
    const conferido: Recebimento = {
      ...recebimentoAguardando,
      status: 'conferido',
      conferente: 'Ana',
      itens: recebimentoAguardando.itens.map((i) => ({ ...i, quantidadeConferida: 5 })),
    };
    vi.mocked(recebimentos.finalizarConferenciaRecebimento).mockResolvedValue({
      success: true,
      data: conferido,
      meta: { source: 'supabase' },
    });

    const result = await concluirConferencia({
      id: 'rec-1',
      conferente: 'Ana',
      observacoes: 'ok',
      itens: [{ id: 'item-1', quantidadeConferida: 5 }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('conferido');
    expect(result.meta?.source).toBe('supabase');
  });
});
