import { describe, expect, it } from 'vitest';
import { parseMateriaisImportStagingStored } from './materiaisImportStaging.zod';

describe('parseMateriaisImportStagingStored', () => {
  it('aceita payload completo', () => {
    const p = { fileName: 'f.csv', text: 'a;b', linhaCount: 1, savedAt: 1 };
    expect(parseMateriaisImportStagingStored(p)).toEqual(p);
  });

  it('rejeita campo em falta', () => {
    expect(parseMateriaisImportStagingStored({ fileName: 'f' })).toBeNull();
  });
});
