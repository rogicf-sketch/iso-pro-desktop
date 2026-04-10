import { createContext } from 'react';
import type { AppModule, AuthUser, LoginPayload, PermissionAction } from '../modules/auth/types/auth.types';

export type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
  canAccessModule: (modulo: AppModule) => boolean;
  canAccessAction: (modulo: AppModule, acao: PermissionAction) => boolean;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
