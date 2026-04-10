import { useContext } from 'react';
import { AuthContext } from './authContext';

export function useAuthStore() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthStore deve ser usado dentro de AuthProvider.');
  }

  return context;
}
