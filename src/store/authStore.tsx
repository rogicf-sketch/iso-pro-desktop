import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AUTH_SESSION_STORAGE_KEY,
  AUTH_USERS_STORAGE_KEY,
  canAccessAction as checkActionAccess,
  canAccessModule as checkModuleAccess,
  ensureDevLocalAdminSession,
  getCurrentUser,
  login as doLogin,
  logout as doLogout,
  validateCurrentSession,
} from '../modules/auth/services/auth.service';
import type { AuthUser } from '../modules/auth/types/auth.types';
import { AuthContext, type AuthContextValue } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => ensureDevLocalAdminSession() ?? getCurrentUser());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const SESSION_REFRESH_INTERVAL_MS = 60000;
    let cancelled = false;
    let isRefreshing = false;

    async function refreshSession() {
      if (isRefreshing) return;
      isRefreshing = true;
      const nextUser = await validateCurrentSession(getCurrentUser());
      if (!cancelled) {
        setUser(nextUser);
        setIsLoading(false);
      }
      isRefreshing = false;
    }

    const timer = window.setTimeout(() => {
      void refreshSession();
    }, 0);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshSession();
      }
    }, SESSION_REFRESH_INTERVAL_MS);

    function handleWindowFocus() {
      void refreshSession();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refreshSession();
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === AUTH_SESSION_STORAGE_KEY) {
        setUser(getCurrentUser());
        setIsLoading(false);
        return;
      }

      if (event.key === AUTH_USERS_STORAGE_KEY) {
        void refreshSession();
      }
    }

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login: async (payload) => {
        const nextUser = await doLogin(payload);
        setUser(nextUser);
      },
      logout: () => {
        doLogout();
        setUser(null);
      },
      canAccessModule: (modulo) => checkModuleAccess(user, modulo),
      canAccessAction: (modulo, acao) => checkActionAccess(user, modulo, acao),
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
