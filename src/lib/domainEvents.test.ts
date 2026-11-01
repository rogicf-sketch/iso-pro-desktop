import { describe, expect, it } from 'vitest';
import { AUTH_AUDIT_TO_DOMAIN_EVENT, DOMAIN_EVENT_TYPES } from './domainEvents';

describe('domainEvents catalog', () => {
  it('tem eventos P1 mapeados', () => {
    expect(DOMAIN_EVENT_TYPES).toContain('recebimento.criado');
    expect(AUTH_AUDIT_TO_DOMAIN_EVENT.recebimento_criado).toBe('recebimento.criado');
    expect(AUTH_AUDIT_TO_DOMAIN_EVENT.material_editado).toBe('material.editado');
    expect(AUTH_AUDIT_TO_DOMAIN_EVENT.login_success).toBeUndefined();
  });
});
