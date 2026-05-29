import { describe, expect, it } from 'vitest';
import {
  atividadeBackupOracleFluxoAlto,
  deveExecutarBackupOracleAutomatico,
} from './backupOracleAuto.policy';

describe('backupOracleAuto.policy', () => {
  const base = {
    agora: new Date('2026-05-10T12:00:00Z'),
    ultimoBackupEm: '2026-05-01T12:00:00Z',
    atividade: { atendimentos: 0, recebimentos: 0, cadastros: 0 },
    intervaloRotinaDias: 7,
    intervaloFluxoAltoDias: 3,
    minAtendimentosFluxo: 10,
    minRecebimentosFluxo: 3,
    minCadastrosFluxo: 5,
  };

  it('primeiro backup quando nunca houve backup', () => {
    expect(deveExecutarBackupOracleAutomatico({ ...base, ultimoBackupEm: null }).motivo).toBe('primeiro_backup');
  });

  it('rotina apos 7 dias mesmo sem fluxo', () => {
    expect(deveExecutarBackupOracleAutomatico({ ...base, atividade: { atendimentos: 2, recebimentos: 0, cadastros: 1 } })).toEqual({
      executar: true,
      motivo: 'rotina',
    });
  });

  it('fluxo alto apos 3 dias com muitos atendimentos', () => {
    expect(
      deveExecutarBackupOracleAutomatico({
        ...base,
        agora: new Date('2026-05-04T12:00:00Z'),
        atividade: { atendimentos: 12, recebimentos: 0, cadastros: 0 },
      }),
    ).toEqual({ executar: true, motivo: 'fluxo_alto' });
  });

  it('nao dispara fluxo alto antes de 3 dias', () => {
    expect(
      deveExecutarBackupOracleAutomatico({
        ...base,
        agora: new Date('2026-05-03T12:00:00Z'),
        atividade: { atendimentos: 50, recebimentos: 20, cadastros: 20 },
      }),
    ).toEqual({ executar: false, motivo: 'aguardar' });
  });

  it('nao dispara rotina antes de 7 dias sem fluxo alto', () => {
    expect(
      deveExecutarBackupOracleAutomatico({
        ...base,
        agora: new Date('2026-05-05T12:00:00Z'),
        atividade: { atendimentos: 2, recebimentos: 1, cadastros: 0 },
      }),
    ).toEqual({ executar: false, motivo: 'aguardar' });
  });

  it('detecta fluxo alto por recebimentos', () => {
    expect(
      atividadeBackupOracleFluxoAlto(
        { atendimentos: 0, recebimentos: 3, cadastros: 0 },
        { minAtendimentosFluxo: 10, minRecebimentosFluxo: 3, minCadastrosFluxo: 5 },
      ),
    ).toBe(true);
  });
});
