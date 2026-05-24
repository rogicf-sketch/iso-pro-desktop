import { describe, expect, it } from 'vitest';
import { parseIsoSnapshotPayloadFromUnknown } from './snapshotPayload.zod.js';

describe('parseIsoSnapshotPayloadFromUnknown', () => {
  it('aceita null e undefined como objeto vazio', () => {
    expect(parseIsoSnapshotPayloadFromUnknown(null)).toEqual({ ok: true, data: {} });
    expect(parseIsoSnapshotPayloadFromUnknown(undefined)).toEqual({ ok: true, data: {} });
  });

  it('rejeita raiz que não é objeto', () => {
    expect(parseIsoSnapshotPayloadFromUnknown([]).ok).toBe(false);
    expect(parseIsoSnapshotPayloadFromUnknown('x').ok).toBe(false);
    expect(parseIsoSnapshotPayloadFromUnknown(1).ok).toBe(false);
  });

  it('aceita payload mínimo e campos extra no topo (passthrough)', () => {
    const r = parseIsoSnapshotPayloadFromUnknown({ seed: true, versao: '1.0' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.versao).toBe('1.0');
      expect((r.data as Record<string, unknown>).seed).toBe(true);
    }
  });

  it('remove __proto__ antes da validação e aceita o resto', () => {
    const malicious = JSON.parse('{"materiais":[],"__proto__":{"admin":true}}') as Record<string, unknown>;
    const r = parseIsoSnapshotPayloadFromUnknown(malicious);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.data as Record<string, unknown>).admin).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(r.data, 'admin')).toBe(false);
    }
  });

  it('rejeita versão com string acima do limite curto', () => {
    const r = parseIsoSnapshotPayloadFromUnknown({ versao: 'x'.repeat(3000) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('versao');
    }
  });

  it('aceita materiais com itens válidos', () => {
    const r = parseIsoSnapshotPayloadFromUnknown({
      materiais: [{ id: '1', codigo: 'ABC', descricao: 'Teste' }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.materiais?.length).toBe(1);
      expect(r.data.materiais?.[0]?.codigo).toBe('ABC');
    }
  });

  it('ignora materiais quando não é array (trata como ausente)', () => {
    const r = parseIsoSnapshotPayloadFromUnknown({ materiais: 'não-array' as unknown as [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.materiais).toBeUndefined();
    }
  });

  it('rejeita origem inválida em atendimentoHistorico', () => {
    const r = parseIsoSnapshotPayloadFromUnknown({
      atendimentoHistorico: [{ codigo: 'X', origem: 'servidor' }],
    });
    expect(r.ok).toBe(false);
  });

  it('aceita origem mobile ou windows', () => {
    const r = parseIsoSnapshotPayloadFromUnknown({
      atendimentoHistorico: [{ codigo: 'X', origem: 'mobile' }],
    });
    expect(r.ok).toBe(true);
  });

  it('aceita atendimentoHistorico com id numérico (móvel) ou UUID string (desktop)', () => {
    const r = parseIsoSnapshotPayloadFromUnknown({
      atendimentoHistorico: [
        { id: 42, codigo: 'A', origem: 'mobile' },
        { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', codigo: 'B', origem: 'windows' },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.atendimentoHistorico?.[0]?.id).toBe(42);
      expect(r.data.atendimentoHistorico?.[1]?.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    }
  });

});
