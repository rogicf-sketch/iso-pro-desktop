import { describe, expect, it } from 'vitest';
import {
  classificarTamanhoSnapshot,
  formatSnapshotSize,
  mensagemTamanhoSnapshot,
  SNAPSHOT_SIZE_CRITICAL_BYTES,
  SNAPSHOT_SIZE_WARN_BYTES,
} from './snapshotPayloadSize';

describe('snapshotPayloadSize', () => {
  it('formata bytes em unidades legiveis', () => {
    expect(formatSnapshotSize(500)).toBe('500 B');
    expect(formatSnapshotSize(2048)).toBe('2.0 KB');
    expect(formatSnapshotSize(3 * 1024 * 1024)).toBe('3.00 MB');
  });

  it('classifica niveis de alerta', () => {
    expect(classificarTamanhoSnapshot(SNAPSHOT_SIZE_WARN_BYTES - 1)).toBe('ok');
    expect(classificarTamanhoSnapshot(SNAPSHOT_SIZE_WARN_BYTES)).toBe('aviso');
    expect(classificarTamanhoSnapshot(SNAPSHOT_SIZE_CRITICAL_BYTES)).toBe('critico');
  });

  it('mensagem null quando tamanho ok', () => {
    expect(mensagemTamanhoSnapshot(1024)).toBeNull();
    expect(mensagemTamanhoSnapshot(SNAPSHOT_SIZE_WARN_BYTES)).toContain('a crescer');
  });
});
