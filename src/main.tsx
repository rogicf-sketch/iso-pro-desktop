import { StrictMode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { carregarConfiguracoes } from '@/modules/configuracoes/services/configuracoes.service';
import { createAppQueryClient } from '@/lib/queryClient';
import { captureException } from '@/lib/errorReporting';
import { initSentryDesktop } from '@/lib/sentryInit';
import { AuthProvider } from '@/store/authStore';

const queryClient = createAppQueryClient();

initSentryDesktop();

void (async () => {
  try {
    await carregarConfiguracoes();
  } catch (err) {
    captureException(err, { where: 'main.tsx/carregarConfiguracoes' });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
})();
