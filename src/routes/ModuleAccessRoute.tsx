import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { OperationalNotice } from '../components/ui/OperationalNotice';
import { useAuth } from '../modules/auth/hooks/useAuth';
import type { AppModule } from '../modules/auth/types/auth.types';
import { getFirstAccessibleRoute } from './navigation';

type Props = {
  modulo: AppModule;
  children: ReactNode;
};

export function ModuleAccessRoute({ modulo, children }: Props) {
  const { canAccessModule, user } = useAuth();
  const location = useLocation();

  if (!canAccessModule(modulo)) {
    const fallbackRoute = getFirstAccessibleRoute(user);
    if (fallbackRoute !== '/login' && fallbackRoute !== location.pathname) {
      return <Navigate replace to={fallbackRoute} />;
    }

    return (
      <OperationalNotice tone="warning">
        {`Voce nao tem permissao para acessar este modulo. Origem: ${location.pathname}`}
      </OperationalNotice>
    );
  }

  return <>{children}</>;
}
