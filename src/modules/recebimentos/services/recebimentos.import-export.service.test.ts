import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recebimento } from '../types/recebimento.types';
import {
  RECEBIMENTOS_EXPORT_SCHEMA_VERSION,
  importarRecebimentosDoArquivoJson,
  montarExportacaoRecebimentosCsvItens,
  montarExportacaoRecebimentosCsvResumo,
  montarExportacaoRecebimentosJson,
} from './recebimentos.service';

const STORAGE_KEY = 'iso-pro-desktop-recebimentos';

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => false),
  shouldUseCloudMaterials: vi.fn(() => false),
}));

describe('recebimentos.service / exportacao e importacao JSON (local)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('exporta envelope com schemaVersion e lista de recebimentos', async () => {
    const rec: Recebimento = {
      id: 'r1',
      fornecedor: 'Forn X',
      dataRecebimento: '2026-05-01',
      notaFiscal: 'NF-1',
      romaneio: 'R-1',
      conferente: 'Ana',
      modoRecebimento: 'direto',
      status: 'conferido',
      observacoes: '',
      itens: [
        {
          id: 'i1',
          codigoMaterial: 'M1',
          descricaoMaterial: 'Mat',
          unidade: 'UN',
          disciplina: 'D',
          localizacao: 'E-1',
          quantidadeRecebida: 3,
          quantidadeConferida: 3,
          pesoUnitario: 0,
          pesoTotal: 0,
        },
      ],
    };
    store[STORAGE_KEY] = JSON.stringify([rec]);

    const result = await montarExportacaoRecebimentosJson();
    expect(result.success).toBe(true);
    expect(result.data?.fileName.startsWith('iso-pro-recebimentos-')).toBe(true);
    const payload = JSON.parse(result.data?.json ?? '{}') as {
      schemaVersion: number;
      recebimentos: Recebimento[];
    };
    expect(payload.schemaVersion).toBe(RECEBIMENTOS_EXPORT_SCHEMA_VERSION);
    expect(payload.recebimentos).toHaveLength(1);
    expect(payload.recebimentos[0]?.fornecedor).toBe('Forn X');
  });

  it('export JSON filtrado por modo retorna apenas correspondentes', async () => {
    store[STORAGE_KEY] = JSON.stringify([
      {
        id: 'a',
        fornecedor: 'F1',
        dataRecebimento: '2026-01-01',
        notaFiscal: 'N1',
        romaneio: '',
        conferente: 'C',
        modoRecebimento: 'direto',
        status: 'conferido',
        observacoes: '',
        itens: [
          {
            id: 'ia',
            codigoMaterial: 'X',
            descricaoMaterial: 'Y',
            unidade: 'UN',
            disciplina: '',
            localizacao: 'A',
            quantidadeRecebida: 1,
            quantidadeConferida: 1,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      },
      {
        id: 'b',
        fornecedor: 'F2',
        dataRecebimento: '2026-01-02',
        notaFiscal: 'N2',
        romaneio: '',
        conferente: 'C2',
        modoRecebimento: 'aguardando_conferencia',
        status: 'aguardando_conferencia',
        observacoes: '',
        itens: [
          {
            id: 'ib',
            codigoMaterial: 'Z',
            descricaoMaterial: 'W',
            unidade: 'UN',
            disciplina: '',
            localizacao: 'B',
            quantidadeRecebida: 2,
            quantidadeConferida: 0,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      },
    ]);

    const result = await montarExportacaoRecebimentosJson({
      filtroLista: { busca: '', status: 'todos', modo: 'aguardando_conferencia' },
    });
    expect(result.success).toBe(true);
    expect(result.data?.fileName.includes('-filtrado')).toBe(true);
    const payload = JSON.parse(result.data?.json ?? '{}') as { recebimentos: Recebimento[] };
    expect(payload.recebimentos).toHaveLength(1);
    expect(payload.recebimentos[0]?.fornecedor).toBe('F2');
  });

  it('CSV resumo inclui cabecalho e BOM', async () => {
    const rec: Recebimento = {
      id: 'c1',
      fornecedor: 'CSV Co',
      dataRecebimento: '2026-06-01',
      notaFiscal: 'NF-C',
      romaneio: '',
      conferente: 'Bob',
      modoRecebimento: 'direto',
      status: 'conferido',
      observacoes: '',
      itens: [
        {
          id: 'ci',
          codigoMaterial: 'C',
          descricaoMaterial: 'D',
          unidade: 'KG',
          disciplina: 'tub',
          localizacao: 'C-loc',
          quantidadeRecebida: 5,
          quantidadeConferida: 5,
          pesoUnitario: 0,
          pesoTotal: 0,
        },
      ],
    };
    store[STORAGE_KEY] = JSON.stringify([rec]);

    const result = await montarExportacaoRecebimentosCsvResumo();
    expect(result.success).toBe(true);
    const csv = result.data?.csv ?? '';
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('fornecedor;data;nota_fiscal');
    expect(csv).toContain('CSV Co');
  });

  it('CSV itens inclui uma linha por material com cabecalho do recebimento', async () => {
    const rec: Recebimento = {
      id: 'c1',
      fornecedor: 'CSV Co',
      dataRecebimento: '2026-06-01',
      notaFiscal: 'NF-C',
      romaneio: 'ROM-1',
      conferente: 'Bob',
      modoRecebimento: 'direto',
      status: 'conferido',
      observacoes: 'obs',
      itens: [
        {
          id: 'ci',
          codigoMaterial: 'C',
          descricaoMaterial: 'D',
          unidade: 'KG',
          disciplina: 'tub',
          localizacao: 'C-loc',
          quantidadeRecebida: 5,
          quantidadeConferida: 5,
          pesoUnitario: 0,
          pesoTotal: 0,
        },
        {
          id: 'ci2',
          codigoMaterial: 'C2',
          descricaoMaterial: 'D2',
          unidade: 'PC',
          disciplina: '',
          localizacao: 'A-1',
          quantidadeRecebida: 2,
          quantidadeConferida: 2,
          pesoUnitario: 0,
          pesoTotal: 0,
        },
      ],
    };
    store[STORAGE_KEY] = JSON.stringify([rec]);

    const result = await montarExportacaoRecebimentosCsvItens();
    expect(result.success).toBe(true);
    const csv = result.data?.csv ?? '';
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('recebimento_id;fornecedor;data_recebimento;nota_fiscal');
    expect(csv).toContain('codigo_material;descricao_material;unidade');
    expect(csv).toContain('localizacao');
    expect(csv).toContain('quantidade_recebida;quantidade_conferida;peso_unitario;peso_total');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(3);
    expect(csv).toContain('c1');
    expect(csv).toContain('NF-C');
    expect(csv).toContain('ROM-1');
    expect(csv).toContain('C-loc');
  });

  it('importa novo recebimento a partir de formato flexivel (fornecedorNome / nota)', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);

    const json = JSON.stringify([
      {
        fornecedorNome: 'Import Co',
        data: '2026-07-01',
        nota: 'NF-I',
        romaneio: 'ROM-I',
        conferenteNome: 'Ceu',
        modoRecebimento: 'direto',
        observacoes: '',
        itens: [
          {
            codigo: 'K1',
            descricao: 'Item',
            unidade: 'UN',
            disciplina: 'eletrica',
            localizacao: 'K-1',
            quantidade: 4,
            quantidadeConferida: 4,
          },
        ],
      },
    ]);

    const result = await importarRecebimentosDoArquivoJson(json);
    expect(result.success).toBe(true);
    expect(result.data?.criados).toBe(1);

    const saved = JSON.parse(store[STORAGE_KEY] ?? '[]') as Recebimento[];
    expect(saved.some((r) => r.fornecedor === 'Import Co' && r.notaFiscal === 'NF-I')).toBe(true);
  });

  it('atualiza recebimento em aguardando conferencia com mesma chave de negocio', async () => {
    store[STORAGE_KEY] = JSON.stringify([
      {
        id: 'exist',
        fornecedor: 'Mesma Chave',
        dataRecebimento: '2026-01-05',
        notaFiscal: 'NF-U',
        romaneio: 'R-U',
        conferente: 'Old',
        modoRecebimento: 'aguardando_conferencia',
        status: 'aguardando_conferencia',
        observacoes: 'x',
        itens: [
          {
            id: 'ei',
            codigoMaterial: 'P1',
            descricaoMaterial: 'Prod',
            unidade: 'UN',
            disciplina: 'd',
            localizacao: 'P-loc',
            quantidadeRecebida: 10,
            quantidadeConferida: 0,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      },
    ]);

    const json = JSON.stringify({
      recebimentos: [
        {
          fornecedor: 'Mesma Chave',
          dataRecebimento: '2026-01-05',
          notaFiscal: 'NF-U',
          romaneio: 'R-U',
          conferente: 'New',
          modoRecebimento: 'aguardando_conferencia',
          observacoes: 'atualizado',
          itens: [
            {
              codigoMaterial: 'P1',
              descricaoMaterial: 'Prod',
              unidade: 'UN',
              disciplina: 'd',
              localizacao: 'P-loc',
              quantidadeRecebida: 10,
              quantidadeConferida: 0,
              pesoUnitario: 0,
              pesoTotal: 0,
            },
          ],
        },
      ],
    });

    const result = await importarRecebimentosDoArquivoJson(json);
    expect(result.success).toBe(true);
    expect(result.data?.atualizados).toBe(1);

    const saved = JSON.parse(store[STORAGE_KEY] ?? '[]') as Recebimento[];
    const row = saved.find((r) => r.id === 'exist');
    expect(row?.conferente).toBe('New');
    expect(row?.observacoes).toBe('atualizado');
  });

  it('nao sobrescreve recebimento conferido', async () => {
    store[STORAGE_KEY] = JSON.stringify([
      {
        id: 'conf',
        fornecedor: 'F',
        dataRecebimento: '2026-01-01',
        notaFiscal: 'N',
        romaneio: '',
        conferente: 'C',
        modoRecebimento: 'direto',
        status: 'conferido',
        observacoes: 'orig',
        itens: [
          {
            id: 'ii',
            codigoMaterial: 'Q',
            descricaoMaterial: 'Qd',
            unidade: 'UN',
            disciplina: '',
            localizacao: 'Q-loc',
            quantidadeRecebida: 1,
            quantidadeConferida: 1,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      },
    ]);

    const json = JSON.stringify([
      {
        fornecedor: 'F',
        dataRecebimento: '2026-01-01',
        notaFiscal: 'N',
        romaneio: '',
        conferente: 'C',
        modoRecebimento: 'direto',
        observacoes: 'tentativa',
        itens: [
          {
            codigoMaterial: 'Q',
            descricaoMaterial: 'Qd',
            unidade: 'UN',
            disciplina: '',
            localizacao: 'Q-loc',
            quantidadeRecebida: 1,
            quantidadeConferida: 1,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      },
    ]);

    const result = await importarRecebimentosDoArquivoJson(json);
    expect(result.success).toBe(false);
    expect(result.data?.atualizados).toBe(0);

    const saved = JSON.parse(store[STORAGE_KEY] ?? '[]') as Recebimento[];
    expect(saved[0]?.observacoes).toBe('orig');
  });
});
