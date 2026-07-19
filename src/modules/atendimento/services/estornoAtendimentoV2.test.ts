import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEstornoV2IdempotencyKey,
  estornarAtendimentoV2,
  isEstornoV2FeatureEnabled,
} from './estornoAtendimentoV2';

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
  getSupabase: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

vi.mock('../../../lib/isoProTenant', () => ({
  getActiveTenantId: vi.fn(() => '11111111-1111-1111-1111-111111111111'),
}));

vi.mock('../../../lib/errorReporting', () => ({
  captureOperationalEvent: vi.fn(),
}));

describe('buildEstornoV2IdempotencyKey', () => {
  it('e estavel entre retries (mesmos inputs → mesma chave)', () => {
    const input = {
      loteId: 'lote-1',
      loteNumero: 'A-100',
      linhas: [
        { atendimentoItemId: 'b', quantidade: 2 },
        { atendimentoItemId: 'a', quantidade: 1 },
      ],
      motivo: 'Devolucao',
    };
    const k1 = buildEstornoV2IdempotencyKey(input);
    const k2 = buildEstornoV2IdempotencyKey({
      ...input,
      linhas: [
        { atendimentoItemId: 'a', quantidade: 1 },
        { atendimentoItemId: 'b', quantidade: 2 },
      ],
    });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^pc-est-v2-A-100-[0-9a-f]{8}$/);
  });

  it('muda quando quantidade ou motivo muda', () => {
    const base = {
      loteId: 'lote-1',
      loteNumero: 'A-100',
      linhas: [{ atendimentoItemId: 'a', quantidade: 1 }],
      motivo: 'x',
    };
    const k1 = buildEstornoV2IdempotencyKey(base);
    const k2 = buildEstornoV2IdempotencyKey({ ...base, linhas: [{ atendimentoItemId: 'a', quantidade: 2 }] });
    const k3 = buildEstornoV2IdempotencyKey({ ...base, motivo: 'y' });
    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
  });
});

describe('isEstornoV2FeatureEnabled', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } as Storage);
  });

  it('fica activo por omissao', () => {
    expect(isEstornoV2FeatureEnabled()).toBe(true);
  });
});

describe('estornarAtendimentoV2', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('mede RTT com performance.now e marca idempotent_hit', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        idempotent_hit: true,
        duration_ms: 12.5,
        lote: {
          id: 'lote-1',
          numero: 'A-100',
          status: 'estornado',
          itens: [],
          documentoId: 'd1',
          documentoNumero: 'DOC-1',
          atendente: 'Admin',
          recebedor: 'Joao',
          dataAtendimento: '2026-07-18T12:00:00.000Z',
        },
        documentosAfetados: [],
      },
      error: null,
    });

    const result = await estornarAtendimentoV2(
      'lote-1',
      [{ atendimentoItemId: 'i1', quantidade: 1 }],
      {
        nomeQuemEstorna: 'Admin',
        nomeQuemDevolve: 'Joao',
        motivoEstorno: 'teste',
        idempotencyKey: 'pc-est-v2-fixed',
        atendimentoSnapshot: {
          id: 'lote-1',
          numero: 'A-100',
          documentoId: 'd1',
          documentoNumero: 'DOC-1',
          atendente: 'Admin',
          recebedorTipo: 'interno',
          recebedorColaboradorId: null,
          recebedor: 'Joao',
          recebedorEmpresa: '',
          recebedorDocumento: '',
          recebedorTelefone: '',
          autorizadorInterno: '',
          motivoRetirada: '',
          origem: 'windows',
          status: 'concluido',
          dataAtendimento: '2026-07-18T12:00:00.000Z',
          itens: [
            {
              id: 'i1',
              documentoItemId: 'di1',
              materialId: null,
              codigoMaterial: 'M1',
              descricaoMaterial: 'Mat',
              unidade: 'UN',
              quantidadeAtendida: 1,
              quantidadeRetiradaOriginal: 1,
              documentoNumero: 'DOC-1',
            },
          ],
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.meta?.estornoV2).toBe(true);
    expect(result.meta?.idempotentHit).toBe(true);
    expect(result.meta?.idempotencyKey).toBe('pc-est-v2-fixed');
    expect(typeof result.meta?.durationMs).toBe('number');
    expect(result.meta?.serverDurationMs).toBe(12.5);
    expect(mockRpc).toHaveBeenCalledWith(
      'iso_pro_estornar_atendimento_v2',
      expect.objectContaining({ p_idempotency_key: 'pc-est-v2-fixed' }),
    );
  });

  it('marca rpcMissing quando a funcao nao existe', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_estornar_atendimento_v2' },
    });

    const result = await estornarAtendimentoV2('lote-1', [{ atendimentoItemId: 'i1', quantidade: 1 }], {
      motivoEstorno: 'x',
    });

    expect(result.success).toBe(false);
    expect(result.meta?.rpcMissing).toBe(true);
  });

  it('expoe snapshotConflict em VERSION_CONFLICT', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, code: 'VERSION_CONFLICT', error: 'Versao divergente' },
      error: null,
    });

    const result = await estornarAtendimentoV2('lote-1', [{ atendimentoItemId: 'i1', quantidade: 1 }], {
      motivoEstorno: 'x',
      expectedVersion: 1,
    });

    expect(result.success).toBe(false);
    expect(result.meta?.snapshotConflict).toBe(true);
  });
});
