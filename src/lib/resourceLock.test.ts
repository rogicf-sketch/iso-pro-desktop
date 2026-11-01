import { describe, expect, it } from 'vitest';
import {
  isResourceLockHeldByOther,
  mensagemResourceLockBloqueado,
} from './resourceLock';

describe('resourceLock', () => {
  it('detecta lock held por outro posto', () => {
    expect(isResourceLockHeldByOther({ ok: false, reason: 'held', holderLabel: 'Joao' })).toBe(true);
    expect(isResourceLockHeldByOther({ ok: true })).toBe(false);
    expect(isResourceLockHeldByOther({ ok: false, reason: 'network' })).toBe(false);
  });

  it('monta mensagem por kind', () => {
    const claim = { ok: false as const, reason: 'held', holderLabel: 'Maria' };
    expect(mensagemResourceLockBloqueado('recebimento', claim)).toContain('Recebimento');
    expect(mensagemResourceLockBloqueado('recebimento', claim)).toContain('Maria');
    expect(mensagemResourceLockBloqueado('rir', claim)).toContain('RIR');
    expect(mensagemResourceLockBloqueado('rnc', claim)).toContain('RNC');
    expect(mensagemResourceLockBloqueado('atendimento', claim)).toContain('Desenho');
  });
});
