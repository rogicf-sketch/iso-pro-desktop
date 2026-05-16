import { describe, expect, it } from 'vitest';
import { parseLocalStorageRecordArray } from './localStorageRecordArray.zod';

describe('parseLocalStorageRecordArray', () => {
  it('aceita array de objetos', () => {
    expect(parseLocalStorageRecordArray([{ id: '1', a: 1 }])).toEqual([{ id: '1', a: 1 }]);
  });

  it('rejeita elemento nao-objeto', () => {
    expect(parseLocalStorageRecordArray([1, 2])).toBeNull();
  });
});
