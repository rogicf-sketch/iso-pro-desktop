import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importarMateriaisDoArquivoCsv } from './materiais.service';

const STORAGE_KEY = 'iso-pro-desktop-materiais';

vi.mock('../../auth/services/authAudit.service', () => ({
  appendAuthAuditEvent: vi.fn(),
}));

describe('importarMateriaisDoArquivoCsv / duplicidade no mesmo arquivo', () => {
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
});
