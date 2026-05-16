/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RirRegistro } from '../types/qualidade.types';
import { destravarRirParaCorrecaoAdministrativa } from './qualidade.service';

const RIR_STORAGE_KEY = 'iso-pro-desktop-rir';

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => false,
}));

function rirTratado(over: Partial<RirRegistro> = {}): RirRegistro {
  return {
    id: 'rir-t1',
    codigo: 'RIR-TEST-001',
    dataRegistro: '2026-04-01',
    recebimentoId: 'rec-x',
    recebimentoNotaFiscal: 'NF-100',
    recebimentoFornecedor: 'Forn',
    recebimentoRomaneio: 'R1',
    recebimentoData: '2026-04-01',
    uo: '',
    localObra: '',
    contratoNumero: '',
    fornecedorNome: 'Forn',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    procedimentoNumero: 'P1',
    solCompraPackList: '',
    obsCurta: '',
    itensRir: [],
    instrumentos: '',
    documentosQc: '',
    observacoesQc: '',
    laudo: 'aprovado',
    assinaturaRecebimento: { nome: '', data: '' },
    assinaturaCq: { nome: 'A', data: '2026-04-02' },
    assinaturaCliente: { nome: '', data: '' },
    origem: 'Teste',
    responsavel: 'A',
    descricao: 'D',
    status: 'tratado',
    acaoImediata: '',
    observacoes: '',
    ...over,
  };
}

describe('qualidade.service / destravarRirParaCorrecaoAdministrativa (local)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('altera tratado para em_analise', async () => {
    const r = rirTratado();
    store[RIR_STORAGE_KEY] = JSON.stringify([r]);
    const result = await destravarRirParaCorrecaoAdministrativa(r.id, { actorLogin: 'admin' });
    expect(result.success).toBe(true);
    const saved = JSON.parse(store[RIR_STORAGE_KEY] ?? '[]') as RirRegistro[];
    expect(saved).toHaveLength(1);
    expect(saved[0]?.status).toBe('em_analise');
    expect(saved[0]?.codigo).toBe('RIR-TEST-001');
  });

  it('rejeita cancelado e aberto', async () => {
    store[RIR_STORAGE_KEY] = JSON.stringify([rirTratado({ id: 'a', status: 'cancelado' }), rirTratado({ id: 'b', status: 'aberto' })]);
    const r1 = await destravarRirParaCorrecaoAdministrativa('a');
    expect(r1.success).toBe(false);
    const r2 = await destravarRirParaCorrecaoAdministrativa('b');
    expect(r2.success).toBe(false);
  });
});
