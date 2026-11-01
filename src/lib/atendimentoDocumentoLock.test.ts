import { describe, expect, it } from 'vitest';
import {
  isAtendimentoLockHeldByOther,
  mensagemAtendimentoLockBloqueado,
} from './atendimentoDocumentoLock';

describe('atendimentoDocumentoLock', () => {
  it('detecta lock held por outro posto', () => {
    expect(isAtendimentoLockHeldByOther({ ok: false, reason: 'held', holderLabel: 'Joao' })).toBe(true);
    expect(isAtendimentoLockHeldByOther({ ok: true })).toBe(false);
    expect(isAtendimentoLockHeldByOther({ ok: false, reason: 'network' })).toBe(false);
  });

  it('monta mensagem de bloqueio duro', () => {
    expect(
      mensagemAtendimentoLockBloqueado({
        ok: false,
        reason: 'held',
        holderLabel: 'Maria (mobile)',
      }),
    ).toContain('Maria (mobile)');
    expect(
      mensagemAtendimentoLockBloqueado({
        ok: false,
        reason: 'held',
        holderLabel: 'Maria (mobile)',
      }),
    ).toContain('bloqueado');
  });
});
