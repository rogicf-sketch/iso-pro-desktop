import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Material } from '../../materiais/types/material.types';
import type { Documento } from '../types/documento.types';
import {
  DOCUMENTOS_EXPORT_SCHEMA_VERSION,
  importarDocumentosDoArquivoJson,
  montarExportacaoDocumentosCsvResumo,
  montarExportacaoDocumentosJson,
} from './documentos.service';

const STORAGE_KEY = 'iso-pro-desktop-documentos';
const MATERIAIS_STORAGE_KEY = 'iso-pro-desktop-materiais';
const RECEBIMENTOS_STORAGE_KEY = 'iso-pro-desktop-recebimentos';

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => false),
  shouldUseCloudMaterials: vi.fn(() => false),
}));

function materiaisParaTestesImportacaoDocumentos(): Material[] {
  const codigos = ['C1', 'C', 'Z', 'X1', 'NEW', 'OLD', 'TB-0001', 'EL-0102', 'MT-0020'];
  return codigos.map((codigo, i) => ({
    id: `mat-fixture-${i}`,
    codigo,
    codigoBarras: '',
    descricao: `Desc ${codigo}`,
    diametro: '-',
    disciplina: 'G',
    unidade: 'UN',
    peso: 1,
    estoqueMinimo: 0,
    saldoAtual: 0,
    ativo: true,
    observacao: '',
  }));
}

describe('documentos.service / exportacao e importacao JSON (local)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    store[MATERIAIS_STORAGE_KEY] = JSON.stringify(materiaisParaTestesImportacaoDocumentos());
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

  it('exporta envelope com schemaVersion e lista de documentos', async () => {
    const doc: Documento = {
      id: 'd1',
      numero: 'EXP-1',
      revisao: 'A',
      descricao: 'Teste export',
      responsavel: 'R1',
      dataDocumento: '2026-05-01',
      status: 'pendente',
      observacao: '',
      itens: [
        {
          id: 'i1',
          codigoMaterial: 'C1',
          descricaoMaterial: 'M1',
          unidade: 'UN',
          quantidadeProjeto: 3,
          quantidadeAtendida: 0,
        },
      ],
    };
    store[STORAGE_KEY] = JSON.stringify([doc]);

    const result = await montarExportacaoDocumentosJson();
    expect(result.success).toBe(true);
    expect(result.data?.fileName.startsWith('iso-pro-documentos-')).toBe(true);
    const payload = JSON.parse(result.data?.json ?? '{}') as {
      schemaVersion: number;
      documentos: Documento[];
    };
    expect(payload.schemaVersion).toBe(DOCUMENTOS_EXPORT_SCHEMA_VERSION);
    expect(payload.documentos).toHaveLength(1);
    expect(payload.documentos[0]?.numero).toBe('EXP-1');
  });

  it('export JSON filtrado por status retorna apenas documentos correspondentes', async () => {
    store[STORAGE_KEY] = JSON.stringify([
      {
        id: 'a',
        numero: 'P',
        revisao: 'A',
        descricao: 'Pend',
        responsavel: 'R',
        dataDocumento: '2026-05-01',
        status: 'pendente',
        observacao: '',
        itens: [
          {
            id: 'i',
            codigoMaterial: 'C',
            descricaoMaterial: 'D',
            unidade: 'UN',
            quantidadeProjeto: 1,
            quantidadeAtendida: 0,
          },
        ],
      },
      {
        id: 'b',
        numero: 'Q',
        revisao: 'A',
        descricao: 'Cancelado',
        responsavel: 'R',
        dataDocumento: '2026-05-02',
        status: 'cancelado',
        observacao: '',
        itens: [
          {
            id: 'i2',
            codigoMaterial: 'C2',
            descricaoMaterial: 'D2',
            unidade: 'UN',
            quantidadeProjeto: 2,
            quantidadeAtendida: 1,
          },
        ],
      },
    ]);

    const result = await montarExportacaoDocumentosJson({ filtroLista: { busca: '', status: 'pendente' } });
    expect(result.success).toBe(true);
    expect(result.data?.fileName.includes('-filtrado')).toBe(true);
    const payload = JSON.parse(result.data?.json ?? '{}') as { documentos: Documento[] };
    expect(payload.documentos).toHaveLength(1);
    expect(payload.documentos[0]?.numero).toBe('P');
  });

  it('export CSV itens (detalhe por linha), disciplina, saldo, pesos e BOM UTF-8', async () => {
    store[MATERIAIS_STORAGE_KEY] = JSON.stringify([
      {
        id: 'mz',
        codigo: 'Z',
        descricao: 'Mat',
        diametro: '-',
        disciplina: 'D',
        unidade: 'KG',
        peso: 2.5,
        estoqueMinimo: 0,
        saldoAtual: 15,
        ativo: true,
        observacao: '',
      },
    ]);
    const doc: Documento = {
      id: 'c1',
      numero: 'CSV-1',
      revisao: 'A',
      descricao: 'Doc CSV',
      responsavel: 'Resp',
      dataDocumento: '2026-05-10',
      status: 'pendente',
      observacao: '',
      itens: [
        {
          id: 'ci',
          codigoMaterial: 'Z',
          descricaoMaterial: 'Mat',
          unidade: 'KG',
          quantidadeProjeto: 4,
          quantidadeAtendida: 0,
          localizacao: 'Rua-01 | Prateleira-B',
        },
      ],
    };
    store[STORAGE_KEY] = JSON.stringify([doc]);

    const result = await montarExportacaoDocumentosCsvResumo();
    expect(result.success).toBe(true);
    expect(result.data?.fileName.startsWith('iso-pro-documentos-itens-')).toBe(true);
    expect(result.data?.fileName.endsWith('.csv')).toBe(true);
    const csv = result.data?.csv ?? '';
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('descricao_documento;responsavel;data_documento;status_documento');
    expect(csv).toContain('localizacao_planejamento');
    expect(csv).toContain('localizacao_consolidada');
    expect(csv).toContain(
      'quantidade_documento;quantidade_atendida;quantidade_pendente_atendimento;quantidade_prevista;quantidade_atendida_global;quantidade_recebida;status_planejamento',
    );
    expect(csv).toContain('peso_unitario;peso_total_documento;peso_total_atendido_documento;saldo_material');
    expect(csv).toContain('CSV-1');
    expect(csv).toContain(
      ';Z;Mat;Rua-01 | Prateleira-B;Rua-01 | Prateleira-B;D;KG;4;0;4;4;0;0;Pendente;"2,5";10;0;15',
    );
  });

  it('export CSV: localizacao_consolidada prioriza recebimentos sobre texto do documento', async () => {
    store[MATERIAIS_STORAGE_KEY] = JSON.stringify([
      {
        id: 'mz',
        codigo: 'Z',
        descricao: 'Mat',
        diametro: '-',
        disciplina: 'D',
        unidade: 'KG',
        peso: 1,
        estoqueMinimo: 0,
        saldoAtual: 10,
        ativo: true,
        observacao: '',
      },
    ]);
    store[RECEBIMENTOS_STORAGE_KEY] = JSON.stringify([
      {
        id: 'rec-1',
        fornecedor: 'F',
        dataRecebimento: '2026-04-01',
        notaFiscal: 'NF-1',
        romaneio: 'R1',
        conferente: 'C',
        modoRecebimento: 'direto',
        status: 'conferido',
        observacoes: '',
        itens: [
          {
            id: 'ri',
            codigoMaterial: 'Z',
            descricaoMaterial: 'Mat',
            unidade: 'KG',
            disciplina: 'D',
            localizacao: 'GALPAO-NORTE',
            quantidadeRecebida: 5,
            quantidadeConferida: 5,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      },
    ]);
    const doc: Documento = {
      id: 'c-loc',
      numero: 'LOC-1',
      revisao: 'A',
      descricao: 'Doc',
      responsavel: 'R',
      dataDocumento: '2026-05-10',
      status: 'pendente',
      observacao: '',
      itens: [
        {
          id: 'ci',
          codigoMaterial: 'Z',
          descricaoMaterial: 'Mat',
          unidade: 'KG',
          quantidadeProjeto: 1,
          quantidadeAtendida: 0,
          localizacao: 'Texto manual',
        },
      ],
    };
    store[STORAGE_KEY] = JSON.stringify([doc]);

    const result = await montarExportacaoDocumentosCsvResumo();
    expect(result.success).toBe(true);
    const csv = result.data?.csv ?? '';
    expect(csv).toContain(';Z;Mat;Texto manual;GALPAO-NORTE;D;KG;');
  });

  it('export CSV repete quantidade_prevista global por codigo em varios documentos', async () => {
    store[MATERIAIS_STORAGE_KEY] = JSON.stringify([
      {
        id: 'mz',
        codigo: 'Z',
        descricao: 'Mat',
        diametro: '-',
        disciplina: 'D',
        unidade: 'KG',
        peso: 1,
        estoqueMinimo: 0,
        saldoAtual: 100,
        ativo: true,
        observacao: '',
      },
    ]);
    const docs: Documento[] = [
      {
        id: 'd1',
        numero: 'D-A',
        revisao: '1',
        descricao: 'A',
        responsavel: 'R',
        dataDocumento: '2026-05-01',
        status: 'pendente',
        observacao: '',
        itens: [
          {
            id: 'i1',
            codigoMaterial: 'Z',
            descricaoMaterial: 'Mat',
            unidade: 'KG',
            quantidadeProjeto: 4,
            quantidadeAtendida: 0,
          },
        ],
      },
      {
        id: 'd2',
        numero: 'D-B',
        revisao: '1',
        descricao: 'B',
        responsavel: 'R',
        dataDocumento: '2026-05-02',
        status: 'pendente',
        observacao: '',
        itens: [
          {
            id: 'i2',
            codigoMaterial: 'Z',
            descricaoMaterial: 'Mat',
            unidade: 'KG',
            quantidadeProjeto: 2,
            quantidadeAtendida: 0,
          },
        ],
      },
    ];
    store[STORAGE_KEY] = JSON.stringify(docs);

    const result = await montarExportacaoDocumentosCsvResumo();
    expect(result.success).toBe(true);
    const dataLines = (result.data?.csv ?? '').split('\r\n').filter((l) => l.trim()).slice(1);
    expect(dataLines).toHaveLength(2);
    expect(dataLines.some((l) => l.includes(';4;0;4;6;0;0;'))).toBe(true);
    expect(dataLines.some((l) => l.includes(';2;0;2;6;0;0;'))).toBe(true);
  });

  it('importa novo documento a partir de array simples', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);

    const json = JSON.stringify([
      {
        numero: 'IMP-1',
        revisao: 'B',
        descricao: 'Novo',
        responsavel: 'Alice',
        dataDocumento: '2026-06-01',
        observacao: '',
        itens: [
          {
            codigo: 'X1',
            descricao: 'Item snapshot',
            unidade: 'M',
            quantidade: 2,
            quantidadeAtendida: 0,
          },
        ],
      },
    ]);

    const result = await importarDocumentosDoArquivoJson(json);
    expect(result.success).toBe(true);
    expect(result.data?.criados).toBe(1);
    expect(result.data?.atualizados).toBe(0);

    const saved = JSON.parse(store[STORAGE_KEY] ?? '[]') as Documento[];
    expect(saved.some((d) => d.numero === 'IMP-1' && d.revisao === 'B')).toBe(true);
  });

  it('nao importa documento com codigo de material inexistente no cadastro', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);

    const json = JSON.stringify([
      {
        numero: 'IMP-BAD',
        revisao: 'A',
        descricao: 'X',
        responsavel: 'R',
        dataDocumento: '2026-06-01',
        observacao: '',
        itens: [
          {
            codigo: 'CODIGO_NAO_CADASTRADO_XYZ',
            descricao: 'Item',
            unidade: 'UN',
            quantidade: 1,
            quantidadeAtendida: 0,
          },
        ],
      },
    ]);

    const result = await importarDocumentosDoArquivoJson(json);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CODIGO_NAO_CADASTRADO_XYZ/);
    expect(result.data).toBeUndefined();

    const saved = JSON.parse(store[STORAGE_KEY] ?? '[]') as Documento[];
    expect(saved.some((d) => d.numero === 'IMP-BAD')).toBe(false);
  });

  it('atualiza documento pendente existente com mesmo numero e revisao', async () => {
    store[STORAGE_KEY] = JSON.stringify([
      {
        id: 'existing',
        numero: 'UPD-1',
        revisao: 'A',
        descricao: 'Antiga',
        responsavel: 'Bob',
        dataDocumento: '2026-01-01',
        status: 'pendente',
        observacao: '',
        itens: [
          {
            id: 'ei1',
            codigoMaterial: 'OLD',
            descricaoMaterial: 'Velho',
            unidade: 'UN',
            quantidadeProjeto: 1,
            quantidadeAtendida: 0,
          },
        ],
      },
    ]);

    const json = JSON.stringify({
      documentos: [
        {
          numero: 'UPD-1',
          revisao: 'A',
          descricao: 'Nova descricao',
          responsavel: 'Bob',
          dataDocumento: '2026-01-02',
          observacao: '',
          itens: [
            {
              codigoMaterial: 'NEW',
              descricaoMaterial: 'Novo item',
              unidade: 'KG',
              quantidadeProjeto: 5,
              quantidadeAtendida: 0,
            },
          ],
        },
      ],
    });

    const result = await importarDocumentosDoArquivoJson(json);
    expect(result.success).toBe(true);
    expect(result.data?.atualizados).toBe(1);
    expect(result.data?.criados).toBe(0);

    const saved = JSON.parse(store[STORAGE_KEY] ?? '[]') as Documento[];
    const row = saved.find((d) => d.id === 'existing');
    expect(row?.descricao).toBe('Nova descricao');
    expect(row?.itens[0]?.codigoMaterial).toBe('NEW');
  });

  it('nao sobrescreve documento que nao esta pendente', async () => {
    store[STORAGE_KEY] = JSON.stringify([
      {
        id: 'parcial',
        numero: 'PAR-1',
        revisao: 'A',
        descricao: 'X',
        responsavel: 'R',
        dataDocumento: '2026-01-01',
        status: 'atendido',
        observacao: '',
        itens: [
          {
            id: 'p1',
            codigoMaterial: 'C',
            descricaoMaterial: 'D',
            unidade: 'UN',
            quantidadeProjeto: 10,
            quantidadeAtendida: 10,
          },
        ],
      },
    ]);

    const json = JSON.stringify([
      {
        numero: 'PAR-1',
        revisao: 'A',
        descricao: 'Tentativa',
        responsavel: 'R',
        dataDocumento: '2026-01-01',
        observacao: '',
        itens: [
          {
            codigoMaterial: 'C',
            descricaoMaterial: 'D',
            unidade: 'UN',
            quantidadeProjeto: 10,
            quantidadeAtendida: 10,
          },
        ],
      },
    ]);

    const result = await importarDocumentosDoArquivoJson(json);
    expect(result.success).toBe(false);
    expect(result.data?.criados).toBe(0);
    expect(result.data?.atualizados).toBe(0);
    expect(result.data?.ignorados).toBeGreaterThan(0);

    const saved = JSON.parse(store[STORAGE_KEY] ?? '[]') as Documento[];
    expect(saved[0]?.descricao).toBe('X');
  });
});
