/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDualWriteFailures,
  listDualWriteFailures,
  recordDualWriteFailure,
  recordDualWriteSuccess,
  runDualWriteBestEffort,
} from './dualWriteEscala';

describe('dualWriteEscala', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDualWriteFailures();
  });

  it('regista falha e limpa no sucesso', async () => {
    recordDualWriteFailure('recebimentos', 'timeout');
    expect(listDualWriteFailures()).toHaveLength(1);

    const ok = await runDualWriteBestEffort('recebimentos', async () => ({ ok: true }));
    expect(ok.ok).toBe(true);
    expect(listDualWriteFailures()).toHaveLength(0);
  });

  it('ignora RPC em falta no painel', async () => {
    const r = await runDualWriteBestEffort('documentos', async () => ({
      ok: false,
      error: 'Could not find the function iso_pro_upsert in the schema cache',
    }));
    expect(r.skippedMissingRpc).toBe(true);
    expect(listDualWriteFailures()).toHaveLength(0);
  });

  it('substitui falha anterior do mesmo dominio', () => {
    recordDualWriteFailure('inventarios', 'erro A');
    recordDualWriteFailure('inventarios', 'erro B');
    const list = listDualWriteFailures();
    expect(list).toHaveLength(1);
    expect(list[0]?.error).toBe('erro B');
    recordDualWriteSuccess('inventarios');
    expect(listDualWriteFailures()).toHaveLength(0);
  });
});
