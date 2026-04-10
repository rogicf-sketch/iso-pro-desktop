import { RouterProvider } from 'react-router-dom';
import { DesktopSecurityGate } from '@/modules/configuracoes/components/DesktopSecurityGate';
import { router } from '@/routes';

function App() {
  return (
    <DesktopSecurityGate>
      <RouterProvider router={router} />
    </DesktopSecurityGate>
  );
}

export default App;
