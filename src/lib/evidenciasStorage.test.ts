import { describe, expect, it } from 'vitest';
import {
  EVIDENCIAS_BUCKET,
  evidenciasPathRf,
  evidenciasPathRir,
  evidenciasPathRnc,
  isStorageRef,
  makeStorageRef,
  parseStorageRef,
  STORAGE_REF_PREFIX,
} from './evidenciasStorage';

describe('evidenciasStorage', () => {
  it('makeStorageRef / parseStorageRef round-trip', () => {
    const path = '00000000-0000-0000-0000-000000000001/rf/r1/f1.jpg';
    const ref = makeStorageRef(path);
    expect(ref.startsWith(STORAGE_REF_PREFIX)).toBe(true);
    expect(isStorageRef(ref)).toBe(true);
    expect(parseStorageRef(ref)).toEqual({ bucket: EVIDENCIAS_BUCKET, path });
  });

  it('parseStorageRef rejeita refs invalidas', () => {
    expect(parseStorageRef('iso-media:rf:x')).toBeNull();
    expect(parseStorageRef('iso-storage:')).toBeNull();
    expect(parseStorageRef('iso-storage:evidencias')).toBeNull();
  });

  it('evidenciasPathRf / Rnc / Rir usam tenant no 1.º segmento', () => {
    const tenant = '11111111-1111-1111-1111-111111111111';
    expect(evidenciasPathRf('rep', 'foto', tenant)).toBe(`${tenant}/rf/rep/foto.jpg`);
    expect(evidenciasPathRnc('rnc1', 'itemA', 2, tenant)).toBe(`${tenant}/rnc/rnc1/itemA/2.jpg`);
    expect(evidenciasPathRir('rir-9', tenant)).toBe(`${tenant}/rir/rir-9.json`);
  });
});
