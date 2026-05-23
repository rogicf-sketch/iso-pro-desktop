import { describe, expect, it } from 'vitest';
import { labelStatusPlanejamento } from './consultaMaterial.service';

describe('consultaMaterial.service / labelStatusPlanejamento', () => {
  it('traduz status de planejamento', () => {
    expect(labelStatusPlanejamento('atendido')).toBe('Atendido');
    expect(labelStatusPlanejamento('pendente')).toBe('Pendente');
  });
});
