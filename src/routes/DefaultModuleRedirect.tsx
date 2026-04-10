import { Navigate } from 'react-router-dom';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { getFirstAccessibleRoute } from './navigation';

export function DefaultModuleRedirect() {
  const { user } = useAuth();
  return <Navigate replace to={getFirstAccessibleRoute(user)} />;
}
