import { describe, expect, it } from 'vitest';
import { computeContainedSize } from './imageCompress';

describe('imageCompress / computeContainedSize', () => {
  it('mantém tamanho quando cabe no limite', () => {
    expect(computeContainedSize(800, 600, 1680)).toEqual({ width: 800, height: 600 });
  });

  it('reduz pelo maior lado', () => {
    expect(computeContainedSize(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
  });

  it('reduz altura quando é o maior lado', () => {
    expect(computeContainedSize(1000, 3000, 1500)).toEqual({ width: 500, height: 1500 });
  });
});
