import { describe, expect, it } from 'vitest';
import { isIsoProAuthRpcMissing } from './isoProAuthRpc';

describe('isoProAuthRpc', () => {
  it('detecta RPC em falta pela mensagem do PostgREST', () => {
    expect(
      isIsoProAuthRpcMissing(
        'Could not find the function public.iso_pro_autenticar_usuario(p_login, p_senha, p_tenant_id) in the schema cache',
      ),
    ).toBe(true);
  });

  it('detecta refresh RPC em falta', () => {
    expect(isIsoProAuthRpcMissing('function iso_pro_refresh_usuario_sessao does not exist')).toBe(true);
  });

  it('nao marca erro generico de credenciais como RPC em falta', () => {
    expect(isIsoProAuthRpcMissing('Login ou senha invalidos.')).toBe(false);
  });
});
