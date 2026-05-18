import { describe, expect, it } from 'vitest';
import { mergeSnapshotRowsById, removeSnapshotRowsByIds } from './snapshotPatchMerge';

describe('snapshotPatchMerge', () => {
  it('mergeSnapshotRowsById mantém outros ids e substitui o patch', () => {
    const current = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
    ];
    const merged = mergeSnapshotRowsById(current, [{ id: 'b', v: 2 }, { id: 'c', v: 3 }]);
    expect(merged).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
    ]);
  });

  it('removeSnapshotRowsByIds remove só os ids indicados', () => {
    const current = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(removeSnapshotRowsByIds(current, ['b'])).toEqual([{ id: 'a' }, { id: 'c' }]);
  });
});
