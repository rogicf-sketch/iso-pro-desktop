import { describe, expect, it } from 'vitest';
import type { IsoSnapshotPayload } from './iso.js';
import {
  chaveAgrupamentoHistoricoAtendimento,
  formatNumeroAtendimento,
  maxSequenciaAtendimentoNoPayload,
  reservarProximoNumeroAtendimento,
} from './atendimentoNumero.js';

describe('atendimentoNumero', () => {
  it('formata com 5 digitos', () => {
    expect(formatNumeroAtendimento(73, new Date('2026-07-05T12:00:00'))).toBe('ATD-20260705-00073');
  });

  it('maxSequencia considera historico mesmo com cfg atrasada', () => {
    const payload: IsoSnapshotPayload = {
      configuracoesSistema: { sequenciaAtendimento: 70 },
      atendimentoHistorico: [{ loteNumero: 'ATD-20260705-00073', codigo: 'M1', quantidade: 1 }],
    };
    expect(maxSequenciaAtendimentoNoPayload(payload)).toBe(73);
  });

  it('reservarProximoNumero nao reutiliza protocolo existente', () => {
    const payload: IsoSnapshotPayload = {
      configuracoesSistema: { sequenciaAtendimento: 72 },
      atendimentoHistorico: [{ loteNumero: 'ATD-20260705-00073', codigo: 'M1', quantidade: 1 }],
    };
    const { numero, sequencia } = reservarProximoNumeroAtendimento(payload);
    expect(sequencia).toBe(74);
    expect(numero).toBe('ATD-20260705-00074');
    expect((payload.configuracoesSistema as Record<string, unknown>).sequenciaAtendimento).toBe(74);
  });

  it('chaveAgrupamento separa mesmo numero com loteId diferente', () => {
    expect(chaveAgrupamentoHistoricoAtendimento({ loteNumero: 'ATD-1', loteId: 10 })).toBe('ATD-1::10');
    expect(chaveAgrupamentoHistoricoAtendimento({ loteNumero: 'ATD-1', loteId: 20 })).toBe('ATD-1::20');
    expect(chaveAgrupamentoHistoricoAtendimento({ loteNumero: 'ATD-1' })).toBe('ATD-1');
  });
});
