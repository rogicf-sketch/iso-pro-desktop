import { describe, expect, it } from 'vitest';
import { parseDesktopLicencaImportFile } from './desktopLicencaImportFile.zod';

describe('parseDesktopLicencaImportFile', () => {
  it('aceita objeto com token', () => {
    expect(parseDesktopLicencaImportFile({ token: 'abc' })).toEqual({ token: 'abc' });
  });

  it('rejeita topo nao-objeto', () => {
    expect(parseDesktopLicencaImportFile('x')).toBeNull();
  });
});
