import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { montarPayloadCadastrosLimpos, SNAPSHOT_CHAVES_LIMPAR_CADASTROS } from './montarPayloadCadastrosLimpos';

describe('montarPayloadCadastrosLimpos', () => {
  it('zera atendimentos e historico junto com planejamento', () => {
    const next = montarPayloadCadastrosLimpos({
      configuracoesSistema: { tema: 'escuro' },
      documentos: [{ id: 'd1', numero: 'DOC-1' }],
      atendimentos: [{ id: 'a1', documentoId: 'd1' }],
      atendimentoHistorico: [{ documentoId: 'd1', documento: 'DOC-1' }],
      atendimentoLotes: [{ id: 'l1', numero: 'AT-1' }],
      materiais: [{ id: 1, codigo: 'M1' }],
    });

    expect(next.configuracoesSistema).toEqual({ tema: 'escuro' });
    expect(next.documentos).toEqual([]);
    expect(next.atendimentos).toEqual([]);
    expect(next.atendimentoHistorico).toEqual([]);
    expect(next.atendimentoLotes).toEqual([]);
    expect(next.materiais).toEqual([]);
    expect(typeof next.dataAtualizacao).toBe('string');
  });

  it('remove usuariosSistema do payload', () => {
    const next = montarPayloadCadastrosLimpos({
      usuariosSistema: [{ login: 'admin' }],
      documentos: [],
    });
    expect(next.usuariosSistema).toBeUndefined();
  });

  it('lista de chaves alinhada com purge_cloud_cadastros', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const edgeSource = readFileSync(join(root, 'supabase/functions/purge_cloud_cadastros/index.ts'), 'utf8');
    const match = edgeSource.match(/const CHAVES_LISTAS_CADASTRO = \[([\s\S]*?)\] as const;/);
    expect(match, 'CHAVES_LISTAS_CADASTRO nao encontrada na Edge Function').toBeTruthy();
    const edgeKeys = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(edgeKeys.sort()).toEqual([...SNAPSHOT_CHAVES_LIMPAR_CADASTROS].sort());
  });
});
