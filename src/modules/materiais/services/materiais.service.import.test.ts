import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'iso-pro-desktop-materiais';
const DOMINIOS_KEY = 'iso-pro-desktop-materiais-dominios';

const supabaseFlags = vi.hoisted(() => ({
  hasSupabaseConfig: vi.fn(() => false),
  shouldUseCloudMaterials: vi.fn(() => false),
  getSupabase: vi.fn(() => null),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => supabaseFlags.hasSupabaseConfig(),
  shouldUseCloudMaterials: () => supabaseFlags.shouldUseCloudMaterials(),
  getSupabase: () => supabaseFlags.getSupabase(),
}));

vi.mock('../../auth/services/authAudit.service', () => ({
  appendAuthAuditEvent: vi.fn(),
}));

import { importarMateriaisDoArquivoCsv, previewImportacaoMateriaisCsv } from './materiais.service';

describe('importarMateriaisDoArquivoCsv / duplicidade no mesmo arquivo', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseFlags.hasSupabaseConfig.mockReturnValue(false);
    supabaseFlags.shouldUseCloudMaterials.mockReturnValue(false);
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
    store[STORAGE_KEY] = JSON.stringify([]);
  });

  it('ignora segunda linha com o mesmo codigo no CSV e informa no resumo', async () => {
    const csv =
      'codigo;descricao;disciplina;unidade;peso;estoque_minimo\n' +
      'DUP-A;Primeira;Tubulacao;UN;1;0\n' +
      'DUP-A;Segunda;Tubulacao;UN;2;0';

    const result = await importarMateriaisDoArquivoCsv(csv);
    expect(result.success).toBe(true);
    expect(result.data?.criados).toBe(1);
    expect(result.data?.atualizados).toBe(0);
    expect(result.data?.ignorados).toBe(1);
    expect(result.data?.ignoradosPorDuplicidadeNoArquivo).toBe(1);
    expect(result.data?.detalhes.some((d) => d.includes('repetido no arquivo'))).toBe(true);

    const materiais = JSON.parse(store[STORAGE_KEY] ?? '[]') as { codigo: string; descricao: string }[];
    expect(materiais.filter((m) => m.codigo === 'DUP-A')).toHaveLength(1);
    expect(materiais.find((m) => m.codigo === 'DUP-A')?.descricao).toBe('Primeira');
  });

  it('nao importa nada quando a disciplina nao esta cadastrada em Disciplinas', async () => {
    const csv =
      'codigo;descricao;disciplina;unidade;peso;estoque_minimo\n' +
      'X-1;Item;Mecânica;PC;1;0\n';
    const prev = previewImportacaoMateriaisCsv(csv);
    expect(prev.ok).toBe(false);

    const result = await importarMateriaisDoArquivoCsv(csv);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Disciplina\(s\) nao cadastrada/i);

    const materiais = JSON.parse(store[STORAGE_KEY] ?? '[]') as unknown[];
    expect(materiais).toHaveLength(0);
  });

  it('lista personalizada em Disciplinas: import permite valor cadastrado', async () => {
    store[DOMINIOS_KEY] = JSON.stringify({
      disciplinas: ['Mecânica', 'Instrumentação'],
      unidades: ['PC', 'UN'],
    });
    const csv = 'codigo;descricao;disciplina;unidade;peso;estoque_minimo\nME-1;Peca;Mecânica;PC;1;0\n';
    expect(previewImportacaoMateriaisCsv(csv).ok).toBe(true);
    const result = await importarMateriaisDoArquivoCsv(csv);
    expect(result.success).toBe(true);
    expect(result.data?.criados).toBe(1);
  });
});

describe('importarMateriaisDoArquivoCsv / protecao armazenamento local', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseFlags.hasSupabaseConfig.mockReturnValue(true);
    supabaseFlags.shouldUseCloudMaterials.mockReturnValue(false);
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
    store[DOMINIOS_KEY] = JSON.stringify({
      disciplinas: ['Tubulacao'],
      unidades: ['UN'],
    });
    /** Tres linhas brutas que nao passam no parse do cadastro: `readAll()` fica vazio mas a contagem de protecao ve 3. */
    store[STORAGE_KEY] = JSON.stringify([{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    supabaseFlags.hasSupabaseConfig.mockReturnValue(false);
    supabaseFlags.shouldUseCloudMaterials.mockReturnValue(false);
  });

  it('recusa import local quando localStorage tem mais linhas que a lista a gravar', async () => {
    const csv =
      'codigo;descricao;disciplina;unidade;peso;estoque_minimo\n' + 'NV-1;Novo;Tubulacao;UN;1;0\n';
    expect(previewImportacaoMateriaisCsv(csv).ok).toBe(true);
    const result = await importarMateriaisDoArquivoCsv(csv);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/armazenamento deste navegador/i);
    const materiais = JSON.parse(store[STORAGE_KEY] ?? '[]') as unknown[];
    expect(materiais).toHaveLength(3);
  });
});
