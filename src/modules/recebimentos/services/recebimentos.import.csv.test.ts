import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  construirJsonImportacaoRecebimentosPlanoCsv,
  mergeItensRecebimentoComImportacao,
  montarModeloCsvImportacaoRecebimentos,
  montarModeloCsvImportacaoRecebimentosItens,
  parseItensRecebimentoCsv,
  previewImportacaoRecebimentosCsv,
  previewItensRecebimentoCsv,
} from './recebimentos.import.csv';

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => false),
  shouldUseCloudMaterials: vi.fn(() => false),
}));

describe('previewImportacaoRecebimentosCsv', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
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
          Object.keys(store).forEach((k) => delete store[k]);
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
  });

  it('conta linhas e recebimentos distintos no modelo em massa', async () => {
    const { csv } = montarModeloCsvImportacaoRecebimentos();
    const p = await previewImportacaoRecebimentosCsv(csv);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.linhaCount).toBe(3);
    expect(p.recebimentoCount).toBe(2);
  });
});

describe('montarModeloCsvImportacaoRecebimentos', () => {
  it('gera CSV compativel com construirJsonImportacaoRecebimentosPlanoCsv', async () => {
    const { csv, fileName } = montarModeloCsvImportacaoRecebimentos();
    expect(fileName).toBe('iso-pro-recebimentos-modelo-importacao.csv');
    expect(csv).toContain('fornecedor;data_recebimento;nota_fiscal');
    expect(csv).toContain('codigo;descricao;quantidade;unidade;localizacao;certificado');
    const r = await construirJsonImportacaoRecebimentosPlanoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = JSON.parse(r.json) as { recebimentos: unknown[] };
    expect(payload.recebimentos.length).toBeGreaterThanOrEqual(2);
  });
});

describe('montarModeloCsvImportacaoRecebimentosItens', () => {
  it('gera CSV so com colunas de item aceitas por parseItensRecebimentoCsv', () => {
    const { csv, fileName } = montarModeloCsvImportacaoRecebimentosItens();
    expect(fileName).toBe('iso-pro-recebimentos-modelo-itens-importacao.csv');
    expect(csv).toContain('codigo;descricao;quantidade;unidade;localizacao;certificado');
    const r = parseItensRecebimentoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens.length).toBeGreaterThanOrEqual(2);
  });
});

describe('construirJsonImportacaoRecebimentosPlanoCsv', () => {
  it('agrupa duas linhas na mesma NF em um recebimento com dois itens', async () => {
    const csv = [
      'fornecedor,data_recebimento,nota_fiscal,romaneio,conferente,modo_recebimento,observacoes,codigo,descricao,quantidade,unidade,localizacao,certificado',
      'Fornecedor X,2026-04-02,NF-1,ROM-1,Joao,direto,,M1,Desc 1,10,UN,A-1,',
      'Fornecedor X,2026-04-02,NF-1,ROM-1,Joao,direto,,M2,Desc 2,5,M,B-2,',
    ].join('\n');

    const r = await construirJsonImportacaoRecebimentosPlanoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = JSON.parse(r.json) as { recebimentos: { itens: unknown[] }[] };
    expect(payload.recebimentos).toHaveLength(1);
    expect(payload.recebimentos[0].itens).toHaveLength(2);
  });
});

describe('previewItensRecebimentoCsv', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
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
          Object.keys(store).forEach((k) => delete store[k]);
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
  });

  it('recusa codigo de material inexistente no cadastro', async () => {
    const csv = [
      'codigo,descricao,quantidade,unidade,localizacao,certificado',
      'CODIGO_IMPORT_FANTASMA,Desc,1,UN,L-1,',
    ].join('\n');

    const p = await previewItensRecebimentoCsv(csv);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.error).toMatch(/Importacao nao concluida/i);
    expect(p.error).toMatch(/CODIGO_IMPORT_FANTASMA/);
  });

  it('aceita CSV de itens quando os codigos existem no cadastro', async () => {
    const csv = [
      'codigo,descricao,quantidade,unidade,localizacao,certificado',
      'TB-0001,Desc,1,UN,L-1,',
    ].join('\n');

    const p = await previewItensRecebimentoCsv(csv);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.linhaCount).toBe(1);
  });
});

describe('parseItensRecebimentoCsv', () => {
  it('parseia colunas codigo, descricao, quantidade e soma codigo repetido', () => {
    const csv = [
      'codigo,descricao,quantidade,unidade,localizacao,certificado',
      'M1,Desc 1,10,UN,L-1,',
      'M1,Desc 1,5,UN,L-1,',
    ].join('\n');

    const r = parseItensRecebimentoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].quantidadeRecebida).toBe(15);
  });
});

describe('mergeItensRecebimentoComImportacao', () => {
  it('soma quantidade quando codigo ja existe na lista', () => {
    const existing = [
      {
        id: 'a',
        codigoMaterial: 'X',
        descricaoMaterial: 'Antiga',
        unidade: 'UN',
        disciplina: '',
        localizacao: 'P1',
        quantidadeRecebida: 2,
        quantidadeConferida: 0,
        pesoUnitario: 0,
        pesoTotal: 0,
      },
    ];
    const imported = [
      {
        id: 'b',
        codigoMaterial: 'X',
        descricaoMaterial: 'Nova',
        unidade: 'UN',
        disciplina: '',
        localizacao: 'P2',
        quantidadeRecebida: 3,
        quantidadeConferida: 1,
        pesoUnitario: 0,
        pesoTotal: 0,
      },
    ];
    const merged = mergeItensRecebimentoComImportacao(existing, imported);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantidadeRecebida).toBe(5);
    expect(merged[0].id).toBe('a');
  });
});
