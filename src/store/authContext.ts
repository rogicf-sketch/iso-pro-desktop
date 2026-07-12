import { createContext } from 'react';
import type { AppModule, AuthUser, LoginPayload, PermissionAction } from '../modules/auth/types/auth.types';

export type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  /** Completa login após código TOTP (quando `IsoProMfaRequiredError`). */
  completeMfaLogin: (
    factorId: string,
    code: string,
    pendingUser: AuthUser,
    permanecerLogado: boolean,
  ) => Promise<void>;
  /** Cancela desafio MFA (limpa sessão Auth aal1). */
  cancelMfaLogin: () => void;
  logout: () => void;
  canAccessModule: (modulo: AppModule) => boolean;
  canAccessAction: (modulo: AppModule, acao: PermissionAction) => boolean;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
