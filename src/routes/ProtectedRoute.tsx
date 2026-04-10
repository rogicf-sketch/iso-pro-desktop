import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { OperationalNotice } from '../components/ui/OperationalNotice';
import { useAuth } from '../modules/auth/hooks/useAuth';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <OperationalNotice>Carregando sessao...</OperationalNotice>;
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return <Outlet />;
}
