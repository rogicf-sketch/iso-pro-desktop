import { preparePasswordForStorage } from 'iso-pro-shared';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { isIsoProJwtSessionActive } from '../../../lib/isoProJwtSession';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import {
  getAuthUsersStorageKey,
  getCurrentUser,
  getVolatileSessionPassword,
  refreshVolatileSessionPasswordAfterSelfPasswordChange,
  setVolatileSessionPasswordAfterSuccessfulLogin,
} from './auth.service';

type RpcBody = { ok?: boolean; error?: string };

/**
 * Altera a senha do utilizador em sessão (self-service).
 * Nuvem: RPC `iso_pro_alterar_propria_senha` (+ Auth.updateUser se JWT activo).
 */
export async function alterarMinhaSenha(input: {
  senhaAtual: string;
  senhaNova: string;
  senhaNova2: string;
}): Promise<ServiceResult<{ ok: true }>> {
  const atual = input.senhaAtual.trim();
  const nova = input.senhaNova.trim();
  const nova2 = input.senhaNova2.trim();
  if (!atual || !nova) {
    return { success: false, error: 'Informe a senha actual e a senha nova.' };
  }
  if (nova.length < 4) {
    return { success: false, error: 'A senha nova deve ter pelo menos 4 caracteres.' };
  }
  if (nova !== nova2) {
    return { success: false, error: 'A confirmacao da senha nova nao coincide.' };
  }

  const user = getCurrentUser();
  if (!user?.login) {
    return { success: false, error: 'Sessao invalida.' };
  }

  if (hasSupabaseConfig()) {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, error: 'Cliente Supabase indisponivel.' };
    }

    const { data, error } = await supabase.rpc('iso_pro_alterar_propria_senha', {
      p_tenant_id: getActiveTenantId(),
      p_login: user.login,
      p_senha_atual: atual,
      p_senha_nova: nova,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    const body = data as RpcBody | null;
    if (!body || body.ok !== true) {
      return { success: false, error: body?.error ?? 'Nao foi possivel alterar a senha na nuvem.' };
    }

    if (isIsoProJwtSessionActive()) {
      const authRes = await supabase.auth.updateUser({ password: nova });
      if (authRes.error) {
        return {
          success: false,
          error:
            authRes.error.message ||
            'Senha da base actualizada, mas falhou actualizar a conta Auth. Tente de novo ou peça apoio ao administrador.',
        };
      }
    }

    refreshVolatileSessionPasswordAfterSelfPasswordChange(nova);
    return { success: true, data: { ok: true } };
  }

  const vol = getVolatileSessionPassword();
  if (vol && vol !== atual) {
    return { success: false, error: 'Senha actual incorrecta.' };
  }

  try {
    const key = getAuthUsersStorageKey();
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const users = JSON.parse(raw) as Array<{ id?: string; login?: string; senha?: string }>;
      if (Array.isArray(users)) {
        const idx = users.findIndex((u) => String(u.login ?? '').toLowerCase() === user.login.toLowerCase());
        if (idx >= 0) {
          const stored = String(users[idx].senha ?? '');
          if (!stored.startsWith('$2') && stored !== atual) {
            return { success: false, error: 'Senha actual incorrecta.' };
          }
          if (stored.startsWith('$2') && (!vol || vol !== atual)) {
            return {
              success: false,
              error: 'Senha actual incorrecta. Saia e entre de novo, depois tente alterar.',
            };
          }
          const hashed = await preparePasswordForStorage(nova);
          if (!hashed) {
            return { success: false, error: 'Falha ao preparar a senha nova.' };
          }
          users[idx] = { ...users[idx], senha: hashed };
          window.localStorage.setItem(key, JSON.stringify(users));
        }
      }
    }
  } catch {
    /* segue com volatile */
  }

  setVolatileSessionPasswordAfterSuccessfulLogin(nova);
  return { success: true, data: { ok: true } };
}
